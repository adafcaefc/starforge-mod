#pragma once

#include <vector>
#include <Geode/Geode.hpp>
#include <glm/glm.hpp>
#include <nlohmann/json.hpp>


namespace glm 
{
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(vec3, x, y, z);
}

namespace spc::ldata
{
    struct Curve
    {
        glm::vec3 p1;
        glm::vec3 m1;
        glm::vec3 m2;
        glm::vec3 p2;

        float p1NormalAngle = 0;
        float p2NormalAngle = 0;
    };

    class Spline
    {
    public:
        std::vector<Curve> segments;
    };

    struct ObjectModelData {
        float scaleX = 1.0f;
        float scaleY = 1.0f;
        std::vector<std::string> modelTextures;
        bool shouldSpin = false;
    };

    struct LevelData
    {
		Spline spline;
        std::unordered_map<int, ObjectModelData> objectModels;
    };

    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(Curve, p1, m1, p2, m2, p1NormalAngle, p2NormalAngle);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(Spline, segments);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(ObjectModelData, scaleX, scaleY, modelTextures, shouldSpin);
    
    // Custom serialization for LevelData to handle unordered_map
    inline void to_json(nlohmann::json& j, const LevelData& data) {
        j["spline"] = data.spline;
        
        // Convert unordered_map to json object
        nlohmann::json objectModelsJson = nlohmann::json::object();
        for (const auto& [key, value] : data.objectModels) {
            objectModelsJson[std::to_string(key)] = value;
        }
        j["objectModels"] = objectModelsJson;
    }

    inline void from_json(const nlohmann::json& j, LevelData& data) {
        j.at("spline").get_to(data.spline);
        
        // Convert json object back to unordered_map
        if (j.contains("objectModels")) {
            data.objectModels.clear();
            for (const auto& [key, value] : j.at("objectModels").items()) {
                data.objectModels[std::stoi(key)] = value.get<ObjectModelData>();
            }
        }
    }

    void msgLevelEncode(GJBaseGameLayer* layer, const std::string& message);
	std::string msgLevelDecode(GJBaseGameLayer* layer);

	LevelData getLevelData(GJBaseGameLayer* layer);
	void setLevelData(GJBaseGameLayer* layer, const LevelData& data);

    bool hasLevelData(GJBaseGameLayer* layer);
}