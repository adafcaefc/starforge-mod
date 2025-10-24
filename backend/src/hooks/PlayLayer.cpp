#include <Geode/Geode.hpp>
#include <Geode/modify/PlayLayer.hpp>
#include "../spc_state.h"

using namespace geode::prelude;

namespace spc {
    // to do: only load level that contains data
    static void loadObjects(GJBaseGameLayer* layer) {
        auto state = spc::State::get();
        state->m_levelData.m_gameObjects.clear();

        for (auto objx : CCArrayExt<GameObject*>(layer->m_objects)) {
            if (objx == layer->m_anticheatSpike) { continue; }
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
            state->m_levelData.m_gameObjects.push_back(obj);
        }
    }
    
    static void loadLevelData(GJBaseGameLayer* layer) {
        auto state = spc::State::get();
        state->m_levelData.m_levelLength = layer->m_levelLength;

        if (auto level = layer->m_level) {
            state->m_levelData.m_levelID = level->m_levelID;
        }

        state->m_levelData.m_levelData.reset();
        state->m_levelData.m_hasLevelData = ldata::hasLevelData(layer);
        if (state->m_levelData.m_hasLevelData) {
            state->m_levelData.m_levelData = ldata::getLevelData(layer);
        }
    }
}

class $modify(PlayLayer) {
    void resetLevel() {
        PlayLayer::resetLevel();

        spc::loadObjects(this);
        spc::loadLevelData(this);

        auto state = spc::State::get();
        state->server->send(state->getLevelDataMessage());
        state->server->send(state->getEventMessage("level_reset"));
    }
    void onQuit() {
        PlayLayer::onQuit();
        auto state = spc::State::get();
        state->server->send(state->getEventMessage("level_exit"));
        state->m_levelData.m_levelData.reset();
    }
};
