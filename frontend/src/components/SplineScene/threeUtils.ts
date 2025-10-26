import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const modelCache = new Map<string, Promise<THREE.Group>>();

export function disposeObject(obj: THREE.Object3D) {
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

  obj.children.forEach((child) => disposeObject(child));
}

export function loadModel(modelPath: string): Promise<THREE.Group> {
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
