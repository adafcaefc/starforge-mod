#include <Geode/Geode.hpp>
#include <Geode/modify/LevelEditorLayer.hpp>
#include "../spc_state.h"

using namespace geode::prelude;

class $modify(LevelEditorLayer) {
    bool init(GJGameLevel* level, bool unk) {
        if (auto ret = LevelEditorLayer::init(level, unk)) {
            auto state = spc::State::get();
            geode::queueInMainThread([]() { spc::State::get()->m_levelStateUpdate = true; });
            state->m_server->send(state->getEventMessage("editor_start"));
            return ret;
        }
        return false;
    }
    void addSpecial(GameObject* obj) {
        LevelEditorLayer::addSpecial(obj);
        auto state = spc::State::get();
        geode::queueInMainThread([]() { spc::State::get()->m_levelStateUpdate = true; });
        state->m_server->send(state->getEventMessage("editor_add_object"));
    }
    void removeSpecial(GameObject* obj) {
        LevelEditorLayer::removeSpecial(obj);
        auto state = spc::State::get();
        geode::queueInMainThread([]() { spc::State::get()->m_levelStateUpdate = true; });
        state->m_server->send(state->getEventMessage("editor_remove_object"));
    }
};
