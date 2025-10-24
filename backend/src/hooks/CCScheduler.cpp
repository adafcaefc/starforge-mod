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
}

class $modify(cocos2d::CCScheduler) {
    // https://github.com/undefined06855/gd-render-texture
    void spcCaptureFrame() {
        uint16_t width = 440u;
        uint16_t height = 240u;

        static RenderTexture render(width, height);

        std::unique_ptr<uint8_t[]> data = render.captureData(CCScene::get());

        auto server = spc::State::get()->server;
        server->sendBinary(std::vector<uint8_t>(data.get(), data.get() + (width * height * 4)));

        auto state = spc::State::get();
        server->send(state->getGameStateMessage());

        spc::loadState();
    }

    void spcSendLevelUpdate() {
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
                state->server->send(state->getEventMessage("level_data_reset"));
                state->m_levelStateReset = false;
            }
            state->server->send(state->getLevelDataMessage());
            state->server->send(state->getEventMessage("level_data_update"));
            state->m_levelStateUpdate = false;
        }
    }


    void update(float dt) {
        static bool init = false;

        if (!init) {
            init = true;
            std::thread(spc::webserver::run).detach();
        }

        cocos2d::CCScheduler::update(dt);

        static std::chrono::steady_clock::time_point lastTime = std::chrono::steady_clock::now();
        auto currentTime = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(currentTime - lastTime).count();
        if (elapsed >= 33) {
            spcCaptureFrame();
            spcSendLevelUpdate();
            lastTime = currentTime;
        }
    }
};
