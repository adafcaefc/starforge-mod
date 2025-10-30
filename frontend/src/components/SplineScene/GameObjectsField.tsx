'use client';

import React, { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MemoizedGameObject as GameObject } from "./GameObject";
import { InstancedGameObjectGroup, GameObjectInstanceData, InstanceGroup } from "./InstancedGameObjects";
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

  // Helper function to get model name for an object
  const getModelName = (obj: GameObjectData): string | null => {
    const objectModelData = objectModelsDataRef.current[obj.objectId.toString()];
    if (!objectModelData || !objectModelData.modelTextures.length) {
      return null;
    }
    
    const hash32 = (n: number) => {
      let value = n | 0;
      value = ((value >>> 16) ^ value) * 0x45d9f3b;
      value = ((value >>> 16) ^ value) * 0x45d9f3b;
      value = (value >>> 16) ^ value;
      return value >>> 0;
    };
    
    const modelIndex = hash32(obj.nativePtr) % objectModelData.modelTextures.length;
    return objectModelData.modelTextures[modelIndex];
  };

  useFrame(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current > 100) {
      const newObjects = gameObjectsRef.current;
      // Only update if the array actually changed (reference or length)
      if (newObjects !== objects || newObjects.length !== objects.length) {
        setObjects([...newObjects]);
      }
      lastUpdateRef.current = now;
    }
  });

  const mapToSplineCoords = (gameX: number, gameY: number) => {
    const spline = splineRef.current;
    if (spline.segments.length === 0) {
      return {
        position: new THREE.Vector3(0, 0, 0),
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
      position: new THREE.Vector3(position.x, position.y + yOffset, position.z),
      tangent,
      normal,
    };
  };

  // Group objects for instanced rendering
  const { instancedGroups, individualObjects } = useMemo(() => {
    const groups: Map<string, InstanceGroup> = new Map();
    const individual: Array<{ obj: GameObjectData; index: number }> = [];
    
    const OPACITY_THRESHOLD = 0.05; // Group objects with similar opacity
    const MAX_VISIBILITY_OPACITY = 1.0;
    
    objects.forEach((obj, index) => {
      const modelName = getModelName(obj);
      if (!modelName) {
        return;
      }
      
      const opacity = obj.visibilityFactor ?? 1.0;
      const scaleKey = `${obj.scaleX.toFixed(2)}x${obj.scaleY.toFixed(2)}`;
      
      // Objects with non-max visibility must be rendered individually for proper opacity control
      if (opacity < MAX_VISIBILITY_OPACITY - OPACITY_THRESHOLD) {
        individual.push({ obj, index });
        return;
      }
      
      // Round opacity to nearest 0.1 for grouping
      const roundedOpacity = Math.round(opacity * 10) / 10;
      
      // Group by model and scale variant (objects with different scales are grouped separately)
      const groupKey = `${modelName}_${roundedOpacity}_${scaleKey}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          modelName,
          opacity: roundedOpacity,
          scaleVariant: scaleKey,
          instances: [],
        });
      }
      
      const splineData = mapToSplineCoords(obj.x, obj.y);
      groups.get(groupKey)!.instances.push({
        object: obj,
        position: splineData.position,
        tangent: splineData.tangent,
        normal: splineData.normal,
        rotation: obj.rotation,
        scale: [obj.scaleX, obj.scaleY],
        nativePtr: obj.nativePtr,
        gameX: obj.x,
      });
    });
    
    return {
      instancedGroups: Array.from(groups.values()),
      individualObjects: individual,
    };
  }, [objects, objectModelsVersion, objectModelsDataRef]);

  return (
    <>
      {/* Render instanced groups */}
      {instancedGroups.map((group) => {
        // Only instance if we have more than 1 object (otherwise individual rendering is fine)
        if (group.instances.length === 0) return null;
        
        // Get the first object's ID for model data lookup
        const firstObj = group.instances[0].object;
        
        return (
          <InstancedGameObjectGroup
            key={`instanced_${group.modelName}_${group.opacity}_${group.scaleVariant}`}
            instances={group.instances}
            modelName={group.modelName}
            opacity={group.opacity}
            objectId={firstObj.objectId}
            objectModelsDataRef={objectModelsDataRef}
            baseScale={0.12}
          />
        );
      })}
      
      {/* Render individual objects (non-max visibility) */}
      {individualObjects.map(({ obj, index }) => {
        const splineData = mapToSplineCoords(obj.x, obj.y);
        return (
          <GameObject
            key={`${obj.objectId}-${index}`}
            position={[splineData.position.x, splineData.position.y, splineData.position.z]}
            tangent={splineData.tangent}
            normal={splineData.normal}
            scale={[obj.scaleX, obj.scaleY]}
            rotation={obj.rotation}
            objectId={obj.objectId}
            nativePtr={obj.nativePtr}
            objectModelsDataRef={objectModelsDataRef}
            objectModelsVersion={objectModelsVersion}
            visibilityFactor={obj.visibilityFactor ?? 1.0}
            gameX={obj.x}
            playerX={playerStateRef.current.p1x}
          />
        );
      })}
    </>
  );
}
