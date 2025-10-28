#include <Geode/Geode.hpp>
#include <Geode/modify/EditorPauseLayer.hpp>
#include "spc_state.h"

using namespace geode::prelude;

class $modify(EditorPauseLayer) {
    void onExitEditor(cocos2d::CCObject* sender) {
        auto state = spc::State::get();
        geode::queueInMainThread([]() {
            spc::State::get()->m_levelStateReset = true;
            spc::State::get()->m_levelStateUpdate = true;
            });
        state->m_server->send(state->getEventMessage("editor_exit"));
        return EditorPauseLayer::onExitEditor(sender);
    }
};
