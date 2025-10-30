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

// Level length constants
export const DEFAULT_LEVEL_LENGTH = 30;

// Coordinate scaling constants
export const GAME_COORDINATE_SCALE = 100; // Game coordinates to scene coordinates (divide by 100) - also used for effective length ratio (levelLength / 100)
export const PLAYER_Y_BASE_OFFSET = 30; // Base Y offset for player positioning

// Spline calculation constants
export const SPLINE_LENGTH_STEPS = 100; // Steps for spline.length() calculation
export const SPLINE_UPDATE_PARAMETER_STEPS = 100000; // Steps for spline.updateParameterList()
export const SPLINE_SCALE_STEPS_PER_CURVE = 1000; // Steps per curve for scaling operations

// UFO block hiding constants
export const UFO_BLOCK_HIDE_X_THRESHOLD = 1; // X position threshold for hiding blocks above UFO (in scene coordinates)
export const UFO_BLOCK_HIDE_Y_THRESHOLD = 1; // Y position threshold for hiding blocks above UFO (in scene coordinates)
export const UFO_BLOCK_MIN_OPACITY = 0.1; // Minimum opacity for blocks directly above UFO (0 = fully transparent, 1 = fully opaque)
export const UFO_BLOCK_MAX_OPACITY = 1.0; // Maximum opacity for blocks far from UFO
export const UFO_BLOCK_FADE_DISTANCE_FACTOR = 0.33; // Factor to multiply distance for fade gradient (lower = more gradual fade)
