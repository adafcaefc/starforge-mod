'use client';

import React, { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Spline } from "./geometry";
import { getEffectiveLevelLength } from "./splineUtils";
import { CameraControlState, EditorCameraState, PlayerState } from "./types";
import {
  PLAYER_ROTATION_SCALE,
  MIN_CAMERA_DISTANCE,
  MAX_CAMERA_DISTANCE,
  SPLINE_LENGTH_STEPS,
  GAME_COORDINATE_SCALE,
} from "./constants";

interface AnimatedCameraProps {
  splineRef: React.MutableRefObject<Spline>;
  playerStateRef: React.MutableRefObject<PlayerState>;
  cameraControlRef: React.MutableRefObject<CameraControlState>;
  isEditorMode: boolean;
  editorCameraRef: React.MutableRefObject<EditorCameraState>;
}

export function AnimatedCamera({
  splineRef,
  playerStateRef,
  cameraControlRef,
  isEditorMode,
  editorCameraRef,
}: AnimatedCameraProps) {
  const editorInitializedRef = useRef(false);
  const fallbackCameraFrameRef = useRef({
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
  });

  useFrame((state) => {
    const controls = state.controls as any;

    if (isEditorMode) {
      if (!editorInitializedRef.current) {
        editorCameraRef.current.position.copy(state.camera.position);
        const currentForward = new THREE.Vector3();
        state.camera.getWorldDirection(currentForward);
        editorCameraRef.current.yaw = Math.atan2(currentForward.x, currentForward.z);
        editorCameraRef.current.pitch = Math.asin(THREE.MathUtils.clamp(currentForward.y, -1, 1));
        editorInitializedRef.current = true;
      }

      const clampedPitch = THREE.MathUtils.clamp(
        editorCameraRef.current.pitch,
        -Math.PI / 2 + 0.01,
        Math.PI / 2 - 0.01
      );
      editorCameraRef.current.pitch = clampedPitch;

      const cosPitch = Math.cos(clampedPitch);
      const forward = new THREE.Vector3(
        Math.sin(editorCameraRef.current.yaw) * cosPitch,
        Math.sin(clampedPitch),
        Math.cos(editorCameraRef.current.yaw) * cosPitch
      ).normalize();
      const worldUp = new THREE.Vector3(0, 1, 0);
      let right = new THREE.Vector3().crossVectors(forward, worldUp);
      if (right.lengthSq() < 1e-6) {
        right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(1, 0, 0));
      }
      right.normalize();
      const upVector = new THREE.Vector3().crossVectors(right, forward).normalize();

      const target = editorCameraRef.current.position.clone().add(forward);
      state.camera.position.copy(editorCameraRef.current.position);
      state.camera.up.copy(upVector);
      state.camera.lookAt(target);

      if (controls) {
        if (controls.target) {
          controls.target.copy(target);
        }
        if (typeof controls.update === "function") {
          controls.update();
        }
      }
      return;
    }

    editorInitializedRef.current = false;

    const spline = splineRef.current;
    const hasSpline = spline.segments.length > 0;

    const fallbackFrame = fallbackCameraFrameRef.current;

    let scaledUfoPosition = fallbackFrame.position.clone();
    let forward = fallbackFrame.forward.clone();
    let upVector = fallbackFrame.up.clone();

    if (forward.lengthSq() < 1e-6) {
      forward.set(0, 0, -1);
    }
    forward.normalize();

    if (upVector.lengthSq() < 1e-6) {
      upVector.set(0, 1, 0);
    }
    upVector.normalize();

    let right = new THREE.Vector3().crossVectors(upVector, forward);
    if (right.lengthSq() < 1e-6) {
      right = Math.abs(forward.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    } else {
      right.normalize();
    }

    if (hasSpline) {
      const playerX = playerStateRef.current.p1x;
      const playerY = playerStateRef.current.p1y;
      const effectiveLevelLength = getEffectiveLevelLength(playerStateRef.current.levelLength);

      // Scale playerX to match effectiveLevelLength (which is levelLength / GAME_COORDINATE_SCALE)
      const scaledPlayerX = playerX / GAME_COORDINATE_SCALE;
      const progress = Math.min(1, Math.max(0, scaledPlayerX / effectiveLevelLength));
      const splineLength = spline.length(SPLINE_LENGTH_STEPS);
      const scaledLength = progress * splineLength;
      const paramData = spline.findClosestByLength(scaledLength);
      const ufoPosition = spline.get(paramData.t);
      const splineTangent = spline.tangent(paramData.t).normalize();
      const splineNormal = spline.normal(paramData.t).normalize();

      const yOffset = playerY / GAME_COORDINATE_SCALE;
      scaledUfoPosition = new THREE.Vector3(ufoPosition.x, ufoPosition.y + yOffset, ufoPosition.z);

      forward = splineTangent.clone();
      upVector = splineNormal.clone().multiplyScalar(-1);

      right = new THREE.Vector3().crossVectors(upVector, forward);
      if (right.lengthSq() < 1e-6) {
        const arbitrary = Math.abs(forward.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        right = new THREE.Vector3().crossVectors(arbitrary, forward).normalize();
      } else {
        right.normalize();
      }

      const playerRotation = playerStateRef.current.p1rotation ?? 0;
      const scaledPlayerRotation = playerRotation * PLAYER_ROTATION_SCALE;
      if (scaledPlayerRotation !== 0) {
        const rotationRadians = THREE.MathUtils.degToRad(-scaledPlayerRotation);
        const rotationQuat = new THREE.Quaternion().setFromAxisAngle(right, rotationRadians);
        forward.applyQuaternion(rotationQuat);
        upVector.applyQuaternion(rotationQuat);
      }

      forward.normalize();
      upVector.normalize();

      right = new THREE.Vector3().crossVectors(upVector, forward);
      if (right.lengthSq() < 1e-6) {
        right = Math.abs(forward.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      } else {
        right.normalize();
      }

      fallbackFrame.position.copy(scaledUfoPosition);
      fallbackFrame.forward.copy(forward);
      fallbackFrame.up.copy(upVector);
    }

    const yawOffset = cameraControlRef.current.theta;
    const pitchOffset = cameraControlRef.current.phi - Math.PI / 2;
    const panX = cameraControlRef.current.panX;
    const panY = cameraControlRef.current.panY;
    const distance = THREE.MathUtils.clamp(
      cameraControlRef.current.distance,
      MIN_CAMERA_DISTANCE,
      MAX_CAMERA_DISTANCE
    );
    cameraControlRef.current.distance = distance;

    const yawQuat = new THREE.Quaternion().setFromAxisAngle(upVector, yawOffset);
    const yawAdjustedRight = right.clone().applyQuaternion(yawQuat).normalize();
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(yawAdjustedRight, pitchOffset);
    const viewAdjustment = new THREE.Quaternion().copy(yawQuat).multiply(pitchQuat);

    const viewForward = forward.clone().applyQuaternion(viewAdjustment).normalize();
    let viewUp = upVector.clone().applyQuaternion(viewAdjustment).normalize();
    const viewRight = new THREE.Vector3().crossVectors(viewForward, viewUp).normalize();
    viewUp = new THREE.Vector3().crossVectors(viewRight, viewForward).normalize();
    viewUp.negate();

    const baseFollowDistance = 0.17 + distance * 0.05;
    const cockpitVerticalOffset = 0.3;

    const desiredPosition = scaledUfoPosition
      .clone()
      .sub(viewForward.clone().multiplyScalar(baseFollowDistance))
      .add(viewUp.clone().multiplyScalar(cockpitVerticalOffset + panY))
      .add(viewRight.clone().multiplyScalar(panX));

    const lerpFactor = 1;
    state.camera.position.lerp(desiredPosition, lerpFactor);

    const lookAheadDistance = 50;
    const lookTarget = state.camera.position.clone().add(viewForward.clone().multiplyScalar(lookAheadDistance));

    const lookMatrix = new THREE.Matrix4().lookAt(state.camera.position, lookTarget, viewUp);
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    state.camera.quaternion.slerp(targetQuaternion, lerpFactor);
    state.camera.up.lerp(viewUp, lerpFactor);

    if (controls && controls.target) {
      controls.target.copy(lookTarget);
      controls.update();
    }
  });

  return null;
}
