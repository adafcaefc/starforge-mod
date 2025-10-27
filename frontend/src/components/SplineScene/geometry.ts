import * as THREE from "three";
import { SPLINE_SCALE_STEPS_PER_CURVE } from "./constants";


export class CubicBezierCurve {
  p1: THREE.Vector3;
  m1: THREE.Vector3;
  m2: THREE.Vector3;
  p2: THREE.Vector3;
  p1NormalAngle = 0;
  p2NormalAngle = 0;

  constructor(
    p1: THREE.Vector3,
    m1: THREE.Vector3,
    m2: THREE.Vector3,
    p2: THREE.Vector3
  ) {
    this.p1 = p1;
    this.m1 = m1;
    this.m2 = m2;
    this.p2 = p2;
  }

  private lerp(p0: THREE.Vector3, p1: THREE.Vector3, t: number): THREE.Vector3 {
    return new THREE.Vector3(
      THREE.MathUtils.lerp(p0.x, p1.x, t),
      THREE.MathUtils.lerp(p0.y, p1.y, t),
      THREE.MathUtils.lerp(p0.z, p1.z, t)
    );
  }

  get(t: number): THREE.Vector3 {
    const a = this.lerp(this.p1, this.m1, t);
    const b = this.lerp(this.m1, this.m2, t);
    const c = this.lerp(this.m2, this.p2, t);
    const d = this.lerp(a, b, t);
    const e = this.lerp(b, c, t);
    return this.lerp(d, e, t);
  }

  tangent(t: number): THREE.Vector3 {
    const delta = 1e-4;
    const p0 = this.get(Math.max(0.0, t - delta));
    const p1 = this.get(Math.min(1.0, t + delta));
    return p1.clone().sub(p0).normalize();
  }

  normal(t: number): THREE.Vector3 {
    const tangentVec = this.tangent(t);
    const angle = THREE.MathUtils.lerp(this.p1NormalAngle, this.p2NormalAngle, t);

    let binormal = new THREE.Vector3()
      .crossVectors(tangentVec, new THREE.Vector3(0, 1, 0))
      .normalize();

    if (binormal.length() < 1e-6) {
      binormal = new THREE.Vector3()
        .crossVectors(tangentVec, new THREE.Vector3(1, 0, 0))
        .normalize();
    }

    const baseNormal = new THREE.Vector3()
      .crossVectors(binormal, tangentVec)
      .normalize();

    return baseNormal.applyAxisAngle(tangentVec, angle);
  }

  length(steps = 100): number {
    let length = 0;
    let prevPoint = this.get(0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const currentPoint = this.get(t);
      length += currentPoint.distanceTo(prevPoint);
      prevPoint = currentPoint;
    }
    return length;
  }
}

export class Spline {
  segments: CubicBezierCurve[] = [];
  parameterList: Array<{ t: number; value: THREE.Vector3; l: number }> = [];
  parameterListShouldBeUpdated = true;

  addSegment(curve: CubicBezierCurve) {
    this.segments.push(curve);
    this.parameterListShouldBeUpdated = true;
  }

  removeLastSegment(levelLength?: number) {
    if (this.segments.length === 0) return;
    
    // Store the target length before removing the segment
    const targetLength = levelLength || this.length();
    
    this.segments.pop();
    this.parameterListShouldBeUpdated = true;
    
    // Scale the spline to the target length
    if (this.segments.length > 0) {
      scaleSplineToLength(this, targetLength);
    }
  }

  addNewCurveToSpline(levelLength?: number) {
    if (this.segments.length === 0) return;
    
    // Store the target length before adding the segment
    const targetLength = levelLength || this.length();
    
    const lastSegment = this.segments[this.segments.length - 1];
    const p1 = lastSegment.p2.clone();
    const m1 = lastSegment.p2.clone().multiplyScalar(2).sub(lastSegment.m2);
    const m2 = lastSegment.p2.clone().multiplyScalar(2).sub(lastSegment.m1);
    const p2 = lastSegment.p2.clone().multiplyScalar(2).sub(lastSegment.p1);
    this.addSegment(new CubicBezierCurve(p1, m1, m2, p2));
    
    // Scale the spline to the target length
    scaleSplineToLength(this, targetLength);
  }

  getAllPoints(): THREE.Vector3[] {
    const ret: THREE.Vector3[] = [];
    for (const segment of this.segments) {
      ret.push(segment.p1, segment.m1, segment.m2);
    }
    if (this.segments.length > 0) {
      ret.push(this.segments[this.segments.length - 1].p2);
    }
    return ret;
  }

  getPointsCount(): number {
    return this.segments.length * 3 + 1;
  }

  editPointSymmetricCenterFix(pointIndex: number, position: THREE.Vector3) {
    if (pointIndex === 0) {
      const deltaP1 = position.clone().sub(this.segments[0].p1);
      this.segments[0].p1.copy(position);
      this.segments[0].m1.add(deltaP1);
      this.parameterListShouldBeUpdated = true;
      return;
    } else if (pointIndex === this.getPointsCount() - 1) {
      const lastSegment = this.segments[this.segments.length - 1];
      const deltaP1 = position.clone().sub(lastSegment.p2);
      lastSegment.p2.copy(position);
      lastSegment.m2.add(deltaP1);
      this.parameterListShouldBeUpdated = true;
      return;
    } else if (pointIndex === 1) {
      this.segments[0].m1.copy(position);
      this.parameterListShouldBeUpdated = true;
      return;
    } else if (pointIndex === this.getPointsCount() - 2) {
      this.segments[this.segments.length - 1].m2.copy(position);
      this.parameterListShouldBeUpdated = true;
      return;
    }

    const segmentIndex = Math.floor(pointIndex / 3);
    const offset = pointIndex % 3;
    const deltaP1 = position.clone().sub(this.segments[segmentIndex].p1);

    switch (offset) {
      case 0:
        this.segments[segmentIndex].p1.copy(position);
        this.segments[segmentIndex - 1].p2.copy(position);
        this.segments[segmentIndex].m1.add(deltaP1);
        this.segments[segmentIndex - 1].m2.add(deltaP1);
        break;
      case 1:
        this.segments[segmentIndex].m1.copy(position);
        this.segments[segmentIndex - 1].m2.copy(
          this.segments[segmentIndex].p1.clone().multiplyScalar(2).sub(this.segments[segmentIndex].m1)
        );
        break;
      case 2:
        this.segments[segmentIndex].m2.copy(position);
        this.segments[segmentIndex + 1].m1.copy(
          this.segments[segmentIndex + 1].p1.clone().multiplyScalar(2).sub(this.segments[segmentIndex].m2)
        );
        break;
    }
    this.parameterListShouldBeUpdated = true;
  }

  updateParameterList(points = 10000) {
    if (!this.parameterListShouldBeUpdated) return;
    this.parameterListShouldBeUpdated = false;
    this.parameterList = [];

    const maxT = this.segments.length * 1.0 - 0.000001;
    const tStep = maxT / points;

    let lengthCounter = 0;

    for (let t = 0; t < maxT; t += tStep) {
      const value = this.get(t);
      let deltaLength = 0;
      if (this.parameterList.length !== 0) {
        const lastValue = this.parameterList[this.parameterList.length - 1].value;
        deltaLength = value.distanceTo(lastValue);
      }
      lengthCounter += deltaLength;
      this.parameterList.push({ t, value, l: lengthCounter });
    }
  }

  length(stepsPerCurve = 100): number {
    let totalLength = 0;
    for (const segment of this.segments) {
      totalLength += segment.length(stepsPerCurve);
    }
    return totalLength;
  }

  get(t: number): THREE.Vector3 {
    if (this.segments.length === 0) return new THREE.Vector3(0, 0, 0);

    t = Math.max(0, Math.min(t, this.segments.length - 0.000001));

    const segmentIndex = Math.floor(t);
    const localT = t - segmentIndex;
    return this.segments[segmentIndex].get(localT);
  }

  tangent(t: number): THREE.Vector3 {
    if (this.segments.length === 0) return new THREE.Vector3(0, 0, 1);

    t = Math.max(0, Math.min(t, this.segments.length - 0.000001));

    const segmentIndex = Math.floor(t);
    const localT = t - segmentIndex;
    return this.segments[segmentIndex].tangent(localT);
  }

  normal(t: number): THREE.Vector3 {
    if (this.segments.length === 0) return new THREE.Vector3(0, 1, 0);

    t = Math.max(0, Math.min(t, this.segments.length - 0.000001));

    const segmentIndex = Math.floor(t);
    const localT = t - segmentIndex;
    return this.segments[segmentIndex].normal(localT);
  }

  findClosestByLength(l: number): { t: number; value: THREE.Vector3; l: number } {
    if (this.parameterList.length === 0) {
      return { t: 0, value: new THREE.Vector3(), l: 0 };
    }

    let left = 0;
    let right = this.parameterList.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.parameterList[mid].l < l) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    if (left === 0) return this.parameterList[0];
    if (left >= this.parameterList.length) return this.parameterList[this.parameterList.length - 1];

    const before = this.parameterList[left - 1];
    const after = this.parameterList[left];

    return Math.abs(after.l - l) < Math.abs(before.l - l) ? after : before;
  }
}

export function createDefaultSplineSegment(): CubicBezierCurve {
  const segment = new CubicBezierCurve(
    new THREE.Vector3(-1.5435895119281877, 3.1906825413365576, -0.4115749478407258),
    new THREE.Vector3(13.087417607366804, 5.9791958668292535, -11.981660048657387),
    new THREE.Vector3(6.919099164601268, 5.067224294028957, -6.483712327427357),
    new THREE.Vector3(18.829060347334654, 4.949963927833904, -22.643917866773307)
  );
  segment.p1NormalAngle = 0;
  segment.p2NormalAngle = 0;
  return segment;
}

export function scaleSplineToLength(
  spline: Spline,
  targetLength: number,
  stepsPerCurve = SPLINE_SCALE_STEPS_PER_CURVE
): number {
  if (spline.segments.length === 0) return 1;
  if (targetLength <= 0) return 1;

  const currentLength = spline.length(stepsPerCurve);
  if (currentLength <= 1e-6) return 1;

  const scaleFactor = targetLength / currentLength;
  if (Math.abs(scaleFactor - 1) < 1e-6) return 1;

  const pivot = spline.segments[0].p1.clone();

  const scalePoint = (point: THREE.Vector3) => {
    point.sub(pivot).multiplyScalar(scaleFactor).add(pivot);
  };

  for (const segment of spline.segments) {
    scalePoint(segment.p1);
    scalePoint(segment.m1);
    scalePoint(segment.m2);
    scalePoint(segment.p2);
  }

  spline.updateParameterList(stepsPerCurve * spline.segments.length);
  return scaleFactor;
}
