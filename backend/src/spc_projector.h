#pragma once

#include <Geode/Geode.hpp>
#include <vector>
#include <mutex>

using namespace geode::prelude;

namespace spc {
    namespace projector {
        struct Texture {
            unsigned int m_width, m_height;
            int m_oldFbo, m_oldRbo;
            unsigned int m_fbo;
            cocos2d::CCTexture2D* m_texture;
            GLuint m_depthBuffer;
            void begin();
            void end();
            void capture(std::mutex* lock, std::vector<std::uint8_t>* data, bool volatile* has_data);
        };

        class Recorder {
        public:
            Recorder();

            std::vector<std::uint8_t> m_currentFrame;
            bool volatile m_frameHasData;
            std::mutex m_lock;
            Texture m_renderer;
            unsigned int m_width, m_height;
            unsigned int m_fps;
            bool m_recording = false;
            double m_lastFrameT, m_extraT;

            void start();
            void stop();
            void capture_frame();
        };

        extern Recorder recorder;
    }
}