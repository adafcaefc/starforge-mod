'use client';

import React, { useEffect, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface ModelPreviewProps {
  modelPath: string;
}

export function ModelPreview({ modelPath }: ModelPreviewProps) {
  const [scene, setScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    let isMounted = true;

    loader.load(
      modelPath,
      (gltf) => {
        if (isMounted) {
          setScene(gltf.scene);
        }
      },
      undefined,
      (error) => {
        console.error(`Failed to load ${modelPath}:`, error);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [modelPath]);

  if (!scene) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse" />
      </div>
    );
  }

  return (
    <Canvas camera={{ position: [2.5, 2.5, 3], fov: 60 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <primitive object={scene} scale={0.5} />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={4} />
    </Canvas>
  );
}
