#pragma once

#include <crow.h>
#include <crow/middlewares/cors.h>

namespace spc {
    namespace webserver {
        void run(uint16_t port);
    }
}