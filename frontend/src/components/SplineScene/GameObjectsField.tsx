'use client';

import React, { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GameObject } from "./GameObject";
import { Spline } from "./geometry";
import { getEffectiveLevelLength } from "./splineUtils";
import { GameObjectData, PlayerState } from "./types";
import { ObjectModelsMap } from "@/types/objectModels";
import { SPLINE_LENGTH_STEPS, GAME_COORDINATE_SCALE } from "./constants";

interface GameObjectsFieldProps {
  gameObjectsRef: React.MutableRefObject<GameObjectData[]>;
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<PlayerState>;
  objectModelsDataRef: React.MutableRefObject<ObjectModelsMap>;
  objectModelsVersion: number;
}

export function GameObjectsField({
  gameObjectsRef,
  splineRef,
  playerStateRef,
  objectModelsDataRef,
  objectModelsVersion,
}: GameObjectsFieldProps) {
  const [objects, setObjects] = useState<GameObjectData[]>([]);
  const lastUpdateRef = useRef<number>(0);

  useFrame(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current > 100) {
      const newObjects = gameObjectsRef.current;
      setObjects([...newObjects]);
      lastUpdateRef.current = now;
    }
  });

  const mapToSplineCoords = (gameX: number, gameY: number) => {
    const spline = splineRef.current;
    if (spline.segments.length === 0) {
      return {
        position: [0, 0, 0] as [number, number, number],
        tangent: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(0, 1, 0),
      };
    }

    const effectiveLevelLength = getEffectiveLevelLength(playerStateRef.current.levelLength);
    
    // Scale gameX to match effectiveLevelLength (which is levelLength / GAME_COORDINATE_SCALE)
    const scaledGameX = gameX / GAME_COORDINATE_SCALE;
    const progress = Math.min(1, Math.max(0, scaledGameX / effectiveLevelLength));
    const splineLength = spline.length(SPLINE_LENGTH_STEPS);
    const targetLength = progress * splineLength;
    const paramData = spline.findClosestByLength(targetLength);
    const position = spline.get(paramData.t);
    const rawTangent = spline.tangent(paramData.t).normalize();
    const rawNormal = spline.normal(paramData.t).normalize();

    let tangent = rawTangent.clone();
    let normal = rawNormal.clone();

    let right = new THREE.Vector3().crossVectors(normal, tangent);
    if (right.lengthSq() < 1e-6) {
      const arbitrary = Math.abs(tangent.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      right = new THREE.Vector3().crossVectors(arbitrary, tangent).normalize();
    } else {
      right.normalize();
    }
    normal = new THREE.Vector3().crossVectors(tangent, right).normalize();

    const yOffset = gameY / GAME_COORDINATE_SCALE;

    return {
      position: [position.x, position.y + yOffset, position.z] as [number, number, number],
      tangent,
      normal,
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
