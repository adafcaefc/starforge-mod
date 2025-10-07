#include "spc_projector.h"

#include "spc_socket.h"
#include "spc_state.h"
#include "spc_utils.h"

#include <thread>

namespace spc {
    namespace projector {
        Recorder recorder;

        Recorder::Recorder() : m_width(440u), m_height(240u), m_fps(30u) {}

        void Recorder::start() {
            if (this->m_recording) {
                return;
            }
            this->m_recording = true;
            this->m_frameHasData = false;
            this->m_currentFrame.resize(this->m_width * this->m_height * 4, 0);
            this->m_lastFrameT = this->m_extraT = 0;
            this->m_renderer.m_width = this->m_width;
            this->m_renderer.m_height = this->m_height;
            this->m_renderer.begin();

            std::thread t([this]() {
                while (this->m_recording || this->m_frameHasData) {
                    this->m_lock.lock();
                    if (this->m_frameHasData) {
                        this->m_frameHasData = false;
                        // send data here - send both screen data (binary) and state (JSON)
                        std::thread(
                            [](std::vector<std::uint8_t> frame, unsigned int width, unsigned int height
                            ) {
                                static auto server = socket::SocketServer::create(6671u);
                                
                                // Send screen data as binary (fast, no base64 encoding needed)
                                server->sendBinary(frame);
                                
                                // Send state as JSON text (small, fast to parse)
                                auto state = State::get();
                                server->send(state->toJSON());
                            },
                            this->m_currentFrame,
                            this->m_width,
                            this->m_height
                        )
                            .detach();

                        this->m_lock.unlock();
                    }
                    else this->m_lock.unlock();
                }
            });
            t.detach();
        }

        void Recorder::stop() {
            if (!this->m_recording) {
                return;
            }
            this->m_renderer.end();
            this->m_recording = false;
        }

        void Recorder::capture_frame() {
            while (this->m_frameHasData) {}
            this->m_renderer.capture(&this->m_lock, &this->m_currentFrame, &this->m_frameHasData);
        }

        void Texture::begin() {
            ::glGetIntegerv(GL_FRAMEBUFFER_BINDING_EXT, &this->m_oldFbo);

            this->m_texture = new cocos2d::CCTexture2D;
            {
                auto data = ::malloc(this->m_width * this->m_height * 4);
                if (data) {
                    ::memset(data, 0, this->m_width * this->m_height * 4);
                    this->m_texture->initWithData(
                        data,
                        cocos2d::CCTexture2DPixelFormat::kCCTexture2DPixelFormat_RGBA8888,
                        this->m_width,
                        this->m_height,
                        cocos2d::CCSize(static_cast<float>(this->m_width), static_cast<float>(this->m_height))
                    );
                    ::free(data);
                }
            }

            ::glGetIntegerv(GL_RENDERBUFFER_BINDING_EXT, &this->m_oldRbo);

            // Generate and bind the framebuffer
            ::glGenFramebuffersEXT(1, &this->m_fbo);
            ::glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, this->m_fbo);

            // Attach the color texture to the framebuffer
            ::glFramebufferTexture2DEXT(
                GL_FRAMEBUFFER_EXT, GL_COLOR_ATTACHMENT0_EXT, GL_TEXTURE_2D, this->m_texture->getName(), 0
            );

            // Create a renderbuffer for depth
            ::glGenRenderbuffersEXT(1, &m_depthBuffer);
            ::glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, m_depthBuffer);

            // Allocate storage for the depth renderbuffer
            ::glRenderbufferStorageEXT(
                GL_RENDERBUFFER_EXT, GL_DEPTH_COMPONENT, this->m_width, this->m_height
            );

            // Attach the depth renderbuffer to the framebuffer
            ::glFramebufferRenderbufferEXT(
                GL_FRAMEBUFFER_EXT, GL_DEPTH_ATTACHMENT_EXT, GL_RENDERBUFFER_EXT, m_depthBuffer
            );

            this->m_texture->setAliasTexParameters();
            this->m_texture->autorelease();

            ::glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, this->m_oldRbo);
            ::glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, this->m_oldFbo);
        }

        void Texture::capture(std::mutex* lock, std::vector<std::uint8_t>* data, bool volatile* has_data) {
            ::glViewport(0, 0, this->m_width, this->m_height);
            ::glGetIntegerv(GL_FRAMEBUFFER_BINDING_EXT, &this->m_oldFbo);
            ::glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, this->m_fbo);

            ::glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
            ::glClearColor(0.0f, 0.0f, 0.0f, 0.0f);

            auto director = cocos2d::CCDirector::sharedDirector();
            auto scene = director->getRunningScene();
            scene->visit();

            ::glPixelStorei(GL_PACK_ALIGNMENT, 1);
            lock->lock();
            *has_data = true;
            ::glReadPixels(0, 0, this->m_width, this->m_height, GL_RGBA, GL_UNSIGNED_BYTE, data->data());
            lock->unlock();

            ::glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, this->m_oldFbo);
            director->setViewport();
        }

        void Texture::end() {
            CC_SAFE_RELEASE(this->m_texture);
        }
    }
}