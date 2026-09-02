/**
 * The four matrix operations the panorama renderer needs.
 *
 * Column-major `Float32Array(16)`, matching what WebGL's `uniformMatrix4fv`
 * expects, so no transpose is ever required. Writing these out is a few dozen
 * lines; taking a matrix library as a dependency for them would not be.
 */

export type Mat4 = Float32Array;
export type Vec4 = [number, number, number, number];

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/** Right-handed perspective projection. `fovY` is in radians. */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function rotationX(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity();
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function rotationY(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity();
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

/** Returns `a × b`. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function transformVec4(m: Mat4, v: Vec4): Vec4 {
  const out: Vec4 = [0, 0, 0, 0];
  for (let row = 0; row < 4; row += 1) {
    out[row] =
      (m[row] ?? 0) * v[0] +
      (m[4 + row] ?? 0) * v[1] +
      (m[8 + row] ?? 0) * v[2] +
      (m[12 + row] ?? 0) * v[3];
  }
  return out;
}

/**
 * Unit direction for a spherical coordinate.
 *
 * Yaw 0 / pitch 0 looks down −Z; yaw increases to the right, pitch upward.
 * The sphere geometry is generated from the same formula, so a hotspot's
 * stored angles and the texture behind it always agree.
 */
export function directionFromAngles(yawRad: number, pitchRad: number): [number, number, number] {
  const cosPitch = Math.cos(pitchRad);
  return [cosPitch * Math.sin(yawRad), Math.sin(pitchRad), -cosPitch * Math.cos(yawRad)];
}

/** Inverse of {@link directionFromAngles}. */
export function anglesFromDirection(x: number, y: number, z: number): { yaw: number; pitch: number } {
  const length = Math.hypot(x, y, z) || 1;
  const ny = y / length;
  return {
    yaw: Math.atan2(x / length, -z / length),
    pitch: Math.asin(Math.max(-1, Math.min(1, ny))),
  };
}

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
