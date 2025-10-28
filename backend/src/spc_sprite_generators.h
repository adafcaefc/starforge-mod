#pragma once

#include <Geode/Geode.hpp>

using namespace geode::prelude;

namespace spc {
    // Creates an animated UFO button sprite
    CCSprite* getUfoBtnSprite();
    
    // Creates an animated meteor button sprite with level name
    CCSprite* getMeteorButtonSprite();
}
