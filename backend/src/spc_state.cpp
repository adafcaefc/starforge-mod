#include "spc_state.h"

#include <iomanip>
#include <nlohmann/json.hpp>
#include <sstream>

#include "spc_webserver.h"

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
                m_gameObjects.emplace_back(objx);
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

    void State::initializeServer() {
        m_server = spc::socket::SocketServer::create(
            Mod::get()->getSettingValue<uint16_t>("websocket-port"));
        std::thread(spc::webserver::run,
            Mod::get()->getSettingValue<uint16_t>("webserver-port")).detach();
    }
}
