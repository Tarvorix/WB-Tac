import { Vector3, Vector2 } from '@babylonjs/core';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function lerpVector3(start: Vector3, end: Vector3, t: number): Vector3 {
  return new Vector3(
    lerp(start.x, end.x, t),
    lerp(start.y, end.y, t),
    lerp(start.z, end.z, t)
  );
}

export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

export function angleBetweenVectors(v1: Vector3, v2: Vector3): number {
  const dot = Vector3.Dot(v1.normalize(), v2.normalize());
  return Math.acos(clamp(dot, -1, 1));
}

export function rotateTowards(current: number, target: number, maxDelta: number): number {
  let delta = normalizeAngle(target - current);

  if (Math.abs(delta) <= maxDelta) {
    return target;
  }

  return current + Math.sign(delta) * maxDelta;
}

export function vector2ToVector3(v2: Vector2, y: number = 0): Vector3 {
  return new Vector3(v2.x, y, v2.y);
}

export function vector3ToVector2(v3: Vector3): Vector2 {
  return new Vector2(v3.x, v3.z);
}

export function distance2D(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function directionFromAngle(angle: number): Vector3 {
  return new Vector3(Math.sin(angle), 0, Math.cos(angle));
}

export function angleFromDirection(direction: Vector3): number {
  return Math.atan2(direction.x, direction.z);
}

export function smoothDamp(
  current: number,
  target: number,
  currentVelocity: { value: number },
  smoothTime: number,
  deltaTime: number,
  maxSpeed: number = Infinity
): number {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const originalTo = target;

  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  const newTarget = current - change;

  const temp = (currentVelocity.value + omega * change) * deltaTime;
  currentVelocity.value = (currentVelocity.value - omega * temp) * exp;

  let output = newTarget + (change + temp) * exp;

  if (originalTo - current > 0 === output > originalTo) {
    output = originalTo;
    currentVelocity.value = (output - originalTo) / deltaTime;
  }

  return output;
}
