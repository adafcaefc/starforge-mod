#include "spc_state.h"

#include <iomanip>
#include <nlohmann/json.hpp>
#include <sstream>

namespace spc {
    // SendableState
    nlohmann::json State::SendableState::getMessage() {
        nlohmann::json j;
        j["type"] = "state";
        j["name"] = getName();
        j["data"] = getJSON();
        return j;
    }

    // GameState
    std::string State::GameState::getName() const {
        return "game_state";
    }

    nlohmann::json State::GameState::getJSON() {
        nlohmann::json j(*this);
        return j;
    }

    // LevelData
    std::string State::LevelData::getName() const {
        return "level_data";
    }

    nlohmann::json State::LevelData::getJSON() {
        nlohmann::json j(*this);
        return j;
    }

    // LiveLevelData
    std::string State::LiveLevelData::getName() const {
        return "live_level_data";
    }

    nlohmann::json State::LiveLevelData::getJSON() {
        nlohmann::json j(*this);
        return j;
    }

    // State member functions
    std::string State::getGameStateMessage() {
        return m_gameState.getMessage().dump();
    }

    std::string State::getLevelDataMessage() {
        return m_levelData.getMessage().dump();
    }

    std::string State::getLiveLevelDataMessage() {
        return m_liveLevelData.getMessage().dump();
    }

    std::string State::getEventMessage(const std::string& eventName, const nlohmann::json& eventData) {
        nlohmann::json j;
        j["type"] = "event";
        j["name"] = eventName;
        j["data"] = eventData;
        return j.dump();
    }

    void State::LevelData::loadFromLevel(GJBaseGameLayer* layer) {
        reset();
        m_hasLevelData = ldata::hasLevelData(layer);
        if (m_hasLevelData) {
            // load spline data
            m_levelData.reset();
            m_levelData = ldata::getLevelData(layer);

            // load level ID and length
            m_levelLength = layer->m_levelLength;
            if (auto level = layer->m_level) {
                m_levelID = level->m_levelID;
            }

            // load game objects
            for (auto objx : CCArrayExt<::GameObject*>(layer->m_objects)) {
                if (objx == layer->m_anticheatSpike) { continue; }
                State::GameObject obj;
                obj.m_x = objx->getPositionX();
                obj.m_y = objx->getPositionY();
                obj.m_rotation = objx->getRotation();
                obj.m_scaleX = objx->getScaleX();
                obj.m_scaleY = objx->getScaleY();
                obj.m_opacity = static_cast<float>(objx->getOpacity()) / 255.0f;
                obj.m_visible = objx->isVisible();
                obj.m_nativePtr = reinterpret_cast<uintptr_t>(objx);
                obj.m_objectId = objx->m_objectID;
                m_gameObjects.push_back(obj);
            }
        }
    }

    void State::LevelData::reset() {
        m_levelID = 0;
        m_levelLength = 0.0f;
        m_gameObjects.clear();
        m_levelData.reset();
        m_hasLevelData = false;
    }
}
