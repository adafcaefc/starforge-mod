#include "spc_projector.h"

#include "spc_socket.h"
#include "spc_state.h"
#include "spc_utils.h"

#include <thread>
#include <mutex>

namespace spc {
    namespace projector {

        Recorder::Recorder() : m_width(440u), m_height(240u), m_fps(30u) {}

        static void processFrameData(std::vector<std::uint8_t> frame, unsigned int width, unsigned int height) {
            auto server = State::get()->server;
            
            // Send screen data as binary (fast, no base64 encoding needed)
            server->sendBinary(frame);

            // Send state as JSON text (small, fast to parse)
            auto state = State::get();
            server->send(state->toJSON());
        }

        void Recorder::start() {
            if (m_recording) {
                return;
            }
            m_recording = true;
            m_frameHasData = false;
            m_currentFrame.resize(m_width * m_height * 4, 0);
            m_lastFrameT = m_extraT = 0;
            m_renderer.m_width = m_width;
            m_renderer.m_height = m_height;
            m_renderer.begin();

            std::thread t([this]() {
                while (m_recording || m_frameHasData) {
                    std::scoped_lock<std::mutex> lock(m_lock);
                    if (m_frameHasData) {
                        m_frameHasData = false;
                        std::thread(processFrameData, m_currentFrame, m_width, m_height).detach();
                    }                 
                }
                });
            t.detach();
        }

        void Recorder::stop() {
            if (!m_recording) {
                return;
            }
            m_renderer.end();
            m_recording = false;
        }

        void Recorder::capture_frame() {
            while (m_frameHasData) {}
            m_renderer.capture(&m_lock, &m_currentFrame, &m_frameHasData);
        }

        void Texture::begin() {
            ::glGetIntegerv(GL_FRAMEBUFFER_BINDING_EXT, &m_oldFbo);

            m_texture = new cocos2d::CCTexture2D;
            {
                auto data = ::malloc(m_width * m_height * 4);
                if (data) {
                    ::memset(data, 0, m_width * m_height * 4);
                    m_texture->initWithData(
                        data,
                        cocos2d::CCTexture2DPixelFormat::kCCTexture2DPixelFormat_RGBA8888,
                        m_width,
                        m_height,
                        cocos2d::CCSize(static_cast<float>(m_width), static_cast<float>(m_height))
                    );
                    ::free(data);
                }
            }

            ::glGetIntegerv(GL_RENDERBUFFER_BINDING_EXT, &m_oldRbo);

            // Generate and bind the framebuffer
            ::glGenFramebuffersEXT(1, &m_fbo);
            ::glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, m_fbo);

            // Attach the color texture to the framebuffer
            ::glFramebufferTexture2DEXT(
                GL_FRAMEBUFFER_EXT, GL_COLOR_ATTACHMENT0_EXT, GL_TEXTURE_2D, m_texture->getName(), 0
            );

            // Create a renderbuffer for depth
            ::glGenRenderbuffersEXT(1, &m_depthBuffer);
            ::glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, m_depthBuffer);

            // Allocate storage for the depth renderbuffer
            ::glRenderbufferStorageEXT(
                GL_RENDERBUFFER_EXT, GL_DEPTH_COMPONENT, m_width, m_height
            );

            // Attach the depth renderbuffer to the framebuffer
            ::glFramebufferRenderbufferEXT(
                GL_FRAMEBUFFER_EXT, GL_DEPTH_ATTACHMENT_EXT, GL_RENDERBUFFER_EXT, m_depthBuffer
            );

            m_texture->setAliasTexParameters();
            m_texture->autorelease();

            ::glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, m_oldRbo);
            ::glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, m_oldFbo);
        }

        void Texture::capture(std::mutex* lock, std::vector<std::uint8_t>* data, bool volatile* has_data) {
            ::glViewport(0, 0, m_width, m_height);
            ::glGetIntegerv(GL_FRAMEBUFFER_BINDING_EXT, &m_oldFbo);
            ::glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, m_fbo);

            ::glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
            ::glClearColor(0.0f, 0.0f, 0.0f, 0.0f);

            auto director = cocos2d::CCDirector::sharedDirector();
            auto scene = director->getRunningScene();
            scene->visit();

            ::glPixelStorei(GL_PACK_ALIGNMENT, 1);
            lock->lock();
            *has_data = true;
            ::glReadPixels(0, 0, m_width, m_height, GL_RGBA, GL_UNSIGNED_BYTE, data->data());
            lock->unlock();

            ::glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, m_oldFbo);
            director->setViewport();
        }

        void Texture::end() {
            CC_SAFE_RELEASE(m_texture);
        }
    }
}