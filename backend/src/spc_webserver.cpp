#include "spc_webserver.h"
#include <Geode/Geode.hpp>
#include <filesystem>
#include <fstream>

#include "spc_level_data.h"

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
               
            CROW_ROUTE(app, "/api/leveldata/get").methods("GET"_method) (
                [](crow::request const& req, crow::response& res) {
                    res.add_header("Content-Type", "application/json");
                    GJBaseGameLayer* level = PlayLayer::get();
                    if (!level)
                     level = LevelEditorLayer::get();
                    if (!level) {
                        res.code = 404;
                        res.end(R"({"error": "No level loaded"})");
                        return;
                    }
                    if (!ldata::hasLevelData(level)) {
                        res.code = 404;
                        res.end(R"({"error": "No level data found"})");
                        return;
                    }
                    auto data = ldata::getLevelData(level);
                    nlohmann::json jsonData = data;
                    res.code = 200;
                    res.end(jsonData.dump());
                }
            );

            
            CROW_ROUTE(app, "/api/leveldata/load").methods("POST"_method) (
                [](crow::request const& req, crow::response& res) {
                    res.add_header("Content-Type", "application/json");
                    GJBaseGameLayer* level = PlayLayer::get();
                    if (!level)
                        level = LevelEditorLayer::get();
                    if (!level) {
                        res.code = 404;
                        res.end(R"({"error": "No level loaded"})");
                        return;
                    }
                    try {
                        auto jsonData = nlohmann::json::parse(req.body);
                        auto data = jsonData.get<ldata::LevelData>();
                        ldata::setLevelData(level, data);
                        res.code = 200;
                        res.end(R"({"status": "Level data loaded successfully"})");
                    }
                    catch (const std::exception& e) {
                        res.code = 400;
                        res.end(fmt::format(R"({{"error": "Failed to parse level data: {}"}})", e.what()));
                    }
                }
            );

            // Serve static files under /files prefix
            CROW_ROUTE(app, "/").methods("GET"_method)
            ([](crow::request const& req, crow::response& res) {
                try {
                    namespace fs = std::filesystem;
                    fs::path base = geode::Mod::get()->getResourcesDir();
                    fs::path indexPath = base / "index.html";
                    
                    if (!fs::exists(indexPath)) {
                        res.code = 404;
                        res.end("index.html not found");
                        return;
                    }
                    
                    std::ifstream f(indexPath, std::ios::binary);
                    if (!f) {
                        res.code = 500;
                        res.end("Error reading file");
                        return;
                    }
                    
                    std::string body((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
                    res.code = 200;
                    res.add_header("Content-Type", "text/html");
                    res.write(body);
                    res.end();
                } catch (const std::exception& e) {
                    res.code = 500;
                    res.end(fmt::format("Error: {}", e.what()));
                }
            });

            CROW_ROUTE(app, "/<path>").methods("GET"_method)
            ([](crow::request const& req,
                crow::response& res,
                std::string filePath) {
                try {
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

                    // Determine content type from extension
                    std::string ext = fullPath.extension().string();
                    std::string contentType = "application/octet-stream";
                    if (ext == ".html" || ext == ".htm") contentType = "text/html";
                    else if (ext == ".css") contentType = "text/css";
                    else if (ext == ".js") contentType = "application/javascript";
                    else if (ext == ".json") contentType = "application/json";
                    else if (ext == ".png") contentType = "image/png";
                    else if (ext == ".jpg" || ext == ".jpeg") contentType = "image/jpeg";
                    else if (ext == ".svg") contentType = "image/svg+xml";
                    else if (ext == ".gif") contentType = "image/gif";
                    else if (ext == ".txt") contentType = "text/plain";

                    res.code = 200;
                    res.add_header("Content-Type", contentType);
                    res.write(body);
                    res.end();
                } catch (const std::exception& e) {
                    res.code = 500;
                    res.end(fmt::format("Error: {}", e.what()));
                }
            });

            app.port(6673).multithreaded().run();
        }
    }
}