'use client';

import React, { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ObjectModelsMap } from "@/types/objectModels";
import { loadModel, disposeObject } from "./threeUtils";

interface GameObjectProps {
  position: [number, number, number];
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  scale: [number, number];
  rotation: number;
  objectId: number;
  nativePtr: number;
  objectModelsDataRef: React.MutableRefObject<ObjectModelsMap>;
  objectModelsVersion: number;
}

export function GameObject({
  position,
  tangent,
  normal,
  scale,
  rotation,
  objectId,
  nativePtr,
  objectModelsDataRef,
  objectModelsVersion,
}: GameObjectProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const seededRandom = (seed: number, offset = 0) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  const hash32 = (n: number) => {
    let value = n | 0;
    value = ((value >>> 16) ^ value) * 0x45d9f3b;
    value = ((value >>> 16) ^ value) * 0x45d9f3b;
    value = (value >>> 16) ^ value;
    return value >>> 0;
  };

  const rotationSpeedX = 30 * seededRandom(nativePtr, 1) * 0.02 - 0.01;
  const rotationSpeedY = 30 * seededRandom(nativePtr, 2) * 0.03 - 0.015;
  const rotationSpeedZ = 30 * seededRandom(nativePtr, 3) * 0.02 - 0.01;
  const breatheSpeed = seededRandom(nativePtr, 4) * 2 + 1;
  const breatheAmount = seededRandom(nativePtr, 5) * 0.02 + 0.01;

  useEffect(() => {
    const objectModelData = objectModelsDataRef.current[objectId.toString()];
    if (objectModelData && objectModelData.modelTextures.length > 0) {
      const modelIndex = hash32(nativePtr) % objectModelData.modelTextures.length;
      const modelName = objectModelData.modelTextures[modelIndex];
      setSelectedModel(modelName);
    } else {
      setSelectedModel(null);
    }
  }, [objectId, nativePtr, objectModelsDataRef, objectModelsVersion]);

  useEffect(() => {
    if (!selectedModel) {
      if (scene) {
        disposeObject(scene);
        setScene(null);
      }
      return;
    }

    const modelPath = `/models/objects/${selectedModel}`;

    loadModel(modelPath)
      .then((originalScene) => {
        const clonedScene = originalScene.clone(true);
        setScene(clonedScene);
      })
      .catch((error) => {
        console.error(`Failed to load ${modelPath}:`, error);
      });

    return () => {
      if (scene) {
        disposeObject(scene);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();
    const objectModelData = objectModelsDataRef.current[objectId];
    const shouldSpin = objectModelData?.shouldSpin ?? true;

    if (shouldSpin) {
      groupRef.current.rotation.x = time * rotationSpeedX;
      groupRef.current.rotation.y = time * rotationSpeedY;
      groupRef.current.rotation.z = time * rotationSpeedZ;
    } else {
      const posVec = new THREE.Vector3(position[0], position[1], position[2]);
      const up = normal;
      const lookAtTarget = posVec.clone().add(tangent);
      groupRef.current.lookAt(lookAtTarget);
      groupRef.current.up.copy(up);

      if (rotation !== 0) {
        groupRef.current.rotateOnAxis(tangent.clone().normalize(), (rotation * Math.PI) / 180);
      }
    }

    const modelScaleX = objectModelData?.scaleX || 1.0;
    const modelScaleY = objectModelData?.scaleY || 1.0;

    const baseScale = 0.12;
    groupRef.current.scale.set(
      scale[0] * baseScale * modelScaleX,
      scale[1] * baseScale * modelScaleY,
      scale[0] * baseScale * modelScaleX
    );

    const breathe = shouldSpin ? Math.sin(time * breatheSpeed) * breatheAmount : 0;
    groupRef.current.position.set(position[0], position[1] + breathe, position[2]);
  });

  if (!scene) return null;

  return <primitive ref={groupRef} object={scene} position={position} />;
}
