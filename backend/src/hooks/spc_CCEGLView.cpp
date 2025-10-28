#include <Geode/Geode.hpp>
#include <Geode/modify/CCEGLView.hpp>

#include "spc_state.h"

using namespace geode::prelude;

// fix texture on reload
class $modify(cocos2d::CCEGLView) {
    void toggleFullScreen(bool value, bool borderless, bool fix) {
        spc::State::get()->clearSpriteCache();
        CCEGLView::toggleFullScreen(value, borderless, fix);
    }
};
