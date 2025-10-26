'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import { Scene } from "./Scene";
import { SplineEditorControls } from "./SplineEditorControls";
import { CubicBezierCurve, Spline, createDefaultSplineSegment } from "./geometry";
import {
  BackendConfig,
  BackendConfigState,
  CameraControlState,
  EditorCameraState,
  GameObjectData,
  PlayerState,
} from "./types";
import {
  BASE_ORBIT_PHI,
  BASE_ORBIT_YAW,
  BASE_PAN_X,
  BASE_PAN_Y,
  DEFAULT_API_BASE,
  DEFAULT_CAMERA_DISTANCE,
  DEFAULT_HTTP_PORT,
  DEFAULT_WS_PORT,
  DEFAULT_WS_URL,
  FOLLOW_DISTANCE_SCROLL_BASE,
  FOLLOW_DISTANCE_SCROLL_SCALE,
  MAX_CAMERA_DISTANCE,
  MIN_CAMERA_DISTANCE,
  MIN_SCROLL_SENSITIVITY,
} from "./constants";
import { ObjectModelsMap } from "@/types/objectModels";

const ObjectModelsEditor = dynamic(() => import("../ObjectModelsEditor/index"), { ssr: false });

async function detectBackendConfig(): Promise<BackendConfig> {
  const currentPort = typeof window !== "undefined" && window.location.port ? parseInt(window.location.port) : 3000;
  const currentHost = typeof window !== "undefined" ? window.location.hostname : "localhost";

  try {
    const response = await fetch(`http://${currentHost}:${currentPort}/api/mod/info`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === 200 && data.message) {
        const webserverPort = data.message.webserverPort || DEFAULT_HTTP_PORT;
        const websocketPort = data.message.websocketPort || DEFAULT_WS_PORT;

        console.log("Backend detected at current port:", {
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
    console.log("Backend not available at current port, trying default port...");
  }

  try {
    const response = await fetch(`http://${currentHost}:${DEFAULT_HTTP_PORT}/api/mod/info`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === 200 && data.message) {
        const webserverPort = data.message.webserverPort || DEFAULT_HTTP_PORT;
        const websocketPort = data.message.websocketPort || DEFAULT_WS_PORT;

        console.log("Backend detected at default port:", {
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
    console.log("Backend not available at default port, using fallback defaults");
  }

  return {
    apiBaseUrl: DEFAULT_API_BASE,
    websocketUrl: DEFAULT_WS_URL,
  };
}

interface ToastData {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

export default function SplineScene() {
  const [showUI, setShowUI] = useState(true);
  const [showObjectModelsEditor, setShowObjectModelsEditor] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [objectModelsVersion, setObjectModelsVersion] = useState(0);
  const toastIdCounter = useRef(0);

  const backendConfigRef = useRef<BackendConfigState>({
    apiBaseUrl: DEFAULT_API_BASE,
    websocketUrl: DEFAULT_WS_URL,
    resolved: false,
  });

  const splineRef = useRef<Spline>(new Spline());
  const playerStateRef = useRef<PlayerState>({
    p1x: 0,
    p1y: 0,
    p1rotation: 0,
    levelLength: 3000,
  });
  const lengthScaleFactorRef = useRef(1);
  const gameObjectsRef = useRef<GameObjectData[]>([]);
  const objectModelsDataRef = useRef<ObjectModelsMap>({});
  const cameraControlRef = useRef<CameraControlState>({
    distance: DEFAULT_CAMERA_DISTANCE,
    theta: BASE_ORBIT_YAW,
    phi: BASE_ORBIT_PHI,
    panX: BASE_PAN_X,
    panY: BASE_PAN_Y,
  });
  const editorCameraRef = useRef<EditorCameraState>({
    position: new THREE.Vector3(0, 3, 10),
    yaw: 0,
    pitch: 0,
  });

  const selectedPointRef = useRef<number | null>(null);
  const isDraggingPointRef = useRef(false);
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const cameraDragModeRef = useRef<"rotate" | "pan" | null>(null);
  const wasEditorModeRef = useRef(isEditorMode);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const showToast = useCallback((message: string, type: ToastData["type"] = "info") => {
    const id = toastIdCounter.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const resetCockpitCamera = useCallback(() => {
    cameraControlRef.current.distance = DEFAULT_CAMERA_DISTANCE;
    cameraControlRef.current.theta = BASE_ORBIT_YAW;
    cameraControlRef.current.phi = BASE_ORBIT_PHI;
    cameraControlRef.current.panX = BASE_PAN_X;
    cameraControlRef.current.panY = BASE_PAN_Y;
  }, []);

  useEffect(() => {
    detectBackendConfig().then((config) => {
      backendConfigRef.current = {
        ...config,
        resolved: true,
      };
      console.log("Backend configuration resolved:", config);
    });
  }, []);

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

  useEffect(() => {
    const timeout = setTimeout(() => {
      const spline = splineRef.current;
      if (spline.segments.length === 0) {
        spline.addSegment(createDefaultSplineSegment());
        spline.updateParameterList(100000);

        const splineLength = spline.length(1000);
        lengthScaleFactorRef.current = splineLength / 3000;
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, []);

  const handleAddSegment = useCallback(() => {
    if (splineRef.current.segments.length === 0) {
      splineRef.current.addSegment(createDefaultSplineSegment());
      showToast("Created default segment", "info");
    } else {
      splineRef.current.addNewCurveToSpline();
    }

    splineRef.current.updateParameterList(100000);
    const splineLength = splineRef.current.length(1000);
    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
    lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
  }, [showToast]);

  const handleRemoveSegment = useCallback(() => {
    if (splineRef.current.segments.length <= 1) {
      showToast("Cannot remove the last segment", "error");
      return;
    }

    splineRef.current.removeLastSegment();
    splineRef.current.updateParameterList(100000);
    const splineLength = splineRef.current.length(1000);
    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
    lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
  }, [showToast]);

  const handleSaveSpline = useCallback(() => {
    const spline = splineRef.current;
    const levelData = {
      segments: spline.segments.map((segment) => ({
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

    if ("showSaveFilePicker" in window) {
      (window as any)
        .showSaveFilePicker({
          suggestedName: "StarforgeLevelData.json",
          types: [
            {
              description: "JSON Files",
              accept: { "application/json": [".json"] },
            },
          ],
        })
        .then((handle: any) => handle.createWritable())
        .then((writable: any) => writable.write(json).then(() => writable.close()))
        .then(() => showToast("Level data saved successfully!", "success"))
        .catch((error: any) => {
          if (error?.name !== "AbortError") {
            console.error("Failed to save file:", error);
            showToast("Failed to save file", "error");
          }
        });
    } else {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "StarforgeLevelData.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Level data saved to StarforgeLevelData.json", "success");
    }
  }, [showToast]);

  const handleLoadSpline = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const levelData = JSON.parse(json);

          const spline = splineRef.current;
          spline.segments = [];

          if (Array.isArray(levelData.segments)) {
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

          if (levelData.objectModels) {
            objectModelsDataRef.current = levelData.objectModels as ObjectModelsMap;
          }

          spline.updateParameterList(100000);
          const splineLength = spline.length(1000);
          const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
          lengthScaleFactorRef.current = splineLength / effectiveLevelLength;

          showToast("Level data loaded successfully from JSON!", "success");
          console.log("Level data loaded from JSON:", levelData);
        } catch (error) {
          console.error("Failed to load level data:", error);
          showToast("Failed to load level data file. Please check the file format.", "error");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [showToast]);

  const handleSaveToLevel = useCallback(async () => {
    try {
      const spline = splineRef.current;
      const levelData = {
        spline: {
          segments: spline.segments.map((segment) => ({
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
      console.log("Saving to level at:", apiUrl);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(levelData),
      });

      const result = await response.json();

      if (!response.ok || result.status !== 200) {
        throw new Error(result.message || "Failed to save level data");
      }

      showToast("Spline and object models saved to level successfully!", "success");
      console.log("Spline saved to level:", result);
    } catch (error) {
      console.error("Failed to save to level:", error);
      showToast(
        `Failed to save to level: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error"
      );
    }
  }, [showToast]);

  useEffect(() => {
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
        editorCameraRef.current.position.addScaledVector(forward, -e.deltaY * zoomSensitivity);
        return;
      }

      e.preventDefault();
      const currentDistance = cameraControlRef.current.distance;
      const computedSensitivity =
        FOLLOW_DISTANCE_SCROLL_BASE + Math.abs(currentDistance) * FOLLOW_DISTANCE_SCROLL_SCALE;
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
  }, [isEditorMode]);

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
          <OrbitControls enabled={false} enableZoom={false} enablePan={false} enableRotate={false} makeDefault />
        </Canvas>
      </div>
      {isEditorMode && showObjectModelsEditor && (
        <ObjectModelsEditor
          objectModelsDataRef={objectModelsDataRef}
          splineRef={splineRef}
          onClose={() => setShowObjectModelsEditor(false)}
          onSave={() => {
            setObjectModelsVersion((prev) => prev + 1);
          }}
        />
      )}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm animate-slide-in-right ${
              toast.type === "success"
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
