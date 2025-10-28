#include "spc_sprite_utils.h"
#include "spc_state.h"
#include <fstream>

using namespace geode::prelude;

namespace spc {
    std::vector<char> readFromFileSpecial(const std::filesystem::path& path)
    {
        try {
            if (!std::filesystem::exists(path)) return std::vector<char>();
            std::ifstream file(path, std::ios::binary | std::ios::ate);
            std::streamsize size = file.tellg();
            file.seekg(0, std::ios::beg);
            std::vector<char> buffer(size);
            file.read(buffer.data(), size);
            return buffer;
        } 
        catch (...) {
            return std::vector<char>();
        }
    }

    void addAnimations(
        cocos2d::CCAnimation* animation,
        const std::filesystem::path& path,
        const uint16_t maxSize)
    {
        for (uint16_t i = 1u; i < maxSize; ++i) {
            try {
                auto imgPath = path / fmt::format("{:04}.png", i);
                if (!std::filesystem::exists(imgPath)) break;
                auto icon = spriteFromData(readFromFileSpecial(imgPath));
                animation->addSpriteFrame(icon->displayFrame());
            }
            catch (...) {
            }
        }
    }

    cocos2d::CCSprite* spriteFromData(const std::vector<char>& data)
    {
        const auto fnv1a64 = [](const std::vector<char>& data) -> uint64_t {
            constexpr uint64_t FNV_OFFSET_BASIS = 1469598103934665603ull;
            constexpr uint64_t FNV_PRIME = 1099511628211ull;
            uint64_t hash = FNV_OFFSET_BASIS;
            for (unsigned char c : data)
                hash = (hash ^ c) * FNV_PRIME;
            return hash;
        };
        
        auto state = State::get();
        const auto hash = fnv1a64(data);
        
        if (state->m_spriteFromDataCache.contains(hash))
            return cocos2d::CCSprite::createWithTexture(state->m_spriteFromDataCache[hash]);
            
        cocos2d::CCImage* image = new cocos2d::CCImage();
        image->initWithImageData((void*)&data.front(), data.size());
        cocos2d::CCTexture2D* texture = new cocos2d::CCTexture2D();
        texture->initWithImage(image);
        delete image;
        texture->retain();
        state->m_spriteFromDataCache[hash] = texture;
        return cocos2d::CCSprite::createWithTexture(texture);
    }
}
