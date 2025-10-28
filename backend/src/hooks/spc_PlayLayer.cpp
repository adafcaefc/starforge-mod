#include <Geode/Geode.hpp>
#include <Geode/modify/PlayLayer.hpp>
#include "spc_state.h"

using namespace geode::prelude;

class $modify(PlayLayer) {
    void resetLevel() {
        PlayLayer::resetLevel();
        auto state = spc::State::get();
        geode::queueInMainThread([]() { spc::State::get()->m_levelStateUpdate = true; });
        state->m_server->send(state->getEventMessage("level_reset"));
    }
    void onQuit() {
        PlayLayer::onQuit();
        auto state = spc::State::get();
        geode::queueInMainThread([]() { 
            spc::State::get()->m_levelStateReset = true;
            spc::State::get()->m_levelStateUpdate = true; 
            });
        state->m_server->send(state->getEventMessage("level_exit"));
    }
};
