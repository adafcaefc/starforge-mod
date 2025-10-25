#include <boost/type_traits/is_same.hpp>
#include "spc_webserver.h"
#include "spc_state.h"
#include <Geode/Geode.hpp>
#include <filesystem>
#include <fstream>

#include "spc_level_data.h"

using namespace geode::prelude;

namespace spc {
    namespace webserver {
        void run(uint16_t port) {
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

            CROW_ROUTE(app, "/api/mod/info").methods("GET"_method) (
                [](crow::request const& req, crow::response& res) {
                    res.add_header("Content-Type", "application/json");

                    auto socketPort = Mod::get()->getSettingValue<uint16_t>("websocket-port");
                    auto serverPort = Mod::get()->getSettingValue<uint16_t>("webserver-port");
                    nlohmann::json response = {
                        {"status", 200},
                        {"statusText", "success"},
                        {"message", {
                            {"modName", Mod::get()->getName()},
                            {"modVersion", Mod::get()->getVersion().toNonVString()},
                            {"websocketPort", socketPort},
                            {"webserverPort", serverPort}
                        }}
                    };
                    res.code = 200;
                    res.end(response.dump());
                }
                );
               
            CROW_ROUTE(app, "/api/gameobject/selected/get").methods("GET"_method) (
                [](crow::request const& req, crow::response& res) {
                    res.add_header("Content-Type", "application/json");
                    auto level = LevelEditorLayer::get();
                    if (!level) {
                        nlohmann::json errorResponse = {
                            {"status", 404},
                            {"statusText", "error"},
                            {"message", "No level editor loaded"}
                        };
                        res.code = 404;
                        res.end(errorResponse.dump());
                        return;
                    }
                    auto editor = level->m_editorUI;
                    if (!editor) {
                        nlohmann::json errorResponse = {
                            {"status", 404},
                            {"statusText", "error"},
                            {"message", "No editor UI found"}
                        };
                        res.code = 404;
                        res.end(errorResponse.dump());
                        return;
                    }
                    std::vector<spc::State::GameObject> selectedObjects;
                    for (auto& objx : CCArrayExt<::GameObject*>(editor->m_selectedObjects)) {
                        selectedObjects.emplace_back(objx);
                    }
                    if (editor->m_selectedObject)
                        selectedObjects.emplace_back(editor->m_selectedObject);
                    if (selectedObjects.empty()) {
                        nlohmann::json errorResponse = {
                            {"status", 404},
                            {"statusText", "error"},
                            {"message", "No objects selected"}
                        };
                        res.code = 404;
                        res.end(errorResponse.dump());
                        return;
                    }
                    nlohmann::json response = {
                        {"status", 200},
                        {"statusText", "success"},
                        {"message", {{"selectedObjects", selectedObjects}}}
                    };
                    res.code = 200;
                    res.end(response.dump());
                }
                );

            CROW_ROUTE(app, "/api/leveldata/get").methods("GET"_method) (
                [](crow::request const& req, crow::response& res) {
                    res.add_header("Content-Type", "application/json");
                    GJBaseGameLayer* level = PlayLayer::get();
                    if (!level)
                     level = LevelEditorLayer::get();
                    if (!level) {
                        nlohmann::json errorResponse = {
                            {"status", 404},
                            {"statusText", "error"},
                            {"message", "No level loaded"}
                        };
                        res.code = 404;
                        res.end(errorResponse.dump());
                        return;
                    }
                    if (!ldata::hasLevelData(level)) {
                        nlohmann::json errorResponse = {
                            {"status", 404},
                            {"statusText", "error"},
                            {"message", "No level data found"}
                        };
                        res.code = 404;
                        res.end(errorResponse.dump());
                        return;
                    }
                    auto data = ldata::getLevelData(level);
                    nlohmann::json response = {
                        {"status", 200},
                        {"statusText", "success"},
                        {"message", data}
                    };
                    res.code = 200;
                    res.end(response.dump());
                }
            );

            
            CROW_ROUTE(app, "/api/leveldata/load").methods("POST"_method) (
                [](crow::request const& req, crow::response& res) {
                    res.add_header("Content-Type", "application/json");
                    GJBaseGameLayer* level = PlayLayer::get();
                    if (!level)
                        level = LevelEditorLayer::get();
                    if (!level) {
                        nlohmann::json errorResponse = {
                            {"status", 404},
                            {"statusText", "error"},
                            {"message", "No level loaded"}
                        };
                        res.code = 404;
                        res.end(errorResponse.dump());
                        return;
                    }
                    try {
                        auto jsonData = nlohmann::json::parse(req.body);
                        auto data = jsonData.get<ldata::LevelData>();
                        ldata::setLevelData(level, data);
                        nlohmann::json successResponse = {
                            {"status", 200},
                            {"statusText", "success"},
                            {"message", "Level data loaded successfully"}
                        };
                        res.code = 200;
                        res.end(successResponse.dump());
                    }
                    catch (const std::exception& e) {
                        nlohmann::json errorResponse = {
                            {"status", 400},
                            {"statusText", "error"},
                            {"message", fmt::format("Failed to parse level data: {}", e.what())}
                        };
                        res.code = 400;
                        res.end(errorResponse.dump());
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

            app.port(port).multithreaded().run();
        }
    }
}