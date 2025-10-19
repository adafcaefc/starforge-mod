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

    struct LevelData
    {
		Spline spline;
    };

    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(Curve, p1, m1, p2, m2, p1NormalAngle, p2NormalAngle);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(Spline, segments);
    NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE(LevelData, spline);

    void msgLevelEncode(GJBaseGameLayer* layer, const std::string& message);
	std::string msgLevelDecode(GJBaseGameLayer* layer);

	LevelData getLevelData(GJBaseGameLayer* layer);
	void setLevelData(GJBaseGameLayer* layer, const LevelData& data);

    bool hasLevelData(GJBaseGameLayer* layer);
}