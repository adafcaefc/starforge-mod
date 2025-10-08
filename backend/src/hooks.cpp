#include <Geode/Geode.hpp>
#include <Geode/modify/CCScheduler.hpp>
#include <Geode/modify/PlayLayer.hpp>
#include "spc_state.h"
#include "spc_projector.h"
#include "spc_webserver.h"

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
        }
    }
}

class $modify(cocos2d::CCScheduler) {
    void update(float dt) {
        static bool init = false;
        if (!init) {
            init = true;
            spc::projector::recorder.start();
            std::thread(spc::webserver::run).detach();
        }

        cocos2d::CCScheduler::update(dt);
        spc::projector::recorder.capture_frame();
        spc::loadState();
    }
};