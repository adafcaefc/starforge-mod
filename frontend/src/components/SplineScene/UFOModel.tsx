'use client';

import React, { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeObject } from "./threeUtils";
import { CubicBezierCurve, Spline, createDefaultSplineSegment } from "./geometry";
import { getEffectiveLevelLength, scaleSplineToEffectiveLength } from "./splineUtils";
import { BackendConfigState, GameObjectData, PlayerState } from "./types";
import { GAME_MODE_EDITOR, PLAYER_ROTATION_SCALE } from "./constants";
import { ObjectModelsMap } from "@/types/objectModels";

interface UFOModelProps {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<PlayerState>;
  gameObjectsRef: React.MutableRefObject<GameObjectData[]>;
  objectModelsDataRef: React.MutableRefObject<ObjectModelsMap>;
  onGameModeChange: (isEditorMode: boolean) => void;
  onLevelExit: () => void;
  backendConfigRef: React.MutableRefObject<BackendConfigState>;
}

export function UFOModel({
  splineRef,
  playerStateRef,
  gameObjectsRef,
  objectModelsDataRef,
  onGameModeChange,
  onLevelExit,
  backendConfigRef,
}: UFOModelProps) {
  const modelRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null);
  const prevTangentRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 1));
  const mouseInScreen = useRef(false);
  const mouseIsPressed = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const lastMousePosition = useRef({ x: 0.5, y: 0.5 });
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

      const wsUrl = backendConfigRef.current.websocketUrl;
      console.log("Connecting to WebSocket at:", wsUrl);

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

            if (parsedData.type === "state") {
              const stateName = parsedData.name;
              const stateData = parsedData.data;

              if (stateName === "level_data") {
                prevTangentRef.current.set(0, 0, 1);

                if (stateData.m_levelLength !== undefined) {
                  playerStateRef.current.levelLength = stateData.m_levelLength || 3000;
                }

                if (stateData.m_gameObjects && Array.isArray(stateData.m_gameObjects)) {
                  if (stateData.m_gameObjects.length === 0) {
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
                      nativePtr: obj.m_nativePtr || 0,
                    }));
                  }
                }

                if (stateData.m_levelData && stateData.m_levelData.spline) {
                  const incomingSegments = Array.isArray(stateData.m_levelData.spline.segments)
                    ? stateData.m_levelData.spline.segments
                    : [];
                  const spline = splineRef.current;
                  spline.segments = [];

                  if (incomingSegments.length > 0) {
                    for (const segmentData of incomingSegments) {
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

                    console.log("Spline loaded automatically from level data");
                  } else {
                    spline.addSegment(createDefaultSplineSegment());
                    console.log("Level data contained no spline segments; default spline applied");
                  
                  }
                  
                  scaleSplineToEffectiveLength(spline, playerStateRef.current.levelLength);
                  spline.updateParameterList(100000);
                }

                if (stateData.m_levelData && stateData.m_levelData.objectModels) {
                  objectModelsDataRef.current = stateData.m_levelData.objectModels;
                }
              } else if (stateName === "game_state") {
                if (typeof stateData.m_mode === "number") {
                  onGameModeChange(stateData.m_mode === GAME_MODE_EDITOR);
                }
              } else if (stateName === "live_level_data") {
                if (stateData.m_player1) {
                  playerStateRef.current.p1x = stateData.m_player1.m_x || 0;
                  playerStateRef.current.p1y = stateData.m_player1.m_y || 0;
                  playerStateRef.current.p1rotation = stateData.m_player1.m_rotation || 0;
                }
              }
            } else if (parsedData.type === "event") {
              const eventName = parsedData.name;
              const eventData = parsedData.data;

              console.log("WebSocket event received:", {
                name: eventName,
                data: eventData,
              });

              if (eventName === "editor_enter") {
                onGameModeChange(true);
                if (splineRef.current.segments.length === 0) {
                  splineRef.current.addSegment(createDefaultSplineSegment());
                  splineRef.current.updateParameterList(100000);
                  console.log("Editor enter received with empty spline; default spline applied");
                }
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
            }
          } catch (error) {
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
      if (canvasTexture) {
        canvasTexture.dispose();
      }
    };
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

      if (child.isMesh && child.material) {
        if (child.material.name?.includes("Material.008")) {
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
      }
    });
  }, [canvasTexture, scene]);

  const isScreenIntersection = (intersect: any) => intersect?.object?.userData?.isScreen === true;

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
    const button = event.nativeEvent?.button ?? 0;
    if (button !== 0) return;

    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv) {
      mouseIsPressed.current = true;

      const pointerId = event.nativeEvent?.pointerId;
      if (pointerId !== undefined) {
        activePointerId.current = pointerId;
        const domTarget = event.nativeEvent?.target as Element & { setPointerCapture?: (pointerId: number) => void };
        if (domTarget && typeof domTarget.setPointerCapture === "function") {
          domTarget.setPointerCapture(pointerId);
        }
      } else {
        activePointerId.current = null;
      }

      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y));
      lastMousePosition.current = { x, y };
      sendInput({ type: "mouse_down", button, x, y });
    }
  };

  const handleModelPointerUp = (event: any) => {
    const button = event.nativeEvent?.button ?? 0;
    if (button !== 0) return;

    const pointerId = event.nativeEvent?.pointerId;
    if (pointerId !== undefined && activePointerId.current === pointerId) {
      const domTarget = event.nativeEvent?.target as Element & { releasePointerCapture?: (pointerId: number) => void };
      if (domTarget && typeof domTarget.releasePointerCapture === "function") {
        domTarget.releasePointerCapture(pointerId);
      }
      activePointerId.current = null;
    }

    if (!mouseIsPressed.current) return;
    mouseIsPressed.current = false;

    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    let { x, y } = lastMousePosition.current;
    if (screenIntersect && screenIntersect.uv) {
      x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y));
      lastMousePosition.current = { x, y };
    }

    sendInput({ type: "mouse_up", button, x, y });
  };

  const handleModelPointerMove = (event: any) => {
    const now = Date.now();
    if (now - lastMouseMoveTime.current < mouseMoveThrottle) {
      return;
    }
    lastMouseMoveTime.current = now;

    const pointerId = event.nativeEvent?.pointerId;
    if (activePointerId.current !== null && pointerId !== undefined && pointerId !== activePointerId.current) {
      return;
    }

    const screenIntersect = event.intersections?.find((intersect: any) => isScreenIntersection(intersect));
    if (screenIntersect && screenIntersect.uv && mouseInScreen.current) {
      const x = Math.max(0, Math.min(1, screenIntersect.uv.x));
      const y = Math.max(0, Math.min(1, 1 - screenIntersect.uv.y));
      lastMousePosition.current = { x, y };

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
    if (mouseIsPressed.current && activePointerId.current === null) {
      const { x, y } = lastMousePosition.current;
      sendInput({ type: "mouse_up", button: 0, x, y });
      mouseIsPressed.current = false;
      activePointerId.current = null;
    }
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

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (!mouseIsPressed.current) return;
      if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;

      mouseIsPressed.current = false;
      activePointerId.current = null;

      const { x, y } = lastMousePosition.current;
      sendInput({ type: "mouse_up", button: 0, x, y });
    };

    const handleGlobalPointerCancel = (e: PointerEvent) => {
      if (!mouseIsPressed.current) return;
      if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;

      mouseIsPressed.current = false;
      activePointerId.current = null;

      const { x, y } = lastMousePosition.current;
      sendInput({ type: "mouse_up", button: 0, x, y });
    };

    const handleWindowBlur = () => {
      if (!mouseIsPressed.current) return;
      mouseIsPressed.current = false;
      activePointerId.current = null;

      const { x, y } = lastMousePosition.current;
      sendInput({ type: "mouse_up", button: 0, x, y });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerCancel);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
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

      const playerX = playerStateRef.current.p1x;
      const playerY = playerStateRef.current.p1y;
      const playerRotation = playerStateRef.current.p1rotation;
      const effectiveLevelLength = getEffectiveLevelLength(playerStateRef.current.levelLength);

      // Scale playerX to match effectiveLevelLength (which is levelLength / 100)
      const scaledPlayerX = playerX / 100;
      const progress = Math.min(1, Math.max(0, scaledPlayerX / effectiveLevelLength));

      if (playerX < 100) {
        prevTangentRef.current.set(0, 0, 1);
      }

      const splineLength = spline.length(100);
      const targetLength = progress * splineLength;
      const paramData = spline.findClosestByLength(targetLength);
      const position = spline.get(paramData.t);
      const rawTangent = spline.tangent(paramData.t).normalize();
      const rawNormal = spline.normal(paramData.t).normalize();

      let tangent = rawTangent.clone();
      let normal = rawNormal.clone();

      if (prevTangentRef.current.dot(tangent) < 0) {
        tangent.multiplyScalar(-1);
        normal.multiplyScalar(-1);
      }
      prevTangentRef.current.copy(tangent);

      let right = new THREE.Vector3().crossVectors(normal, tangent);
      if (right.lengthSq() < 1e-6) {
        const arbitrary = Math.abs(tangent.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        right = new THREE.Vector3().crossVectors(arbitrary, tangent).normalize();
      } else {
        right.normalize();
      }
      normal = new THREE.Vector3().crossVectors(tangent, right).normalize();

      const yOffset = (playerY - 30) / 100;

      modelRef.current.position.copy(position);
      modelRef.current.position.y += yOffset;

      const forward = tangent.clone();
      const upVector = normal.clone().multiplyScalar(-1);

      right = new THREE.Vector3().crossVectors(upVector, forward);
      if (right.lengthSq() < 1e-6) {
        const arbitrary = Math.abs(forward.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        right = new THREE.Vector3().crossVectors(arbitrary, forward).normalize();
      } else {
        right.normalize();
      }

      const correctedUp = new THREE.Vector3().crossVectors(forward, right).normalize();
      const basis = new THREE.Matrix4().makeBasis(right, correctedUp, forward);
      modelRef.current.quaternion.setFromRotationMatrix(basis);

      if (playerRotation !== 0) {
        const scaledPlayerRotation = playerRotation * PLAYER_ROTATION_SCALE;
        const rotationRadians = THREE.MathUtils.degToRad(-scaledPlayerRotation);
        modelRef.current.rotateX(rotationRadians);
      }

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
