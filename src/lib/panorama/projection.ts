import {
  DEG,
  RAD,
  anglesFromDirection,
  directionFromAngles,
  multiply,
  perspective,
  rotationX,
  rotationY,
  transformVec4,
  type Mat4,
} from './mat4';

/**
 * Pure projection maths, deliberately separated from the WebGL engine.
 *
 * Everything here is a function of numbers, so it can be tested in Node with
 * no GPU, no canvas and no browser. Hotspot placement depends entirely on this
 * being right — a sign error puts every marker in the wrong place, or worse,
 * in a plausible-looking wrong place — and that is not something to verify by
 * squinting at a screenshot.
 */

export type Camera = { yaw: number; pitch: number; fov: number };

export type Projected = {
  x: number;
  y: number;
  visible: boolean;
  eccentricity: number;
};

/**
 * View-projection matrix for a camera.
 *
 * The view matrix is the inverse of the camera's orientation. The camera
 * rotates by `Ry(−yaw) · Rx(pitch)` (which takes the reference direction
 * (0,0,−1) to `directionFromAngles(yaw, pitch)`), so its inverse is
 * `Rx(−pitch) · Ry(yaw)`.
 */
export function viewProjectionMatrix(camera: Camera, aspect: number): Mat4 {
  const projection = perspective(camera.fov * DEG, aspect, 0.1, 10);
  const view = multiply(rotationX(-camera.pitch * DEG), rotationY(camera.yaw * DEG));
  return multiply(projection, view);
}

/** Keeps markers alive slightly beyond the edge so they do not pop. */
const VISIBILITY_MARGIN = 0.25;

export function projectAngles(
  viewProjection: Mat4,
  yawDeg: number,
  pitchDeg: number,
  width: number,
  height: number,
): Projected {
  const [x, y, z] = directionFromAngles(yawDeg * DEG, pitchDeg * DEG);
  const clip = transformVec4(viewProjection, [x, y, z, 1]);

  // Behind the eye. Dividing by a non-positive w would fold the point back
  // into view as a mirrored ghost — a classic panorama-viewer bug.
  if (clip[3] <= 0) return { x: 0, y: 0, visible: false, eccentricity: 1 };

  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];

  return {
    x: ((ndcX + 1) / 2) * width,
    y: ((1 - ndcY) / 2) * height,
    visible: Math.abs(ndcX) <= 1 + VISIBILITY_MARGIN && Math.abs(ndcY) <= 1 + VISIBILITY_MARGIN,
    eccentricity: Math.min(1, Math.hypot(ndcX, ndcY)),
  };
}

/** Screen pixels back to spherical coordinates — the inverse of the above. */
export function unprojectPoint(
  camera: Camera,
  screenX: number,
  screenY: number,
  width: number,
  height: number,
): { yaw: number; pitch: number } {
  const ndcX = (screenX / width) * 2 - 1;
  const ndcY = 1 - (screenY / height) * 2;

  const tanHalf = Math.tan(camera.fov * DEG / 2);
  const aspect = width / height;

  // Ray direction in view space.
  const vx = ndcX * tanHalf * aspect;
  const vy = ndcY * tanHalf;
  const vz = -1;

  // Rotate into world space by the camera orientation: Ry(−yaw) · Rx(pitch).
  const pitchRad = camera.pitch * DEG;
  const yawRad = camera.yaw * DEG;
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);

  // Rx(pitch) · v
  const rx = vx;
  const ry = vy * cosP - vz * sinP;
  const rz = vy * sinP + vz * cosP;

  // Ry(−yaw) · r. Note the signs: substituting b = −yaw into Ry(b) flips both
  // sine terms relative to a positive rotation, and getting this backwards
  // mirrors every unprojected point across the view axis.
  const wx = rx * cosY - rz * sinY;
  const wy = ry;
  const wz = rx * sinY + rz * cosY;

  const angles = anglesFromDirection(wx, wy, wz);
  return { yaw: angles.yaw * RAD, pitch: angles.pitch * RAD };
}
