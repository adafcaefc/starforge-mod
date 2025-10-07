#include "spc_state.h"

#include <iomanip>
#include <nlohmann/json.hpp>
#include <sstream>

namespace spc {
    std::string State::toJSON() const {
        nlohmann::json j;
        j["type"] = "state";
        j["message"] = {
            {"mode", static_cast<int>(m_mode)},
            {"player1",
             {{"x", m_player1.m_x},
              {"y", m_player1.m_y},
              {"mode", static_cast<int>(m_player1.m_mode)},
              {"rotation", m_player1.m_rotation},
              {"yVelocity", m_player1.m_yVelocity}}},
            {"player2",
             {{"x", m_player2.m_x},
              {"y", m_player2.m_y},
              {"mode", static_cast<int>(m_player2.m_mode)},
              {"rotation", m_player2.m_rotation},
              {"yVelocity", m_player2.m_yVelocity}}},
            {"bgColor", {m_bgColor.m_r, m_bgColor.m_g, m_bgColor.m_b}},
            {"gColor", {m_gColor.m_r, m_gColor.m_g, m_gColor.m_b}},
            {"g2Color", {m_g2Color.m_r, m_g2Color.m_g, m_g2Color.m_b}},
            {"mgColor", {m_mgColor.m_r, m_mgColor.m_g, m_mgColor.m_b}},
            {"mg2Color", {m_mg2Color.m_r, m_mg2Color.m_g, m_mg2Color.m_b}},
            {"levelID", m_levelID},
            {"levelLength", m_levelLength}
        };
        return j.dump();
    }
}
