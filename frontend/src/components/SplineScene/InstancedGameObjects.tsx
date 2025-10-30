'use client';

import React, { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { loadModel } from "./threeUtils";
import { getCachedMaterials } from "./materialCache";
import { GameObjectData } from "./types";

interface InstanceGroup {
  modelName: string;
  opacity: number;
  scaleVariant: string; // Key for scale combination (e.g., "1.0x1.0")
  instances: GameObjectInstanceData[];
}

interface GameObjectInstanceData {
  object: GameObjectData;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  rotation: number;
  scale: [number, number];
  nativePtr: number;
  gameX: number;
}

interface InstancedGameObjectsProps {
  instances: GameObjectInstanceData[];
  modelName: string;
  opacity: number;
  objectId: number;
  objectModelsDataRef: React.MutableRefObject<any>;
  baseScale: number;
}

// Component for a single instanced mesh group (same model, same opacity, same scale)
function InstancedGameObjectGroup({
  instances,
  modelName,
  opacity,
  objectId,
  objectModelsDataRef,
  baseScale,
}: InstancedGameObjectsProps) {
  const meshRefs = useRef<THREE.InstancedMesh[]>([]);
  const [meshData, setMeshData] = useState<Array<{ 
    geometry: THREE.BufferGeometry; 
    material: THREE.Material;
  }>>([]);
  const tempObject = useMemo(() => new THREE.Object3D(), []);
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempLookAt = useMemo(() => new THREE.Vector3(), []);
  const tempAxis = useMemo(() => new THREE.Vector3(), []);

  // Random rotation speeds per instance (stored once)
  const instanceAnimationData = useMemo(() => {
    return instances.map((inst) => {
      const seededRandom = (seed: number, offset = 0) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
      };

      return {
        rotationSpeedX: 30 * seededRandom(inst.nativePtr, 1) * 0.02 - 0.01,
        rotationSpeedY: 30 * seededRandom(inst.nativePtr, 2) * 0.03 - 0.015,
        rotationSpeedZ: 30 * seededRandom(inst.nativePtr, 3) * 0.02 - 0.01,
        breatheSpeed: seededRandom(inst.nativePtr, 4) * 2 + 1,
        breatheAmount: seededRandom(inst.nativePtr, 5) * 0.02 + 0.01,
      };
    });
  }, [instances]);

  // Load model and extract geometry and material
  useEffect(() => {
    const modelPath = `/models/objects/${modelName}`;
    
    loadModel(modelPath)
      .then((scene) => {
        // Update all matrices in the scene hierarchy first
        scene.updateMatrixWorld(true);
        
        // Extract all meshes from the scene
        const meshes: Array<{ 
          geometry: THREE.BufferGeometry; 
          material: THREE.Material;
        }> = [];
        
        scene.traverse((child: any) => {
          if (child.isMesh && child.geometry) {
            const mesh = child as THREE.Mesh;
            
            // Get cached material at the correct opacity
            const cachedMaterials = getCachedMaterials(modelName, opacity);
            let material: THREE.Material;
            
            if (cachedMaterials && cachedMaterials.length > meshes.length) {
              material = cachedMaterials[meshes.length];
            } else {
              // Fallback: clone the material and set opacity
              material = (mesh.material as THREE.Material).clone();
              material.transparent = true;
              material.opacity = opacity;
              if (opacity < 1.0) {
                material.depthWrite = false;
              }
            }
            
            // Clone the geometry and apply the mesh's world transform to it
            // This bakes the model's hierarchy transforms into the geometry itself
            const geometry = mesh.geometry.clone();
            const worldMatrix = new THREE.Matrix4();
            worldMatrix.copy(mesh.matrixWorld).premultiply(scene.matrixWorld.clone().invert());
            geometry.applyMatrix4(worldMatrix);
            
            meshes.push({
              geometry: geometry,
              material: material,
            });
          }
        });

        setMeshData(meshes);
      })
      .catch((error) => {
        console.error(`Failed to load ${modelPath} for instancing:`, error);
      });
  }, [modelName, opacity]);

  // Update instance matrices every frame
  useFrame((state) => {
    if (meshRefs.current.length === 0 || meshData.length === 0) return;

    const time = state.clock.getElapsedTime();
    const objectModelData = objectModelsDataRef.current[objectId];
    const shouldSpin = objectModelData?.shouldSpin ?? true;
    const modelScaleX = objectModelData?.scaleX || 1.0;
    const modelScaleY = objectModelData?.scaleY || 1.0;

    instances.forEach((inst, i) => {
      const animData = instanceAnimationData[i];

      if (shouldSpin) {
        // Spinning objects
        const breathe = Math.sin(time * animData.breatheSpeed) * animData.breatheAmount;
        tempPosition.set(inst.position.x, inst.position.y + breathe, inst.position.z);
        
        tempObject.position.copy(tempPosition);
        tempObject.rotation.set(
          time * animData.rotationSpeedX,
          time * animData.rotationSpeedY,
          time * animData.rotationSpeedZ
        );
      } else {
        // Non-spinning objects (aligned to spline)
        tempPosition.copy(inst.position);
        tempLookAt.copy(tempPosition).add(inst.tangent);
        tempObject.position.copy(tempPosition);
        tempObject.lookAt(tempLookAt);
        tempObject.up.copy(inst.normal);

        if (inst.rotation !== 0) {
          tempAxis.copy(inst.tangent).normalize();
          tempObject.rotateOnAxis(tempAxis, (inst.rotation * Math.PI) / 180);
        }
      }

      // Apply scale
      tempObject.scale.set(
        inst.scale[0] * baseScale * modelScaleX,
        inst.scale[1] * baseScale * modelScaleY,
        inst.scale[0] * baseScale * modelScaleX
      );

      tempObject.updateMatrix();
      
      // Update all instanced meshes with the same matrix
      // The geometry already has the model's transforms baked in
      meshRefs.current.forEach((meshRef) => {
        if (meshRef) {
          meshRef.setMatrixAt(i, tempObject.matrix);
        }
      });
    });

    // Mark all instance matrices as needing update
    meshRefs.current.forEach((meshRef) => {
      if (meshRef) {
        meshRef.instanceMatrix.needsUpdate = true;
      }
    });
  });

  if (meshData.length === 0) return null;

  return (
    <group>
      {meshData.map((data, index) => (
        <instancedMesh
          key={index}
          ref={(ref) => {
            if (ref) {
              meshRefs.current[index] = ref;
            }
          }}
          args={[data.geometry, data.material, instances.length]}
          frustumCulled={true}
        />
      ))}
    </group>
  );
}

// Add missing import
import { useState } from "react";

export { InstancedGameObjectGroup };
export type { GameObjectInstanceData, InstanceGroup };
