#include <Geode/Geode.hpp>
#include <Geode/modify/MenuLayer.hpp>
#include <Geode/modify/DialogLayer.hpp>
#include <filesystem>
#include <fstream>
#include <hjfod.gmd-api/include/GMD.hpp>

#include "spc_state.h"

using namespace geode::prelude;

static std::vector<char> readFromFileSpecial(
    const std::filesystem::path& path)
{
    if (!std::filesystem::exists(path)) return std::vector<char>();
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::vector<char> buffer(size);
    file.read(buffer.data(), size);
    return buffer;
}

static cocos2d::CCSprite* spriteFromData(std::vector<char> data)
{
    cocos2d::CCImage* image = new cocos2d::CCImage();
    image->initWithImageData((void*)&data.front(), data.size());
    cocos2d::CCTexture2D* texture = new cocos2d::CCTexture2D();
    texture->initWithImage(image);
    delete image;
    return cocos2d::CCSprite::createWithTexture(texture);
}

static void addAnimations(
    cocos2d::CCAnimation* animation,
    const std::filesystem::path& path,
    const uint16_t maxSize = 2048u)
{
    for (uint16_t i = 1u; i < maxSize; ++i)
    {
        auto imgPath = path / fmt::format("{:04}.png", i);
        if (!std::filesystem::exists(imgPath)) break;
        auto icon = spriteFromData(readFromFileSpecial(imgPath));
        animation->addSpriteFrame(icon->displayFrame());
    }
}

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

// https://github.com/GDColon/Custom-Textboxes/blob/main/src/CustomTextbox.cpp
class $modify(CustomDialogLayer, DialogLayer) {
    struct Fields {
        std::unordered_map<DialogObject*, std::shared_ptr<CustomDialogData>> m_customData;
    };

    void displayDialogObject(DialogObject * obj) {
        DialogLayer::displayDialogObject(obj);

        auto customDataIt = m_fields->m_customData.find(obj);
        if (customDataIt == m_fields->m_customData.end()) return;

        auto customData = customDataIt->second;

        if (customData->m_soundOnAppear.has_value())
            FMODAudioEngine::sharedEngine()->playEffect(customData->m_soundOnAppear.value().string().c_str());

        m_mainLayer->removeChildByID("custom_portrait"_spr);
        if (customData->m_potraitImage.has_value()) {
            m_characterSprite->setVisible(false);
            auto newPortrait =
                spriteFromData(readFromFileSpecial(customData->m_potraitImage.value()));
            newPortrait->setID("custom_portrait"_spr);
            newPortrait->setPosition(m_characterSprite->getPosition());
            if (customData->m_iconScale.has_value()) 
                newPortrait->setScale(customData->m_iconScale.value());
            newPortrait->setZOrder(4);
            m_mainLayer->addChild(newPortrait);
        }
    }
};

class CustomGauntletSelectLayer : public GauntletSelectLayer {
public:
    static CustomGauntletSelectLayer* create(int p0) {
        auto ret = new CustomGauntletSelectLayer();
        if (ret && ret->init(p0)) {
            ret->autorelease();
            return ret;
        }
        CC_SAFE_DELETE(ret);
        return nullptr;
    }
    bool init(int p0) {
        return GauntletSelectLayer::init(p0);
    }

    virtual void loadLevelsFinished(cocos2d::CCArray* p0, char const* p1, int p2) override {
    }

    virtual void loadLevelsFailed(char const* p0, int p1) override {
    }
};

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

// https://github.com/adafcaefc/Geome3Dash/blob/master/Geome3Dash/src/game/component/G3DProgressBar.cpp
bool G3DProgressBar::init() {
    if (!CCSprite::initWithFile("GJ_progressBar_001.png")) return false;
    this->updateDisplayedColor(ccc3(0, 0, 0));
    this->setOpacity(100);

    clipper = CCClippingNode::create();
    stencil = CCDrawNode::create();
    clipper->setPosition({ 0, 0 });
    clipper->setContentSize(this->getContentSize());
    updateClipper();
    clipper->setStencil(stencil);
    this->addChild(clipper);

    filling = CCSprite::create("GJ_progressBar_001.png");
    filling->setScaleX(0.98f);
    filling->setScaleY(0.7f);
    filling->setColor(ccc3(255, 255, 0));
    filling->setPosition(this->getContentSize() / 2);
    clipper->addChild(filling);

    label = CCLabelBMFont::create((std::to_string(progress) + "%").c_str(), "bigFont.fnt");
    label->setPosition(this->getContentSize() / 2);
    label->setScale(0.5);
    this->addChild(label);

    return true;
}

static GJGameLevel* getLevelByID(int levelID) {
    const auto path = spc::State::get()->getResourcesPath() / "level" / (std::to_string(levelID) + ".gmd");
    if (std::filesystem::exists(path))
    {
        // check first whether GameManager has a child with the same levelID
        for (auto child : CCArrayExt<CCNode*>(GameManager::get()->getChildren())) {
            auto level = typeinfo_cast<GJGameLevel*>(child);
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
            return level;
        }
    }
    return nullptr;
}

// https://github.com/adafcaefc/Geome3Dash/blob/master/Geome3Dash/src/game/planet/G3DPlanetPopup.cpp
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
};

bool G3DPlanetPopup::setup(int levelID)
{
    this->levelID = levelID;
    this->level = getLevelByID(levelID);

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

void G3DProgressBar::updateClipper() {
    stencil->drawRect(CCRect(2, 0, (this->getContentSize().width - 4) / 100 * progress, this->getContentSize().height), ccColor4F(1, 1, 1, 1), 0, ccColor4F(1, 1, 1, 1));
}

void G3DProgressBar::setColor(const ccColor3B& color) {
    filling->setColor(color);
}

void G3DProgressBar::setProgress(int progress) {
    this->progress = progress;
    updateClipper();
    label->setString((std::to_string(progress) + "%").c_str());
}

G3DProgressBar* G3DProgressBar::create() {
    auto ret = new G3DProgressBar();
    if (ret && ret->init()) {
        ret->autorelease();
        return ret;
    }

    delete ret;
    return nullptr;
}

static CCSprite* spcGetUfoBtnSprite() {
    auto animation = cocos2d::CCAnimation::create();
    animation->setDelayPerUnit(1.0f / 24.0f);
    addAnimations(animation, spc::State::get()->getResourcesPath() / "rendered" / "ufo", 64u);
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

static void spcOpenWebserverLink() {
    geode::utils::web::openLinkInBrowser(fmt::format(
        "http://localhost:{}/",
        Mod::get()->getSettingValue<uint16_t>("webserver-port")
    ));
}

class $modify(MyMenuLayer, MenuLayer) {
    bool init() {
        if (!MenuLayer::init()) {
            return false;
        }
        auto myButton = CCMenuItemSpriteExtra::create(
            spcGetUfoBtnSprite(),
            this,
            menu_selector(MyMenuLayer::onMyButton)
        );
        auto menu = this->getChildByID("bottom-menu");
        menu->addChild(myButton);
        myButton->setID("my-button"_spr);
        menu->updateLayout();
        return true;
    }

    void onOrionDialog(CCObject*) {
        auto dialogTestObj = DialogObject::create(
            "Loading", // Character name
            "Booting up...", // Text
            5, .75f, true, ccc3(255, 255, 255) // Icon type, Text Scale, Can Skip, Color
        );
        auto dialogObject1 = DialogObject::create(
            "Orion", // Character name
            "Greetings. I am Orion, your ship's artificial intelligence. My existence is to ensure your survival. Mostly.", // Text
            5, .75f, true, ccc3(255, 255, 255) // Icon type, Text Scale, Can Skip, Color
        );
        auto dialogObject2 = DialogObject::create(
            "Orion", // Character name
            "You are now aboard the spaceship Starforge. Please observe your screen to control the vessel. Your choices are being recorded. For science.", // Text
            6, .75f, true, ccc3(255, 255, 255) // Icon type, Text Scale, Can Skip, Color
        );
        auto dialogObject3 = DialogObject::create(
            "Orion", // Character name
            "Control inputs may be delayed due to intergalactic transmission. This is not a bug. It is a feature.", // Text
            5, .75f, true, ccc3(255, 255, 255) // Icon type, Text Scale, Can Skip, Color
        );
        auto dialogObject4 = DialogObject::create(
            "Orion", // Character name
            "For optimal performance, play in windowed mode. Do not minimize the game executable. Ignoring this advice will result in disappointment.", // Text
            6, .75f, true, ccc3(255, 255, 255) // Icon type, Text Scale, Can Skip, Color
        );
        auto array = cocos2d::CCArray::create();
        array->addObject(dialogTestObj);
        array->addObject(dialogObject1);
        array->addObject(dialogObject2);
        array->addObject(dialogObject3);
        array->addObject(dialogObject4);
        auto* dialog = static_cast<CustomDialogLayer*>(CustomDialogLayer::createDialogLayer(
            nullptr,
            array, 1 // idk, Background
        ));

        dialog->m_fields->m_customData[dialogTestObj] = std::make_shared<CustomDialogData>(
            std::nullopt,
            spc::State::get()->getResourcesPath() / "image" / "orion.png",
            .3f
        );

        dialog->m_fields->m_customData[dialogObject1] = std::make_shared<CustomDialogData>(
            spc::State::get()->getResourcesPath() / "sound" / "dlg1.wav",
            spc::State::get()->getResourcesPath() / "image" / "orion.png",
            .3f
        );
        dialog->m_fields->m_customData[dialogObject2] = std::make_shared<CustomDialogData>(
            spc::State::get()->getResourcesPath() / "sound" / "dlg2.wav",
            spc::State::get()->getResourcesPath() / "image" / "orion.png",
            .3f
        );
        dialog->m_fields->m_customData[dialogObject3] = std::make_shared<CustomDialogData>(
            spc::State::get()->getResourcesPath() / "sound" / "dlg3.wav",
            spc::State::get()->getResourcesPath() / "image" / "orion.png",
            .3f
        );
        dialog->m_fields->m_customData[dialogObject4] = std::make_shared<CustomDialogData>(
            spc::State::get()->getResourcesPath() / "sound" / "dlg4.wav",
            spc::State::get()->getResourcesPath() / "image" / "orion.png",
            .3f
        );

        dialog->animateInRandomSide();
        dialog->m_characterSprite->setVisible(false);

        CCScene::get()->addChild(dialog, 1000);
    }

    void replaceButton(
        CCLayer* layer,
        CCMenu* menu,
        CCMenuItemSpriteExtra* menuItem,
        CCObject* target,
        cocos2d::SEL_MenuHandler newCallback
    ) {
        auto newBackBtn = CCMenuItemSpriteExtra::create(
            menuItem->getNormalImage(),
            target,
            newCallback
        );

        newBackBtn->setID(menuItem->getID());
        newBackBtn->setScale(menuItem->getScale());
        newBackBtn->setPosition(menuItem->getPosition());
        newBackBtn->setZOrder(menuItem->getZOrder());
        newBackBtn->setAnchorPoint(menuItem->getAnchorPoint());
        newBackBtn->setVisible(menuItem->isVisible());
        newBackBtn->setOpacity(menuItem->getOpacity());
        newBackBtn->setColor(menuItem->getColor());
        newBackBtn->setTag(menuItem->getTag());
        newBackBtn->setEnabled(menuItem->isEnabled());

        menu->removeChild(menuItem, true);
        menu->addChild(newBackBtn);
    }

    void onNewLayerBack(CCObject*) {
        CCDirector::sharedDirector()->popSceneWithTransition(0.3f, kPopTransitionFade);
    }

    void onPlayLevel1(CCObject*) {
        G3DPlanetPopup::tryOpen(800000000);
    }

    void onOpenLink(CCObject*) {
        spcOpenWebserverLink();
    }

    void onMyButton(CCObject*) {
        auto scene = CCScene::create();
        // template layer because idk how to code a new one from scratch
        auto layer = CustomGauntletSelectLayer::create(0);

        if (auto backMenu = typeinfo_cast<CCMenu*>(layer->getChildByIDRecursive("back-menu"))) {
            if (auto backBtn = typeinfo_cast<CCMenuItemSpriteExtra*>(backMenu->getChildByIDRecursive("back-button"))) {
                replaceButton(
                    layer,
                    backMenu,
                    backBtn,
                    layer,
                    menu_selector(MyMenuLayer::onNewLayerBack)
                );
            }
        }

        if (auto bottomLeftMenu = typeinfo_cast<CCMenu*>(layer->getChildByIDRecursive("bottom-left-menu"))) {
            if (auto infoBtn = typeinfo_cast<CCMenuItemSpriteExtra*>(bottomLeftMenu->getChildByIDRecursive("info-button"))) {
                replaceButton(
                    layer,
                    bottomLeftMenu,
                    infoBtn,
                    layer,
                    menu_selector(MyMenuLayer::onOrionDialog)
                );
            }
        }

        if (auto bottomRightMenu = typeinfo_cast<CCMenu*>(layer->getChildByIDRecursive("bottom-right-menu"))) {
            auto myButtonSprite = spcGetUfoBtnSprite();
            auto myButton = CCMenuItemSpriteExtra::create(
                myButtonSprite,
                this,
                menu_selector(MyMenuLayer::onOpenLink)
            );
            myButton->setID("ufo-button"_spr);
            bottomRightMenu->addChild(myButton);
            myButton->setPosition(ccp(
                -10.f,
                20.f
            ));
            if (auto child = myButtonSprite->getChildByIndex(0)) {
                child->setScale(0.225f);
            }
        }

        if (auto loadingCircle = layer->getChildByIDRecursive("loading-circle")) {
            loadingCircle->setVisible(false);
            loadingCircle->setZOrder(-1000);
        }

        if (auto gauntletList = typeinfo_cast<BoomScrollLayer*>(layer->getChildByIDRecursive("gauntlets-list"))) {
            gauntletList->setVisible(false);
            gauntletList->setZOrder(-1000);
        }

        if (auto titleLabel = layer->getChildByIDRecursive("title")) {
            titleLabel->setVisible(false);
            titleLabel->setZOrder(-1000);
        }

        if (auto tryAgainText = layer->getChildByIDRecursive("try-again-text")) {
            tryAgainText->setVisible(false);
            tryAgainText->setZOrder(-1000);
        }

        if (auto scrollButtonsMenu = typeinfo_cast<CCMenu*>(layer->getChildByIDRecursive("scroll-buttons-menu"))) {
            scrollButtonsMenu->setVisible(false);
            scrollButtonsMenu->setZOrder(-1000);
        }

        if (auto background = typeinfo_cast<CCSprite*>(layer->getChildByIDRecursive("background"))) {
            // Create a new node to hold the starfield
            auto starField = CCNode::create();

            auto winSize = CCDirector::sharedDirector()->getWinSize();

            // Create stars
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

                // Random blink timing
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

            // Optional: slow drifting stars for subtle motion
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

        // create a new CCMenu in the middle of the layer
        auto planetMenu = CCMenu::create();
        planetMenu->setPosition(ccp(
            layer->getContentSize().width / 2.f,
            layer->getContentSize().height / 2.f
        ));
        layer->addChild(planetMenu);

        // add a button to the menu that represents a planet
        auto planetBtn = CCMenuItemSpriteExtra::create(
            spriteFromData(readFromFileSpecial(spc::State::get()->getResourcesPath() / "image" / "planet1.png")),
            layer,
            menu_selector(MyMenuLayer::onPlayLevel1)
        );
        planetBtn->getChildByIndex(0)->setScale(0.45f);
        planetMenu->addChild(planetBtn);  

        scene->addChild(layer);
        CCDirector::sharedDirector()->pushScene(CCTransitionFade::create(0.3f, scene));

        // check whether socket connection exist before opening a new web window
        if (spc::State::get()->m_server->getConnectionCount() == 0u) {
            spcOpenWebserverLink();
            // play welcome sound
            const auto soundPath = spc::State::get()->getResourcesPath() / "sound" / "welcome.wav";
            FMODAudioEngine::sharedEngine()->playEffect(soundPath.string());
        }
    }
};
