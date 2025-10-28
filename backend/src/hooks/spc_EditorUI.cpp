#include <Geode/Geode.hpp>
#include <Geode/modify/EditorUI.hpp>
#include "spc_state.h"

using namespace geode::prelude;

class $modify(EditorUI) {
    void moveObject(GameObject* p0, cocos2d::CCPoint p1) {
        EditorUI::moveObject(p0, p1);
        auto state = spc::State::get();
        geode::queueInMainThread([]() { spc::State::get()->m_levelStateUpdate = true; });
        state->m_server->send(state->getEventMessage("editor_move_object"));
    }
    
    void onCopy(cocos2d::CCObject* p0) {
        EditorUI::onCopy(p0);
        auto state = spc::State::get();
        geode::queueInMainThread([]() { spc::State::get()->m_levelStateUpdate = true; });
        state->m_server->send(state->getEventMessage("editor_copy_object"));
    }
    
    void onPaste(cocos2d::CCObject* p0) {
        EditorUI::onPaste(p0);
        auto state = spc::State::get();
        geode::queueInMainThread([]() { spc::State::get()->m_levelStateUpdate = true; });
        state->m_server->send(state->getEventMessage("editor_paste_object"));
    }
    
    void doPasteObjects(bool p0) {
        EditorUI::doPasteObjects(p0);
        auto state = spc::State::get();
        geode::queueInMainThread([]() { spc::State::get()->m_levelStateUpdate = true; });
        state->m_server->send(state->getEventMessage("editor_do_paste_object"));
    }
};
