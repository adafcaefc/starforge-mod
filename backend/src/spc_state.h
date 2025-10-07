#pragma once

#include <cstdint>
#include <string>

namespace spc {
    class State {
    public:
        struct ColorRGB {
            uint8_t m_r = 0;
            uint8_t m_g = 0;  
            uint8_t m_b = 0;
        };

        enum class Mode {
            Idle = 0,
            Playing = 1,
            Paused = 2,
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

        // Convert state to JSON string
        std::string toJSON() const;

        Mode m_mode = Mode::Idle;
        PlayerState m_player1;
        PlayerState m_player2;
        ColorRGB m_bgColor = {0, 0, 0};
        ColorRGB m_gColor = {0, 0, 0};
        ColorRGB m_g2Color = {0, 0, 0};
        ColorRGB m_mgColor = {0, 0, 0};
        ColorRGB m_mg2Color = {0, 0, 0};
        uint32_t m_levelID = 0;
        float m_levelLength = 0.0f;

    private:
        State() = default;
        ~State() = default;
        State(State const&) = delete;
        State(State&&) = delete;
        State& operator=(State const&) = delete;
        State& operator=(State&&) = delete;
    };
}
