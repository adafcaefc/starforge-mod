#include <Geode/Geode.hpp>
#include <Geode/modify/LoadingLayer.hpp>
#include <filesystem>

#include "spc_state.h"
#include "spc_sprite_utils.h"

using namespace geode::prelude;

class $modify(LoadingLayer) {
    void loadAssets() {
        try {
            const auto parentPath = spc::State::get()->getResourcesPath() / "rendered";
            for (const auto& entry : std::filesystem::recursive_directory_iterator(parentPath)) {
                if (entry.is_regular_file() && entry.path().extension() == ".png") {
                    spc::spriteFromData(spc::readFromFileSpecial(entry.path()));
                }
            }
        }
        catch (...) {
        }
        LoadingLayer::loadAssets();
    }
};
