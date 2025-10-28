#include <Geode/Geode.hpp>
#include <Geode/modify/MenuLayer.hpp>

#include "../spc_state.h"
#include "../spc_scheduler.h"
#include "../spc_sprite_generators.h"
#include "../spc_web_utils.h"
#include "../components/spc_CustomGauntletSelectLayer.h"

using namespace geode::prelude;

class $modify(MyMenuLayer, MenuLayer) {
    bool init() {
        if (!MenuLayer::init()) {
            return false;
        }
        
        // Initialize scheduler
        spc::initScheduler();
        
        auto myButton = CCMenuItemSpriteExtra::create(
            spc::getUfoBtnSprite(),
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
        auto scene = CCScene::create();
        auto layer = spc::CustomGauntletSelectLayer::create(0);
        scene->addChild(layer);
        CCDirector::sharedDirector()->pushScene(CCTransitionFade::create(0.3f, scene));

        // Check whether socket connection exists before opening a new web window
        if (spc::State::get()->m_server->getConnectionCount() == 0u) {
            spc::openWebserverLink();
            // Play welcome sound
            const auto soundPath = spc::State::get()->getResourcesPath() / "sound" / "welcome.wav";
            FMODAudioEngine::sharedEngine()->playEffect(geode::utils::string::pathToString(soundPath));
        }
    }
};
