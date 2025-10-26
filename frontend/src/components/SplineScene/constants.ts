import * as THREE from "three";

export const PLAYER_ROTATION_SCALE = 0;
export const GAME_MODE_EDITOR = 3;
export const FOLLOW_DISTANCE_SCROLL_BASE = 0.0001;
export const FOLLOW_DISTANCE_SCROLL_SCALE = 0.002;
export const MIN_SCROLL_SENSITIVITY = 0.000005;
export const MIN_CAMERA_DISTANCE = -2;
export const MAX_CAMERA_DISTANCE = 20;
export const DEFAULT_CAMERA_DISTANCE = 6;
export const BASE_ORBIT_YAW = THREE.MathUtils.degToRad(0.6);
export const BASE_ORBIT_PHI = THREE.MathUtils.degToRad(56.8);
export const BASE_PAN_X = -0.02;
export const BASE_PAN_Y = -0.05;
export const DEFAULT_HTTP_PORT = 6673;
export const DEFAULT_WS_PORT = 6671;
export const DEFAULT_API_BASE = `http://localhost:${DEFAULT_HTTP_PORT}`;
export const DEFAULT_WS_URL = `ws://localhost:${DEFAULT_WS_PORT}/socket`;
