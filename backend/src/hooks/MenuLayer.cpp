#include <Geode/Geode.hpp>
#include <Geode/modify/MenuLayer.hpp>
#include <Geode/modify/DialogLayer.hpp>
#include <filesystem>
#include <fstream>

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

class $modify(MyMenuLayer, MenuLayer) {
    bool init() {
        if (!MenuLayer::init()) {
            return false;
        }

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

        auto myButton = CCMenuItemSpriteExtra::create(
            btnSprite,
            this,
            menu_selector(MyMenuLayer::onMyButton)
        );
        auto menu = this->getChildByID("bottom-menu");
        menu->addChild(myButton);
        myButton->setID("my-button"_spr);
        menu->updateLayout();
        return true;
    }

    void onMyButton(CCObject*) {
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
};
