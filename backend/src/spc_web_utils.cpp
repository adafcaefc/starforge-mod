#include "spc_web_utils.h"
#include <Geode/Geode.hpp>

using namespace geode::prelude;

namespace spc {
    void openWebserverLink() {
        geode::utils::web::openLinkInBrowser(fmt::format(
            "http://localhost:{}/",
            Mod::get()->getSettingValue<uint16_t>("webserver-port")
        ));
    }
}
