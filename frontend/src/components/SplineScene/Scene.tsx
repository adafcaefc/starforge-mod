'use client';

import React from "react";
import { Stars, Environment } from "@react-three/drei";
import * as THREE from "three";
import { Spline } from "./geometry";
import { BackendConfigState, GameObjectData, PlayerState, CameraControlState, EditorCameraState } from "./types";
import { ObjectModelsMap } from "@/types/objectModels";
import { SplineVisualization } from "./SplineVisualization";
import { SplinePointDragger } from "./SplinePointDragger";
import { UFOModel } from "./UFOModel";
import { GameObjectsField } from "./GameObjectsField";
import { AnimatedCamera } from "./AnimatedCamera";

interface SceneProps {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<PlayerState>;
  cameraControlRef: React.MutableRefObject<CameraControlState>;
  gameObjectsRef: React.MutableRefObject<GameObjectData[]>;
  selectedPointRef: React.MutableRefObject<number | null>;
  isDraggingPointRef: React.MutableRefObject<boolean>;
  dragPlaneRef: React.MutableRefObject<THREE.Plane | null>;
  raycasterRef: React.MutableRefObject<THREE.Raycaster>;
  mouseRef: React.MutableRefObject<THREE.Vector2>;
  objectModelsDataRef: React.MutableRefObject<ObjectModelsMap>;
  objectModelsVersion: number;
  onGameModeChange: (isEditorMode: boolean) => void;
  isEditorMode: boolean;
  editorCameraRef: React.MutableRefObject<EditorCameraState>;
  onLevelExit: () => void;
  backendConfigRef: React.MutableRefObject<BackendConfigState>;
}

export function Scene({
  splineRef,
  playerStateRef,
  cameraControlRef,
  gameObjectsRef,
  selectedPointRef,
  isDraggingPointRef,
  dragPlaneRef,
  raycasterRef,
  mouseRef,
  objectModelsDataRef,
  objectModelsVersion,
  onGameModeChange,
  isEditorMode,
  editorCameraRef,
  onLevelExit,
  backendConfigRef,
}: SceneProps) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4169E1" />
      <Stars radius={300} depth={60} count={1000} factor={7} saturation={0} />

      {isEditorMode && (
        <SplineVisualization
          splineRef={splineRef}
          selectedPointRef={selectedPointRef}
          playerStateRef={playerStateRef}
        />
      )}
      {isEditorMode && (
        <SplinePointDragger
          splineRef={splineRef}
          selectedPointRef={selectedPointRef}
          isDraggingPointRef={isDraggingPointRef}
          dragPlaneRef={dragPlaneRef}
          raycasterRef={raycasterRef}
          mouseRef={mouseRef}
          playerStateRef={playerStateRef}
        />
      )}
      <UFOModel
        splineRef={splineRef}
        playerStateRef={playerStateRef}
        gameObjectsRef={gameObjectsRef}
        objectModelsDataRef={objectModelsDataRef}
        onGameModeChange={onGameModeChange}
        onLevelExit={onLevelExit}
        backendConfigRef={backendConfigRef}
      />
      <GameObjectsField
        gameObjectsRef={gameObjectsRef}
        splineRef={splineRef}
        playerStateRef={playerStateRef}
        objectModelsDataRef={objectModelsDataRef}
        objectModelsVersion={objectModelsVersion}
      />
      <AnimatedCamera
        splineRef={splineRef}
        playerStateRef={playerStateRef}
        cameraControlRef={cameraControlRef}
        isEditorMode={isEditorMode}
        editorCameraRef={editorCameraRef}
      />
      <Environment preset="night" />
    </>
  );
}
