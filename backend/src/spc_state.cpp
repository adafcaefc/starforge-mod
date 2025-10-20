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
}
