#include "spc_utils.h"

namespace spc {
    namespace utils {
        std::string encodeBase64(std::vector<uint8_t> const& data) {
            static char const encoding_table[] =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            std::string encoded_data;
            size_t input_length = data.size();
            size_t output_length = 4 * ((input_length + 2) / 3);

            encoded_data.reserve(output_length);

            for (size_t i = 0; i < input_length;) {
                uint32_t octet_a = i < input_length ? data[i++] : 0;
                uint32_t octet_b = i < input_length ? data[i++] : 0;
                uint32_t octet_c = i < input_length ? data[i++] : 0;

                uint32_t triple = (octet_a << 16) | (octet_b << 8) | octet_c;

                encoded_data.push_back(encoding_table[(triple >> 18) & 0x3F]);
                encoded_data.push_back(encoding_table[(triple >> 12) & 0x3F]);
                encoded_data.push_back(
                    (i > input_length + 1) ? '=' : encoding_table[(triple >> 6) & 0x3F]
                );
                encoded_data.push_back((i > input_length) ? '=' : encoding_table[triple & 0x3F]);
            }

            return encoded_data;
        }
    }
}