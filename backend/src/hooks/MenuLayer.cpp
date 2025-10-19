#include <Geode/Geode.hpp>
#include <Geode/modify/MenuLayer.hpp>
#include <filesystem>
#include <fstream>

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

class $modify(MyMenuLayer, MenuLayer) {
    bool init() {
        if (!MenuLayer::init()) {
            return false;
        }

        auto animation = cocos2d::CCAnimation::create();
        animation->setDelayPerUnit(1.0f / 24.0f);
        addAnimations(animation, "C:\\Users\\Windows\\Desktop\\blender test", 64u);
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
        FLAlertLayer::create("Geode", "Hello from my custom mod!", "OK")->show();
    }
};
