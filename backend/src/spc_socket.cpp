#include "spc_socket.h"

#include <chrono>
#include <thread>

namespace spc {
    namespace socket {
        template <typename concurrency, typename names>
        wspp_spc_logger<concurrency, names>::wspp_spc_logger(wspp_cth::value hint) :
            base_class(wspp::log::level(0), hint), m_channel_type_hint(hint) {}

        template <typename concurrency, typename names>
        wspp_spc_logger<concurrency, names>::wspp_spc_logger(
            wspp::log::level channels, wspp_cth::value hint
        ) : base_class(channels, hint), m_channel_type_hint(hint) {}

        template <typename concurrency, typename names>
        void wspp_spc_logger<concurrency, names>::write(wspp::log::level channel, std::string const& msg) {
            write(channel, msg.c_str());
        }

        template <typename concurrency, typename names>
        void wspp_spc_logger<concurrency, names>::write(wspp::log::level channel, char const* msg) {
            scoped_lock_type lock(base_class::m_lock);
            if (!this->dynamic_test(channel)) {
                return;
            }

            std::string prefix = "Unknown";

            switch (channel) {
                case wspp::log::elevel::devel: prefix = "Debug"; break;
                case wspp::log::elevel::library: prefix = "Debug"; break;
                case wspp::log::elevel::info: prefix = "Info"; break;
                case wspp::log::elevel::warn: prefix = "Warning"; break;
                case wspp::log::elevel::rerror: prefix = "Error"; break;
                case wspp::log::elevel::fatal: prefix = "Critical"; break;
            }

            if (m_channel_type_hint == wspp_cth::access) {
                prefix = "Info";
            }

            std::string message_fixed = msg;
            // spc::utils::string::replaceAllString(message_fixed, "\n", " ");
            // SPC_LOG_INFO("[{}] [WebSocket]: {}", prefix, message_fixed);
        }

        // Explicit template instantiations
        template class wspp_spc_logger<websocketpp::concurrency::basic, websocketpp::log::elevel>;
        template class wspp_spc_logger<websocketpp::concurrency::basic, websocketpp::log::alevel>;

        Action::Action(Type t, wspp::connection_hdl h) : m_type(t), m_hdl(h) {}

        Action::Action(Type t, wspp::connection_hdl h, wspp_server::message_ptr m) :
            m_type(t), m_hdl(h), m_msg(m) {}

        SocketServer::SocketServer() {
            using wspp::lib::placeholders::_1;
            using wspp::lib::placeholders::_2;

            // Initialize Asio Transport
            m_socketServer.init_asio();

            // Register handler callbacks
            m_socketServer.set_open_handler(bind(&SocketServer::onOpen, this, _1));
            m_socketServer.set_close_handler(bind(&SocketServer::onClose, this, _1));
            m_socketServer.set_message_handler(bind(&SocketServer::onMessage, this, _1, _2));
        }

        void SocketServer::run(uint16_t port) {
            // listen on specified port
            m_socketServer.listen(port);

            // Start the server accept loop
            m_socketServer.start_accept();

            // Start the ASIO io_service run loop
            try {
                m_socketServer.run();
            }
            catch (std::exception const& e) {
                // error handling
            }
        }

        void SocketServer::pushAction(Action const& a) {
            wspp_lock_guard guard(m_actionLock);
            m_actions.push(a);
        }

        void SocketServer::pushActionAndNotify(Action const& a) {
            pushAction(a);
            m_actionCond.notify_one();
        }

        void SocketServer::onOpen(wspp::connection_hdl hdl) {
            pushActionAndNotify(Action(Action::Type::Subscribe, hdl));
        }

        void SocketServer::onClose(wspp::connection_hdl hdl) {
            pushActionAndNotify(Action(Action::Type::Unsubscribe, hdl));
        }

        void SocketServer::onMessage(wspp::connection_hdl hdl, wspp_server::message_ptr msg) {
            pushActionAndNotify(Action(Action::Type::Message, hdl, msg));
        }

        void SocketServer::processMouseEvent(nlohmann::json const& j) {
            static CCTouch* activeTouch = nullptr;
            static CCScene* activeScene = nullptr;
            static CCEvent* activeEvent = nullptr;

            if (j["type"] == "mouse_down") {
                float x = j["x"].get<float>() * CCDirector::sharedDirector()->getWinSize().width;
                float y = j["y"].get<float>() * CCDirector::sharedDirector()->getWinSize().height;

                if (!activeTouch) {
                    activeTouch = new CCTouch();
                    activeTouch->retain(); // keep it alive
                    activeScene = CCDirector::sharedDirector()->getRunningScene();
                    activeEvent = new CCEvent();
                    activeEvent->retain();
                }

                activeTouch->setTouchInfo(0, x, y);

                CCSet* touches = new CCSet();
                touches->addObject(activeTouch);

                CCDirector::sharedDirector()->getTouchDispatcher()->touchesBegan(touches, activeEvent);

                touches->release();
            }
            else if (j["type"] == "mouse_move") {
                if (activeTouch && activeScene == CCDirector::sharedDirector()->getRunningScene()) {
                    float x = j["x"].get<float>() * CCDirector::sharedDirector()->getWinSize().width;
                    float y = j["y"].get<float>() * CCDirector::sharedDirector()->getWinSize().height;

                    activeTouch->setTouchInfo(0, x, y);

                    CCSet* touches = new CCSet();
                    touches->addObject(activeTouch);

                    CCDirector::sharedDirector()->getTouchDispatcher()->touchesMoved(
                        touches, activeEvent
                    );

                    touches->release();
                }
                else {
                    // scene changed, cancel active touch
                    if (activeTouch) {
                        activeTouch->release();
                        activeTouch = nullptr;
                    }
                }
            }
            else if (j["type"] == "mouse_up") {
                if (activeTouch && activeScene == CCDirector::sharedDirector()->getRunningScene()) {
                    float x = j["x"].get<float>() * CCDirector::sharedDirector()->getWinSize().width;
                    float y = j["y"].get<float>() * CCDirector::sharedDirector()->getWinSize().height;

                    activeTouch->setTouchInfo(0, x, y);

                    CCSet* touches = new CCSet();
                    touches->addObject(activeTouch);

                    CCDirector::sharedDirector()->getTouchDispatcher()->touchesEnded(
                        touches, activeEvent
                    );

                    touches->release();

                    // cleanup after ended
                    activeTouch->release();
                    activeTouch = nullptr;

                    activeEvent->release();
                    activeEvent = nullptr;
                }
                else {
                    // scene changed, cancel active touch
                    if (activeTouch) {
                        activeTouch->release();
                        activeTouch = nullptr;
                    }
                }
            }
            else if (j["type"] == "mouse_cancel") {
                if (activeTouch && activeScene == CCDirector::sharedDirector()->getRunningScene()) {
                    CCSet* touches = new CCSet();
                    touches->addObject(activeTouch);
                    CCDirector::sharedDirector()->getTouchDispatcher()->touchesCancelled(
                        touches, activeEvent
                    );
                    touches->release();
                    // cleanup after cancelled
                    activeTouch->release();
                    activeTouch = nullptr;
                    activeEvent->release();
                    activeEvent = nullptr;
                }
                else {
                    // scene changed, cancel active touch
                    if (activeTouch) {
                        activeTouch->release();
                        activeTouch = nullptr;
                    }
                }
            }
            else if (j["type"] == "key_down") {
                CCDirector::sharedDirector()->getKeyboardDispatcher()->dispatchKeyboardMSG(
                    static_cast<enumKeyCodes>(j["key"].get<int>()), true, false
                );
            }
            else if (j["type"] == "key_up") {
                CCDirector::sharedDirector()->getKeyboardDispatcher()->dispatchKeyboardMSG(
                    static_cast<enumKeyCodes>(j["key"].get<int>()), false, false
                );
            }
        }

        void SocketServer::processMessages() {
            while (1) {
                if (m_stopped) {
                    break;
                }

                std::this_thread::sleep_for(std::chrono::milliseconds(6)); // reduce CPU usage

                wspp::lib::unique_lock<wspp::lib::mutex> lock(m_actionLock);

                while (m_actions.empty()) {
                    m_actionCond.wait(lock);
                }

                Action a = m_actions.front();
                m_actions.pop();

                lock.unlock();
                try {

                    switch (a.m_type) {
                    case Action::Type::Subscribe: {
                        wspp_lock_guard guard(m_connectionLock);
                        m_connections.insert(a.m_hdl);
                        break;
                    }

                    case Action::Type::Unsubscribe: {
                        wspp_lock_guard guard(m_connectionLock);
                        m_connections.erase(a.m_hdl);
                        break;
                    }

                    case Action::Type::Message: {
                        wspp_lock_guard guard(m_connectionLock);
                        nlohmann::json j;
                        try {
                            j = nlohmann::json::parse(a.m_msg->get_payload());
                        }
                        catch (nlohmann::json::parse_error const&) {
                            // invalid json
                            break;
                        }

                        if (j.contains("type")) {
                            auto self = shared_from_this();
                            geode::queueInMainThread([self, j] {
                                self->processMouseEvent(j);
                                });
                        }
                        break;
                    }
                    default:
                        // unknown action type
                        break;
                    }
                }
                catch (std::exception const& e) {
                    // error handling
                    continue;
                }
            }
        }

        void SocketServer::send(std::string const& s) {
            for (auto& connection : m_connections) {
                try {
                    m_socketServer.send(connection, s, wspp::frame::opcode::value::TEXT);
                }
                catch (std::exception const& e) {
                    // error handling
                    continue;
                }
            }
        }

        void SocketServer::sendBinary(std::vector<uint8_t> const& data) {
            for (auto& connection : m_connections) {
                try {
                    m_socketServer.send(connection, data.data(), data.size(), wspp::frame::opcode::value::BINARY);
                }
                catch (std::exception const& e) {
                    // error handling
                    continue;
                }
            }
        }

        bool SocketServer::initThread() {
            if (m_threadLaunched) {
                return false;
            }

            m_threadLaunched = true;

            // Start a thread to run the processing loop
            auto self = shared_from_this();
            wspp::lib::thread t([self] {
                self->processMessages();
            });

            // Run the asio loop with the main thread
            run(m_port);

            t.join();

            return true;
        }

        bool SocketServer::init(uint16_t const port) {
            if (m_launched) {
                return false;
            }

            m_launched = true;
            m_port = port;

            auto instance = shared_from_this();

            std::thread([instance] {
                instance->initThread();
            }).detach();

            return true;
        }

        std::shared_ptr<SocketServer> SocketServer::create(uint16_t const port) {
            auto instance = std::make_shared<SocketServer>();
            if (instance->init(port)) {
                return instance;
            }
            return nullptr;
        }

        void SocketServer::stop() {
            if (m_stopped) {
                return;
            }
            m_stopped = true;
            m_socketServer.stop_listening();
            {
                wspp_lock_guard guard(m_actionLock);
                while (!m_actions.empty()) {
                    m_actions.pop();
                }
            }
            m_actionCond.notify_one();
        }
    }
}