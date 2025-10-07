#pragma once

#include <vector>
#include <string>
#include <cstdint>

namespace spc {
    namespace utils {
        std::string encodeBase64(std::vector<uint8_t> const& data);
    }
}