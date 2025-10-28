#pragma once

#include <Geode/Geode.hpp>

using namespace geode::prelude;

namespace spc {
    class G3DProgressBar : public CCSprite {
        CCClippingNode* clipper;
        CCDrawNode* stencil;
        CCSprite* filling;
        CCLabelBMFont* label;
        int progress = 0;

        virtual bool init();
        void updateClipper();

    public:
        void setColor(const ccColor3B& color);
        void setProgress(int progress);
        static G3DProgressBar* create();
    };
}
