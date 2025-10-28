#pragma once

#include <Geode/Geode.hpp>
#include "spc_G3DProgressBar.h"

using namespace geode::prelude;

namespace spc {
    class G3DPlanetPopup : public geode::Popup<int> {
    protected:
        G3DProgressBar* normalBar;
        G3DProgressBar* practiceBar;
        GJGameLevel* level;
        int levelID;
        bool openOnce = false;
        static bool isOpened;
        bool setup(int levelID) override;
        void onPlayLevel(CCObject*);
        void onClose(cocos2d::CCObject* obj) override;
        virtual void onEnter() override;

    public:
        static bool checkIsOpened() { return isOpened; }
        static void tryOpen(int levelID);
        static GJGameLevel* getLevelByID(int levelID);
    };
}
