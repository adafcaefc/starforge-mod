#include "spc_sprite_generators.h"
#include "spc_state.h"
#include "spc_sprite_utils.h"
#include "components/spc_G3DPlanetPopup.h"

using namespace geode::prelude;

namespace spc {
    CCSprite* getUfoBtnSprite() {
        auto animation = cocos2d::CCAnimation::create();
        animation->setDelayPerUnit(1.0f / 24.0f);
        addAnimations(animation, State::get()->getResourcesPath() / "rendered" / "ufo", 64u);
        auto gif = cocos2d::CCSprite::create();
        gif->runAction(cocos2d::CCRepeatForever::create(cocos2d::CCAnimate::create(animation)));

        auto btnSprite = CCSprite::createWithSpriteFrameName("GJ_likeBtn_001.png");

        btnSprite->setScale(2.5f);
        btnSprite->setOpacity(0);

        btnSprite->addChild(gif);
        gif->setPosition(ccp(
            btnSprite->getContentSize().width / 2.f,
            btnSprite->getContentSize().height / 2.f
        ));

        gif->setScale(0.325f);
        return btnSprite;
    }

    CCSprite* getMeteorButtonSprite() {
        auto animation = cocos2d::CCAnimation::create();
        animation->setDelayPerUnit(1.0f / 8.0f);
        addAnimations(animation, State::get()->getResourcesPath() / "rendered" / "meteor1", 64u);
        auto gif = cocos2d::CCSprite::create();
        gif->runAction(cocos2d::CCRepeatForever::create(cocos2d::CCAnimate::create(animation)));

        auto btnSprite = CCSprite::createWithSpriteFrameName("GJ_likeBtn_001.png");

        btnSprite->setScale(3.5f);
        btnSprite->setOpacity(0);

        btnSprite->addChild(gif);
        gif->setPosition(ccp(
            btnSprite->getContentSize().width / 2.f,
            btnSprite->getContentSize().height / 2.f
        ));

        gif->setScale(1.6f);

        std::string levelName = "Level Not Found";
        auto level = G3DPlanetPopup::getLevelByID(800000000);
        if (level)
            levelName = level->m_levelName;

        auto label = CCLabelBMFont::create(levelName.c_str(), "bigFont.fnt");
        label->setScale(1.7f);
        label->setPosition(ccp(
            btnSprite->getContentSize().width / 2.f,
            225.f
        ));
        btnSprite->addChild(label);

        return btnSprite;
    }
}
