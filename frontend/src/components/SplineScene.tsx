"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Stars } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import dynamic from "next/dynamic";

const ObjectModelsEditor = dynamic(() => import("./ObjectModelsEditor"), { ssr: false });

// Global model cache to avoid loading the same model multiple times
const modelCache = new Map<string, Promise<THREE.Group>>();

// Tune this to control how strongly the player's rotation affects the UFO and camera
const PLAYER_ROTATION_SCALE = 0;
const GAME_MODE_EDITOR = 3; // Matches spc::State::Mode::Editor
const FOLLOW_DISTANCE_SCROLL_BASE = 0.0001;
const FOLLOW_DISTANCE_SCROLL_SCALE = 0.002;
const MIN_SCROLL_SENSITIVITY = 0.000005;
const MIN_CAMERA_DISTANCE = -2;
const MAX_CAMERA_DISTANCE = 20;
const DEFAULT_CAMERA_DISTANCE = 6;
const BASE_ORBIT_YAW = THREE.MathUtils.degToRad(0.6);
const BASE_ORBIT_PHI = THREE.MathUtils.degToRad(56.8);
const BASE_PAN_X = -0.02;
const BASE_PAN_Y = -0.05;

const DEFAULT_HTTP_PORT = 6673;
const DEFAULT_WS_PORT = 6671;
const DEFAULT_API_BASE = `http://localhost:${DEFAULT_HTTP_PORT}`;
const DEFAULT_WS_URL = `ws://localhost:${DEFAULT_WS_PORT}/socket`;

type BackendConfig = {
  apiBaseUrl: string;
  websocketUrl: string;
};

type BackendConfigState = BackendConfig & {
  resolved: boolean;
};

// Helper function to dispose of Three.js objects
function disposeObject(obj: THREE.Object3D) {
  if (obj instanceof THREE.Mesh) {
    if (obj.geometry) {
      obj.geometry.dispose();
    }
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((mat) => {
          if (mat.map) mat.map.dispose();
          mat.dispose();
        });
      } else {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  }
  // Recursively dispose children
  obj.children.forEach((child) => disposeObject(child));
}

function loadModel(modelPath: string): Promise<THREE.Group> {
  if (modelCache.has(modelPath)) {
    return modelCache.get(modelPath)!;
  }

  const loader = new GLTFLoader();
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      modelPath,
      (gltf) => {
        resolve(gltf.scene);
      },
      undefined,
      (error) => {
        console.error(`Failed to load ${modelPath}:`, error);
        reject(error);
      }
    );
  });

  modelCache.set(modelPath, promise);
  return promise;
}

// Cubic Bezier curve implementation matching the C++ Curve class
class CubicBezierCurve {
  p1: THREE.Vector3;
  m1: THREE.Vector3;
  m2: THREE.Vector3;
  p2: THREE.Vector3;
  p1NormalAngle: number = 0;
  p2NormalAngle: number = 0;

  constructor(
    p1: THREE.Vector3,
    m1: THREE.Vector3,
    m2: THREE.Vector3,
    p2: THREE.Vector3
  ) {
    this.p1 = p1;
    this.m1 = m1;
    this.m2 = m2;
    this.p2 = p2;
  }

  lerp(p0: THREE.Vector3, p1: THREE.Vector3, t: number): THREE.Vector3 {
    return new THREE.Vector3(
      THREE.MathUtils.lerp(p0.x, p1.x, t),
      THREE.MathUtils.lerp(p0.y, p1.y, t),
      THREE.MathUtils.lerp(p0.z, p1.z, t)
    );
  }

  get(t: number): THREE.Vector3 {
    const a = this.lerp(this.p1, this.m1, t);
    const b = this.lerp(this.m1, this.m2, t);
    const c = this.lerp(this.m2, this.p2, t);
    const d = this.lerp(a, b, t);
    const e = this.lerp(b, c, t);
    return this.lerp(d, e, t);
  }

  tangent(t: number): THREE.Vector3 {
    const delta = 1e-4;
    const p0 = this.get(Math.max(0.0, t - delta));
    const p1 = this.get(Math.min(1.0, t + delta));
    return p1.clone().sub(p0).normalize();
  }

  normal(t: number): THREE.Vector3 {
    const tangentVec = this.tangent(t);
    const angle = THREE.MathUtils.lerp(this.p1NormalAngle, this.p2NormalAngle, t);

    let binormal = new THREE.Vector3()
      .crossVectors(tangentVec, new THREE.Vector3(0, 1, 0))
      .normalize();

    if (binormal.length() < 1e-6) {
      binormal = new THREE.Vector3()
        .crossVectors(tangentVec, new THREE.Vector3(1, 0, 0))
        .normalize();
    }

    const baseNormal = new THREE.Vector3()
      .crossVectors(binormal, tangentVec)
      .normalize();

    return baseNormal.applyAxisAngle(tangentVec, angle);
  }

  length(steps: number = 100): number {
    let length = 0;
    let prevPoint = this.get(0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const currentPoint = this.get(t);
      length += currentPoint.distanceTo(prevPoint);
      prevPoint = currentPoint;
    }
    return length;
  }
}

// Spline implementation matching the C++ Spline class
class Spline {
  segments: CubicBezierCurve[] = [];
  parameterList: Array<{ t: number; value: THREE.Vector3; l: number }> = [];
  parameterListShouldBeUpdated: boolean = true;

  addSegment(curve: CubicBezierCurve) {
    this.segments.push(curve);
    this.parameterListShouldBeUpdated = true;
  }

  removeLastSegment() {
    if (this.segments.length === 0) return;
    this.segments.pop();
    this.parameterListShouldBeUpdated = true;
  }

  addNewCurveToSpline() {
    if (this.segments.length === 0) return;
    const lastSegment = this.segments[this.segments.length - 1];
    const p1 = lastSegment.p2.clone();
    const m1 = lastSegment.p2.clone().multiplyScalar(2).sub(lastSegment.m2);
    const m2 = lastSegment.p2.clone().multiplyScalar(2).sub(lastSegment.m1);
    const p2 = lastSegment.p2.clone().multiplyScalar(2).sub(lastSegment.p1);
    this.addSegment(new CubicBezierCurve(p1, m1, m2, p2));
  }

  getAllPoints(): THREE.Vector3[] {
    const ret: THREE.Vector3[] = [];
    for (const segment of this.segments) {
      ret.push(segment.p1, segment.m1, segment.m2);
    }
    if (this.segments.length > 0) {
      ret.push(this.segments[this.segments.length - 1].p2);
    }
    return ret;
  }

  getPointsCount(): number {
    return this.segments.length * 3 + 1;
  }

  editPointSymmetricCenterFix(pointIndex: number, position: THREE.Vector3) {
    if (pointIndex === 0) {
      const deltaP1 = position.clone().sub(this.segments[0].p1);
      this.segments[0].p1.copy(position);
      this.segments[0].m1.add(deltaP1);
      this.parameterListShouldBeUpdated = true;
      return;
    } else if (pointIndex === this.getPointsCount() - 1) {
      const lastSegment = this.segments[this.segments.length - 1];
      const deltaP1 = position.clone().sub(lastSegment.p2);
      lastSegment.p2.copy(position);
      lastSegment.m2.add(deltaP1);
      this.parameterListShouldBeUpdated = true;
      return;
    } else if (pointIndex === 1) {
      this.segments[0].m1.copy(position);
      this.parameterListShouldBeUpdated = true;
      return;
    } else if (pointIndex === this.getPointsCount() - 2) {
      this.segments[this.segments.length - 1].m2.copy(position);
      this.parameterListShouldBeUpdated = true;
      return;
    }

    const segmentIndex = Math.floor(pointIndex / 3);
    const offset = pointIndex % 3;
    const deltaP1 = position.clone().sub(this.segments[segmentIndex].p1);

    switch (offset) {
      case 0:
        this.segments[segmentIndex].p1.copy(position);
        this.segments[segmentIndex - 1].p2.copy(position);
        this.segments[segmentIndex].m1.add(deltaP1);
        this.segments[segmentIndex - 1].m2.add(deltaP1);
        break;
      case 1:
        this.segments[segmentIndex].m1.copy(position);
        this.segments[segmentIndex - 1].m2.copy(
          this.segments[segmentIndex].p1
            .clone()
            .multiplyScalar(2)
            .sub(this.segments[segmentIndex].m1)
        );
        break;
      case 2:
        this.segments[segmentIndex].m2.copy(position);
        this.segments[segmentIndex + 1].m1.copy(
          this.segments[segmentIndex + 1].p1
            .clone()
            .multiplyScalar(2)
            .sub(this.segments[segmentIndex].m2)
        );
        break;
    }
    this.parameterListShouldBeUpdated = true;
  }

  updateParameterList(points: number = 10000) {
    if (!this.parameterListShouldBeUpdated) return;
    this.parameterListShouldBeUpdated = false;
    this.parameterList = [];

    const maxT = this.segments.length * 1.0 - 0.000001;
    const tStep = maxT / points;

    let lengthCounter = 0;

    for (let t = 0; t < maxT; t += tStep) {
      const value = this.get(t);
      let deltaLength = 0;
      if (this.parameterList.length !== 0) {
        const lastValue = this.parameterList[this.parameterList.length - 1].value;
        deltaLength = value.distanceTo(lastValue);
      }
      lengthCounter += deltaLength;
      this.parameterList.push({ t, value, l: lengthCounter });
    }
  }

  length(stepsPerCurve: number = 100): number {
    let totalLength = 0;
    for (const segment of this.segments) {
      totalLength += segment.length(stepsPerCurve);
    }
    return totalLength;
  }

  get(t: number): THREE.Vector3 {
    if (this.segments.length === 0) return new THREE.Vector3(0, 0, 0);

    t = Math.max(0, Math.min(t, this.segments.length - 0.000001));

    const segmentIndex = Math.floor(t);
    const localT = t - segmentIndex;
    return this.segments[segmentIndex].get(localT);
  }

  tangent(t: number): THREE.Vector3 {
    if (this.segments.length === 0) return new THREE.Vector3(0, 0, 1);

    t = Math.max(0, Math.min(t, this.segments.length - 0.000001));

    const segmentIndex = Math.floor(t);
    const localT = t - segmentIndex;
    return this.segments[segmentIndex].tangent(localT);
  }

  normal(t: number): THREE.Vector3 {
    if (this.segments.length === 0) return new THREE.Vector3(0, 1, 0);

    t = Math.max(0, Math.min(t, this.segments.length - 0.000001));

    const segmentIndex = Math.floor(t);
    const localT = t - segmentIndex;
    return this.segments[segmentIndex].normal(localT);
  }

  findClosestByLength(l: number): { t: number; value: THREE.Vector3; l: number } {
    if (this.parameterList.length === 0) {
      return { t: 0, value: new THREE.Vector3(), l: 0 };
    }

    // Binary search for closest length
    let left = 0;
    let right = this.parameterList.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.parameterList[mid].l < l) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    if (left === 0) return this.parameterList[0];
    if (left >= this.parameterList.length) return this.parameterList[this.parameterList.length - 1];

    const before = this.parameterList[left - 1];
    const after = this.parameterList[left];

    return Math.abs(after.l - l) < Math.abs(before.l - l) ? after : before;
  }
}

// GameObject component - loads models based on objectModels data
function GameObject({
  position,
  tangent,
  normal,
  scale,
  rotation,
  objectId,
  nativePtr,
  objectModelsDataRef,
  objectModelsVersion,
}: {
  position: [number, number, number];
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  scale: [number, number];
  rotation: number;
  objectId: number;
  nativePtr: number;
  objectModelsDataRef: React.MutableRefObject<{
    [objectId: string]: {
      scaleX: number;
      scaleY: number;
      modelTextures: string[];
      shouldSpin?: boolean;
    };
  }>;
  objectModelsVersion: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const seededRandom = (seed: number, offset: number = 0) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  function hash32(n: number) {
    n = n | 0;
    n = ((n >>> 16) ^ n) * 0x45d9f3b;
    n = ((n >>> 16) ^ n) * 0x45d9f3b;
    n = (n >>> 16) ^ n;
    return n >>> 0;
  }

  const rotationSpeedX = 30 * seededRandom(nativePtr, 1) * 0.02 - 0.01;
  const rotationSpeedY = 30 * seededRandom(nativePtr, 2) * 0.03 - 0.015;
  const rotationSpeedZ = 30 * seededRandom(nativePtr, 3) * 0.02 - 0.01;
  const breatheSpeed = seededRandom(nativePtr, 4) * 2 + 1;
  const breatheAmount = seededRandom(nativePtr, 5) * 0.02 + 0.01;

  // Select model based on objectModels data
  useEffect(() => {
    const objectModelData = objectModelsDataRef.current[objectId.toString()];
    if (objectModelData && objectModelData.modelTextures.length > 0) {
      // If multiple models, select one at random based on nativePtr
      const modelIndex = hash32(nativePtr) % objectModelData.modelTextures.length;
      const modelName = objectModelData.modelTextures[modelIndex];
      setSelectedModel(modelName);
    } else {
      // No model data - don't load anything
      setSelectedModel(null);
    }
  }, [objectId, nativePtr, objectModelsDataRef, objectModelsVersion]);

  useEffect(() => {
    if (!selectedModel) {
      // Clean up any existing scene when no model is selected
      if (scene) {
        disposeObject(scene);
        setScene(null);
      }
      return;
    }

    const modelPath = `/models/objects/${selectedModel}`;

    // Use cached loader and clone the model
    loadModel(modelPath)
      .then((originalScene) => {
        // Clone the scene for this instance
        const clonedScene = originalScene.clone(true);
        setScene(clonedScene);
      })
      .catch((error) => {
        console.error(`Failed to load ${modelPath}:`, error);
      });

    // Cleanup function to dispose of the cloned scene when model changes or component unmounts
    return () => {
      if (scene) {
        disposeObject(scene);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  useFrame((state) => {
    if (groupRef.current) {
      const time = state.clock.getElapsedTime();

      // Get objectModel data to check if spinning should be enabled
      const objectModelData = objectModelsDataRef.current[objectId];
      const shouldSpin = objectModelData?.shouldSpin ?? true; // Default to true for backward compatibility

      // Only apply rotation if shouldSpin is true
      if (shouldSpin) {
        groupRef.current.rotation.x = time * rotationSpeedX;
        groupRef.current.rotation.y = time * rotationSpeedY;
        groupRef.current.rotation.z = time * rotationSpeedZ;
      } else {
        // Orient along spline using tangent and normal vectors
        const posVec = new THREE.Vector3(position[0], position[1], position[2]);
        const up = normal;
        const lookAtTarget = posVec.clone().add(tangent);
        groupRef.current.lookAt(lookAtTarget);
        groupRef.current.up.copy(up);

        // Apply the game object's rotation around the tangent axis
        if (rotation !== 0) {
          groupRef.current.rotateOnAxis(tangent.clone().normalize(), (rotation * Math.PI) / 180);
        }
      }

      // Get scale from objectModels data if available
      const modelScaleX = objectModelData?.scaleX || 1.0;
      const modelScaleY = objectModelData?.scaleY || 1.0;

      const baseScale = 0.12;
      groupRef.current.scale.set(
        scale[0] * baseScale * modelScaleX,
        scale[1] * baseScale * modelScaleY,
        scale[0] * baseScale * modelScaleX
      );

      // Only apply breathing animation if shouldSpin is true
      const breathe = shouldSpin ? Math.sin(time * breatheSpeed) * breatheAmount : 0;
      groupRef.current.position.set(position[0], position[1] + breathe, position[2]);
    }
  });

  if (!scene) return null;

  return (
    <primitive
      ref={groupRef}
      object={scene}
      position={position}
    />
  );
}

// UFO following the spline
function UFOModel({
  splineRef,
  playerStateRef,
  lengthScaleFactorRef,
  gameObjectsRef,
  objectModelsDataRef,
  onGameModeChange,
  onLevelExit,
  backendConfigRef,
}: {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
    p1rotation: number;
    levelLength: number;
  }>;
  lengthScaleFactorRef: React.MutableRefObject<number>;
  gameObjectsRef: React.MutableRefObject<
    Array<{
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
      opacity: number;
      visible: boolean;
      objectId: number;
      nativePtr: number;
    }>
  >;
  objectModelsDataRef: React.MutableRefObject<{
    [objectId: string]: {
      scaleX: number;
      scaleY: number;
      modelTextures: string[];
    };
  }>;
  onGameModeChange: (isEditorMode: boolean) => void;
  onLevelExit: () => void;
  backendConfigRef: React.MutableRefObject<BackendConfigState>;
}) {
  const modelRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null);
  const prevTangentRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 1));
  const mouseInScreen = useRef(false);
  const lastMouseMoveTime = useRef(0);
  const mouseMoveThrottle = 16;
  const pendingMouseMove = useRef<{ x: number; y: number } | null>(null);
  const mouseRafId = useRef<number | null>(null);

  const width = 440;
  const height = 240;

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(
      "/models/ufo1.glb",
      (gltf) => {
        setScene(gltf.scene);
      },
      undefined,
      (error) => {
        console.error("Failed to load GLB:", error);
      }
    );

    // Cleanup function to dispose of the UFO scene
    return () => {
      if (scene) {
        disposeObject(scene);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      
      // Use websocket URL from backend config
      const wsUrl = backendConfigRef.current.websocketUrl;
      console.log('Connecting to WebSocket at:', wsUrl);
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        console.log("WebSocket connected for spline editor");
      });

      socket.addEventListener("message", (event) => {
        if (event.data instanceof Blob) {
          event.data.arrayBuffer().then((buffer) => {
            const pixels = new Uint8ClampedArray(buffer);
            const imageData = new ImageData(pixels, width, height);
            if (ctx) {
              ctx.putImageData(imageData, 0, 0);
              texture.needsUpdate = true;
            }
          });
        } else if (typeof event.data === "string") {
          try {
            const parsedData = JSON.parse(event.data);

            // Handle state messages
            if (parsedData.type === "state") {
              const stateName = parsedData.name;
              const stateData = parsedData.data;

              if (stateName === "level_data") {
                // Reset UFO tangent tracking when new level data arrives
                prevTangentRef.current.set(0, 0, 1);

                // Update level data and game objects
                if (stateData.m_levelLength !== undefined) {
                  playerStateRef.current.levelLength = stateData.m_levelLength || 3000;
                  // Update length scale factor when level length changes
                  const splineLength = splineRef.current.length(1000);
                  const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
                  lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
                }

                // Always update game objects whenever level_data is received
                // If the new level data has an empty game objects array, clear all objects
                if (stateData.m_gameObjects && Array.isArray(stateData.m_gameObjects)) {
                  if (stateData.m_gameObjects.length === 0) {
                    // Clear and dispose all game objects when empty array is sent
                    gameObjectsRef.current = [];
                    console.log("Level data with empty game objects - cleared and disposed all objects");
                  } else {
                    gameObjectsRef.current = stateData.m_gameObjects.map((obj: any) => ({
                      x: obj.m_x || 0,
                      y: obj.m_y || 0,
                      rotation: obj.m_rotation || 0,
                      scaleX: obj.m_scaleX || 1,
                      scaleY: obj.m_scaleY || 1,
                      opacity: obj.m_opacity || 1,
                      visible: obj.m_visible !== false,
                      objectId: obj.m_objectId || -1,
                      nativePtr: obj.m_nativePtr || 0
                    }));
                  }
                }

                // Load spline data automatically when received from level
                if (stateData.m_levelData && stateData.m_levelData.spline && stateData.m_levelData.spline.segments) {
                  const spline = splineRef.current;
                  spline.segments = [];

                  for (const segmentData of stateData.m_levelData.spline.segments) {
                    const segment = new CubicBezierCurve(
                      new THREE.Vector3(segmentData.p1.x, segmentData.p1.y, segmentData.p1.z),
                      new THREE.Vector3(segmentData.m1.x, segmentData.m1.y, segmentData.m1.z),
                      new THREE.Vector3(segmentData.m2.x, segmentData.m2.y, segmentData.m2.z),
                      new THREE.Vector3(segmentData.p2.x, segmentData.p2.y, segmentData.p2.z)
                    );
                    segment.p1NormalAngle = segmentData.p1NormalAngle || 0;
                    segment.p2NormalAngle = segmentData.p2NormalAngle || 0;
                    spline.addSegment(segment);
                  }

                  spline.updateParameterList(100000);

                  // Recalculate length scale factor
                  const splineLength = spline.length(1000);
                  const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
                  lengthScaleFactorRef.current = splineLength / effectiveLevelLength;

                  console.log('Spline loaded automatically from level data');
                }

                // Update object models data
                if (stateData.m_levelData && stateData.m_levelData.objectModels) {
                  objectModelsDataRef.current = stateData.m_levelData.objectModels;
                }
              } else if (stateName === "game_state") {
                if (typeof stateData.m_mode === "number") {
                  onGameModeChange(stateData.m_mode === GAME_MODE_EDITOR);
                }
              } else if (stateName === "live_level_data") {
                // Update live player data
                if (stateData.m_player1) {
                  playerStateRef.current.p1x = stateData.m_player1.m_x || 0;
                  playerStateRef.current.p1y = stateData.m_player1.m_y || 0;
                  playerStateRef.current.p1rotation = stateData.m_player1.m_rotation || 0;
                }
              }
            }
            // Handle event messages
            else if (parsedData.type === "event") {
              const eventName = parsedData.name;
              const eventData = parsedData.data;

              // Print all received events to console
              console.log("WebSocket event received:", {
                name: eventName,
                data: eventData
              });

              if (eventName === "editor_enter") {
                onGameModeChange(true);
              } else if (eventName === "editor_exit") {
                onGameModeChange(false);
              } else if (eventName === "level_exit") {
                onLevelExit();
                mouseInScreen.current = false;
                pendingMouseMove.current = null;
                if (mouseRafId.current !== null) {
                  cancelAnimationFrame(mouseRafId.current);
                  mouseRafId.current = null;
                }
              }

              // Note: level_exit event no longer clears objects
              // Objects are only cleared when level_data state is sent with empty m_gameObjects array
              // This ensures proper disposal through React's cleanup mechanisms
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      });

      socket.addEventListener("close", () => {
        console.log("WebSocket disconnected, retrying in 3 seconds");
        setTimeout(connectSocket, 3000);
      });
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      // Dispose canvas texture on cleanup
      if (canvasTexture) {
        canvasTexture.dispose();
      }
    };
    // Refs are intentionally excluded - they're stable and always reference current values
    // canvasTexture is created inside this effect and disposed in cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGameModeChange, onLevelExit, backendConfigRef]);

  useEffect(() => {
    if (!canvasTexture || !scene) return;
    scene.traverse((child: any) => {
      if (child.isMesh && child.material?.name?.includes("Material_0")) {
        if (["cube", "cube001", "cube002", "cube003"].includes(child.name)) {
          const glowLight = new THREE.PointLight(0xffff00, 3, 0.8);
          glowLight.position.copy(child.position);
          child.add(glowLight);
        }
      }

      if (child.isMesh && ["cube007"].includes(child.name)) {
        if (child.material?.type === "MeshStandardMaterial") {
          const glowLight = new THREE.PointLight(0xff0000, 0.2, 0.6);
          glowLight.position.copy(child.position);
          glowLight.position.x += 0.2;
          glowLight.position.y += 0.1;
          glowLight.position.z += 0.4;
          child.add(glowLight);
        }
      }

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
        }

        const screenLight = new THREE.SpotLight(0xffffff, 7, 15, Math.PI / -6, 20, 1);
        screenLight.position.copy(child.position);
        screenLight.position.z += 3;
        screenLight.target.position.set(
          screenLight.position.x,
          screenLight.position.y,
          screenLight.position.z - 1
        );
        child.add(screenLight);
        child.add(screenLight.target);
      }
    });
  }, [canvasTexture, scene]);

  const isScreenIntersection = (intersect: any) => {
    return intersect?.object?.userData?.isScreen === true;
  };

  const sendInput = (data: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  };

  const sendMouseMove = () => {
    if (pendingMouseMove.current && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "mouse_move",
          x: pendingMouseMove.current.x,
          y: pendingMouseMove.current.y,
        })
      );
      pendingMouseMove.current = null;
    }
    mouseRafId.current = null;
  };

  const handleModelPointerDown = (event: any) => {
    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y));
      const button = event.nativeEvent?.button ?? 0;
      sendInput({ type: "mouse_down", button, x, y });
    }
  };

  const handleModelPointerUp = (event: any) => {
    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y));
      const button = event.nativeEvent?.button ?? 0;
      sendInput({ type: "mouse_up", button, x, y });
    }
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
    pendingMouseMove.current = null;
    if (mouseRafId.current !== null) {
      cancelAnimationFrame(mouseRafId.current);
      mouseRafId.current = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mouseInScreen.current) return;
      sendInput({ type: "key_down", key: e.keyCode, code: e.code });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!mouseInScreen.current) return;
      sendInput({ type: "key_up", key: e.keyCode, code: e.code });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mouseRafId.current !== null) {
        cancelAnimationFrame(mouseRafId.current);
        mouseRafId.current = null;
      }
    };
  }, []);

  useFrame((state) => {
    if (modelRef.current && splineRef.current.segments.length > 0) {
      const time = state.clock.getElapsedTime();
      const spline = splineRef.current;

      // Calculate position along spline based on player position
      const playerX = playerStateRef.current.p1x;
      const playerY = playerStateRef.current.p1y;
      const playerRotation = playerStateRef.current.p1rotation;
      const effectiveLevelLength = playerStateRef.current.levelLength || 3000;

      // Calculate X-scale based on level length
      const defaultLevelLength = 3000;
      const xScale = effectiveLevelLength / defaultLevelLength;

      // Update length scale factor to ensure spline is proportional to level length
      const splineLength = spline.length(100);
      lengthScaleFactorRef.current = splineLength / effectiveLevelLength;

      // Calculate progress (0 to 1) - player reaches 100% at level length
      const progress = Math.min(1, Math.max(0, playerX / effectiveLevelLength));

      // Reset tangent tracking if player restarted (near beginning of level)
      if (playerX < 100) {
        prevTangentRef.current.set(0, 0, 1);
      }

      // Map progress to spline length
      const targetLength = progress * splineLength;

      // Find parameter t based on length
      const paramData = spline.findClosestByLength(targetLength);
      const position = spline.get(paramData.t);
      const rawTangent = spline.tangent(paramData.t).normalize();
      const rawNormal = spline.normal(paramData.t).normalize();

      // Apply the non-uniform X scaling to the spline frame so orientation matches the stretched path
      let tangent = new THREE.Vector3(rawTangent.x * xScale, rawTangent.y, rawTangent.z).normalize();
      let normal = new THREE.Vector3(rawNormal.x * xScale, rawNormal.y, rawNormal.z).normalize();

      // Ensure orientation stays consistent when the spline direction flips between frames
      if (prevTangentRef.current.dot(tangent) < 0) {
        tangent.multiplyScalar(-1);
        normal.multiplyScalar(-1);
      }
      prevTangentRef.current.copy(tangent);

      // Re-orthonormalize the frame to avoid skew introduced by scaling
      let right = new THREE.Vector3().crossVectors(normal, tangent);
      if (right.lengthSq() < 1e-6) {
        const arbitrary = Math.abs(tangent.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        right = new THREE.Vector3().crossVectors(arbitrary, tangent).normalize();
      } else {
        right.normalize();
      }
      normal = new THREE.Vector3().crossVectors(tangent, right).normalize();

      // Apply X-scale to position
      const scaledPosition = new THREE.Vector3(position.x * xScale, position.y, position.z);

      // Add player Y offset (scaled down to match scene scale)
      const yOffset = (playerY - 30) / 100;

      // Position UFO along spline with Y offset
      modelRef.current.position.copy(scaledPosition);
      modelRef.current.position.y += yOffset;

      // Build an orthonormal basis from the spline frame to drive the UFO orientation
      const forward = tangent.clone();
      const upVector = normal.clone().multiplyScalar(-1); // Flip to match scene orientation

      right = new THREE.Vector3().crossVectors(upVector, forward);
      if (right.lengthSq() < 1e-6) {
        // Fallback in the rare case forward and up become parallel
        const arbitrary = Math.abs(forward.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        right = new THREE.Vector3().crossVectors(arbitrary, forward).normalize();
      } else {
        right.normalize();
      }

      const correctedUp = new THREE.Vector3().crossVectors(forward, right).normalize();
      const basis = new THREE.Matrix4().makeBasis(right, correctedUp, forward);
      modelRef.current.quaternion.setFromRotationMatrix(basis);

      // Apply player rotation around the local right axis to mirror 2D left/right turning
      if (playerRotation !== 0) {
        const scaledPlayerRotation = playerRotation * PLAYER_ROTATION_SCALE;
        const rotationRadians = THREE.MathUtils.degToRad(-scaledPlayerRotation);
        modelRef.current.rotateX(rotationRadians);
      }

      // Add subtle floating motion
      const floatingY = Math.sin(time * 2) * 0.005;
      modelRef.current.position.y += floatingY;
    }
  });

  if (!scene) return null;
  return (
    <primitive
      ref={modelRef}
      object={scene}
      scale={0.75}
      onPointerDown={handleModelPointerDown}
      onPointerUp={handleModelPointerUp}
      onPointerMove={handleModelPointerMove}
      onPointerEnter={handleModelPointerEnter}
      onPointerLeave={handleModelPointerLeave}
    />
  );
}

// Spline visualization
function SplineVisualization({
  splineRef,
  selectedPointRef,
  isDraggingPointRef,
  playerStateRef,
}: {
  splineRef: React.MutableRefObject<Spline>;
  selectedPointRef: React.MutableRefObject<number | null>;
  isDraggingPointRef: React.MutableRefObject<boolean>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
    p1rotation: number;
    levelLength: number;
  }>;
}) {
  const lineRef = useRef<THREE.Line>(null);
  const controlPointsRef = useRef<THREE.Group>(null);
  const baseSplineLengthRef = useRef<number>(0);

  // Reusable geometries and materials to avoid recreation every frame
  const controlPointGeometriesRef = useRef<{
    endpointGeometry: THREE.SphereGeometry;
    handleGeometry: THREE.SphereGeometry;
    endpointMaterial: THREE.MeshStandardMaterial;
    handleMaterial: THREE.MeshStandardMaterial;
  } | null>(null);

  // Initialize reusable geometries and materials once
  useEffect(() => {
    controlPointGeometriesRef.current = {
      endpointGeometry: new THREE.SphereGeometry(0.15, 16, 16),
      handleGeometry: new THREE.SphereGeometry(0.1, 16, 16),
      endpointMaterial: new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.3
      }),
      handleMaterial: new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.3
      }),
    };

    // Cleanup function to dispose resources
    return () => {
      if (controlPointGeometriesRef.current) {
        const { endpointGeometry, handleGeometry, endpointMaterial, handleMaterial } = controlPointGeometriesRef.current;
        endpointGeometry.dispose();
        handleGeometry.dispose();
        endpointMaterial.dispose();
        handleMaterial.dispose();
      }
    };
  }, []);

  // Calculate base spline length once
  useEffect(() => {
    const spline = splineRef.current;
    if (spline.segments.length > 0 && baseSplineLengthRef.current === 0) {
      // Calculate the base X-distance (not arc length) from first point to last point
      const firstPoint = spline.segments[0].p1;
      const lastPoint = spline.segments[spline.segments.length - 1].p2;
      baseSplineLengthRef.current = Math.abs(lastPoint.x - firstPoint.x);
    }
  }, [splineRef]);

  useFrame(() => {
    const spline = splineRef.current;
    if (!spline || spline.segments.length === 0 || !controlPointGeometriesRef.current) return;

    // Calculate X-scale based on level length
    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
    const defaultLevelLength = 3000;
    const xScale = effectiveLevelLength / defaultLevelLength;

    // Update spline line with scaling
    if (lineRef.current) {
      const points: THREE.Vector3[] = [];
      const steps = 100;
      const maxT = spline.segments.length;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * maxT;
        const point = spline.get(t);
        // Scale X coordinate based on level length
        points.push(new THREE.Vector3(point.x * xScale, point.y, point.z));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      lineRef.current.geometry.dispose();
      lineRef.current.geometry = geometry;
    }

    // Update control points - reuse existing meshes instead of recreating
    if (controlPointsRef.current) {
      const { endpointGeometry, handleGeometry, endpointMaterial, handleMaterial } = controlPointGeometriesRef.current;

      // Calculate expected number of control points
      const expectedPoints = spline.segments.length * 3 + 1; // Each segment has p1, m1, m2, plus final p2

      // Remove excess meshes if we have too many
      while (controlPointsRef.current.children.length > expectedPoints) {
        const mesh = controlPointsRef.current.children[controlPointsRef.current.children.length - 1];
        controlPointsRef.current.remove(mesh);
      }

      let pointIndex = 0;

      // Helper function to update or create mesh
      const updateOrCreateMesh = (pos: THREE.Vector3, isEndpoint: boolean) => {
        let mesh: THREE.Mesh;
        if (pointIndex < controlPointsRef.current!.children.length) {
          // Reuse existing mesh
          mesh = controlPointsRef.current!.children[pointIndex] as THREE.Mesh;
        } else {
          // Create new mesh only if needed
          mesh = new THREE.Mesh(
            isEndpoint ? endpointGeometry : handleGeometry,
            (isEndpoint ? endpointMaterial : handleMaterial).clone()
          );
          mesh.userData.isControlPoint = true;
          controlPointsRef.current!.add(mesh);
        }
        mesh.position.set(pos.x * xScale, pos.y, pos.z);
        mesh.userData.pointIndex = pointIndex;

        // Handle highlighting
        const isSelected = selectedPointRef.current === pointIndex;
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = isSelected ? 0.8 : 0.3;

        pointIndex++;
      };

      // Add/update endpoint and handle spheres
      for (const segment of spline.segments) {
        // P1 (red) - scaled
        updateOrCreateMesh(segment.p1, true);
        // M1 (green) - scaled
        updateOrCreateMesh(segment.m1, false);
        // M2 (green) - scaled
        updateOrCreateMesh(segment.m2, false);
      }

      // P2 of last segment (red) - scaled
      if (spline.segments.length > 0) {
        const lastSegment = spline.segments[spline.segments.length - 1];
        updateOrCreateMesh(lastSegment.p2, true);
      }
    }
  });

  return (
    <>
      <primitive ref={lineRef} object={new THREE.Line()}>
        <bufferGeometry />
        <lineBasicMaterial color={0xffffff} linewidth={2} />
      </primitive>
      <group ref={controlPointsRef} />
    </>
  );
}

// Component to handle point dragging
function SplinePointDragger({
  splineRef,
  selectedPointRef,
  isDraggingPointRef,
  dragPlaneRef,
  raycasterRef,
  mouseRef,
  playerStateRef,
}: {
  splineRef: React.MutableRefObject<Spline>;
  selectedPointRef: React.MutableRefObject<number | null>;
  isDraggingPointRef: React.MutableRefObject<boolean>;
  dragPlaneRef: React.MutableRefObject<THREE.Plane | null>;
  raycasterRef: React.MutableRefObject<THREE.Raycaster>;
  mouseRef: React.MutableRefObject<THREE.Vector2>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
    p1rotation: number;
    levelLength: number;
  }>;
}) {
  const { camera, scene, gl } = useThree();

  // Handle click to select control point
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left click

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // Find all control point meshes
      const controlPoints: THREE.Object3D[] = [];
      scene.traverse((obj: THREE.Object3D) => {
        if (obj.userData.isControlPoint) {
          controlPoints.push(obj);
        }
      });

      const intersects = raycasterRef.current.intersectObjects(controlPoints, false);

      if (intersects.length > 0) {
        const pointIndex = intersects[0].object.userData.pointIndex;
        selectedPointRef.current = pointIndex;
        isDraggingPointRef.current = true;

        // Create a drag plane perpendicular to camera
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        const pointPosition = intersects[0].point;
        dragPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(
          cameraDirection,
          pointPosition
        );
      } else {
        selectedPointRef.current = null;
        isDraggingPointRef.current = false;
      }
    };

    gl.domElement.addEventListener("mousedown", handleClick);
    return () => {
      gl.domElement.removeEventListener("mousedown", handleClick);
    };
  }, [camera, scene, gl, raycasterRef, mouseRef, selectedPointRef, isDraggingPointRef, dragPlaneRef]);

  // Handle dragging
  useFrame(() => {
    if (isDraggingPointRef.current && selectedPointRef.current !== null && dragPlaneRef.current) {
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const intersectPoint = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersectPoint);

      if (intersectPoint) {
        // Calculate X-scale based on level length
        const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
        const defaultLevelLength = 3000;
        const xScale = effectiveLevelLength / defaultLevelLength;

        // Un-scale the X coordinate to get the actual spline coordinate
        const unscaledPoint = new THREE.Vector3(
          intersectPoint.x / xScale,
          intersectPoint.y,
          intersectPoint.z
        );

        // Update spline control point with unscaled coordinates
        splineRef.current.editPointSymmetricCenterFix(selectedPointRef.current, unscaledPoint);
        splineRef.current.updateParameterList(100000);
      }
    }
  });

  return null;
}

// Game objects field along spline
function GameObjectsField({
  gameObjectsRef,
  splineRef,
  lengthScaleFactorRef,
  playerStateRef,
  objectModelsDataRef,
  objectModelsVersion,
}: {
  gameObjectsRef: React.MutableRefObject<
    Array<{
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
      opacity: number;
      visible: boolean;
      objectId: number;
      nativePtr: number;
    }>
  >;
  splineRef: React.MutableRefObject<Spline>;
  lengthScaleFactorRef: React.MutableRefObject<number>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
    p1rotation: number;
    levelLength: number;
  }>;
  objectModelsDataRef: React.MutableRefObject<{
    [objectId: string]: {
      scaleX: number;
      scaleY: number;
      modelTextures: string[];
    };
  }>;
  objectModelsVersion: number;
}) {
  const [objects, setObjects] = useState<
    Array<{
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
      opacity: number;
      visible: boolean;
      objectId: number;
      nativePtr: number;
    }>
  >([]);

  const lastUpdateRef = useRef<number>(0);

  // Use useFrame to update objects - works even when tab is not active
  useFrame(() => {
    const now = Date.now();
    // Update at most every 100ms to avoid excessive re-renders
    if (now - lastUpdateRef.current > 100) {
      const newObjects = gameObjectsRef.current;
      // Always update, even if empty (to clear objects)
      setObjects([...newObjects]);
      lastUpdateRef.current = now;
    }
  });

  const mapToSplineCoords = (
    gameX: number,
    gameY: number
  ): { position: [number, number, number]; tangent: THREE.Vector3; normal: THREE.Vector3 } => {
    const spline = splineRef.current;
    if (spline.segments.length === 0) {
      return {
        position: [0, 0, 0],
        tangent: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(0, 1, 0)
      };
    }

    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;

    // Calculate X-scale based on level length
    const defaultLevelLength = 3000;
    const xScale = effectiveLevelLength / defaultLevelLength;

    // Calculate progress (0 to 1) - same as UFO movement
    const progress = Math.min(1, Math.max(0, gameX / effectiveLevelLength));

    // Map progress to spline length
    const splineLength = spline.length(100);
    const targetLength = progress * splineLength;

    // Find position on spline
    const paramData = spline.findClosestByLength(targetLength);
    const position = spline.get(paramData.t);
    const rawTangent = spline.tangent(paramData.t).normalize();
    const rawNormal = spline.normal(paramData.t).normalize();

    let tangent = new THREE.Vector3(rawTangent.x * xScale, rawTangent.y, rawTangent.z).normalize();
    let normal = new THREE.Vector3(rawNormal.x * xScale, rawNormal.y, rawNormal.z).normalize();

    let right = new THREE.Vector3().crossVectors(normal, tangent);
    if (right.lengthSq() < 1e-6) {
      const arbitrary = Math.abs(tangent.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      right = new THREE.Vector3().crossVectors(arbitrary, tangent).normalize();
    } else {
      right.normalize();
    }
    normal = new THREE.Vector3().crossVectors(tangent, right).normalize();

    // Apply X-scale to position
    const scaledX = position.x * xScale;

    // Add Y offset (scaled to match scene)
    const yOffset = gameY / 100;

    return {
      position: [scaledX, position.y + yOffset, position.z],
      tangent,
      normal
    };
  };

  return (
    <>
      {objects.map((obj, index) => {
        const splineData = mapToSplineCoords(obj.x, obj.y);
        return (
          <GameObject
            key={`${obj.objectId}-${index}`}
            position={splineData.position}
            tangent={splineData.tangent}
            normal={splineData.normal}
            scale={[obj.scaleX, obj.scaleY]}
            rotation={obj.rotation}
            objectId={obj.objectId}
            nativePtr={obj.nativePtr}
            objectModelsDataRef={objectModelsDataRef}
            objectModelsVersion={objectModelsVersion}
          />
        );
      })}
    </>
  );
}

// Camera following UFO along spline (cockpit view)
function AnimatedCamera({
  splineRef,
  playerStateRef,
  lengthScaleFactorRef,
  cameraControlRef,
  isEditorMode,
  editorCameraRef,
}: {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
    p1rotation: number;
    levelLength: number;
  }>;
  lengthScaleFactorRef: React.MutableRefObject<number>;
  cameraControlRef: React.MutableRefObject<{
    distance: number;
    theta: number;
    phi: number;
    panX: number;
    panY: number;
  }>;
  isEditorMode: boolean;
  editorCameraRef: React.MutableRefObject<{
    position: THREE.Vector3;
    yaw: number;
    pitch: number;
  }>;
}) {
  const editorInitializedRef = useRef(false);
  // Preserve the last valid cockpit frame so zoom controls stay responsive when spline data is missing
  const fallbackCameraFrameRef = useRef({
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
  });

  useFrame((state) => {
    const controls = state.controls as any;

    if (isEditorMode) {
      if (!editorInitializedRef.current) {
        editorCameraRef.current.position.copy(state.camera.position);
        const currentForward = new THREE.Vector3();
        state.camera.getWorldDirection(currentForward);
        editorCameraRef.current.yaw = Math.atan2(currentForward.x, currentForward.z);
        editorCameraRef.current.pitch = Math.asin(
          THREE.MathUtils.clamp(currentForward.y, -1, 1)
        );
        editorInitializedRef.current = true;
      }

      const clampedPitch = THREE.MathUtils.clamp(
        editorCameraRef.current.pitch,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01
      );
      editorCameraRef.current.pitch = clampedPitch;

      const cosPitch = Math.cos(clampedPitch);
      const forward = new THREE.Vector3(
        Math.sin(editorCameraRef.current.yaw) * cosPitch,
        Math.sin(clampedPitch),
        Math.cos(editorCameraRef.current.yaw) * cosPitch
      ).normalize();
      const worldUp = new THREE.Vector3(0, 1, 0);
      let right = new THREE.Vector3().crossVectors(forward, worldUp);
      if (right.lengthSq() < 1e-6) {
        right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(1, 0, 0));
      }
      right.normalize();
      const upVector = new THREE.Vector3().crossVectors(right, forward).normalize();

      const target = editorCameraRef.current.position.clone().add(forward);
      state.camera.position.copy(editorCameraRef.current.position);
      state.camera.up.copy(upVector);
      state.camera.lookAt(target);

      if (controls) {
        if (controls.target) {
          controls.target.copy(target);
        }
        if (typeof controls.update === "function") {
          controls.update();
        }
      }
      return;
    }

    editorInitializedRef.current = false;

    const spline = splineRef.current;
    const hasSpline = spline.segments.length > 0;

    const fallbackFrame = fallbackCameraFrameRef.current;

    let scaledUfoPosition = fallbackFrame.position.clone();
    let forward = fallbackFrame.forward.clone();
    let upVector = fallbackFrame.up.clone();

    if (forward.lengthSq() < 1e-6) {
      forward.set(0, 0, -1);
    }
    forward.normalize();

    if (upVector.lengthSq() < 1e-6) {
      upVector.set(0, 1, 0);
    }
    upVector.normalize();

    let right = new THREE.Vector3().crossVectors(upVector, forward);
    if (right.lengthSq() < 1e-6) {
      right = Math.abs(forward.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    } else {
      right.normalize();
    }

    if (hasSpline) {
      const playerX = playerStateRef.current.p1x;
      const playerY = playerStateRef.current.p1y;
      const lengthScaleFactor = lengthScaleFactorRef.current;
      const effectiveLevelLength = playerStateRef.current.levelLength || 3000;

      const defaultLevelLength = 3000;
      const xScale = effectiveLevelLength / defaultLevelLength;

      const scaledLength = playerX * lengthScaleFactor;
      const paramData = spline.findClosestByLength(scaledLength);
      const ufoPosition = spline.get(paramData.t);
      const splineTangent = spline.tangent(paramData.t).normalize();
      const splineNormal = spline.normal(paramData.t).normalize();

      const scaledUfoX = ufoPosition.x * xScale;
      const yOffset = playerY / 100;
      scaledUfoPosition = new THREE.Vector3(scaledUfoX, ufoPosition.y + yOffset, ufoPosition.z);

      forward = splineTangent.clone();
      upVector = splineNormal.clone().multiplyScalar(-1);

      right = new THREE.Vector3().crossVectors(upVector, forward);
      if (right.lengthSq() < 1e-6) {
        const arbitrary = Math.abs(forward.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        right = new THREE.Vector3().crossVectors(arbitrary, forward).normalize();
      } else {
        right.normalize();
      }

      const playerRotation = playerStateRef.current.p1rotation ?? 0;
      const scaledPlayerRotation = playerRotation * PLAYER_ROTATION_SCALE;
      if (scaledPlayerRotation !== 0) {
        const rotationRadians = THREE.MathUtils.degToRad(-scaledPlayerRotation);
        const rotationQuat = new THREE.Quaternion().setFromAxisAngle(right, rotationRadians);
        forward.applyQuaternion(rotationQuat);
        upVector.applyQuaternion(rotationQuat);
      }

      const scaledForward = new THREE.Vector3(
        forward.x * xScale,
        forward.y,
        forward.z
      ).normalize();

      forward = scaledForward;
      upVector.normalize();

      right = new THREE.Vector3().crossVectors(upVector, forward);
      if (right.lengthSq() < 1e-6) {
        right = Math.abs(forward.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      } else {
        right.normalize();
      }

      fallbackFrame.position.copy(scaledUfoPosition);
      fallbackFrame.forward.copy(forward);
      fallbackFrame.up.copy(upVector);
    }

    // Apply operator-derived offsets to camera orientation to keep a cockpit feel
    const yawOffset = cameraControlRef.current.theta;
    const pitchOffset = cameraControlRef.current.phi - Math.PI / 2;
    const panX = cameraControlRef.current.panX;
    const panY = cameraControlRef.current.panY;
    const distance = THREE.MathUtils.clamp(
      cameraControlRef.current.distance,
      MIN_CAMERA_DISTANCE,
      MAX_CAMERA_DISTANCE
    );
    cameraControlRef.current.distance = distance;

    const yawQuat = new THREE.Quaternion().setFromAxisAngle(upVector, yawOffset);
    const yawAdjustedRight = right.clone().applyQuaternion(yawQuat).normalize();
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(yawAdjustedRight, pitchOffset);
    const viewAdjustment = new THREE.Quaternion().copy(yawQuat).multiply(pitchQuat);

    const viewForward = forward.clone().applyQuaternion(viewAdjustment).normalize();
    let viewUp = upVector.clone().applyQuaternion(viewAdjustment).normalize();
    const viewRight = new THREE.Vector3().crossVectors(viewForward, viewUp).normalize();
    viewUp = new THREE.Vector3().crossVectors(viewRight, viewForward).normalize();
    viewUp.negate();

    const baseFollowDistance = 0.17 + distance * 0.05;
    const cockpitVerticalOffset = 0.3;

    const desiredPosition = scaledUfoPosition
      .clone()
      .sub(viewForward.clone().multiplyScalar(baseFollowDistance))
      .add(viewUp.clone().multiplyScalar(cockpitVerticalOffset + panY))
      .add(viewRight.clone().multiplyScalar(panX));

    const lerpFactor = 1;
    state.camera.position.lerp(desiredPosition, lerpFactor);

    const lookAheadDistance = 50;
    const lookTarget = state.camera.position.clone().add(viewForward.clone().multiplyScalar(lookAheadDistance));

    const lookMatrix = new THREE.Matrix4().lookAt(state.camera.position, lookTarget, viewUp);
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    state.camera.quaternion.slerp(targetQuaternion, lerpFactor);
    state.camera.up.lerp(viewUp, lerpFactor);

    if (controls && controls.target) {
      controls.target.copy(lookTarget);
      controls.update();
    }
  });

  return null;
}

// UI Controls
function SplineEditorControls({
  onAddSegment,
  onRemoveSegment,
  onSaveSpline,
  onLoadSpline,
  onSaveToLevel,
  onOpenObjectModelsEditor,
  splineRef,
}: {
  onAddSegment: () => void;
  onRemoveSegment: () => void;
  onSaveSpline: () => void;
  onLoadSpline: () => void;
  onSaveToLevel: () => void;
  onOpenObjectModelsEditor: () => void;
  splineRef: React.MutableRefObject<Spline>;
}) {
  const [segmentCount, setSegmentCount] = useState(0);

  // Optimized polling - reduced frequency to minimize performance impact
  useEffect(() => {
    const interval = setInterval(() => {
      setSegmentCount(splineRef.current.segments.length);
    }, 250); // Reduced from 100ms to 250ms for better performance
    return () => clearInterval(interval);
  }, [splineRef]);

  return (
    <div className="absolute top-4 left-4 bg-black/30 backdrop-blur-md p-4 rounded-lg shadow-lg border border-gray-700 z-10">
      <div className="flex flex-col gap-2">
        <button
          onClick={onAddSegment}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
        >
          Add Segment
        </button>
        <button
          onClick={onRemoveSegment}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-700"
          disabled={segmentCount <= 1}
        >
          Remove Segment
        </button>
        <div className="border-t border-gray-600 my-1"></div>
        <button
          onClick={onSaveSpline}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
        >
          Save to JSON
        </button>
        <button
          onClick={onLoadSpline}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
        >
          Load from JSON
        </button>
        <div className="border-t border-gray-600 pt-2 mt-1">
          <button
            onClick={onSaveToLevel}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            Save to Level
          </button>
        </div>
        <div className="border-t border-gray-600 pt-2 mt-1">
          <button
            onClick={onOpenObjectModelsEditor}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            Object Models Editor
          </button>
        </div>
      </div>
    </div>
  );
}

function Scene({
  splineRef,
  playerStateRef,
  lengthScaleFactorRef,
  cameraControlRef,
  gameObjectsRef,
  selectedPointRef,
  isDraggingPointRef,
  dragPlaneRef,
  raycasterRef,
  mouseRef,
  objectModelsDataRef,
  objectModelsVersion,
  onGameModeChange,
  isEditorMode,
  editorCameraRef,
  onLevelExit,
  backendConfigRef,
}: {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
    p1rotation: number;
    levelLength: number;
  }>;
  lengthScaleFactorRef: React.MutableRefObject<number>;
  cameraControlRef: React.MutableRefObject<{
    distance: number;
    theta: number;
    phi: number;
    panX: number;
    panY: number;
  }>;
  gameObjectsRef: React.MutableRefObject<
    Array<{
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
      opacity: number;
      visible: boolean;
      objectId: number;
      nativePtr: number;
    }>
  >;
  selectedPointRef: React.MutableRefObject<number | null>;
  isDraggingPointRef: React.MutableRefObject<boolean>;
  dragPlaneRef: React.MutableRefObject<THREE.Plane | null>;
  raycasterRef: React.MutableRefObject<THREE.Raycaster>;
  mouseRef: React.MutableRefObject<THREE.Vector2>;
  objectModelsDataRef: React.MutableRefObject<{
    [objectId: string]: {
      scaleX: number;
      scaleY: number;
      modelTextures: string[];
    };
  }>;
  objectModelsVersion: number;
  onGameModeChange: (isEditorMode: boolean) => void;
  isEditorMode: boolean;
  editorCameraRef: React.MutableRefObject<{
    position: THREE.Vector3;
    yaw: number;
    pitch: number;
  }>;
  onLevelExit: () => void;
  backendConfigRef: React.MutableRefObject<BackendConfigState>;
}) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4169E1" />
      <Stars radius={300} depth={60} count={1000} factor={7} saturation={0} />

      {isEditorMode && (
        <SplineVisualization
          splineRef={splineRef}
          selectedPointRef={selectedPointRef}
          isDraggingPointRef={isDraggingPointRef}
          playerStateRef={playerStateRef}
        />
      )}
      {isEditorMode && (
        <SplinePointDragger
          splineRef={splineRef}
          selectedPointRef={selectedPointRef}
          isDraggingPointRef={isDraggingPointRef}
          dragPlaneRef={dragPlaneRef}
          raycasterRef={raycasterRef}
          mouseRef={mouseRef}
          playerStateRef={playerStateRef}
        />
      )}
      <UFOModel
        splineRef={splineRef}
        playerStateRef={playerStateRef}
        lengthScaleFactorRef={lengthScaleFactorRef}
        gameObjectsRef={gameObjectsRef}
        objectModelsDataRef={objectModelsDataRef}
        onGameModeChange={onGameModeChange}
        onLevelExit={onLevelExit}
        backendConfigRef={backendConfigRef}
      />
      <GameObjectsField
        gameObjectsRef={gameObjectsRef}
        splineRef={splineRef}
        lengthScaleFactorRef={lengthScaleFactorRef}
        playerStateRef={playerStateRef}
        objectModelsDataRef={objectModelsDataRef}
        objectModelsVersion={objectModelsVersion}
      />
      <AnimatedCamera
        splineRef={splineRef}
        playerStateRef={playerStateRef}
        lengthScaleFactorRef={lengthScaleFactorRef}
        cameraControlRef={cameraControlRef}
        isEditorMode={isEditorMode}
        editorCameraRef={editorCameraRef}
      />
      <Environment preset="night" />
    </>
  );
}


// Helper to detect backend configuration
async function detectBackendConfig(): Promise<BackendConfig> {
  // Try to detect the current port from window.location
  const currentPort = window.location.port ? parseInt(window.location.port) : 3000;
  const currentHost = window.location.hostname;
  
  // First, try to use the same port as the frontend (Next.js dev server proxying to backend)
  try {
    const response = await fetch(`http://${currentHost}:${currentPort}/api/mod/info`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === 200 && data.message) {
        const webserverPort = data.message.webserverPort || DEFAULT_HTTP_PORT;
        const websocketPort = data.message.websocketPort || DEFAULT_WS_PORT;
        
        console.log('Backend detected at current port:', {
          webserverPort,
          websocketPort,
        });
        
        return {
          apiBaseUrl: `http://${currentHost}:${webserverPort}`,
          websocketUrl: `ws://${currentHost}:${websocketPort}/socket`,
        };
      }
    }
  } catch (error) {
    console.log('Backend not available at current port, trying default port...');
  }
  
  // Fall back to default port 6673
  try {
    const response = await fetch(`http://${currentHost}:${DEFAULT_HTTP_PORT}/api/mod/info`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === 200 && data.message) {
        const webserverPort = data.message.webserverPort || DEFAULT_HTTP_PORT;
        const websocketPort = data.message.websocketPort || DEFAULT_WS_PORT;
        
        console.log('Backend detected at default port:', {
          webserverPort,
          websocketPort,
        });
        
        return {
          apiBaseUrl: `http://${currentHost}:${webserverPort}`,
          websocketUrl: `ws://${currentHost}:${websocketPort}/socket`,
        };
      }
    }
  } catch (error) {
    console.log('Backend not available at default port, using fallback defaults');
  }
  
  // Ultimate fallback
  return {
    apiBaseUrl: DEFAULT_API_BASE,
    websocketUrl: DEFAULT_WS_URL,
  };
}

export default function SplineScene() {
  const [showUI, setShowUI] = useState(true);
  const [showObjectModelsEditor, setShowObjectModelsEditor] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: "success" | "error" | "info" }>>([]);
  const [isEditorMode, setIsEditorMode] = useState(false);
  const toastIdCounter = useRef(0);

  // Track object models version to force re-render when models change
  const [objectModelsVersion, setObjectModelsVersion] = useState(0);
  
  // Backend configuration state
  const backendConfigRef = useRef<BackendConfigState>({
    apiBaseUrl: DEFAULT_API_BASE,
    websocketUrl: DEFAULT_WS_URL,
    resolved: false,
  });

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = toastIdCounter.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };
  
  // Detect backend configuration on mount
  useEffect(() => {
    detectBackendConfig().then((config) => {
      backendConfigRef.current = {
        ...config,
        resolved: true,
      };
      console.log('Backend configuration resolved:', config);
    });
  }, []);

  const splineRef = useRef<Spline>(new Spline());
  const playerStateRef = useRef({
    p1x: 0,
    p1y: 0,
    p1rotation: 0,
    levelLength: 3000,
  });
  const lengthScaleFactorRef = useRef(1);
  const gameObjectsRef = useRef<
    Array<{
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
      opacity: number;
      visible: boolean;
      objectId: number;
      nativePtr: number;
    }>
  >([]);

  const objectModelsDataRef = useRef<{
    [objectId: string]: {
      scaleX: number;
      scaleY: number;
      modelTextures: string[];
      shouldSpin?: boolean;
    };
  }>({});

  const cameraControlRef = useRef({
    distance: DEFAULT_CAMERA_DISTANCE,
    theta: BASE_ORBIT_YAW,
    phi: BASE_ORBIT_PHI,
    panX: BASE_PAN_X,
    panY: BASE_PAN_Y,
  });

  const resetCockpitCamera = useCallback(() => {
    cameraControlRef.current.distance = DEFAULT_CAMERA_DISTANCE;
    cameraControlRef.current.theta = BASE_ORBIT_YAW;
    cameraControlRef.current.phi = BASE_ORBIT_PHI;
    cameraControlRef.current.panX = BASE_PAN_X;
    cameraControlRef.current.panY = BASE_PAN_Y;
  }, []);

  // Stores the free camera pose that is active while the game is in editor mode
  const editorCameraRef = useRef({
    position: new THREE.Vector3(0, 3, 10),
    yaw: 0,
    pitch: 0,
  });

  // Tracks whether the editor camera is rotating or panning during a drag
  const cameraDragModeRef = useRef<"rotate" | "pan" | null>(null);
  const wasEditorModeRef = useRef(isEditorMode);

  // Reset cockpit camera offsets when the editor is closed so the view snaps back to first person
  useEffect(() => {
    if (wasEditorModeRef.current && !isEditorMode) {
      resetCockpitCamera();
    }
    wasEditorModeRef.current = isEditorMode;
  }, [isEditorMode, resetCockpitCamera]);

  useEffect(() => {
    if (isEditorMode) {
      setShowUI(true);
    } else {
      setShowUI(false);
      setShowObjectModelsEditor(false);
    }
  }, [isEditorMode]);

  // Spline editing state
  const selectedPointRef = useRef<number | null>(null);
  const isDraggingPointRef = useRef(false);
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Initialize default spline only if no spline data is loaded from level
  useEffect(() => {
    // Wait a bit for websocket to connect and potentially load level data
    const timeout = setTimeout(() => {
      const spline = splineRef.current;
      // Only add default segments if spline is still empty (no data from level)
      if (spline.segments.length === 0) {
        // Seed the scene with the user-supplied default spline when nothing has loaded yet
        const defaultCurve = new CubicBezierCurve(
          new THREE.Vector3(-1.5435895119281877, 3.1906825413365576, -0.4115749478407258),
          new THREE.Vector3(13.087417607366804, 5.9791958668292535, -11.981660048657387),
          new THREE.Vector3(6.919099164601268, 5.067224294028957, -6.483712327427357),
          new THREE.Vector3(18.829060347334654, 4.949963927833904, -22.643917866773307)
        );
        defaultCurve.p1NormalAngle = 0;
        defaultCurve.p2NormalAngle = 0;
        spline.addSegment(defaultCurve);
        spline.updateParameterList(100000);

        // Calculate length scale factor with default level length of 3000
        const splineLength = spline.length(1000);
        lengthScaleFactorRef.current = splineLength / 3000;
      }
    }, 1000); // Wait 1 second for websocket data

    return () => clearTimeout(timeout);
  }, []);

  const handleAddSegment = () => {
    // If spline is empty, create a default segment first
    if (splineRef.current.segments.length === 0) {
      const defaultCurve = new CubicBezierCurve(
        new THREE.Vector3(-1.5435895119281877, 3.1906825413365576, -0.4115749478407258),
        new THREE.Vector3(13.087417607366804, 5.9791958668292535, -11.981660048657387),
        new THREE.Vector3(6.919099164601268, 5.067224294028957, -6.483712327427357),
        new THREE.Vector3(18.829060347334654, 4.949963927833904, -22.643917866773307)
      );
      defaultCurve.p1NormalAngle = 0;
      defaultCurve.p2NormalAngle = 0;
      splineRef.current.addSegment(defaultCurve);
      showToast('Created default segment', 'info');
    } else {
      splineRef.current.addNewCurveToSpline();
    }
    
    splineRef.current.updateParameterList(100000);

    // Recalculate length scale factor
    const splineLength = splineRef.current.length(1000);
    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
    lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
  };

  const handleRemoveSegment = () => {
    // Don't remove if only one segment left
    if (splineRef.current.segments.length <= 1) {
      showToast('Cannot remove the last segment', 'error');
      return;
    }
    
    splineRef.current.removeLastSegment();
    splineRef.current.updateParameterList(100000);

    // Recalculate length scale factor
    const splineLength = splineRef.current.length(1000);
    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
    lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
  };

  const handleSaveSpline = async () => {
    const spline = splineRef.current;
    const levelData = {
      segments: spline.segments.map(segment => ({
        p1: { x: segment.p1.x, y: segment.p1.y, z: segment.p1.z },
        m1: { x: segment.m1.x, y: segment.m1.y, z: segment.m1.z },
        m2: { x: segment.m2.x, y: segment.m2.y, z: segment.m2.z },
        p2: { x: segment.p2.x, y: segment.p2.y, z: segment.p2.z },
        p1NormalAngle: segment.p1NormalAngle,
        p2NormalAngle: segment.p2NormalAngle,
      })),
      objectModels: objectModelsDataRef.current,
    };

    const json = JSON.stringify(levelData, null, 2);

    // Use File System Access API if available (modern browsers)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: 'StarforgeLevelData.json',
          types: [
            {
              description: 'JSON Files',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();

        showToast(`Level data saved successfully!`, 'success');
      } catch (error: any) {
        // User cancelled or error occurred
        if (error.name !== 'AbortError') {
          console.error('Failed to save file:', error);
          showToast('Failed to save file', 'error');
        }
      }
    } else {
      // Fallback for browsers that don't support File System Access API
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'StarforgeLevelData.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Level data saved to StarforgeLevelData.json', 'success');
    }
  };

  const handleLoadSpline = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const levelData = JSON.parse(json);

          // Clear current spline
          const spline = splineRef.current;
          spline.segments = [];

          // Load segments from JSON
          if (levelData.segments && Array.isArray(levelData.segments)) {
            for (const segmentData of levelData.segments) {
              const segment = new CubicBezierCurve(
                new THREE.Vector3(segmentData.p1.x, segmentData.p1.y, segmentData.p1.z),
                new THREE.Vector3(segmentData.m1.x, segmentData.m1.y, segmentData.m1.z),
                new THREE.Vector3(segmentData.m2.x, segmentData.m2.y, segmentData.m2.z),
                new THREE.Vector3(segmentData.p2.x, segmentData.p2.y, segmentData.p2.z)
              );
              segment.p1NormalAngle = segmentData.p1NormalAngle || 0;
              segment.p2NormalAngle = segmentData.p2NormalAngle || 0;
              spline.addSegment(segment);
            }
          }

          // Load object models if present
          if (levelData.objectModels) {
            objectModelsDataRef.current = levelData.objectModels;
          }

          spline.updateParameterList(100000);

          // Recalculate length scale factor
          const splineLength = spline.length(1000);
          const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
          lengthScaleFactorRef.current = splineLength / effectiveLevelLength;

          showToast('Level data loaded successfully from JSON!', 'success');
          console.log('Level data loaded from JSON:', levelData);
        } catch (error) {
          console.error('Failed to load level data:', error);
          showToast('Failed to load level data file. Please check the file format.', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleSaveToLevel = async () => {
    try {
      const spline = splineRef.current;
      const levelData = {
        spline: {
          segments: spline.segments.map(segment => ({
            p1: { x: segment.p1.x, y: segment.p1.y, z: segment.p1.z },
            m1: { x: segment.m1.x, y: segment.m1.y, z: segment.m1.z },
            m2: { x: segment.m2.x, y: segment.m2.y, z: segment.m2.z },
            p2: { x: segment.p2.x, y: segment.p2.y, z: segment.p2.z },
            p1NormalAngle: segment.p1NormalAngle,
            p2NormalAngle: segment.p2NormalAngle,
          })),
        },
        objectModels: objectModelsDataRef.current,
      };

      const apiUrl = `${backendConfigRef.current.apiBaseUrl}/api/leveldata/load`;
      console.log('Saving to level at:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(levelData),
      });

      const result = await response.json();
      
      if (!response.ok || result.status !== 200) {
        throw new Error(result.message || 'Failed to save level data');
      }

      showToast('Spline and object models saved to level successfully!', 'success');
      console.log('Spline saved to level:', result);
    } catch (error) {
      console.error('Failed to save to level:', error);
      showToast(`Failed to save to level: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const lastMousePosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    cameraDragModeRef.current = null;

    const getEditorDirections = () => {
      const { yaw } = editorCameraRef.current;
      const clampedPitch = THREE.MathUtils.clamp(
        editorCameraRef.current.pitch,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01
      );
      editorCameraRef.current.pitch = clampedPitch;

      const cosPitch = Math.cos(clampedPitch);
      const forward = new THREE.Vector3(
        Math.sin(yaw) * cosPitch,
        Math.sin(clampedPitch),
        Math.cos(yaw) * cosPitch
      ).normalize();
      const worldUp = new THREE.Vector3(0, 1, 0);
      let right = new THREE.Vector3().crossVectors(forward, worldUp);
      if (right.lengthSq() < 1e-6) {
        right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(1, 0, 0));
      }
      right.normalize();
      const cameraUp = new THREE.Vector3().crossVectors(right, forward).normalize();
      return { forward, right, cameraUp };
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        const rect = (e.target as HTMLElement).getBoundingClientRect?.();
        if (rect) {
          mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        }
      } else if (e.button === 2) {
        if (!isEditorMode) {
          return;
        }
        e.preventDefault();
        cameraDragModeRef.current = e.shiftKey ? "pan" : "rotate";
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect?.();
      if (rect) {
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }

      if (!isEditorMode || cameraDragModeRef.current === null) {
        return;
      }

      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;

      if (cameraDragModeRef.current === "rotate") {
        const orbitSensitivity = 0.005;
        editorCameraRef.current.yaw -= deltaX * orbitSensitivity;
        editorCameraRef.current.pitch -= deltaY * orbitSensitivity;
        editorCameraRef.current.pitch = THREE.MathUtils.clamp(
          editorCameraRef.current.pitch,
          -Math.PI / 2 + 0.01,
          Math.PI / 2 - 0.01
        );
      } else {
        const panSensitivity = 0.01;
        const { right, cameraUp } = getEditorDirections();
        editorCameraRef.current.position
          .addScaledVector(right, -deltaX * panSensitivity)
          .addScaledVector(cameraUp, deltaY * panSensitivity);
      }

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isDraggingPointRef.current = false;
        dragPlaneRef.current = null;
      } else if (e.button === 2) {
        cameraDragModeRef.current = null;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleWheel = (e: WheelEvent) => {
      if (isEditorMode) {
        e.preventDefault();
        const { forward } = getEditorDirections();
        const zoomSensitivity = 0.005;
        editorCameraRef.current.position.addScaledVector(
          forward,
          -e.deltaY * zoomSensitivity
        );
        return;
      }

      e.preventDefault();
      const currentDistance = cameraControlRef.current.distance;
      const computedSensitivity = FOLLOW_DISTANCE_SCROLL_BASE + Math.abs(currentDistance) * FOLLOW_DISTANCE_SCROLL_SCALE;
      const zoomSensitivity = Math.max(MIN_SCROLL_SENSITIVITY, computedSensitivity);
      const nextDistance = THREE.MathUtils.clamp(
        currentDistance + e.deltaY * zoomSensitivity,
        MIN_CAMERA_DISTANCE,
        MAX_CAMERA_DISTANCE
      );
      cameraControlRef.current.distance = nextDistance;
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [isEditorMode, cameraDragModeRef, dragPlaneRef, editorCameraRef, isDraggingPointRef, mouseRef]);

  return (
    <div className="relative bg-black h-screen w-screen">
      {isEditorMode && (
        <button
          className="fixed top-4 right-4 z-30 bg-black/70 hover:bg-black/90 text-white px-3 py-2 rounded-lg transition-colors"
          onClick={() => setShowUI((v) => !v)}
          title={showUI ? "Hide UI" : "Show UI"}
        >
          {showUI ? "👁️ Hide UI" : "👁️‍🗨️ Show UI"}
        </button>
      )}
      <div className="fixed inset-0 w-full h-full">
        {isEditorMode && showUI && (
          <SplineEditorControls
            onAddSegment={handleAddSegment}
            onRemoveSegment={handleRemoveSegment}
            onSaveSpline={handleSaveSpline}
            onLoadSpline={handleLoadSpline}
            onSaveToLevel={handleSaveToLevel}
            onOpenObjectModelsEditor={() => setShowObjectModelsEditor(true)}
            splineRef={splineRef}
          />
        )}
        <Canvas shadows camera={{ position: [0, 2, 5], fov: 75 }}>
          <Scene
            splineRef={splineRef}
            playerStateRef={playerStateRef}
            lengthScaleFactorRef={lengthScaleFactorRef}
            cameraControlRef={cameraControlRef}
            gameObjectsRef={gameObjectsRef}
            selectedPointRef={selectedPointRef}
            isDraggingPointRef={isDraggingPointRef}
            dragPlaneRef={dragPlaneRef}
            raycasterRef={raycasterRef}
            mouseRef={mouseRef}
            objectModelsDataRef={objectModelsDataRef}
            objectModelsVersion={objectModelsVersion}
            onGameModeChange={setIsEditorMode}
            isEditorMode={isEditorMode}
            editorCameraRef={editorCameraRef}
            onLevelExit={resetCockpitCamera}
            backendConfigRef={backendConfigRef}
          />
          <OrbitControls
            enabled={false}
            enableZoom={false}
            enablePan={false}
            enableRotate={false}
            makeDefault
          />
        </Canvas>
      </div>
      {isEditorMode && showObjectModelsEditor && (
        <ObjectModelsEditor
          objectModelsDataRef={objectModelsDataRef}
          splineRef={splineRef}
          onClose={() => setShowObjectModelsEditor(false)}
          onSave={() => {
            // Increment version to force GameObject components to re-render
            setObjectModelsVersion(prev => prev + 1);
          }}
        />
      )}

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm animate-slide-in-right ${toast.type === "success"
                ? "bg-green-900/90 border-green-600 text-green-100"
                : toast.type === "error"
                  ? "bg-red-900/90 border-red-600 text-red-100"
                  : "bg-blue-900/90 border-blue-600 text-blue-100"
              }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
