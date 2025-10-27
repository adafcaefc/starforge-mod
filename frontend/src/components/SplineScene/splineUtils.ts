import { Spline, scaleSplineToLength } from "./geometry";
import { DEFAULT_LEVEL_LENGTH, GAME_COORDINATE_SCALE, SPLINE_SCALE_STEPS_PER_CURVE } from "./constants";

/**
 * Calculate the effective level length for spline scaling
 * @param levelLength The raw level length from the game
 * @returns The effective length (levelLength / GAME_COORDINATE_SCALE with fallback to DEFAULT_LEVEL_LENGTH)
 */
export function getEffectiveLevelLength(levelLength: number): number {
  return levelLength / GAME_COORDINATE_SCALE || DEFAULT_LEVEL_LENGTH;
}

/**
 * Scale a spline to match the effective level length
 * @param spline The spline to scale
 * @param levelLength The raw level length from the game
 * @param stepsPerCurve Number of steps per curve for length calculation (default: SPLINE_SCALE_STEPS_PER_CURVE)
 */
export function scaleSplineToEffectiveLength(
  spline: Spline,
  levelLength: number,
  stepsPerCurve = SPLINE_SCALE_STEPS_PER_CURVE
): void {
  const effectiveLength = getEffectiveLevelLength(levelLength);
  scaleSplineToLength(spline, effectiveLength, stepsPerCurve);
}

