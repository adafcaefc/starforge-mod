import { Spline, scaleSplineToLength } from "./geometry";

/**
 * Calculate the effective level length for spline scaling
 * @param levelLength The raw level length from the game
 * @returns The effective length (levelLength / 100 with fallback to 30)
 */
export function getEffectiveLevelLength(levelLength: number): number {
  return levelLength / 100 || 30;
}

/**
 * Scale a spline to match the effective level length
 * @param spline The spline to scale
 * @param levelLength The raw level length from the game
 * @param stepsPerCurve Number of steps per curve for length calculation (default: 1000)
 */
export function scaleSplineToEffectiveLength(
  spline: Spline,
  levelLength: number,
  stepsPerCurve = 1000
): void {
  const effectiveLength = getEffectiveLevelLength(levelLength);
  scaleSplineToLength(spline, effectiveLength, stepsPerCurve);
}
