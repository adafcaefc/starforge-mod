
#include <Geode/Geode.hpp>
#include <HTML/HTML.h>
#include "spc_utils.h"
#include "spc_socket.h"
#include "spc_projector.h"
#include "spc_webserver.h"
#include "spc_state.h"
#include <thread>

using namespace geode::prelude;

$execute{
    std::thread(spc::webserver::run).detach();
}