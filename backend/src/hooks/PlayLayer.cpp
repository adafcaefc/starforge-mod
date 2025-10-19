#include <Geode/Geode.hpp>
#include <Geode/modify/PlayLayer.hpp>
#include "../spc_state.h"

using namespace geode::prelude;

namespace spc {
    // to do: only load level that contains data
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
}

class $modify(PlayLayer) {
    void resetLevel() {
        PlayLayer::resetLevel();
        spc::loadObjects(this);
    }
};
