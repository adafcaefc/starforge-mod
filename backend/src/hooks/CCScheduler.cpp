#include <Geode/Geode.hpp>
#include <Geode/modify/CCScheduler.hpp>
#include <Geode/modify/PlayLayer.hpp>
#include "../spc_state.h"
#include "../spc_webserver.h"

#include <RenderTexture.hpp>

using namespace geode::prelude;

namespace spc {
    static void spcProcessPlayer(PlayerObject* player, spc::State::PlayerState& state) {
        if (!player) return;
        
        state.m_x = player->m_position.x;
        state.m_y = player->m_position.y;
        state.m_rotation = player->getRotation();
        state.m_yVelocity = player->m_yVelocity;

        if (player->m_isShip) state.m_mode = spc::State::PlayerState::Mode::Ship;
        else if (player->m_isBall) state.m_mode = spc::State::PlayerState::Mode::Ball;
        else if (player->m_isBird) state.m_mode = spc::State::PlayerState::Mode::UFO;
        else if (player->m_isDart) state.m_mode = spc::State::PlayerState::Mode::Wave;
        else if (player->m_isRobot) state.m_mode = spc::State::PlayerState::Mode::Robot;
        else if (player->m_isSpider) state.m_mode = spc::State::PlayerState::Mode::Spider;
        else if (player->m_isSwing) state.m_mode = spc::State::PlayerState::Mode::Swing;
        else state.m_mode = spc::State::PlayerState::Mode::Cube;
    }

    static void loadLevelState(GJBaseGameLayer* layer) {
        auto state = spc::State::get();

        if (auto p1 = layer->m_player1) {
            spcProcessPlayer(p1, state->m_liveLevelData.m_player1);
        }

        if (auto p2 = layer->m_player2) {
            spcProcessPlayer(p2, state->m_liveLevelData.m_player2);
        }

        if (auto em = layer->m_effectManager)
        {
            static const auto loadColorAction = [](int tag, spc::State::ColorRGB& color, ColorAction* ca) {
                color.m_r = ca->m_color.r;
                color.m_g = ca->m_color.g;
                color.m_b = ca->m_color.b;
                };
            if (auto ca = em->getColorAction(1000)) {
                loadColorAction(1000, state->m_liveLevelData.m_bgColor, ca);
            }
            if (auto ca = em->getColorAction(1001)) {
                loadColorAction(1002, state->m_liveLevelData.m_gColor, ca);
            }
            if (auto ca = em->getColorAction(1002)) {
                loadColorAction(1003, state->m_liveLevelData.m_lineColor, ca);
            }
            if (auto ca = em->getColorAction(1009)) {
                loadColorAction(1004, state->m_liveLevelData.m_g2Color, ca);
            }
            if (auto ca = em->getColorAction(1013)) {
                loadColorAction(1010, state->m_liveLevelData.m_mgColor, ca);
            }
            if (auto ca = em->getColorAction(1014)) {
                loadColorAction(1010, state->m_liveLevelData.m_mg2Color, ca);
            }
        }
    }

    static void loadModeState() {
        auto state = spc::State::get();
        state->m_gameState.m_mode = spc::State::Mode::Idle;
        if (auto pl = PlayLayer::get()) {
            state->m_gameState.m_mode = spc::State::Mode::Playing;
            if (pl->m_isPaused) {
                state->m_gameState.m_mode = spc::State::Mode::Paused;
            }
        }
        if (auto lel = LevelEditorLayer::get()) {
            state->m_gameState.m_mode = spc::State::Mode::Editor;
        }
    }

    static void loadState() {

        auto state = spc::State::get();
        loadModeState();
        switch (state->m_gameState.m_mode)
        {
        case spc::State::Mode::Playing:
            loadLevelState(PlayLayer::get());
            break;
        case spc::State::Mode::Editor:
            loadLevelState(LevelEditorLayer::get());
            break;
        default:
            break;
        }
    }

    // https://github.com/undefined06855/gd-render-texture
    static void spcCaptureFrame() {
        uint16_t width = 440u;
        uint16_t height = 240u;

        static RenderTexture render(width, height);

        std::unique_ptr<uint8_t[]> data = render.captureData(CCScene::get());

        auto server = spc::State::get()->m_server;
        server->sendBinary(std::vector<uint8_t>(data.get(), data.get() + (width * height * 4)));
    }

    static void spcSendLevelUpdate() {
        auto state = spc::State::get();
        GJBaseGameLayer* layer = nullptr;
        if (PlayLayer::get())
            layer = PlayLayer::get();
        else if (LevelEditorLayer::get())
            layer = LevelEditorLayer::get();
        if (state->m_levelStateUpdate) {
            if (layer)
                state->m_levelData.loadFromLevel(layer);
            else
                state->m_levelData.reset();
            if (state->m_levelStateReset) {
                state->m_levelData.reset();
                state->m_server->send(state->getEventMessage("level_data_reset"));
                state->m_levelStateReset = false;
            }
            state->m_server->send(state->getLevelDataMessage());
            state->m_server->send(state->getEventMessage("level_data_update"));
            state->m_levelStateUpdate = false;
        }
    }

    static void spcSendGameState() {
        auto state = spc::State::get();
        state->m_server->send(state->getGameStateMessage());

        spc::loadState();

        // Send live level data for player position updates
        state->m_server->send(state->getLiveLevelDataMessage());
    }
}



class $modify(cocos2d::CCScheduler) {
    template <auto Id, typename Duration, auto Interval, typename Func>
    void doEvery(Func&& func) {
        using Clock = std::chrono::steady_clock;
        static auto lastTime = Clock::now();

        auto currentTime = Clock::now();
        auto elapsed = std::chrono::duration_cast<Duration>(currentTime - lastTime);

        if (elapsed.count() >= Interval) {
            std::invoke(std::forward<Func>(func));  // supports lambdas, std::function, etc.
            lastTime = currentTime;
        }
    }


    void update(float dt) {
        static bool init = false;

        cocos2d::CCScheduler::update(dt);

        doEvery<__COUNTER__, std::chrono::milliseconds, 1>([] {
            spc::spcSendGameState();
            });


        doEvery<__COUNTER__, std::chrono::milliseconds, 16>([] {
            spc::spcCaptureFrame();
            spc::spcSendLevelUpdate();
            });
    }
};
