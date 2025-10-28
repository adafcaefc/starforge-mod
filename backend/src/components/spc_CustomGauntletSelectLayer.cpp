#include "spc_CustomGauntletSelectLayer.h"
#include "spc_state.h"
#include "spc_sprite_utils.h"
#include "spc_web_utils.h"
#include "spc_sprite_generators.h"
#include "spc_G3DPlanetPopup.h"
#include <Geode/modify/DialogLayer.hpp>
#include <filesystem>

using namespace geode::prelude;

namespace spc {
    // Data structure for custom dialog properties
    struct CustomDialogData {
        std::optional<std::filesystem::path> m_soundOnAppear;
        std::optional<std::filesystem::path> m_potraitImage;
        std::optional<float> m_iconScale;
        
        CustomDialogData(
            const std::optional<std::filesystem::path>& soundOnAppear,
            const std::optional<std::filesystem::path>& potraitImage,
            const std::optional<float>& iconScale)
            : m_soundOnAppear(soundOnAppear), m_potraitImage(potraitImage), m_iconScale(iconScale) {
        }
    };
}

// https://github.com/GDColon/Custom-Textboxes/blob/main/src/CustomTextbox.cpp
class $modify(CustomDialogLayer, DialogLayer) {
public:
    struct Fields {
        std::unordered_map<DialogObject*, std::shared_ptr<spc::CustomDialogData>> m_customData;
    };

    void displayDialogObject(DialogObject* obj) {
        DialogLayer::displayDialogObject(obj);

        auto customDataIt = m_fields->m_customData.find(obj);
        if (customDataIt == m_fields->m_customData.end()) return;

        auto customData = customDataIt->second;

        if (customData->m_soundOnAppear.has_value())
            FMODAudioEngine::sharedEngine()->playEffect(geode::utils::string::pathToString(customData->m_soundOnAppear.value()).c_str());

        m_mainLayer->removeChildByID("custom_portrait"_spr);
        if (customData->m_potraitImage.has_value()) {
            m_characterSprite->setVisible(false);
            auto newPortrait =
                spc::spriteFromData(spc::readFromFileSpecial(customData->m_potraitImage.value()));
            newPortrait->setID("custom_portrait"_spr);
            newPortrait->setPosition(m_characterSprite->getPosition());
            if (customData->m_iconScale.has_value())
                newPortrait->setScale(customData->m_iconScale.value());
            newPortrait->setZOrder(4);
            m_mainLayer->addChild(newPortrait);
        }
    }
};

namespace spc {
    CustomGauntletSelectLayer* CustomGauntletSelectLayer::create(int p0) {
        auto ret = new CustomGauntletSelectLayer();
        if (ret && ret->init(p0)) {
            ret->autorelease();
            return ret;
        }
        CC_SAFE_DELETE(ret);
        return nullptr;
    }

    bool CustomGauntletSelectLayer::init(int p0) {
        if (!GauntletSelectLayer::init(p0)) {
            return false;
        }

        // Replace back button
        if (auto backMenu = typeinfo_cast<CCMenu*>(this->getChildByIDRecursive("back-menu"))) {
            if (auto backBtn = typeinfo_cast<CCMenuItemSpriteExtra*>(backMenu->getChildByIDRecursive("back-button"))) {
                auto newBackBtn = CCMenuItemSpriteExtra::create(
                    backBtn->getNormalImage(),
                    this,
                    menu_selector(CustomGauntletSelectLayer::onBack)
                );
                newBackBtn->setID(backBtn->getID());
                newBackBtn->setScale(backBtn->getScale());
                newBackBtn->setPosition(backBtn->getPosition());
                newBackBtn->setZOrder(backBtn->getZOrder());
                newBackBtn->setAnchorPoint(backBtn->getAnchorPoint());
                newBackBtn->setVisible(backBtn->isVisible());
                newBackBtn->setOpacity(backBtn->getOpacity());
                newBackBtn->setColor(backBtn->getColor());
                newBackBtn->setTag(backBtn->getTag());
                newBackBtn->setEnabled(backBtn->isEnabled());
                backMenu->removeChild(backBtn, true);
                backMenu->addChild(newBackBtn);
            }
        }

        // Replace info button
        if (auto bottomLeftMenu = typeinfo_cast<CCMenu*>(this->getChildByIDRecursive("bottom-left-menu"))) {
            if (auto infoBtn = typeinfo_cast<CCMenuItemSpriteExtra*>(bottomLeftMenu->getChildByIDRecursive("info-button"))) {
                auto newInfoBtn = CCMenuItemSpriteExtra::create(
                    infoBtn->getNormalImage(),
                    this,
                    menu_selector(CustomGauntletSelectLayer::onOrionDialog)
                );
                newInfoBtn->setID(infoBtn->getID());
                newInfoBtn->setScale(infoBtn->getScale());
                newInfoBtn->setPosition(infoBtn->getPosition());
                newInfoBtn->setZOrder(infoBtn->getZOrder());
                newInfoBtn->setAnchorPoint(infoBtn->getAnchorPoint());
                newInfoBtn->setVisible(infoBtn->isVisible());
                newInfoBtn->setOpacity(infoBtn->getOpacity());
                newInfoBtn->setColor(infoBtn->getColor());
                newInfoBtn->setTag(infoBtn->getTag());
                newInfoBtn->setEnabled(infoBtn->isEnabled());
                bottomLeftMenu->removeChild(infoBtn, true);
                bottomLeftMenu->addChild(newInfoBtn);
            }
        }

        // Add UFO button
        if (auto bottomRightMenu = typeinfo_cast<CCMenu*>(this->getChildByIDRecursive("bottom-right-menu"))) {
            auto myButtonSprite = getUfoBtnSprite();
            auto myButton = CCMenuItemSpriteExtra::create(
                myButtonSprite,
                this,
                menu_selector(CustomGauntletSelectLayer::onOpenLink)
            );
            myButton->setID("ufo-button"_spr);
            bottomRightMenu->addChild(myButton);
            myButton->setPosition(ccp(-10.f, 20.f));
            if (auto child = myButtonSprite->getChildByIndex(0)) {
                child->setScale(0.225f);
            }
        }

        // Hide unwanted elements
        if (auto loadingCircle = this->getChildByIDRecursive("loading-circle")) {
            loadingCircle->setVisible(false);
            loadingCircle->setZOrder(-1000);
        }

        if (auto gauntletList = typeinfo_cast<BoomScrollLayer*>(this->getChildByIDRecursive("gauntlets-list"))) {
            gauntletList->setVisible(false);
            gauntletList->setZOrder(-1000);
        }

        if (auto titleLabel = this->getChildByIDRecursive("title")) {
            titleLabel->setVisible(false);
            titleLabel->setZOrder(-1000);
        }

        if (auto tryAgainText = this->getChildByIDRecursive("try-again-text")) {
            tryAgainText->setVisible(false);
            tryAgainText->setZOrder(-1000);
        }

        if (auto scrollButtonsMenu = typeinfo_cast<CCMenu*>(this->getChildByIDRecursive("scroll-buttons-menu"))) {
            scrollButtonsMenu->setVisible(false);
            scrollButtonsMenu->setZOrder(-1000);
        }

        // Create starfield background
        if (auto background = typeinfo_cast<CCSprite*>(this->getChildByIDRecursive("background"))) {
            auto starField = CCNode::create();
            auto winSize = CCDirector::sharedDirector()->getWinSize();

            constexpr int numStars = 120;
            for (int i = 0; i < numStars; ++i) {
                auto star = CCSprite::create();
                auto draw = CCDrawNode::create();
                auto randomRadius = .05f + CCRANDOM_0_1() * .35f;
                draw->drawDot(CCPointZero, randomRadius, ccc4f(1, 1, 1, 1));
                star->addChild(draw);

                float x = CCRANDOM_0_1() * winSize.width;
                float y = CCRANDOM_0_1() * winSize.height;
                star->setPosition({ x, y });
                star->setOpacity(0);
                starField->addChild(star);

                float delay = CCRANDOM_0_1() * 9.0f;
                float fadeIn = 1.5f + CCRANDOM_0_1() * 1.5f;
                float fadeOut = 1.5f + CCRANDOM_0_1() * 1.5f;

                auto blink = CCSequence::create(
                    CCDelayTime::create(delay),
                    CCFadeIn::create(fadeIn),
                    CCFadeOut::create(fadeOut),
                    nullptr
                );

                star->runAction(CCRepeatForever::create(blink));
            }

            auto drift = CCMoveBy::create(25.0f, { 10.0f, 5.0f });
            starField->runAction(CCRepeatForever::create(
                CCSequence::create(drift, drift->reverse(), nullptr)
            ));

            starField->setID("star-field"_spr);
            starField->setContentSize(background->getContentSize());
            starField->setZOrder(background->getZOrder());
            starField->setPosition(background->getPosition());
            background->getParent()->addChild(starField);
            background->setVisible(false);
        }

        // Create planet menu
        auto planetMenu = CCMenu::create();
        planetMenu->setPosition(ccp(
            this->getContentSize().width / 2.f,
            this->getContentSize().height / 2.f
        ));
        this->addChild(planetMenu);

        auto planetBtn = CCMenuItemSpriteExtra::create(
            getMeteorButtonSprite(),
            this,
            menu_selector(CustomGauntletSelectLayer::onPlayLevel)
        );
        planetBtn->getChildByIndex(0)->setScale(0.45f);
        planetMenu->addChild(planetBtn);

        return true;
    }

    void CustomGauntletSelectLayer::onBack(CCObject*) {
        CCDirector::sharedDirector()->popSceneWithTransition(0.3f, kPopTransitionFade);
    }

    void CustomGauntletSelectLayer::onPlayLevel(CCObject*) {
        G3DPlanetPopup::tryOpen(800000000);
    }

    void CustomGauntletSelectLayer::onOpenLink(CCObject*) {
        openWebserverLink();
    }

    void CustomGauntletSelectLayer::onOrionDialog(CCObject*) {
        struct DialogEntry {
            const char* character;
            const char* text;
            int iconType;
            const char* soundFile;
        };

        const DialogEntry dialogEntries[] = {
            {"Loading", "Booting up...", 5, nullptr},
            {"Orion", "Greetings. I am Orion, your ship's artificial intelligence. My existence is to ensure your survival. Mostly.", 5, "dlg1.wav"},
            {"Orion", "You are now aboard the spaceship Starforge. Please observe your screen to control the vessel. Your choices are being recorded. For science.", 6, "dlg2.wav"},
            {"Orion", "Control inputs may be delayed due to intergalactic transmission. This is not a bug. It is a feature.", 5, "dlg3.wav"},
            {"Orion", "For optimal performance, play in windowed mode. Do not minimize the game executable. Ignoring this advice will result in disappointment.", 6, "dlg4.wav"}
        };

        auto array = cocos2d::CCArray::create();
        std::vector<DialogObject*> dialogObjects;

        for (const auto& entry : dialogEntries) {
            auto dialogObj = DialogObject::create(
                entry.character,
                entry.text,
                entry.iconType, .75f, true, ccc3(255, 255, 255)
            );
            array->addObject(dialogObj);
            dialogObjects.push_back(dialogObj);
        }

        auto* dialog = static_cast<CustomDialogLayer*>(CustomDialogLayer::createDialogLayer(nullptr, array, 1));

        const auto orionImage = State::get()->getResourcesPath() / "image" / "orion.png";
        for (size_t i = 0; i < dialogObjects.size(); ++i) {
            std::optional<std::filesystem::path> soundPath = std::nullopt;
            if (dialogEntries[i].soundFile) {
                soundPath = State::get()->getResourcesPath() / "sound" / dialogEntries[i].soundFile;
            }
            dialog->m_fields->m_customData[dialogObjects[i]] = std::make_shared<spc::CustomDialogData>(
                soundPath, orionImage, .3f
            );
        }

        dialog->animateInRandomSide();
        dialog->m_characterSprite->setVisible(false);
        CCScene::get()->addChild(dialog, 1000);
    }

    void CustomGauntletSelectLayer::loadLevelsFinished(cocos2d::CCArray* p0, char const* p1, int p2) {
    }

    void CustomGauntletSelectLayer::loadLevelsFailed(char const* p0, int p1) {
    }
}
