#include "spc_level_data.h"

namespace spc::ldata
{
    static std::vector<std::string> splitString(const std::string &str, char delimiter)
    {
        std::vector<std::string> tokens;
        std::stringstream ss(str);
        std::string token;
        while (std::getline(ss, token, delimiter))
        {
            tokens.push_back(token);
        }
        return tokens;
    }

    std::string joinStrings(const std::vector<std::string> &tokens, char delimiter)
    {
        std::ostringstream joined;
        for (size_t i = 0; i < tokens.size(); ++i)
        {
            joined << tokens[i];
            if (i < tokens.size() - 1)
            {
                joined << delimiter;
            }
        }
        return joined.str();
    }

    std::string encodeGuidelines(const std::string &data, const std::string &guidelines)
    {
        std::vector<std::string> tokens = splitString(guidelines, '~');
        auto startIt = std::find(tokens.begin(), tokens.end(), "283036382.0");
        auto endIt = std::find(tokens.begin(), tokens.end(), "283036382.1");
        if (startIt != tokens.end() && endIt != tokens.end() && startIt < endIt)
        {
            tokens.erase(startIt, endIt + 1);
        }
        tokens.push_back("283036382.0");
        for (char ch : data)
        {
            float timestamp = static_cast<float>(ch);
            float colorValue = 0.0f;
            tokens.push_back(std::to_string(timestamp));
            tokens.push_back(std::to_string(colorValue));
        }
        tokens.push_back("283036382.1");
        return joinStrings(tokens, '~');
    }

    std::string decodeGuidelines(const std::string &encodedGuidelines)
    {
        std::string decodedData;
        std::vector<std::string> tokens = splitString(encodedGuidelines, '~');
        auto startIt = std::find(tokens.begin(), tokens.end(), "283036382.0");
        auto endIt = std::find(tokens.begin(), tokens.end(), "283036382.1");

        if (startIt == tokens.end() || endIt == tokens.end() || startIt >= endIt)
        {
            return ""; // No valid encoded data found
        }

        for (auto it = startIt + 1; it < endIt; it += 2)
        {
            float timestamp = std::stof(*it);
            decodedData.push_back(static_cast<char>(static_cast<int>(timestamp)));
        }

        return decodedData;
    }

    void msgLevelEncode(GJBaseGameLayer *layer, const std::string &message)
    {
        layer->m_levelSettings->m_guidelineString = encodeGuidelines(message, layer->m_levelSettings->m_guidelineString);
    }

    std::string msgLevelDecode(GJBaseGameLayer *layer)
    {
        return decodeGuidelines(layer->m_levelSettings->m_guidelineString);
    }

    bool hasLevelData(GJBaseGameLayer *layer)
    {
        std::vector<std::string> tokens = splitString(layer->m_levelSettings->m_guidelineString, '~');
        auto startIt = std::find(tokens.begin(), tokens.end(), "283036382.0");
        auto endIt = std::find(tokens.begin(), tokens.end(), "283036382.1");
        return (startIt != tokens.end() && endIt != tokens.end() && startIt < endIt);
    }

    LevelData getLevelData(GJBaseGameLayer *layer)
    {
        std::string msg = msgLevelDecode(layer);
        nlohmann::json jsonData = nlohmann::json::parse(msg);
        LevelData levelData = jsonData.get<LevelData>();
        return levelData;
    }

    void setLevelData(GJBaseGameLayer *layer, const LevelData &data)
    {
        nlohmann::json jsonData = data;
        std::string jsonMsg = jsonData.dump();
        msgLevelEncode(layer, jsonMsg);
    }
}