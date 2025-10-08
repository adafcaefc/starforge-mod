"use client";

import React, { useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Stars } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function Meteor({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const initialPosition = useRef(position);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;
      const time = state.clock.getElapsedTime();
      meshRef.current.position.z = initialPosition.current[2] + Math.sin(time * 0.1) * 5;
      meshRef.current.position.x = initialPosition.current[0] + Math.cos(time * 0.05) * 2;
    }
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <sphereGeometry args={[0.3, 8, 8]} />
      <meshStandardMaterial color="#8B4513" roughness={0.8} emissive="#2B1B0B" emissiveIntensity={0.1} />
    </mesh>
  );
}

function LaptopModel({ gameModeRef, playerStateRef, modelOffsetRef }: { 
  gameModeRef: React.MutableRefObject<string>,
  playerStateRef: React.MutableRefObject<{
    p1x: number, p1y: number, p2x: number, p2y: number, levelLength: number,
    p1rotation: number, p1yVelocity: number, p2rotation: number, p2yVelocity: number
  }>,
  modelOffsetRef: React.MutableRefObject<{ x: number, y: number, z: number }>
}) {
  const modelRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null);
  const screenMeshRef = useRef<THREE.Mesh | null>(null);
  const mouseInScreen = useRef(false);
  const lastMouseMoveTime = useRef(0);
  const mouseMoveThrottle = 16; // ~60fps
  const pendingMouseMove = useRef<{ x: number; y: number } | null>(null);
  const mouseRafId = useRef<number | null>(null);
  
  const width = 440;
  const height = 240;

  const base64ToArrayBuffer = (base64: string) => {
    const binary = atob(base64);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer.buffer;
  };

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load('/models/ufo1.glb', (gltf) => {
      setScene(gltf.scene);
    }, undefined, (error) => {
      console.error('Failed to load GLB:', error);
    });
  }, []);

  useEffect(() => {
    if (socketRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.flipY = false;
    setCanvasTexture(texture);
    const connectSocket = () => {
      if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
        return;
      }
      const ip = "localhost";
      const port = 6671;
      const socket = new WebSocket(`ws://${ip}:${port}/socket`);
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        console.log("WebSocket connected for spaceship laptop");
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
              const stateData = parsedData.message;
              // This is JSON state data - update game mode and player positions
              const modeNames = ["Idle", "Playing", "Paused"];
              if (stateData.mode !== undefined) {
                gameModeRef.current = modeNames[stateData.mode] || "Unknown";
              }
              if (stateData.player1) {
                playerStateRef.current.p1x = stateData.player1.x || 0;
                playerStateRef.current.p1y = stateData.player1.y || 0;
                playerStateRef.current.p1rotation = stateData.player1.rotation || 0;
                playerStateRef.current.p1yVelocity = stateData.player1.yVelocity || 0;
              }
              if (stateData.player2) {
                playerStateRef.current.p2x = stateData.player2.x || 0;
                playerStateRef.current.p2y = stateData.player2.y || 0;
                playerStateRef.current.p2rotation = stateData.player2.rotation || 0;
                playerStateRef.current.p2yVelocity = stateData.player2.yVelocity || 0;
              }
              if (stateData.levelLength !== undefined) {
                playerStateRef.current.levelLength = stateData.levelLength || 1;
              }
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
    };
  }, []);

  useEffect(() => {
    if (!canvasTexture || !scene) return;
    scene.traverse((child: any) => {
      if (child.isMesh && child.material?.name?.includes("Material.008")) {
        if (child.material.type === "MeshStandardMaterial") {
          child.material.map = canvasTexture;
          child.material.emissiveMap = canvasTexture;
          child.material.emissive = new THREE.Color(0xaaaaaa);
          child.material.emissiveIntensity = 0.4;
          child.material.roughness = 0.6;
          child.material.metalness = 0.1;
          child.material.needsUpdate = true;
          child.userData.isScreen = true;
          screenMeshRef.current = child;
        }
      }
    });
  }, [canvasTexture, scene]);

  // Helper function to check if an intersection is with the screen
  const isScreenIntersection = (intersect: any) => {
    return intersect?.object?.userData?.isScreen === true;
  };

  // Helper function to send input to WebSocket
  const sendInput = (data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  };

  // Handle pointer down
  const handleModelPointerDown = (event: any) => {
    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y));
      const button = event.nativeEvent?.button ?? 0;
      sendInput({ type: "mouse_down", button, x, y });
    }
  };

  // Handle pointer up
  const handleModelPointerUp = (event: any) => {
    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y));
      const button = event.nativeEvent?.button ?? 0;
      sendInput({ type: "mouse_up", button, x, y });
    }
  };

  // Handle pointer move with throttling
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

  const handleModelPointerMove = (event: any) => {
    const now = Date.now();
    if (now - lastMouseMoveTime.current < mouseMoveThrottle) {
      return;
    }
    lastMouseMoveTime.current = now;

    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv && mouseInScreen.current) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y));
      
      pendingMouseMove.current = { x, y };
      if (mouseRafId.current === null) {
        mouseRafId.current = requestAnimationFrame(sendMouseMove);
      }
    }
  };

  const handleModelPointerEnter = () => {
    mouseInScreen.current = true;
  };

  const handleModelPointerLeave = () => {
    mouseInScreen.current = false;
  };

  // Keyboard event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mouseInScreen.current) return;
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ 
          type: "key_down", 
          key: e.keyCode, 
          code: e.code 
        }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!mouseInScreen.current) return;
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ 
          type: "key_up", 
          key: e.keyCode, 
          code: e.code 
        }));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);


  useFrame((state) => {
    if (modelRef.current) {
      const time = state.clock.getElapsedTime();
      
      // Get level progress from player position
      const levelProgress = playerStateRef.current.levelLength > 0
        ? Math.max(0, Math.min(1, playerStateRef.current.p1x / playerStateRef.current.levelLength))
        : 0;
      
      // Position object based on game progression (not camera position)
      const targetX = THREE.MathUtils.lerp(objectKeyframes[0].position[0], objectKeyframes[1].position[0], levelProgress);
      const targetY = THREE.MathUtils.lerp(objectKeyframes[0].position[1], objectKeyframes[1].position[1], levelProgress);
      const targetZ = THREE.MathUtils.lerp(objectKeyframes[0].position[2], objectKeyframes[1].position[2], levelProgress);
      
      // Add subtle floating motion
      const floatingY = Math.sin(time * 2) * 0.005;
      
      // Apply model offset
      const offsetX = modelOffsetRef.current.x;
      const offsetY = modelOffsetRef.current.y;
      const offsetZ = modelOffsetRef.current.z;
      
      modelRef.current.position.set(
        targetX + offsetX, 
        targetY + floatingY + offsetY, 
        targetZ + offsetZ
      );
      
      // Keep UFO facing forward (doesn't follow camera)
      // Optional: Add subtle rotation
      modelRef.current.rotation.y = Math.sin(time * 0.5) * 0.015; // Gentle sway
      modelRef.current.rotation.z += Math.sin(time * 0.5) * 0.0001;
    }
  });

  if (!scene) return null;
  return (
    <primitive 
      ref={modelRef} 
      object={scene} 
      scale={0.75} 
      position={[0, 2, 4]}
      onPointerDown={handleModelPointerDown}
      onPointerUp={handleModelPointerUp}
      onPointerMove={handleModelPointerMove}
      onPointerEnter={handleModelPointerEnter}
      onPointerLeave={handleModelPointerLeave}
    />
  );
}

function MeteorField() {
  const meteors = [];
  for (let i = 0; i < 0; i++) {
    const x = (Math.random() - 0.5) * 100;
    const y = (Math.random() - 0.5) * 50;
    const z = (Math.random() - 0.5) * 100;
    const scale = Math.random() * 6 + 0.5;
    meteors.push(<Meteor key={i} position={[x, y, z]} scale={scale} />);
  }
  return <>{meteors}</>;
}

// Object position keyframes (where the UFO is positioned in the scene)
const objectKeyframes = [
  { position: [0, 0, -10], progress: 0 },
  { position: [0, 0, -60], progress: 1.0 },
];

function AnimatedCamera({ playerStateRef, cameraControlRef }: {
  playerStateRef: React.MutableRefObject<{
    p1x: number, p1y: number, p2x: number, p2y: number, levelLength: number,
    p1rotation: number, p1yVelocity: number, p2rotation: number, p2yVelocity: number
  }>,
  cameraControlRef: React.MutableRefObject<{ 
    distance: number, 
    theta: number, // horizontal angle
    phi: number,   // vertical angle
    panX: number, 
    panY: number 
  }>
}) {
  useFrame((state) => {
    // Get level progress from player position
    const levelProgress = playerStateRef.current.levelLength > 0
      ? Math.max(0, Math.min(1, playerStateRef.current.p1x / playerStateRef.current.levelLength))
      : 0;
    
    // Calculate where the UFO/object is (its absolute world position)
    const objectX = THREE.MathUtils.lerp(objectKeyframes[0].position[0], objectKeyframes[1].position[0], levelProgress);
    const objectY = THREE.MathUtils.lerp(objectKeyframes[0].position[1], objectKeyframes[1].position[1], levelProgress);
    const objectZ = THREE.MathUtils.lerp(objectKeyframes[0].position[2], objectKeyframes[1].position[2], levelProgress);
    
    // Get camera controls
    const distance = cameraControlRef.current.distance;
    const theta = cameraControlRef.current.theta;
    const phi = cameraControlRef.current.phi;
    const panX = cameraControlRef.current.panX;
    const panY = cameraControlRef.current.panY;
    
    // Convert spherical coordinates to cartesian (Blender-style orbit)
    const x = distance * Math.sin(phi) * Math.sin(theta);
    const y = distance * Math.cos(phi);
    const z = distance * Math.sin(phi) * Math.cos(theta);
    
    // Camera position = UFO position + spherical offset + pan offset
    const targetX = objectX + x + panX;
    const targetY = objectY + y + panY;
    const targetZ = objectZ + z;

    const lerpFactor = 1;
    
    // Smoothly lerp camera to target position
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, targetX, lerpFactor);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, lerpFactor);
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, lerpFactor);
    
    // Camera always looks at the UFO (with pan offset applied to lookAt target too)
    const controls = state.controls as any;
    if (controls && controls.target) {
      const lookAtTarget = new THREE.Vector3(
        objectX + panX, 
        objectY + panY, 
        objectZ
      );
      controls.target.lerp(lookAtTarget, lerpFactor);
      controls.update();
    }
  });

  return null;
}

function CameraControls({ 
  cameraControl,
  modelOffset
}: { 
  cameraControl: { 
    distance: number, 
    theta: number, 
    phi: number, 
    panX: number, 
    panY: number 
  },
  modelOffset: { x: number, y: number, z: number }
}) {
  const thetaDegrees = (cameraControl.theta * 180 / Math.PI).toFixed(1);
  const phiDegrees = (cameraControl.phi * 180 / Math.PI).toFixed(1);
  
  return (
    <div className="absolute top-4 right-4 bg-gray-900/80 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-gray-700 z-10 max-w-xs">
      <div className="text-white text-sm font-medium mb-3">Camera Controls (Blender-Style)</div>
      
      {/* Orbit Section */}
      <div className="mb-3 pb-3 border-b border-gray-600">
        <div className="text-xs font-semibold text-blue-300 mb-2">Orbit</div>
        <div className="text-xs text-gray-300 space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Distance:</span>
            <span className="font-mono">{cameraControl.distance.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Horizontal:</span>
            <span className="font-mono">{thetaDegrees}°</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Vertical:</span>
            <span className="font-mono">{phiDegrees}°</span>
          </div>
        </div>
      </div>
      
      {/* Pan Section */}
      <div className="mb-3 pb-3 border-b border-gray-600">
        <div className="text-xs font-semibold text-green-300 mb-2">Pan</div>
        <div className="text-xs text-gray-300 space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">X:</span>
            <span className="font-mono">{cameraControl.panX.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Y:</span>
            <span className="font-mono">{cameraControl.panY.toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      {/* Model Offset Section */}
      <div className="mb-3 pb-3 border-b border-gray-600">
        <div className="text-xs font-semibold text-purple-300 mb-2">UFO Offset</div>
        <div className="text-xs text-gray-300 space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">X:</span>
            <span className="font-mono">{modelOffset.x.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Y:</span>
            <span className="font-mono">{modelOffset.y.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-400">Z:</span>
            <span className="font-mono">{modelOffset.z.toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      <div className="text-xs text-gray-400 space-y-1">
        <div>🖱️ Right-click + drag: Orbit</div>
        <div>🖱️ Shift + Right-drag: Pan</div>
        <div>🖱️ Scroll: Zoom in/out</div>
        <div>🖱️ Alt + X/Y/Z + Scroll: UFO Offset</div>
      </div>
    </div>
  );
}

function AnimationControls({ gameModeRef, playerStateRef }: { 
  gameModeRef: React.MutableRefObject<string>,
  playerStateRef: React.MutableRefObject<{
    p1x: number, p1y: number, p2x: number, p2y: number, levelLength: number,
    p1rotation: number, p1yVelocity: number, p2rotation: number, p2yVelocity: number
  }>
}) {
  const [gameMode, setGameMode] = useState("Idle");
  const [playerState, setPlayerState] = useState({
    p1x: 0, p1y: 0, p2x: 0, p2y: 0, levelLength: 1,
    p1rotation: 0, p1yVelocity: 0, p2rotation: 0, p2yVelocity: 0
  });
  
  // Poll the game mode and player positions from the refs
  useEffect(() => {
    const interval = setInterval(() => {
      if (gameModeRef.current !== gameMode) {
        setGameMode(gameModeRef.current);
      }
      // Update player positions
      const newState = playerStateRef.current;
      if (newState.p1x !== playerState.p1x || newState.p1y !== playerState.p1y ||
          newState.p2x !== playerState.p2x || newState.p2y !== playerState.p2y ||
          newState.levelLength !== playerState.levelLength) {
        setPlayerState({ ...newState });
      }
    }, 100); // Update UI every 100ms
    return () => clearInterval(interval);
  }, [gameModeRef, playerStateRef, gameMode, playerState]);

  // Calculate level progress from player position
  const getLevelProgress = () => {
    if (gameMode === "Idle" || playerState.levelLength <= 0) {
      return 0;
    }
    // Clamp progress between 0 and 1
    const progress = Math.max(0, Math.min(1, playerState.p1x / playerState.levelLength));
    // Handle NaN by returning 0
    return isNaN(progress) ? 0 : progress;
  };

  const levelProgress = getLevelProgress();

  // Get color based on game mode
  const getModeColor = () => {
    switch(gameMode) {
      case "Playing": return "text-green-400";
      case "Paused": return "text-yellow-400";
      case "Idle": return "text-gray-400";
      default: return "text-gray-400";
    }
  };

  return (
    <div className="absolute top-16 left-4 z-10 space-y-2">
      <div className="bg-black/70 p-4 rounded-lg text-white max-w-sm w-72">
        
        {/* Game Status Display */}
        <div className="mb-3 bg-black/50 p-2 rounded border border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Game Status:</span>
            <span className={`text-sm font-bold ${getModeColor()}`}>
              {gameMode}
            </span>
          </div>
        </div>
        
        {/* Player Positions Display */}
         <div className="mb-3 bg-black/50 p-2 rounded border border-gray-700 space-y-2">
            <div className="text-xs font-semibold text-blue-300 mb-1">Player Positions</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-blue-900/30 p-1.5 rounded">
                <div className="text-blue-300 font-medium mb-0.5">Player 1</div>
                <div className="text-gray-300">
                  <span className="text-gray-400">X:</span> {playerState.p1x.toFixed(1)}
                </div>
                <div className="text-gray-300">
                  <span className="text-gray-400">Y:</span> {playerState.p1y.toFixed(1)}
                </div>
                <div className="text-gray-300">
                  <span className="text-gray-400">Rotation:</span> {playerState.p1rotation.toFixed(2)}
                </div>
                <div className="text-gray-300">
                  <span className="text-gray-400">Y-Velocity:</span> {playerState.p1yVelocity.toFixed(2)}
                </div>
              </div>
              <div className="bg-green-900/30 p-1.5 rounded">
                <div className="text-green-300 font-medium mb-0.5">Player 2</div>
                <div className="text-gray-300">
                  <span className="text-gray-400">X:</span> {playerState.p2x.toFixed(1)}
                </div>
                <div className="text-gray-300">
                  <span className="text-gray-400">Y:</span> {playerState.p2y.toFixed(1)}
                </div>
                <div className="text-gray-300">
                  <span className="text-gray-400">Rotation:</span> {playerState.p2rotation.toFixed(2)}
                </div>
                <div className="text-gray-300">
                  <span className="text-gray-400">Y-Velocity:</span> {playerState.p2yVelocity.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span>Level Progress</span>
            <span>{Math.round(levelProgress * 100)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${levelProgress * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Scene({ gameModeRef, playerStateRef, cameraControlRef, modelOffsetRef }: { 
  gameModeRef: React.MutableRefObject<string>,
  playerStateRef: React.MutableRefObject<{
    p1x: number, p1y: number, p2x: number, p2y: number, levelLength: number,
    p1rotation: number, p1yVelocity: number, p2rotation: number, p2yVelocity: number
  }>,
  cameraControlRef: React.MutableRefObject<{ 
    distance: number, 
    theta: number, 
    phi: number, 
    panX: number, 
    panY: number 
  }>,
  modelOffsetRef: React.MutableRefObject<{ x: number, y: number, z: number }>
}) {
  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4169E1" />
      <Stars radius={300} depth={60} count={1000} factor={7} saturation={0} />
      <LaptopModel gameModeRef={gameModeRef} playerStateRef={playerStateRef} modelOffsetRef={modelOffsetRef} />
      <MeteorField />
      <AnimatedCamera playerStateRef={playerStateRef} cameraControlRef={cameraControlRef} />
      <Environment preset="night" />
    </>
  );
}

export default function SpaceshipScene({ isUIVisible = true }: { isUIVisible?: boolean }) {
  const gameModeRef = useRef<string>("Idle");
  const playerStateRef = useRef({
    p1x: 0, p1y: 0, p2x: 0, p2y: 0, levelLength: 1,
    p1rotation: 0, p1yVelocity: 0, p2rotation: 0, p2yVelocity: 0
  });
  
  // Blender-style camera controls
  const cameraControlRef = useRef({ 
    distance: 15,      // Distance from target
    theta: 0,          // Horizontal angle (rotation around Y axis)
    phi: Math.PI / 3,  // Vertical angle (angle from Y axis), start at 60 degrees
    panX: 0,           // Pan offset X
    panY: 0            // Pan offset Y
  });
  
  const [cameraControl, setCameraControl] = useState({ 
    distance: 15, 
    theta: 0, 
    phi: Math.PI / 3, 
    panX: 0, 
    panY: 0 
  });
  
  // Model offset controls
  const modelOffsetRef = useRef({ x: 0, y: 0, z: 0 });
  const [modelOffset, setModelOffset] = useState({ x: 0, y: 0, z: 0 });
  
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);

  // Blender-style mouse controls
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) { // Right click
        e.preventDefault();
        isDraggingRef.current = true;
        isPanningRef.current = e.shiftKey;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const deltaX = e.clientX - lastMousePosRef.current.x;
        const deltaY = e.clientY - lastMousePosRef.current.y;
        
        if (e.shiftKey || isPanningRef.current) {
          // Shift + Right-drag = Pan
          const panSensitivity = 0.02;
          cameraControlRef.current.panX -= deltaX * panSensitivity;
          cameraControlRef.current.panY += deltaY * panSensitivity;
        } else {
          // Right-drag = Orbit
          const orbitSensitivity = 0.01;
          cameraControlRef.current.theta -= deltaX * orbitSensitivity;
          cameraControlRef.current.phi -= deltaY * orbitSensitivity;
          
          // Clamp phi to avoid gimbal lock
          cameraControlRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraControlRef.current.phi));
        }
        
        setCameraControl({ ...cameraControlRef.current });
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        isDraggingRef.current = false;
        isPanningRef.current = false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Scroll = Zoom (adjust distance) OR Alt + X/Y/Z + Scroll = Model offset
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      // Check for Alt + X/Y/Z to adjust model offset
      if (e.altKey) {
        const offsetSensitivity = 0.001;
        const delta = e.deltaY * offsetSensitivity;
        
        // Check which key is pressed (X, Y, or Z)
        // We'll use a keydown listener to track this
        const pressedKeys = (window as any).pressedKeys || new Set();
        
        if (pressedKeys.has('x') || pressedKeys.has('X')) {
          modelOffsetRef.current.x += delta;
          setModelOffset({ ...modelOffsetRef.current });
        } else if (pressedKeys.has('y') || pressedKeys.has('Y')) {
          modelOffsetRef.current.y += delta;
          setModelOffset({ ...modelOffsetRef.current });
        } else if (pressedKeys.has('z') || pressedKeys.has('Z')) {
          modelOffsetRef.current.z += delta;
          setModelOffset({ ...modelOffsetRef.current });
        }
      } else {
        // Normal zoom
        const zoomSensitivity = 0.001;
        cameraControlRef.current.distance += e.deltaY * zoomSensitivity;
        // Clamp distance
        cameraControlRef.current.distance = Math.max(0, Math.min(50, cameraControlRef.current.distance));
        setCameraControl({ ...cameraControlRef.current });
      }
    };

    // Track pressed keys for Alt + X/Y/Z + Scroll
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!((window as any).pressedKeys)) {
        (window as any).pressedKeys = new Set();
      }
      (window as any).pressedKeys.add(e.key);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if ((window as any).pressedKeys) {
        (window as any).pressedKeys.delete(e.key);
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
  return (
    <div className="relative bg-black h-screen w-screen">
      <div className="fixed inset-0 w-full h-full">
        {isUIVisible && (
          <>
            <AnimationControls gameModeRef={gameModeRef} playerStateRef={playerStateRef} />
            <CameraControls cameraControl={cameraControl} modelOffset={modelOffset} />
          </>
        )}
        <Canvas shadows camera={{ position: [0, 2, 5], fov: 75 }}>
          <Scene 
            gameModeRef={gameModeRef} 
            playerStateRef={playerStateRef} 
            cameraControlRef={cameraControlRef}
            modelOffsetRef={modelOffsetRef}
          />
          <OrbitControls 
            enableZoom={false} 
            enablePan={false} 
            enableRotate={false} 
            rotateSpeed={0.5} 
            enableDamping={true} 
            dampingFactor={0.05}
            makeDefault
          />
        </Canvas>
      </div>
    </div>
  );
}
