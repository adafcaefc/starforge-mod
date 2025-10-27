'use client';

import React, { useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Spline } from "./geometry";
import { getEffectiveLevelLength } from "./splineUtils";
import { PlayerState } from "./types";

interface SplinePointDraggerProps {
  splineRef: React.MutableRefObject<Spline>;
  selectedPointRef: React.MutableRefObject<number | null>;
  isDraggingPointRef: React.MutableRefObject<boolean>;
  dragPlaneRef: React.MutableRefObject<THREE.Plane | null>;
  raycasterRef: React.MutableRefObject<THREE.Raycaster>;
  mouseRef: React.MutableRefObject<THREE.Vector2>;
  playerStateRef: React.MutableRefObject<PlayerState>;
}

export function SplinePointDragger({
  splineRef,
  selectedPointRef,
  isDraggingPointRef,
  dragPlaneRef,
  raycasterRef,
  mouseRef,
  playerStateRef,
}: SplinePointDraggerProps) {
  const { camera, scene, gl } = useThree();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

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

  useFrame(() => {
    if (isDraggingPointRef.current && selectedPointRef.current !== null && dragPlaneRef.current) {
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const intersectPoint = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersectPoint);

      if (intersectPoint) {
        const effectiveLevelLength = getEffectiveLevelLength(playerStateRef.current.levelLength);
        const defaultLevelLength = 30;
        const xScale = effectiveLevelLength / defaultLevelLength;

        const unscaledPoint = new THREE.Vector3(
          intersectPoint.x / xScale,
          intersectPoint.y,
          intersectPoint.z
        );

        splineRef.current.editPointSymmetricCenterFix(selectedPointRef.current, unscaledPoint);
        splineRef.current.updateParameterList(100000);
      }
    }
  });

  return null;
}
