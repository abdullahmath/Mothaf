import { describe, expect, it } from 'vitest';
import {
  anglesFromDirection,
  directionFromAngles,
  identity,
  multiply,
  transformVec4,
  DEG,
  RAD,
} from '@/lib/panorama/mat4';
import { projectAngles, unprojectPoint, viewProjectionMatrix } from '@/lib/panorama/projection';
import { normalizeYaw, shortestAngle } from '@/lib/panorama/engine';

/**
 * Hotspot placement rests entirely on this maths. A sign error would put every
 * marker in a plausible-looking but wrong position — the kind of bug that
 * survives a visual check and then shows up as "the arrow points at the wall".
 */

const WIDTH = 1200;
const HEIGHT = 800;

/** Where the point directly ahead of the camera lands. */
function centre() {
  return { x: WIDTH / 2, y: HEIGHT / 2 };
}

describe('mat4 primitives', () => {
  it('multiplying by the identity changes nothing', () => {
    const m = viewProjectionMatrix({ yaw: 30, pitch: 10, fov: 75 }, 1.5);
    const result = multiply(m, identity());
    for (let i = 0; i < 16; i += 1) {
      expect(result[i]).toBeCloseTo(m[i]!, 6);
    }
  });

  it('maps the reference direction to −Z', () => {
    const [x, y, z] = directionFromAngles(0, 0);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(-1, 6);
  });

  it('increases x for positive yaw and y for positive pitch', () => {
    const [right] = directionFromAngles(90 * DEG, 0);
    expect(right).toBeCloseTo(1, 6);

    const [, up] = directionFromAngles(0, 45 * DEG);
    expect(up).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it('round-trips direction to angles and back', () => {
    for (const yaw of [-170, -90, -3, 0, 17, 90, 179]) {
      for (const pitch of [-80, -30, 0, 25, 80]) {
        const [x, y, z] = directionFromAngles(yaw * DEG, pitch * DEG);
        const back = anglesFromDirection(x, y, z);
        expect(back.yaw * RAD).toBeCloseTo(yaw, 4);
        expect(back.pitch * RAD).toBeCloseTo(pitch, 4);
      }
    }
  });

  it('transforms a vector by a translation-free matrix consistently', () => {
    const m = viewProjectionMatrix({ yaw: 0, pitch: 0, fov: 90 }, 1);
    const result = transformVec4(m, [0, 0, -1, 1]);
    // Straight ahead: x and y clip coordinates vanish, w is positive.
    expect(result[0]).toBeCloseTo(0, 6);
    expect(result[1]).toBeCloseTo(0, 6);
    expect(result[3]).toBeGreaterThan(0);
  });
});

describe('projectAngles', () => {
  it('puts the camera direction exactly at the centre of the viewport', () => {
    for (const camera of [
      { yaw: 0, pitch: 0, fov: 75 },
      { yaw: 137, pitch: -22, fov: 50 },
      { yaw: -95, pitch: 61, fov: 100 },
    ]) {
      const vp = viewProjectionMatrix(camera, WIDTH / HEIGHT);
      const point = projectAngles(vp, camera.yaw, camera.pitch, WIDTH, HEIGHT);
      expect(point.visible).toBe(true);
      expect(point.x).toBeCloseTo(centre().x, 3);
      expect(point.y).toBeCloseTo(centre().y, 3);
      expect(point.eccentricity).toBeCloseTo(0, 6);
    }
  });

  it('places a point to the camera\'s right on the right half of the screen', () => {
    const camera = { yaw: 0, pitch: 0, fov: 75 };
    const vp = viewProjectionMatrix(camera, WIDTH / HEIGHT);
    const point = projectAngles(vp, 20, 0, WIDTH, HEIGHT);
    expect(point.visible).toBe(true);
    expect(point.x).toBeGreaterThan(centre().x);
    expect(point.y).toBeCloseTo(centre().y, 3);
  });

  it('places a point above the horizon in the upper half of the screen', () => {
    const camera = { yaw: 0, pitch: 0, fov: 75 };
    const vp = viewProjectionMatrix(camera, WIDTH / HEIGHT);
    const point = projectAngles(vp, 0, 25, WIDTH, HEIGHT);
    expect(point.visible).toBe(true);
    // Screen y grows downward, so "up" means a smaller value.
    expect(point.y).toBeLessThan(centre().y);
  });

  it('marks a point directly behind the camera as not visible', () => {
    const camera = { yaw: 0, pitch: 0, fov: 75 };
    const vp = viewProjectionMatrix(camera, WIDTH / HEIGHT);
    const behind = projectAngles(vp, 180, 0, WIDTH, HEIGHT);
    expect(behind.visible).toBe(false);
  });

  it('does not mirror points behind the camera into view', () => {
    // The classic failure: dividing by a negative w folds a point that is
    // behind the eye onto the screen as a ghost marker.
    const camera = { yaw: 0, pitch: 0, fov: 90 };
    const vp = viewProjectionMatrix(camera, WIDTH / HEIGHT);
    for (const yaw of [120, 150, 180, -150, -120]) {
      expect(projectAngles(vp, yaw, 0, WIDTH, HEIGHT).visible).toBe(false);
    }
  });

  it('brings more of the scene into view as the field of view widens', () => {
    const narrow = viewProjectionMatrix({ yaw: 0, pitch: 0, fov: 40 }, WIDTH / HEIGHT);
    const wide = viewProjectionMatrix({ yaw: 0, pitch: 0, fov: 100 }, WIDTH / HEIGHT);

    // 35° off-axis is outside a 40° view but inside a 100° one.
    expect(projectAngles(narrow, 0, 35, WIDTH, HEIGHT).visible).toBe(false);
    expect(projectAngles(wide, 0, 35, WIDTH, HEIGHT).visible).toBe(true);
  });

  it('handles the yaw wrap-around seam without jumping', () => {
    const camera = { yaw: 175, pitch: 0, fov: 75 };
    const vp = viewProjectionMatrix(camera, WIDTH / HEIGHT);

    // −175° is 10° to the right of 175°, not 350° away.
    const across = projectAngles(vp, -175, 0, WIDTH, HEIGHT);
    expect(across.visible).toBe(true);
    expect(across.x).toBeGreaterThan(centre().x);
  });
});

describe('unprojectPoint', () => {
  it('returns the camera direction for the centre of the viewport', () => {
    for (const camera of [
      { yaw: 0, pitch: 0, fov: 75 },
      { yaw: -40, pitch: 15, fov: 60 },
      { yaw: 120, pitch: -35, fov: 95 },
    ]) {
      const angles = unprojectPoint(camera, WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT);
      expect(normalizeYaw(angles.yaw - camera.yaw)).toBeCloseTo(0, 4);
      expect(angles.pitch).toBeCloseTo(camera.pitch, 4);
    }
  });

  it('is the inverse of projectAngles', () => {
    const camera = { yaw: 25, pitch: -10, fov: 70 };
    const vp = viewProjectionMatrix(camera, WIDTH / HEIGHT);

    for (const [yaw, pitch] of [
      [25, -10],
      [40, 5],
      [10, -30],
      [-5, 12],
    ] as const) {
      const projected = projectAngles(vp, yaw, pitch, WIDTH, HEIGHT);
      expect(projected.visible).toBe(true);

      const back = unprojectPoint(camera, projected.x, projected.y, WIDTH, HEIGHT);
      expect(normalizeYaw(back.yaw - yaw)).toBeCloseTo(0, 3);
      expect(back.pitch).toBeCloseTo(pitch, 3);
    }
  });
});

describe('angle helpers', () => {
  it('normalizes yaw into (−180, 180]', () => {
    expect(normalizeYaw(0)).toBe(0);
    expect(normalizeYaw(180)).toBe(180);
    expect(normalizeYaw(190)).toBeCloseTo(-170, 6);
    expect(normalizeYaw(-190)).toBeCloseTo(170, 6);
    expect(normalizeYaw(720)).toBeCloseTo(0, 6);
    expect(normalizeYaw(-540)).toBeCloseTo(180, 6);
  });

  it('takes the short way around when animating between angles', () => {
    expect(shortestAngle(170, -170)).toBeCloseTo(20, 6);
    expect(shortestAngle(-170, 170)).toBeCloseTo(-20, 6);
    expect(shortestAngle(0, 90)).toBeCloseTo(90, 6);
    expect(Math.abs(shortestAngle(0, 180))).toBeCloseTo(180, 6);
  });
});
