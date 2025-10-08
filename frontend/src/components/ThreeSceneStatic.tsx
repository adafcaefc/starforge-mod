"use client";

import React, { useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Center } from "@react-three/drei";
import * as THREE from "three";
import { Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Create a component for the laptop with WebSocket screen
function Model({
  onScreenStateChange,
}: {
  onScreenStateChange: (connected: boolean) => void;
}) {
  const modelRef = useRef<THREE.Group>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const mouseInScreen = useRef<boolean>(false);
  const lastMouseMoveTime = useRef<number>(0);
  const mouseMoveThrottle = 16; // ~60fps, send mouse moves max every 16ms
  const pendingMouseMove = useRef<{x: number, y: number} | null>(null);
  const mouseRafId = useRef<number | null>(null);
  const screenMeshRef = useRef<THREE.Mesh | null>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  
  // Screen dimensions - must match server's frame dimensions
  const width = 440;
  const height = 240;
  
  // Load the MacBook model from public folder
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load('/models/macbook.glb', (gltf) => {
      setScene(gltf.scene);
    }, undefined, (error) => {
      console.error('Failed to load GLB:', error);
    });
  }, []);
  
  // Decode Base64 → ArrayBuffer
  const base64ToArrayBuffer = (base64: string) => {
    const binary = atob(base64);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer.buffer;
  };
  
  // Set up WebSocket connection and canvas texture
  useEffect(() => {
    // Prevent multiple connections in React StrictMode
    if (socketRef.current) return;
    
    // Create canvas element
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvasRef.current = canvas;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctxRef.current = ctx;
    
    // Set initial black screen
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    
    // Create canvas texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.flipY = false; // Important for proper orientation
    
    setCanvasTexture(texture);
    
    // Connect to WebSocket
    const connectSocket = () => {
      // Don't create new connection if one already exists
      if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
        return;
      }
      
      const ip = "localhost";
      const port = 6671;
      
      const socket = new WebSocket(`ws://${ip}:${port}/socket`);
      
      socketRef.current = socket;
      
      socket.addEventListener("open", () => {
        console.log("WebSocket connected");
        setIsConnected(true);
        onScreenStateChange(true);
      });
      
      socket.addEventListener("message", (event) => {
        // Handle both binary (screen data) and text (state JSON) messages
        if (event.data instanceof Blob) {
          // Binary message - screen data
          event.data.arrayBuffer().then((buffer) => {
            const pixels = new Uint8ClampedArray(buffer);
            const imageData = new ImageData(pixels, width, height);
            
            if (ctx) {
              ctx.putImageData(imageData, 0, 0);
              texture.needsUpdate = true;
            }
          });
        } else if (typeof event.data === 'string') {
          // Text message - could be base64 (legacy) or JSON state
          try {
            const parsedData = JSON.parse(event.data);
            
            // Check if this is the new state format with type: "state"
            if (parsedData.type === "state" && parsedData.message) {
              // This is JSON state data
              // You can process state data here if needed
              // console.log("State update:", parsedData.message);
            } else {
              // Legacy format or unknown JSON - ignore
            }
          } catch (e) {
            // Not JSON, assume it's base64 screen data (legacy support)
            const buffer = base64ToArrayBuffer(event.data);
            const pixels = new Uint8ClampedArray(buffer);
            const imageData = new ImageData(pixels, width, height);
            
            if (ctx) {
              ctx.putImageData(imageData, 0, 0);
              texture.needsUpdate = true;
            }
          }
        }
      });
      
      socket.addEventListener("close", () => {
        console.log("WebSocket disconnected, retrying in 3 seconds");
        setIsConnected(false);
        onScreenStateChange(false);
        setTimeout(connectSocket, 3000);
      });
      
      socket.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
      });
    };
    
    connectSocket();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (mouseRafId.current) {
        cancelAnimationFrame(mouseRafId.current);
      }
    };
  }, []); // Remove scene and onScreenStateChange from dependencies
  
  // Apply texture to screen material in a separate effect
  useEffect(() => {
    if (!canvasTexture || !scene) return;
    
    // Find and apply texture to screen material
    scene.traverse((child: any) => {
      console.log("Child name:", child.name);
      if (child.isMesh && child.material?.name?.includes("Material.008")) {
        console.log("Found likely screen:", child.name);
        console.log("Child material before:", child.material.name);
        
        // Store the original material properties
        child.userData.originalMaterial = { ...child.material };
        
        // Apply canvas texture to the material
        if (child.material.type === "MeshStandardMaterial") {
          console.log("Using existing MeshStandardMaterial");
          child.material.map = canvasTexture;
          child.material.emissiveMap = canvasTexture;
          child.material.emissive = new THREE.Color(0xaaaaaa);
          child.material.emissiveIntensity = 0.4;
          child.material.roughness = 0.6;
          child.material.metalness = 0.1;
          child.material.needsUpdate = true;
          // Mark this object as screen for intersection filtering
          child.userData.isScreen = true;
          screenMeshRef.current = child; // Store reference to avoid future traversals
        } else {
          console.log("Creating new MeshStandardMaterial");
          const screenMaterial = new THREE.MeshStandardMaterial({
            map: canvasTexture,
            emissiveMap: canvasTexture,
            emissive: new THREE.Color(0x333333),
            emissiveIntensity: 0.4,
            roughness: 0.6,
            metalness: 0.2,
            transparent: false,
          });
          
          child.material = screenMaterial;
          // Mark this object as screen for intersection filtering
          child.userData.isScreen = true;
          screenMeshRef.current = child; // Store reference to avoid future traversals
        }
      }
    });
  }, [canvasTexture, scene]);
  
  // Zoom in and out of the model (same as original)
  useFrame((state, delta) => {
    if (modelRef.current) {
      const time = state.clock.getElapsedTime();
      const scale = 1 + 0.05 * Math.sin(time * 0.25);
      modelRef.current.scale.setScalar(scale);
    }
  });
  
  // Function to send input to WebSocket
  const sendInput = (data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  };
  
  // Function to check if intersection is on the screen surface
  const isScreenIntersection = (intersect: any) => {
    return intersect?.object?.material?.name?.includes("Material.008") || 
           intersect?.object?.userData?.isScreen;
  };
  
  // Function to handle clicking on the model
  const handleModelClick = (event: any) => {
    event.stopPropagation();
    
    // Find screen intersection
    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv) {
      // Map UV coordinates to screen space (0-1 range)
      // UV coordinates are already in 0-1 range, invert Y for proper screen orientation
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y)); // Invert Y coordinate
      
      console.log("Screen click at UV:", screenIntersect.uv.x, screenIntersect.uv.y);
      console.log("Screen click at normalized:", x, y);
      
      // Get the button from the pointer event
      const button = event.nativeEvent?.button ?? 0;
      
      // Send mouse down and up events immediately
      sendInput({ 
        type: "mouse_down", 
        button: button, 
        x, 
        y 
      });
      
      // Send mouse up after a short delay
      setTimeout(() => {
        sendInput({ 
          type: "mouse_up", 
          button: button, 
          x, 
          y 
        });
      }, 50);
    }
  };
  
  // Function to handle mouse down on the model
  const handleModelPointerDown = (event: any) => {
    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y)); // Invert Y coordinate
      const button = event.nativeEvent?.button ?? 0;
      
      console.log("Mouse down at:", x, y, "button:", button);
      sendInput({ 
        type: "mouse_down", 
        button: button, 
        x, 
        y 
      });
    }
  };
  
  // Function to handle mouse up on the model  
  const handleModelPointerUp = (event: any) => {
    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y)); // Invert Y coordinate
      const button = event.nativeEvent?.button ?? 0;
      
      console.log("Mouse up at:", x, y, "button:", button);
      sendInput({ 
        type: "mouse_up", 
        button: button, 
        x, 
        y 
      });
    }
  };
  
  // Optimized mouse move with RAF batching
  const sendMouseMove = () => {
    if (pendingMouseMove.current && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "mouse_move",
        x: pendingMouseMove.current.x,
        y: pendingMouseMove.current.y
      }));
      pendingMouseMove.current = null;
    }
    mouseRafId.current = null;
  };
  
  // Function to handle mouse movement on the model
  const handleModelPointerMove = (event: any) => {
    // Throttle mouse move events to reduce lag
    const now = Date.now();
    if (now - lastMouseMoveTime.current < mouseMoveThrottle) {
      return;
    }
    lastMouseMoveTime.current = now;
    
    // Only send mouse move if we're over the screen surface
    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv && mouseInScreen.current) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y)); // Invert Y coordinate
      
      // Batch mouse moves with requestAnimationFrame
      pendingMouseMove.current = { x, y };
      if (!mouseRafId.current) {
        mouseRafId.current = requestAnimationFrame(sendMouseMove);
      }
    }
  };
  
  const handleModelPointerEnter = () => {
    console.log("Pointer entered screen area");
    mouseInScreen.current = true;
  };
  
  const handleModelPointerLeave = () => {
    console.log("Pointer left screen area");
    mouseInScreen.current = false;
  };
  
  // Add keyboard event listeners with stable references
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mouseInScreen.current) return;
      
      console.log("Key down:", e.key, e.keyCode, e.code, "mouseInScreen:", mouseInScreen.current);
      
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const keyData = { 
          type: "key_down", 
          key: e.keyCode, 
          code: e.code 
        };
        console.log("Sending key down:", keyData);
        socketRef.current.send(JSON.stringify(keyData));
      } else {
        console.log("WebSocket not ready for key down");
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!mouseInScreen.current) return;
      
      console.log("Key up:", e.key, e.keyCode, e.code, "mouseInScreen:", mouseInScreen.current);
      
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const keyData = { 
          type: "key_up", 
          key: e.keyCode, 
          code: e.code 
        };
        console.log("Sending key up:", keyData);
        socketRef.current.send(JSON.stringify(keyData));
      } else {
        console.log("WebSocket not ready for key up");
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []); // No dependencies to prevent recreation
  
  // Only render if we have the scene loaded
  if (!scene) {
    return null;
  }
  
  return (
    <primitive
      ref={modelRef}
      object={scene}
      scale={1}
      position={[0, -1.2, 0]}
      rotation={[0.05, 0, 0]}
      onClick={handleModelClick}
      onPointerDown={handleModelPointerDown}
      onPointerUp={handleModelPointerUp}
      onPointerMove={handleModelPointerMove}
      onPointerEnter={handleModelPointerEnter}
      onPointerLeave={handleModelPointerLeave}
    />
  );
}

// Camera controller for smooth transitions (exact copy from original)
function CameraController({ currentVideo }: { currentVideo: string }) {
  const { camera } = useThree();
  const startPos = useRef(new Vector3(0, 20, 15));
  const midPos = useRef(new Vector3(0, 10, 12.5));
  const finalPos = useRef(new Vector3(0, 5, 12.5));
  const specialPos = useRef(new Vector3(0, 0, 3));
  const timerRef = useRef<number>(0);
  const transitionTimerRef = useRef<number>(0);
  const isTransitioning = useRef(false);
  const initialAnimationComplete = useRef(false);
  const scrollY = useRef(0);
  const isDemo2 = useRef(false);
  const isTransitioningVideoChange = useRef(false);

  const cubicInOut = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  useEffect(() => {
    camera.position.copy(startPos.current);

    const timerId = setTimeout(() => {
      isTransitioning.current = true;
    }, 500);

    const handleScroll = () => {
      scrollY.current = window.scrollY;
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      clearTimeout(timerId);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [camera]);

  useEffect(() => {
    const isNowDemo2 = currentVideo === "/videos/demo2.mp4";
    
    if (isDemo2.current !== isNowDemo2) {
      isDemo2.current = isNowDemo2;
      if (initialAnimationComplete.current) {
        console.log(`Video changed to ${currentVideo}, transitioning camera`);
        isTransitioningVideoChange.current = true;
        transitionTimerRef.current = 0;
      }
    }
  }, [currentVideo]);

  useFrame((_, delta) => {
    if (isTransitioning.current && !initialAnimationComplete.current) {
      timerRef.current += delta;
      const rawProgress = Math.min(timerRef.current / 1.5, 1);
      const easedProgress = cubicInOut(rawProgress);
      const segmentSplit = 0.6;

      if (easedProgress < segmentSplit) {
        const segmentProgress = easedProgress / segmentSplit;
        camera.position.lerpVectors(
          startPos.current,
          midPos.current,
          segmentProgress
        );
      } else {
        const segmentProgress =
          (easedProgress - segmentSplit) / (1 - segmentSplit);
        camera.position.lerpVectors(
          midPos.current,
          finalPos.current,
          segmentProgress
        );
      }

      if (rawProgress === 1) {
        initialAnimationComplete.current = true;
      }
    }
    
    if (initialAnimationComplete.current && isTransitioningVideoChange.current) {
      transitionTimerRef.current += delta;
      const transitionProgress = Math.min(transitionTimerRef.current / 3, 1);
      const easedTransitionProgress = cubicInOut(transitionProgress);
      
      if (isDemo2.current) {
        camera.position.lerpVectors(
          camera.position.clone(),
          specialPos.current,
          easedTransitionProgress
        );
      } else {
        camera.position.lerpVectors(
          camera.position.clone(),
          finalPos.current,
          easedTransitionProgress
        );
      }
      
      if (transitionProgress === 1) {
        isTransitioningVideoChange.current = false;
      }
    }
    
    if (initialAnimationComplete.current && !isTransitioningVideoChange.current && !isDemo2.current) {
      const maxScrollEffect = 2;
      const scrollFactor = Math.min(scrollY.current / 300, 1);
      const targetY = finalPos.current.y - scrollFactor * 6;
      const targetZ = finalPos.current.z + scrollFactor * 2;

      camera.position.y = THREE.MathUtils.lerp(
        camera.position.y,
        targetY,
        0.05
      );
      camera.position.z = THREE.MathUtils.lerp(
        camera.position.z,
        targetZ,
        0.05
      );
    }
  });

  return null;
}

export default function ThreeSceneStatic() {
  const [screenConnected, setScreenConnected] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<string>("/videos/demo1.mp4");
  
  const handleToggleScreen = (event: React.MouseEvent) => {
    if (event.currentTarget === event.target) {
      console.log("Container clicked - screen interaction");
    }
  };

  const handleScreenStateChange = (connected: boolean) => {
    console.log(`Screen connection state: ${connected ? 'Connected' : 'Disconnected'}`);
    setScreenConnected(connected);
  };
  
  return (
    <div
      style={{
        width: '100%',
        height: '90dvh',
        background: 'transparent',
        color: 'inherit',
        position: 'relative',
        fontFamily: 'inherit',
      }}
      className="relative cursor-pointer"
      onClick={handleToggleScreen}
    >
      <Canvas 
        camera={{ position: [0, 20, 0], fov: 15 }} 
        shadows
        performance={{ min: 0.5 }}
        dpr={[1, 2]} // Limit device pixel ratio for better performance
        gl={{ 
          antialias: false, // Disable anti-aliasing for better performance
          powerPreference: "high-performance" 
        }}
      >
        <ambientLight intensity={0.2} />
        <spotLight
          position={[10, 10, 10]}
          angle={0.15}
          penumbra={1}
          intensity={0.8}
          castShadow
        />
        <pointLight position={[-5, 3, 5]} intensity={0.4} color="#6699ff" />
        <CameraController currentVideo={currentVideo} />
        <Center>
          <React.Suspense fallback={null}>
            <Model 
              onScreenStateChange={handleScreenStateChange} 
            />
            <Environment preset="night" />
          </React.Suspense>
        </Center>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
          makeDefault
        />
      </Canvas>
      <div className="absolute top-0 left-0 right-0 flex justify-center p-2 text-gray-300">
        <div className="text-sm">
          Screen: {screenConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </div>
  );
}