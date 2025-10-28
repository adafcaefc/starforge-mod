#include "spc_G3DPlanetPopup.h"
#include "spc_state.h"
#include <hjfod.gmd-api/include/GMD.hpp>

using namespace geode::prelude;

namespace spc {
    // https://github.com/adafcaefc/Geome3Dash/blob/master/Geome3Dash/src/game/planet/G3DPlanetPopup.cpp
    GJGameLevel* G3DPlanetPopup::getLevelByID(int levelID) {
        const auto gmdName = fmt::format("{}.gmd", levelID);
        const auto path = spc::State::get()->getResourcesPath() / "level" / gmdName;
        if (std::filesystem::exists(path))
        {
            const auto levelTag = fmt::format("spc-level-{}", levelID);
            // check first whether GameManager has a child with the same levelID
            if (auto level = typeinfo_cast<GJGameLevel*>(GameManager::get()->getChildByID(levelTag))) {
                if (level && level->m_levelID == levelID) {
                    return level;
                }
            }
            if (auto level = gmd::importGmdAsLevel(path).unwrapOr(nullptr))
            {
                level->m_levelID = levelID;
                level->m_dailyID = levelID;
                level->m_levelType = GJLevelType::Saved;
                level->m_stars = 0;
                GameManager::get()->addChild(level);
                level->setID(levelTag);
                return level;
            }
        }
        return nullptr;
    }

    // https://github.com/adafcaefc/Geome3Dash/blob/master/Geome3Dash/src/game/planet/G3DPlanetPopup.cpp
    bool G3DPlanetPopup::setup(int levelID)
    {
        this->levelID = levelID;
        this->level = G3DPlanetPopup::getLevelByID(levelID);

        if (this->level) { this->setTitle(this->level->m_levelName); }
        else { this->setTitle("Coming Soon!"); }
        this->levelID = levelID;
        auto mySize = this->m_bgSprite->getContentSize();

        this->m_closeBtn->setZOrder(5);

        auto corner1 = CCSprite::createWithSpriteFrameName("rewardCorner_001.png");
        corner1->setPosition({ 0, 0 });
        corner1->setAnchorPoint({ 0, 0 });
        m_buttonMenu->addChild(corner1);

        auto corner2 = CCSprite::createWithSpriteFrameName("rewardCorner_001.png");
        corner2->setPosition({ 0, mySize.height });
        corner2->setRotation(90);
        corner2->setAnchorPoint({ 0, 0 });
        m_buttonMenu->addChild(corner2);

        auto corner3 = CCSprite::createWithSpriteFrameName("rewardCorner_001.png");
        corner3->setPosition({ mySize.width, mySize.height });
        corner3->setRotation(180);
        corner3->setAnchorPoint({ 0, 0 });
        m_buttonMenu->addChild(corner3);

        auto corner4 = CCSprite::createWithSpriteFrameName("rewardCorner_001.png");
        corner4->setPosition({ mySize.width, 0 });
        corner4->setRotation(270);
        corner4->setAnchorPoint({ 0, 0 });
        m_buttonMenu->addChild(corner4);

        auto playBtnSprite = CCSprite::createWithSpriteFrameName("GJ_playBtn2_001.png");
        auto playBtn = CCMenuItemSpriteExtra::create(playBtnSprite, this, menu_selector(G3DPlanetPopup::onPlayLevel));
        playBtn->setPosition({ mySize.width / 2, mySize.height / 2 + 20 });
        m_buttonMenu->addChild(playBtn);

        normalBar = G3DProgressBar::create();
        normalBar->setPosition({ mySize.width / 2, mySize.height / 2 - 50 });
        normalBar->setScale(0.5);
        m_buttonMenu->addChild(normalBar);

        practiceBar = G3DProgressBar::create();
        practiceBar->setPosition({ mySize.width / 2, mySize.height / 2 - 65 });
        practiceBar->setScale(0.5);
        m_buttonMenu->addChild(practiceBar);

        return true;
    }

    void G3DPlanetPopup::onEnter() {
        Popup::onEnter();
        if (level) {
            normalBar->setProgress(level->m_normalPercent);
            normalBar->setColor(ccc3(0, 255, 0));

            practiceBar->setProgress(level->m_practicePercent);
            practiceBar->setColor(ccc3(0, 150, 255));
        }
    }

    void G3DPlanetPopup::onPlayLevel(CCObject*)
    {
        if (level)
        {
            isOpened = false;
            auto playLayer = PlayLayer::scene(level, 0, 0);
            CCDirector::sharedDirector()->pushScene(CCTransitionFade::create(0.3f, playLayer));
        }
        else
        {

        }
    }

    void G3DPlanetPopup::onClose(cocos2d::CCObject* obj) {
        Popup::onClose(obj);
        isOpened = false;
    }

    void G3DPlanetPopup::tryOpen(int levelID) {
        if (!isOpened) {
            isOpened = true;
            auto ret = new G3DPlanetPopup();
            if (ret->initAnchored(240.f, 200.f, levelID)) {
                ret->autorelease();
                ret->show();
                return;
            }
            delete ret;
        }
    }

    bool G3DPlanetPopup::isOpened = false;
}
