#pragma once

#include <cstdint>
#include <string>

#include "spc_socket.h"
#include "spc_level_data.h"

namespace spc {
    class State {
    public:
        std::shared_ptr<socket::SocketServer> m_server = nullptr;

        std::filesystem::path getResourcesPath() const {
            return geode::Mod::get()->getResourcesDir() / "_geode";
        }

        struct GameObject {
            float m_x = 0.0f;
            float m_y = 0.0f;
            float m_rotation = 0.0f;
            float m_scaleX = 1.0f;
            float m_scaleY = 1.0f;
            float m_opacity = 1.0f;
            bool m_visible = true;
            int m_objectId = -1;
            uintptr_t m_nativePtr = 0;

            GameObject() = default;
            GameObject(::GameObject* obj)
                : m_x(obj->getPositionX())
                , m_y(obj->getPositionY())
                , m_rotation(obj->getRotation())
                , m_scaleX(obj->getScaleX())
                , m_scaleY(obj->getScaleY())
                , m_opacity(static_cast<float>(obj->getOpacity()) / 255.0f)
                , m_visible(obj->isVisible())
                , m_objectId(obj->m_objectID)
                , m_nativePtr(reinterpret_cast<uintptr_t>(obj))
            {
            }
        };

        struct ColorRGB {
            uint8_t m_r = 0;
            uint8_t m_g = 0;
            uint8_t m_b = 0;
        };

        enum class Mode {
            Idle = 0,
            Playing = 1,
            Paused = 2,
            Editor = 3,
        };

        struct PlayerState {
            enum class Mode {
                Cube = 0,
                Ship = 1,
                Ball = 2,
                UFO = 3,
                Wave = 4,
                Robot = 5,
                Spider = 6,
                Swing = 7,
            };
            float m_x = 0.0f;
            float m_y = 0.0f;
            float m_rotation = 0.0f;
            float m_yVelocity = 0.0f;
            Mode m_mode = Mode::Cube;
        };

        static State* get() {
            static State instance;
            return &instance;
        }

        struct SendableState {
            virtual std::string getName() const = 0;
            virtual nlohmann::json getJSON() = 0;
            virtual nlohmann::json getMessage();
        };

        struct GameState : public SendableState {
            Mode m_mode = Mode::Idle;
            std::string getName() const override;
            nlohmann::json getJSON() override;
        };

        struct LevelData : public SendableState {
            void loadFromLevel(GJBaseGameLayer* layer);
            void reset();
            uint32_t m_levelID = 0;
            float m_levelLength = 0.0f;
            std::vector<GameObject> m_gameObjects;
            ldata::LevelData m_levelData;
            bool m_hasLevelData = false;
            std::string getName() const override;
            nlohmann::json getJSON() override;
        };

        struct LiveLevelData : public SendableState {
            PlayerState m_player1;
            PlayerState m_player2;
            ColorRGB m_bgColor = { 0, 0, 0 };
            ColorRGB m_lineColor = { 0, 0, 0 };
            ColorRGB m_gColor = { 0, 0, 0 };
            ColorRGB m_g2Color = { 0, 0, 0 };
            ColorRGB m_mgColor = { 0, 0, 0 };
            ColorRGB m_mg2Color = { 0, 0, 0 };
            std::string getName() const override;
            nlohmann::json getJSON() override;
        };

        GameState m_gameState;
        LevelData m_levelData;
        LiveLevelData m_liveLevelData;

        bool m_levelStateUpdate = false;
        bool m_levelStateReset = false;

        std::string getGameStateMessage();
        std::string getLevelDataMessage();
        std::string getLiveLevelDataMessage();
        std::string getEventMessage(const std::string& eventName, const nlohmann::json& eventData = nlohmann::json());
    private:
        void initializeServer();
        State() { initializeServer(); }
        ~State() = default;
        State(State const&) = delete;
        State(State&&) = delete;
        State& operator=(State const&) = delete;
        State& operator=(State&&) = delete;
    };

    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(State::GameObject, m_x, m_y, m_rotation, m_scaleX, m_scaleY, m_opacity, m_visible, m_objectId, m_nativePtr);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(State::ColorRGB, m_r, m_g, m_b);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(State::PlayerState, m_x, m_y, m_rotation, m_yVelocity, m_mode);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(State::GameState, m_mode);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(State::LevelData, m_levelID, m_levelLength, m_gameObjects, m_levelData, m_hasLevelData);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(State::LiveLevelData, m_player1, m_player2, m_bgColor, m_lineColor, m_gColor, m_g2Color, m_mgColor, m_mg2Color);
}
