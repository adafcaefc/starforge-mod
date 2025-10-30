'use client';

import React, { useEffect, useRef, useState, memo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ObjectModelsMap } from "@/types/objectModels";
import { loadModel, disposeObject } from "./threeUtils";
import { getCachedMaterials, isCached } from "./materialCache";

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
  visibilityFactor: number; // Opacity factor (0 = transparent, 1 = opaque)
  gameX: number; // Game X coordinate for distance check
  playerX: number; // Player X coordinate for distance check
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
  visibilityFactor,
  gameX,
  playerX,
}: GameObjectProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const lastVisibilityFactorRef = useRef<number>(1.0);
  const materialsRef = useRef<THREE.Material[]>([]); // Cache materials that need opacity updates
  const meshesRef = useRef<THREE.Mesh[]>([]); // Cache mesh references for material swapping

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

  // Reusable vectors to avoid allocations
  const posVecRef = useRef(new THREE.Vector3());
  const lookAtTargetRef = useRef(new THREE.Vector3());
  const rotationAxisRef = useRef(new THREE.Vector3());

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
        
        // Clear previous references
        materialsRef.current = [];
        meshesRef.current = [];
        
        // Single traverse to collect all meshes
        // Just collect meshes - don't modify materials yet
        const meshes: THREE.Mesh[] = [];
        clonedScene.traverse((child: any) => {
          if (child.isMesh && child.material) {
            meshes.push(child);
            // Store material references from the cloned scene
            if (Array.isArray(child.material)) {
              child.material.forEach((mat: THREE.Material) => {
                materialsRef.current.push(mat);
              });
            } else {
              materialsRef.current.push(child.material);
            }
          }
        });
        
        // Store mesh references once
        meshesRef.current = meshes;
        
        // Set the initial visibility factor to match current state
        // This prevents unnecessary material swaps on first frame
        lastVisibilityFactorRef.current = visibilityFactor;
        
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
      
      const breathe = Math.sin(time * breatheSpeed) * breatheAmount;
      groupRef.current.position.set(position[0], position[1] + breathe, position[2]);
    } else {
      // Reuse vector objects instead of creating new ones
      posVecRef.current.set(position[0], position[1], position[2]);
      lookAtTargetRef.current.copy(posVecRef.current).add(tangent);
      groupRef.current.lookAt(lookAtTargetRef.current);
      groupRef.current.up.copy(normal);

      if (rotation !== 0) {
        rotationAxisRef.current.copy(tangent).normalize();
        groupRef.current.rotateOnAxis(rotationAxisRef.current, (rotation * Math.PI) / 180);
      }
      
      groupRef.current.position.set(position[0], position[1], position[2]);
    }

    const modelScaleX = objectModelData?.scaleX || 1.0;
    const modelScaleY = objectModelData?.scaleY || 1.0;

    const baseScale = 0.12;
    groupRef.current.scale.set(
      scale[0] * baseScale * modelScaleX,
      scale[1] * baseScale * modelScaleY,
      scale[0] * baseScale * modelScaleX
    );

    // Only update materials for objects near the player (within ~300 game units)
    // This drastically reduces unnecessary calculations for distant objects
    const distanceToPlayer = Math.abs(gameX - playerX);
    const isNearPlayer = distanceToPlayer < 300;

    // Swap to pre-cached materials at the correct opacity instead of modifying opacity
    // This is MUCH faster than updating material properties
    if (isNearPlayer && (visibilityFactor !== 1.0 || lastVisibilityFactorRef.current !== 1.0)) {
      const visibilityDiff = Math.abs(visibilityFactor - lastVisibilityFactorRef.current);
      if (visibilityDiff > 0.01) {
        // Try to get cached materials at the new opacity level
        const newCachedMaterials = selectedModel ? getCachedMaterials(selectedModel, visibilityFactor) : null;
        
        if (newCachedMaterials && newCachedMaterials.length > 0) {
          // Swap to pre-cached materials - instant material change!
          let materialIndex = 0;
          const meshes = meshesRef.current;
          for (let i = 0; i < meshes.length; i++) {
            const mesh = meshes[i];
            if (Array.isArray(mesh.material)) {
              const newMaterials: THREE.Material[] = [];
              for (let j = 0; j < mesh.material.length; j++) {
                if (materialIndex < newCachedMaterials.length) {
                  newMaterials.push(newCachedMaterials[materialIndex++]);
                } else {
                  newMaterials.push(mesh.material[j]);
                }
              }
              mesh.material = newMaterials;
            } else if (materialIndex < newCachedMaterials.length) {
              mesh.material = newCachedMaterials[materialIndex++];
            }
          }
          // Update material references
          materialsRef.current = newCachedMaterials;
        } else {
          // Fallback: Modify opacity directly (slower but works)
          const materials = materialsRef.current;
          const len = materials.length;
          for (let i = 0; i < len; i++) {
            materials[i].opacity = visibilityFactor;
          }
        }
        
        lastVisibilityFactorRef.current = visibilityFactor;
      }
    } else if (!isNearPlayer && lastVisibilityFactorRef.current !== 1.0) {
      // Swap back to full opacity materials
      const fullOpacityMaterials = selectedModel ? getCachedMaterials(selectedModel, 1.0) : null;
      
      if (fullOpacityMaterials && fullOpacityMaterials.length > 0) {
        let materialIndex = 0;
        const meshes = meshesRef.current;
        for (let i = 0; i < meshes.length; i++) {
          const mesh = meshes[i];
          if (Array.isArray(mesh.material)) {
            const newMaterials: THREE.Material[] = [];
            for (let j = 0; j < mesh.material.length; j++) {
              if (materialIndex < fullOpacityMaterials.length) {
                newMaterials.push(fullOpacityMaterials[materialIndex++]);
              } else {
                newMaterials.push(mesh.material[j]);
              }
            }
            mesh.material = newMaterials;
          } else if (materialIndex < fullOpacityMaterials.length) {
            mesh.material = fullOpacityMaterials[materialIndex++];
          }
        }
        materialsRef.current = fullOpacityMaterials;
      } else {
        // Fallback
        const materials = materialsRef.current;
        const len = materials.length;
        for (let i = 0; i < len; i++) {
          materials[i].opacity = 1.0;
        }
      }
      
      lastVisibilityFactorRef.current = 1.0;
    }
  });

  if (!scene) return null;

  return <primitive ref={groupRef} object={scene} position={position} />;
}

// Memoize component to prevent unnecessary re-renders
// Only re-render when critical props change
export const MemoizedGameObject = memo(GameObject, (prevProps, nextProps) => {
  // Re-render if these props change
  return (
    prevProps.objectId === nextProps.objectId &&
    prevProps.nativePtr === nextProps.nativePtr &&
    prevProps.visibilityFactor === nextProps.visibilityFactor &&
    prevProps.objectModelsVersion === nextProps.objectModelsVersion &&
    prevProps.position[0] === nextProps.position[0] &&
    prevProps.position[1] === nextProps.position[1] &&
    prevProps.position[2] === nextProps.position[2] &&
    prevProps.rotation === nextProps.rotation &&
    prevProps.scale[0] === nextProps.scale[0] &&
    prevProps.scale[1] === nextProps.scale[1] &&
    prevProps.gameX === nextProps.gameX &&
    prevProps.playerX === nextProps.playerX
  );
});
