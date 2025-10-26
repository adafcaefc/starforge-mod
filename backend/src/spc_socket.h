#pragma once

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>
#include <websocketpp/common/thread.hpp>
#include <websocketpp/logger/basic.hpp>
#include <websocketpp/logger/levels.hpp>
#include <nlohmann/json.hpp>
#include <Geode/Geode.hpp>
#include <memory>
#include <queue>
#include <set>

using namespace geode::prelude;

namespace spc {
    namespace socket {
        namespace wspp = ::websocketpp;
        // to do : fix type inheritance
        using wspp_server = wspp::server<wspp::config::asio>;
        using wspp_lock_guard = wspp::lib::lock_guard<wspp::lib::mutex>;
        using wspp_unique_lock = wspp::lib::unique_lock<wspp::lib::mutex>;

        template <typename concurrency, typename names>
        class wspp_spc_logger : public wspp::log::basic<concurrency, names> {
        public:
            typedef wspp::log::basic<concurrency, names> base_class;
            typedef wspp::log::channel_type_hint wspp_cth;

            wspp_spc_logger<concurrency, names>(wspp_cth::value hint = wspp_cth::access);
            wspp_spc_logger<concurrency, names>(
                wspp::log::level channels, wspp_cth::value hint = wspp_cth::access
            );

            void write(wspp::log::level channel, std::string const& msg);
            void write(wspp::log::level channel, char const* msg);

        private:
            typedef typename base_class::scoped_lock_type scoped_lock_type;
            wspp_cth::value m_channel_type_hint;
        };

        struct wspp_spc_config : public websocketpp::config::asio {
            typedef wspp_spc_logger<concurrency_type, websocketpp::log::elevel> elog_type;
            typedef wspp_spc_logger<concurrency_type, websocketpp::log::alevel> alog_type;

            // create a custom transport config based on the base asio transport config
            struct spc_transport_config : public websocketpp::config::asio::transport_config {
                typedef wspp_spc_config::alog_type alog_type;
                typedef wspp_spc_config::elog_type elog_type;
            };

            // let wspp_spc_config know to create transport endpoints with spc_transport_config
            typedef websocketpp::transport::asio::endpoint<spc_transport_config> transport_type;
        };

        struct Action {
            enum class Type : uint64_t {
                Subscribe = 0x1000,
                Unsubscribe = 0x1001,
                Message = 0x1002
            };

            Action(Type t, wspp::connection_hdl h);
            Action(Type t, wspp::connection_hdl h, wspp_server::message_ptr m);

            Type m_type = Type::Message;
            wspp::connection_hdl m_hdl;
            wspp_server::message_ptr m_msg = nullptr;
        };

        class SocketServer : public std::enable_shared_from_this<SocketServer> {
        public:
            SocketServer();

            void run(uint16_t port);
            void pushAction(Action const& a);
            void pushActionAndNotify(Action const& a);
            void onOpen(wspp::connection_hdl hdl);
            void onClose(wspp::connection_hdl hdl);
            void onMessage(wspp::connection_hdl hdl, wspp_server::message_ptr msg);
            void processMouseEvent(nlohmann::json const& j);
            void processMessages();
            void send(std::string const& s);
            void sendBinary(std::vector<uint8_t> const& data);
            bool initThread();
            bool init(uint16_t const port);
            void stop();

            static std::shared_ptr<SocketServer> create(uint16_t const port);

            unsigned int getConnectionCount() {
                wspp_lock_guard lock(m_connectionLock);
                return m_connections.size();
            }

            // these all should be private, but for simplicity, we make them public
            bool m_launched = false;
            bool m_threadLaunched = false;
            bool m_stopped = false;
            uint16_t m_port = 0u;

        private:
            wspp::server<wspp_spc_config> m_socketServer;
            std::set<wspp::connection_hdl, std::owner_less<wspp::connection_hdl>> m_connections;
            std::queue<Action> m_actions;

            wspp::lib::mutex m_actionLock;
            wspp::lib::mutex m_connectionLock;
            wspp::lib::condition_variable m_actionCond;
        };
    }
}