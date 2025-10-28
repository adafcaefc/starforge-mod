#pragma once

#include <Geode/Geode.hpp>

using namespace geode::prelude;

namespace spc {
    class CustomGauntletSelectLayer : public GauntletSelectLayer {
    public:
        static CustomGauntletSelectLayer* create(int p0);
        bool init(int p0);
        
        void onBack(CCObject*);
        void onPlayLevel(CCObject*);
        void onOpenLink(CCObject*);
        void onOrionDialog(CCObject*);
        
        virtual void loadLevelsFinished(cocos2d::CCArray* p0, char const* p1, int p2) override;
        virtual void loadLevelsFailed(char const* p0, int p1) override;
    };
}
