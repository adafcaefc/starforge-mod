#include "spc_webserver.h"
#include <Geode/Geode.hpp>
#include <filesystem>
#include <fstream>

using namespace geode::prelude;

namespace spc {
    namespace webserver {
        void run() {
            static crow::App<crow::CORSHandler> app;
            auto& cors = app.get_middleware<crow::CORSHandler>();
            cors.global()
                .origin("*")
                .headers(
                    "origin, x-requested-with, accept, access-control-allow-origin, authorization, "
                    "content-type"
                )
                .methods(
                    "POST"_method,
                    "GET"_method,
                    "PUT"_method,
                    "DELETE"_method,
                    "PATCH"_method,
                    "OPTIONS"_method
                );

            // Serve static files (like serve .)
            CROW_ROUTE(app, "/<path>")
                .methods("GET"_method)([](crow::request const& req,
                                          crow::response& res,
                                          std::string filePath) {
                    if (!filePath.empty() && filePath.front() == '/') filePath.erase(0, 1);

                    namespace fs = std::filesystem;
                    fs::path base = geode::Mod::get()->getResourcesDir();

                    // Sanitize incoming path
                    fs::path requested = fs::path(filePath).lexically_normal();
                    if (requested.empty() || requested == ".") {
                        requested = "index.html";
                    }

                    // Prevent directory traversal (ensure requested stays inside base)
                    fs::path fullPath = base / requested;
                    if (fullPath.lexically_normal().string().find(base.lexically_normal().string()
                        ) != 0) {
                        res.code = 403;
                        res.end("Forbidden");
                        return;
                    }

                    // If it's a directory, serve index.html inside it
                    if (fs::is_directory(fullPath)) {
                        fullPath /= "index.html";
                    }

                    // Check existence
                    if (!fs::exists(fullPath)) {
                        res.code = 404;
                        res.end("Not found");
                        return;
                    }

                    // Read file
                    std::ifstream f(fullPath, std::ios::binary);
                    if (!f) {
                        res.code = 500;
                        res.end("Error reading file");
                        return;
                    }
                    std::string body(
                        (std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>()
                    );

                    // Set content type automatically
                    res.set_static_file_info(fullPath.string());
                    res.code = 200;
                    res.write(body);
                    res.end();
                });

            // Root path -> serve index.html
            CROW_ROUTE(app, "/")
            ([](crow::request const& req, crow::response& res) {
                auto indexPath = geode::Mod::get()->getResourcesDir() / "index.html";
                std::ifstream f(indexPath, std::ios::binary);
                if (!f) {
                    res.code = 404;
                    res.end("index.html not found");
                    return;
                }
                std::string body((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
                res.set_static_file_info(indexPath.string());
                res.code = 200;
                res.write(body);
                res.end();
            });

            app.port(6673).multithreaded().run();
        }
    }
}