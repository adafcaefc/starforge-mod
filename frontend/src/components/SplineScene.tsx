"use client";

import React, { useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, Stars } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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

// GameObject component (meteors) - same as SpaceshipScene
function GameObject({
  position,
  scale,
  rotation,
  objectId,
  nativePtr,
}: {
  position: [number, number, number];
  scale: [number, number];
  rotation: number;
  objectId: number;
  nativePtr: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);

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

  const meteorIndex = (hash32(nativePtr) % 3) + 1;
  const rotationSpeedX = 30 * seededRandom(nativePtr, 1) * 0.02 - 0.01;
  const rotationSpeedY = 30 * seededRandom(nativePtr, 2) * 0.03 - 0.015;
  const rotationSpeedZ = 30 * seededRandom(nativePtr, 3) * 0.02 - 0.01;
  const breatheSpeed = seededRandom(nativePtr, 4) * 2 + 1;
  const breatheAmount = seededRandom(nativePtr, 5) * 0.02 + 0.01;

  useEffect(() => {
    const meteorPath = `/models/meteor${meteorIndex}.glb`;
    const loader = new GLTFLoader();
    loader.load(
      meteorPath,
      (gltf) => {
        setScene(gltf.scene);
      },
      undefined,
      (error) => {
        console.error(`Failed to load ${meteorPath}:`, error);
      }
    );
  }, [meteorIndex]);

  useFrame((state) => {
    if (groupRef.current) {
      const time = state.clock.getElapsedTime();

      groupRef.current.rotation.x = time * rotationSpeedX;
      groupRef.current.rotation.y = time * rotationSpeedY;
      groupRef.current.rotation.z = time * rotationSpeedZ;

      const breathe = Math.sin(time * breatheSpeed) * breatheAmount;
      const baseScale = 0.12;
      groupRef.current.scale.set(scale[0] * baseScale, scale[1] * baseScale, scale[0] * baseScale);

      groupRef.current.position.set(position[0], position[1] + breathe, position[2]);
    }
  });

  if (!scene) return null;

  return (
    <primitive
      ref={groupRef}
      object={scene}
      position={position}
      rotation={[0, (rotation * Math.PI) / 180, 0]}
    />
  );
}

// UFO following the spline
function UFOModel({
  splineRef,
  playerStateRef,
  lengthScaleFactorRef,
  gameObjectsRef,
}: {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
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
}) {
  const modelRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [canvasTexture, setCanvasTexture] = useState<THREE.CanvasTexture | null>(null);

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
      const socket = new WebSocket(`ws://localhost:6671/socket`);
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
            if (parsedData.type === "state" && parsedData.message) {
              const stateData = parsedData.message;
              if (stateData.player1) {
                playerStateRef.current.p1x = stateData.player1.x || 0;
                playerStateRef.current.p1y = stateData.player1.y || 0;
              }
              if (stateData.levelLength !== undefined) {
                playerStateRef.current.levelLength = stateData.levelLength || 3000;
                // Update length scale factor when level length changes
                const splineLength = splineRef.current.length(1000);
                const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
                lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
              }
              
              // Update game objects
              if (stateData.objects && Array.isArray(stateData.objects)) {
                gameObjectsRef.current = stateData.objects.map((obj: any) => ({
                  x: obj.x || 0,
                  y: obj.y || 0,
                  rotation: obj.rotation || 0,
                  scaleX: obj.scaleX || 1,
                  scaleY: obj.scaleY || 1,
                  opacity: obj.opacity || 1,
                  visible: obj.visible !== false,
                  objectId: obj.objectId || -1,
                  nativePtr: obj.nativePtr
                }));
              }
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
    };
  }, []);

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

      if (child.isMesh && child.material?.name?.includes("Material.008")) {
        if (child.material.type === "MeshStandardMaterial") {
          child.material.map = canvasTexture;
          child.material.emissiveMap = canvasTexture;
          child.material.emissive = new THREE.Color(0xaaaaaa);
          child.material.emissiveIntensity = 0.4;
          child.material.roughness = 0.6;
          child.material.metalness = 0.1;
          child.material.needsUpdate = true;
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

  useFrame((state) => {
    if (modelRef.current && splineRef.current.segments.length > 0) {
      const time = state.clock.getElapsedTime();
      const spline = splineRef.current;

      // Calculate position along spline based on player position
      const playerX = playerStateRef.current.p1x;
      const playerY = playerStateRef.current.p1y;
      const effectiveLevelLength = playerStateRef.current.levelLength || 3000;

      // Update length scale factor to ensure spline is proportional to level length
      const splineLength = spline.length(100);
      lengthScaleFactorRef.current = splineLength / effectiveLevelLength;

      // Calculate progress (0 to 1) - player reaches 100% at level length
      const progress = Math.min(1, Math.max(0, playerX / effectiveLevelLength));
      
      // Map progress to spline length
      const targetLength = progress * splineLength;

      // Find parameter t based on length
      const paramData = spline.findClosestByLength(targetLength);
      const position = spline.get(paramData.t);
      const tangent = spline.tangent(paramData.t);
      const normal = spline.normal(paramData.t);

      // Add player Y offset (scaled down to match scene scale)
      const yOffset = playerY / 100;

      // Position UFO along spline with Y offset
      modelRef.current.position.copy(position);
      modelRef.current.position.y += yOffset;

      // Orient UFO along tangent
      const up = normal;
      const lookAtTarget = position.clone().add(tangent);
      modelRef.current.lookAt(lookAtTarget);
      modelRef.current.up.copy(up);

      // Add subtle floating motion
      const floatingY = Math.sin(time * 2) * 0.005;
      modelRef.current.position.y += floatingY;
    }
  });

  if (!scene) return null;
  return <primitive ref={modelRef} object={scene} scale={0.75} />;
}

// Spline visualization
function SplineVisualization({ 
  splineRef,
  selectedPointRef,
  isDraggingPointRef
}: { 
  splineRef: React.MutableRefObject<Spline>;
  selectedPointRef: React.MutableRefObject<number | null>;
  isDraggingPointRef: React.MutableRefObject<boolean>;
}) {
  const lineRef = useRef<THREE.Line>(null);
  const controlPointsRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const spline = splineRef.current;
    if (!spline || spline.segments.length === 0) return;

    // Update spline line
    if (lineRef.current) {
      const points: THREE.Vector3[] = [];
      const steps = 100;
      const maxT = spline.segments.length;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * maxT;
        points.push(spline.get(t));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      lineRef.current.geometry.dispose();
      lineRef.current.geometry = geometry;
    }

    // Update control points
    if (controlPointsRef.current) {
      // Clear existing control points
      while (controlPointsRef.current.children.length > 0) {
        controlPointsRef.current.remove(controlPointsRef.current.children[0]);
      }

      // Add endpoint and handle spheres
      for (const segment of spline.segments) {
        // P1 (red)
        const p1Mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.3 })
        );
        p1Mesh.position.copy(segment.p1);
        p1Mesh.userData.isControlPoint = true;
        p1Mesh.userData.pointIndex = controlPointsRef.current.children.length;
        controlPointsRef.current.add(p1Mesh);

        // M1 (green)
        const m1Mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.3 })
        );
        m1Mesh.position.copy(segment.m1);
        m1Mesh.userData.isControlPoint = true;
        m1Mesh.userData.pointIndex = controlPointsRef.current.children.length;
        controlPointsRef.current.add(m1Mesh);

        // M2 (green)
        const m2Mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.3 })
        );
        m2Mesh.position.copy(segment.m2);
        m2Mesh.userData.isControlPoint = true;
        m2Mesh.userData.pointIndex = controlPointsRef.current.children.length;
        controlPointsRef.current.add(m2Mesh);
      }

      // P2 of last segment (red)
      if (spline.segments.length > 0) {
        const lastSegment = spline.segments[spline.segments.length - 1];
        const p2Mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.3 })
        );
        p2Mesh.position.copy(lastSegment.p2);
        p2Mesh.userData.isControlPoint = true;
        p2Mesh.userData.pointIndex = controlPointsRef.current.children.length;
        controlPointsRef.current.add(p2Mesh);
      }

      // Highlight selected point
      if (selectedPointRef.current !== null && controlPointsRef.current.children[selectedPointRef.current]) {
        const selectedMesh = controlPointsRef.current.children[selectedPointRef.current] as THREE.Mesh;
        const material = selectedMesh.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.8;
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
}: {
  splineRef: React.MutableRefObject<Spline>;
  selectedPointRef: React.MutableRefObject<number | null>;
  isDraggingPointRef: React.MutableRefObject<boolean>;
  dragPlaneRef: React.MutableRefObject<THREE.Plane | null>;
  raycasterRef: React.MutableRefObject<THREE.Raycaster>;
  mouseRef: React.MutableRefObject<THREE.Vector2>;
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
        // Update spline control point
        splineRef.current.editPointSymmetricCenterFix(selectedPointRef.current, intersectPoint);
        splineRef.current.updateParameterList(10000);
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
    levelLength: number;
  }>;
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

  useEffect(() => {
    const interval = setInterval(() => {
      const newObjects = gameObjectsRef.current;
      if (newObjects.length > 0) {
        setObjects([...newObjects]);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [gameObjectsRef]);

  const mapToSplineCoords = (
    gameX: number,
    gameY: number
  ): [number, number, number] => {
    const spline = splineRef.current;
    if (spline.segments.length === 0) return [0, 0, 0];

    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
    
    // Calculate progress (0 to 1) - same as UFO movement
    const progress = Math.min(1, Math.max(0, gameX / effectiveLevelLength));
    
    // Map progress to spline length
    const splineLength = spline.length(100);
    const targetLength = progress * splineLength;

    // Find position on spline
    const paramData = spline.findClosestByLength(targetLength);
    const position = spline.get(paramData.t);

    // Add Y offset (scaled to match scene)
    const yOffset = gameY / 100;

    return [position.x, position.y + yOffset, position.z];
  };

  return (
    <>
      {objects.map((obj, index) => {
        const scenePos = mapToSplineCoords(obj.x, obj.y);
        return (
          <GameObject
            key={`${obj.objectId}-${index}`}
            position={scenePos}
            scale={[obj.scaleX, obj.scaleY]}
            rotation={obj.rotation}
            objectId={obj.objectId}
            nativePtr={obj.nativePtr}
          />
        );
      })}
    </>
  );
}

// Camera following UFO along spline
function AnimatedCamera({
  splineRef,
  playerStateRef,
  lengthScaleFactorRef,
  cameraControlRef,
}: {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
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
}) {
  useFrame((state) => {
    const spline = splineRef.current;
    if (spline.segments.length === 0) return;

    const playerX = playerStateRef.current.p1x;
    const playerY = playerStateRef.current.p1y;
    const lengthScaleFactor = lengthScaleFactorRef.current;

    const scaledLength = playerX * lengthScaleFactor;
    const paramData = spline.findClosestByLength(scaledLength);
    const ufoPosition = spline.get(paramData.t);
    const yOffset = playerY / 100;

    // Camera controls
    const distance = cameraControlRef.current.distance;
    const theta = cameraControlRef.current.theta;
    const phi = cameraControlRef.current.phi;
    const panX = cameraControlRef.current.panX;
    const panY = cameraControlRef.current.panY;

    // Spherical to cartesian
    const x = distance * Math.sin(phi) * Math.sin(theta);
    const y = distance * Math.cos(phi);
    const z = distance * Math.sin(phi) * Math.cos(theta);

    // Camera position relative to UFO
    const targetX = ufoPosition.x + x + panX;
    const targetY = ufoPosition.y + yOffset + y + panY;
    const targetZ = ufoPosition.z + z;

    const lerpFactor = 0.1;
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, targetX, lerpFactor);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY, lerpFactor);
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, lerpFactor);

    // Look at UFO
    const controls = state.controls as any;
    if (controls && controls.target) {
      const lookAtTarget = new THREE.Vector3(ufoPosition.x + panX, ufoPosition.y + yOffset + panY, ufoPosition.z);
      controls.target.lerp(lookAtTarget, lerpFactor);
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
  splineRef,
}: {
  onAddSegment: () => void;
  onRemoveSegment: () => void;
  onSaveSpline: () => void;
  onLoadSpline: () => void;
  splineRef: React.MutableRefObject<Spline>;
}) {
  const [segmentCount, setSegmentCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSegmentCount(splineRef.current.segments.length);
    }, 100);
    return () => clearInterval(interval);
  }, [splineRef]);

  return (
    <div className="absolute top-4 left-4 bg-gray-900/80 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-gray-700 z-10">
      <div className="text-white text-sm font-medium mb-3">Spline Editor</div>
      <div className="text-xs text-gray-300 mb-3">
        Segments: <span className="font-mono">{segmentCount}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            onClick={onAddSegment}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium text-sm transition-colors"
          >
            + Add Segment
          </button>
          <button
            onClick={onRemoveSegment}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-sm transition-colors"
            disabled={segmentCount <= 1}
          >
            - Remove Segment
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSaveSpline}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm transition-colors"
          >
            💾 Save Spline
          </button>
          <button
            onClick={onLoadSpline}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium text-sm transition-colors"
          >
            📂 Load Spline
          </button>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-400 space-y-1">
        <div>🖱️ Right-click + drag: Orbit</div>
        <div>🖱️ Shift + Right-drag: Pan</div>
        <div>🖱️ Scroll: Zoom in/out</div>
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
}: {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<{
    p1x: number;
    p1y: number;
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
}) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4169E1" />
      <Stars radius={300} depth={60} count={1000} factor={7} saturation={0} />
      
      <SplineVisualization 
        splineRef={splineRef} 
        selectedPointRef={selectedPointRef}
        isDraggingPointRef={isDraggingPointRef}
      />
      <SplinePointDragger
        splineRef={splineRef}
        selectedPointRef={selectedPointRef}
        isDraggingPointRef={isDraggingPointRef}
        dragPlaneRef={dragPlaneRef}
        raycasterRef={raycasterRef}
        mouseRef={mouseRef}
      />
      <UFOModel
        splineRef={splineRef}
        playerStateRef={playerStateRef}
        lengthScaleFactorRef={lengthScaleFactorRef}
        gameObjectsRef={gameObjectsRef}
      />
      <GameObjectsField
        gameObjectsRef={gameObjectsRef}
        splineRef={splineRef}
        lengthScaleFactorRef={lengthScaleFactorRef}
        playerStateRef={playerStateRef}
      />
      <AnimatedCamera
        splineRef={splineRef}
        playerStateRef={playerStateRef}
        lengthScaleFactorRef={lengthScaleFactorRef}
        cameraControlRef={cameraControlRef}
      />
      <Environment preset="night" />
    </>
  );
}

export default function SplineScene({ isUIVisible = true }: { isUIVisible?: boolean }) {
  const splineRef = useRef<Spline>(new Spline());
  const playerStateRef = useRef({
    p1x: 0,
    p1y: 0,
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

  const cameraControlRef = useRef({
    distance: 15,
    theta: (0.6 * Math.PI) / 180,
    phi: (45.8 * Math.PI) / 180,
    panX: 0,
    panY: 0,
  });

  const [cameraControl, setCameraControl] = useState(cameraControlRef.current);

  // Spline editing state
  const selectedPointRef = useRef<number | null>(null);
  const isDraggingPointRef = useRef(false);
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Initialize default spline
  useEffect(() => {
    const spline = splineRef.current;
    // Create initial spline with 2 segments
    spline.addSegment(
      new CubicBezierCurve(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(2, 1, -5),
        new THREE.Vector3(4, -1, -10),
        new THREE.Vector3(6, 0, -15)
      )
    );
    spline.addSegment(
      new CubicBezierCurve(
        new THREE.Vector3(6, 0, -15),
        new THREE.Vector3(8, 1, -20),
        new THREE.Vector3(10, -1, -25),
        new THREE.Vector3(12, 0, -30)
      )
    );
    spline.updateParameterList(10000);

    // Calculate length scale factor with default level length of 3000
    const splineLength = spline.length(1000);
    lengthScaleFactorRef.current = splineLength / 3000;
  }, []);

  const handleAddSegment = () => {
    splineRef.current.addNewCurveToSpline();
    splineRef.current.updateParameterList(10000);
    
    // Recalculate length scale factor
    const splineLength = splineRef.current.length(1000);
    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
    lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
  };

  const handleRemoveSegment = () => {
    splineRef.current.removeLastSegment();
    splineRef.current.updateParameterList(10000);
    
    // Recalculate length scale factor
    const splineLength = splineRef.current.length(1000);
    const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
    lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
  };

  const handleSaveSpline = () => {
    const spline = splineRef.current;
    const splineData = {
      segments: spline.segments.map(segment => ({
        p1: { x: segment.p1.x, y: segment.p1.y, z: segment.p1.z },
        m1: { x: segment.m1.x, y: segment.m1.y, z: segment.m1.z },
        m2: { x: segment.m2.x, y: segment.m2.y, z: segment.m2.z },
        p2: { x: segment.p2.x, y: segment.p2.y, z: segment.p2.z },
        p1NormalAngle: segment.p1NormalAngle,
        p2NormalAngle: segment.p2NormalAngle,
      })),
    };
    
    const json = JSON.stringify(splineData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spline.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          const splineData = JSON.parse(json);
          
          // Clear current spline
          const spline = splineRef.current;
          spline.segments = [];
          
          // Load segments from JSON
          for (const segmentData of splineData.segments) {
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
          
          spline.updateParameterList(10000);
          
          // Recalculate length scale factor
          const splineLength = spline.length(1000);
          const effectiveLevelLength = playerStateRef.current.levelLength || 3000;
          lengthScaleFactorRef.current = splineLength / effectiveLevelLength;
          
          console.log('Spline loaded successfully');
        } catch (error) {
          console.error('Failed to load spline:', error);
          alert('Failed to load spline file. Please check the file format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Camera controls (same as SpaceshipScene)
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        // Left click - check for control point selection
        const rect = (e.target as HTMLElement).getBoundingClientRect?.();
        if (rect) {
          mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        }
        // Selection will be handled in the canvas click event
      } else if (e.button === 2) {
        // Right click - camera controls
        e.preventDefault();
        isDraggingRef.current = true;
        isPanningRef.current = e.shiftKey;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect?.();
      if (rect) {
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }

      if (isDraggingRef.current) {
        const deltaX = e.clientX - lastMousePosRef.current.x;
        const deltaY = e.clientY - lastMousePosRef.current.y;

        if (e.shiftKey || isPanningRef.current) {
          const panSensitivity = 0.00005 + cameraControlRef.current.distance * 0.001;
          cameraControlRef.current.panX -= deltaX * panSensitivity;
          cameraControlRef.current.panY += deltaY * panSensitivity;
        } else {
          const orbitSensitivity = 0.01;
          cameraControlRef.current.theta -= deltaX * orbitSensitivity;
          cameraControlRef.current.phi -= deltaY * orbitSensitivity;
          cameraControlRef.current.phi = Math.max(
            0.1,
            Math.min(Math.PI - 0.1, cameraControlRef.current.phi)
          );
        }

        setCameraControl({ ...cameraControlRef.current });
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        // Left mouse up - release dragging
        isDraggingPointRef.current = false;
        dragPlaneRef.current = null;
      } else if (e.button === 2) {
        isDraggingRef.current = false;
        isPanningRef.current = false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.00005 + cameraControlRef.current.distance * 0.001;
      cameraControlRef.current.distance += e.deltaY * zoomSensitivity;
      cameraControlRef.current.distance = Math.max(
        0.00001,
        Math.min(50, cameraControlRef.current.distance)
      );
      setCameraControl({ ...cameraControlRef.current });
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
  }, []);

  return (
    <div className="relative bg-black h-screen w-screen">
      <div className="fixed inset-0 w-full h-full">
        {isUIVisible && (
          <SplineEditorControls
            onAddSegment={handleAddSegment}
            onRemoveSegment={handleRemoveSegment}
            onSaveSpline={handleSaveSpline}
            onLoadSpline={handleLoadSpline}
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
          />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableRotate={false}
            makeDefault
          />
        </Canvas>
      </div>
    </div>
  );
}
