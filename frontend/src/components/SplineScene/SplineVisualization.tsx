'use client';

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Spline } from "./geometry";
import { getEffectiveLevelLength } from "./splineUtils";
import { PlayerState } from "./types";

interface SplineVisualizationProps {
  splineRef: React.MutableRefObject<Spline>;
  selectedPointRef: React.MutableRefObject<number | null>;
  playerStateRef: React.MutableRefObject<PlayerState>;
}

export function SplineVisualization({ splineRef, selectedPointRef, playerStateRef }: SplineVisualizationProps) {
  const lineRef = useRef<THREE.Line>(null);
  const controlPointsRef = useRef<THREE.Group>(null);
  const baseSplineLengthRef = useRef<number>(0);

  const controlPointGeometriesRef = useRef<{
    endpointGeometry: THREE.SphereGeometry;
    handleGeometry: THREE.SphereGeometry;
    endpointMaterial: THREE.MeshStandardMaterial;
    handleMaterial: THREE.MeshStandardMaterial;
  } | null>(null);

  useEffect(() => {
    controlPointGeometriesRef.current = {
      endpointGeometry: new THREE.SphereGeometry(0.15, 16, 16),
      handleGeometry: new THREE.SphereGeometry(0.1, 16, 16),
      endpointMaterial: new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.3,
      }),
      handleMaterial: new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.3,
      }),
    };

    return () => {
      if (controlPointGeometriesRef.current) {
        const { endpointGeometry, handleGeometry, endpointMaterial, handleMaterial } = controlPointGeometriesRef.current;
        endpointGeometry.dispose();
        handleGeometry.dispose();
        endpointMaterial.dispose();
        handleMaterial.dispose();
      }
    };
  }, []);

  useEffect(() => {
    const spline = splineRef.current;
    if (spline.segments.length > 0 && baseSplineLengthRef.current === 0) {
      const firstPoint = spline.segments[0].p1;
      const lastPoint = spline.segments[spline.segments.length - 1].p2;
      baseSplineLengthRef.current = Math.abs(lastPoint.x - firstPoint.x);
    }
  }, [splineRef]);

  useFrame(() => {
    const spline = splineRef.current;
    if (!spline || spline.segments.length === 0 || !controlPointGeometriesRef.current) return;

    const effectiveLevelLength = getEffectiveLevelLength(playerStateRef.current.levelLength);
    const defaultLevelLength = 30;
    const xScale = effectiveLevelLength / defaultLevelLength;

    if (lineRef.current) {
      const points: THREE.Vector3[] = [];
      const steps = 100;
      const maxT = spline.segments.length;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * maxT;
        const point = spline.get(t);
        points.push(new THREE.Vector3(point.x * xScale, point.y, point.z));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      lineRef.current.geometry.dispose();
      lineRef.current.geometry = geometry;
    }

    if (controlPointsRef.current) {
      const { endpointGeometry, handleGeometry, endpointMaterial, handleMaterial } = controlPointGeometriesRef.current;
      const expectedPoints = spline.segments.length * 3 + 1;

      while (controlPointsRef.current.children.length > expectedPoints) {
        const mesh = controlPointsRef.current.children[controlPointsRef.current.children.length - 1];
        controlPointsRef.current.remove(mesh);
      }

      let pointIndex = 0;

      const updateOrCreateMesh = (pos: THREE.Vector3, isEndpoint: boolean) => {
        let mesh: THREE.Mesh;
        if (pointIndex < controlPointsRef.current!.children.length) {
          mesh = controlPointsRef.current!.children[pointIndex] as THREE.Mesh;
        } else {
          mesh = new THREE.Mesh(
            isEndpoint ? endpointGeometry : handleGeometry,
            (isEndpoint ? endpointMaterial : handleMaterial).clone()
          );
          mesh.userData.isControlPoint = true;
          controlPointsRef.current!.add(mesh);
        }
        mesh.position.set(pos.x * xScale, pos.y, pos.z);
        mesh.userData.pointIndex = pointIndex;

        const isSelected = selectedPointRef.current === pointIndex;
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = isSelected ? 0.8 : 0.3;

        pointIndex++;
      };

      for (const segment of spline.segments) {
        updateOrCreateMesh(segment.p1, true);
        updateOrCreateMesh(segment.m1, false);
        updateOrCreateMesh(segment.m2, false);
      }

      if (spline.segments.length > 0) {
        const lastSegment = spline.segments[spline.segments.length - 1];
        updateOrCreateMesh(lastSegment.p2, true);
      }
    }
  });

  return (
    <>
      <primitive ref={lineRef} object={new THREE.Line()}>
        <bufferGeometry />
        <lineBasicMaterial color={0xffffff} linewidth={2} />
      </primitive>
      <group ref={controlPointsRef} />
    </>
  );
}
