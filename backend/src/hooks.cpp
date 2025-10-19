#include <Geode/Geode.hpp>
#include <Geode/modify/CCScheduler.hpp>
#include <Geode/modify/PlayLayer.hpp>
#include <Geode/modify/MenuLayer.hpp>
#include "spc_state.h"
#include "spc_projector.h"
#include "spc_webserver.h"

using namespace geode::prelude;

namespace spc {
    // to do: only load level that contains data
    static void loadObjects(PlayLayer* pl)
    {
        auto state = spc::State::get();
        state->m_gameObjects.clear();

        for (auto objx : CCArrayExt<GameObject*>(pl->m_objects)) {
            if (objx == pl->m_anticheatSpike) { continue; }
            spc::State::GameObject obj;
            obj.m_x = objx->getPositionX();
            obj.m_y = objx->getPositionY();
            obj.m_rotation = objx->getRotation();
            obj.m_scaleX = objx->getScaleX();
            obj.m_scaleY = objx->getScaleY();
            obj.m_opacity = static_cast<float>(objx->getOpacity()) / 255.0f;
            obj.m_visible = objx->isVisible();
            obj.m_nativePtr = reinterpret_cast<uintptr_t>(objx);
            obj.m_objectId = objx->m_objectID;
            state->m_gameObjects.push_back(obj);
        }
    }

    static void spcProcessPlayer(PlayerObject* player, spc::State::PlayerState& state) {
        if (!player) return;
        
        state.m_x = player->m_position.x;
        state.m_y = player->m_position.y;
        state.m_rotation = player->getRotation();
        state.m_yVelocity = player->m_yVelocity;

        if (player->m_isShip) state.m_mode = spc::State::PlayerState::Mode::Ship;
        else if (player->m_isBall) state.m_mode = spc::State::PlayerState::Mode::Ball;
        else if (player->m_isBird) state.m_mode = spc::State::PlayerState::Mode::UFO;
        else if (player->m_isDart) state.m_mode = spc::State::PlayerState::Mode::Wave;
        else if (player->m_isRobot) state.m_mode = spc::State::PlayerState::Mode::Robot;
        else if (player->m_isSpider) state.m_mode = spc::State::PlayerState::Mode::Spider;
        else if (player->m_isSwing) state.m_mode = spc::State::PlayerState::Mode::Swing;
        else state.m_mode = spc::State::PlayerState::Mode::Cube;
    }

    static void loadState() {
        auto state = spc::State::get();
        state->m_mode = spc::State::Mode::Idle;

        if (auto pl = PlayLayer::get()) {
            state->m_mode = spc::State::Mode::Playing;

            if (pl->m_isPaused) {
                state->m_mode = spc::State::Mode::Paused;
            }

            state->m_levelLength = pl->m_levelLength;

            if (auto level = pl->m_level) {
                state->m_levelID = level->m_levelID;
            }

            if (auto p1 = pl->m_player1) {
                spcProcessPlayer(p1, state->m_player1);
            }

            if (auto p2 = pl->m_player2) {
                spcProcessPlayer(p2, state->m_player2);
            }

            if (auto em = pl->m_effectManager)
            {
                static const auto loadColorAction = [](int tag, spc::State::ColorRGB& color, ColorAction* ca) {
                    color.m_r = ca->m_color.r;
                    color.m_g = ca->m_color.g;
                    color.m_b = ca->m_color.b;
                    };
                if (auto ca = em->getColorAction(1000)) {
                    loadColorAction(1000, state->m_bgColor, ca);
                }
                if (auto ca = em->getColorAction(1001)) {
                    loadColorAction(1002, state->m_gColor, ca);
                }
                if (auto ca = em->getColorAction(1002)) {
                    loadColorAction(1003, state->m_lineColor, ca);
                }
                if (auto ca = em->getColorAction(1009)) {
                    loadColorAction(1004, state->m_g2Color, ca);
                }
                if (auto ca = em->getColorAction(1013)) {
                    loadColorAction(1010, state->m_mgColor, ca);
                }
                if (auto ca = em->getColorAction(1014)) {
                    loadColorAction(1010, state->m_mg2Color, ca);
                }
            }       
        }
    }
}

class $modify(PlayLayer) {
    void resetLevel() {
        PlayLayer::resetLevel();
        spc::loadObjects(this);
    }
};

class $modify(cocos2d::CCScheduler) {
    void update(float dt) {
        static bool init = false;

        auto recorder = spc::State::get()->recorder;

        if (!init) {
            init = true;
            recorder->start();
            std::thread(spc::webserver::run).detach();
        }

        cocos2d::CCScheduler::update(dt);
        recorder->capture_frame();
        spc::loadState();
    }
};


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