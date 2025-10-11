#include <Geode/Geode.hpp>
#include <Geode/modify/CCScheduler.hpp>
#include <Geode/modify/PlayLayer.hpp>
#include "spc_state.h"
#include "spc_projector.h"
#include "spc_webserver.h"

using namespace geode::prelude;

namespace spc {
    static void loadObjects(PlayLayer* pl)
    {
        auto state = spc::State::get();
        state->m_gameObjects.clear();

        for (auto objx : CCArrayExt<GameObject*>(pl->m_objects)) {
            if (objx == pl->m_anticheatSpike) { continue; }
            spc::State::GameObject obj;
            obj.m_x = objx->getPositionX();
            obj.m_y = objx->getPositionY();
            obj.m_rotation = objx->getRotation();
            obj.m_scaleX = objx->getScaleX();
            obj.m_scaleY = objx->getScaleY();
            obj.m_opacity = static_cast<float>(objx->getOpacity()) / 255.0f;
            obj.m_visible = objx->isVisible();
            obj.m_nativePtr = reinterpret_cast<uintptr_t>(objx);
            obj.m_objectId = objx->m_objectID;
            state->m_gameObjects.push_back(obj);
        }
    }

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

    static void loadState() {
        auto state = spc::State::get();
        state->m_mode = spc::State::Mode::Idle;

        if (auto pl = PlayLayer::get()) {
            state->m_mode = spc::State::Mode::Playing;

            if (pl->m_isPaused) {
                state->m_mode = spc::State::Mode::Paused;
            }

            state->m_levelLength = pl->m_levelLength;

            if (auto level = pl->m_level) {
                state->m_levelID = level->m_levelID;
            }

            if (auto p1 = pl->m_player1) {
                spcProcessPlayer(p1, state->m_player1);
            }

            if (auto p2 = pl->m_player2) {
                spcProcessPlayer(p2, state->m_player2);
            }

            if (auto em = pl->m_effectManager)
            {
                static const auto loadColorAction = [](int tag, spc::State::ColorRGB& color, ColorAction* ca) {
                    color.m_r = ca->m_color.r;
                    color.m_g = ca->m_color.g;
                    color.m_b = ca->m_color.b;
                    };
                if (auto ca = em->getColorAction(1000)) {
                    loadColorAction(1000, state->m_bgColor, ca);
                }
                if (auto ca = em->getColorAction(1001)) {
                    loadColorAction(1002, state->m_gColor, ca);
                }
                if (auto ca = em->getColorAction(1002)) {
                    loadColorAction(1003, state->m_lineColor, ca);
                }
                if (auto ca = em->getColorAction(1009)) {
                    loadColorAction(1004, state->m_g2Color, ca);
                }
                if (auto ca = em->getColorAction(1013)) {
                    loadColorAction(1010, state->m_mgColor, ca);
                }
                if (auto ca = em->getColorAction(1014)) {
                    loadColorAction(1010, state->m_mg2Color, ca);
                }
            }       
        }
    }
}

class $modify(PlayLayer) {
    void resetLevel() {
        PlayLayer::resetLevel();
        spc::loadObjects(this);
    }
};

class $modify(cocos2d::CCScheduler) {
    void update(float dt) {
        static bool init = false;

        auto recorder = spc::State::get()->recorder;

        if (!init) {
            init = true;
            recorder->start();
            std::thread(spc::webserver::run).detach();
        }

        cocos2d::CCScheduler::update(dt);
        recorder->capture_frame();
        spc::loadState();
    }
};