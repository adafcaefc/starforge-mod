import * as THREE from "three";

export interface BackendConfig {
  apiBaseUrl: string;
  websocketUrl: string;
}

export interface BackendConfigState extends BackendConfig {
  resolved: boolean;
}

export interface GameObjectData {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  visible: boolean;
  objectId: number;
  nativePtr: number;
}

export interface PlayerState {
  p1x: number;
  p1y: number;
  p1rotation: number;
  levelLength: number;
}

export interface CameraControlState {
  distance: number;
  theta: number;
  phi: number;
  panX: number;
  panY: number;
}

export interface EditorCameraState {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
}
