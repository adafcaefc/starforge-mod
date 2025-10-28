#pragma once

#include <Geode/Geode.hpp>
#include <vector>
#include <filesystem>

using namespace geode::prelude;

namespace spc {
    std::vector<char> readFromFileSpecial(const std::filesystem::path& path);
    
    void addAnimations(
        cocos2d::CCAnimation* animation,
        const std::filesystem::path& path,
        const uint16_t maxSize = 2048u);
    
    cocos2d::CCSprite* spriteFromData(const std::vector<char>& data);
}
