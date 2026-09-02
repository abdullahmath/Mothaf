import { DEG, directionFromAngles, perspective, type Mat4 } from './mat4';
import { projectAngles, unprojectPoint, viewProjectionMatrix } from './projection';

/**
 * Equirectangular panorama renderer.
 *
 * A 360° photo is one textured sphere viewed from its centre. That does not
 * justify a general-purpose 3D engine, so this is written directly against
 * WebGL: roughly 400 lines with no dependencies, against ~600 KB for a scene
 * graph, material system and loader stack that would all go unused.
 *
 * Writing it also buys the thing a library would have hidden — the projection
 * matrix. `project()` exposes it, which is what lets hotspots be real DOM
 * elements positioned over the canvas. Canvas-drawn markers cannot be focused,
 * cannot be read by a screen reader, and cannot be styled with CSS; DOM
 * markers are all three.
 */

/* -------------------------------------------------------------------------- */
/*  Shaders                                                                   */
/* -------------------------------------------------------------------------- */

const VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform mat4 u_viewProjection;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_viewProjection * vec4(a_position, 1.0);
}
`;

/**
 * Two samplers with a mix factor.
 *
 * The tiny blurred preview is uploaded first and rendered immediately, then
 * the full texture crossfades over it. The visitor sees a correctly projected,
 * fully interactive scene within a frame or two instead of a blank canvas —
 * and because the preview is a real texture rather than a CSS backdrop, it
 * turns with the camera while they drag.
 */
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_preview;
uniform sampler2D u_texture;
uniform float u_mix;
varying vec2 v_uv;
void main() {
  vec4 preview = texture2D(u_preview, v_uv);
  vec4 full = texture2D(u_texture, v_uv);
  gl_FragColor = mix(preview, full, u_mix);
}
`;

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type PanoramaCamera = {
  /** Degrees. Wraps at ±180. */
  yaw: number;
  /** Degrees, clamped to ±85 so the poles are never crossed. */
  pitch: number;
  /** Vertical field of view in degrees. Smaller is more zoomed in. */
  fov: number;
};

export type PanoramaLimits = {
  minFov: number;
  maxFov: number;
  minPitch: number;
  maxPitch: number;
};

export type ProjectedPoint = {
  /** CSS pixels relative to the canvas's top-left. */
  x: number;
  y: number;
  /** False when the point is behind the camera or outside the viewport. */
  visible: boolean;
  /** 0 at the centre of view, 1 at the edge — used to fade distant markers. */
  eccentricity: number;
};

export type PanoramaOptions = {
  canvas: HTMLCanvasElement;
  camera?: Partial<PanoramaCamera>;
  limits?: Partial<PanoramaLimits>;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  /** Disables inertia and auto-rotation for `prefers-reduced-motion`. */
  reducedMotion?: boolean;
  onCameraChange?: (camera: PanoramaCamera) => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
};

const DEFAULT_LIMITS: PanoramaLimits = {
  minFov: 30,
  maxFov: 100,
  minPitch: -85,
  maxPitch: 85,
};

/** Idle time before auto-rotation resumes after the visitor stops dragging. */
const AUTO_ROTATE_RESUME_MS = 3000;

export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Engine                                                                    */
/* -------------------------------------------------------------------------- */

export class PanoramaEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  private readonly options: PanoramaOptions;
  private readonly limits: PanoramaLimits;

  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private uvBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private indexCount = 0;

  private previewTexture: WebGLTexture | null = null;
  private mainTexture: WebGLTexture | null = null;

  private uniforms: {
    viewProjection: WebGLUniformLocation | null;
    preview: WebGLUniformLocation | null;
    texture: WebGLUniformLocation | null;
    mix: WebGLUniformLocation | null;
  } = { viewProjection: null, preview: null, texture: null, mix: null };

  private attributes = { position: -1, uv: -1 };

  private camera: PanoramaCamera = { yaw: 0, pitch: 0, fov: 75 };
  private velocity = { yaw: 0, pitch: 0 };
  private mixTarget = 0;
  private mixCurrent = 0;

  private frame: number | null = null;
  private disposed = false;
  private needsRender = true;
  private resizeObserver: ResizeObserver | null = null;

  private viewProjection: Mat4 = perspective(75 * DEG, 1, 0.1, 100);
  private viewportWidth = 1;
  private viewportHeight = 1;

  // Pointer state
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private pinchDistance = 0;
  private lastInteractionAt = 0;

  constructor(options: PanoramaOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };

    const gl =
      this.canvas.getContext('webgl2', { antialias: true, alpha: false }) ??
      this.canvas.getContext('webgl', { antialias: true, alpha: false });

    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;

    this.setCamera({ ...this.camera, ...options.camera }, { silent: true });
    this.initialise();
    this.attachInput();
    this.observeSize();
    this.resize();
    this.start();
  }

  /**
   * Tracks the canvas's own box rather than trusting the caller to call
   * `resize()`.
   *
   * The constructor frequently runs before the element has been laid out — a
   * React mount, a container that animates open, a font that has not settled —
   * and a one-shot measurement then freezes the drawing buffer at whatever
   * size (often zero) was current at that instant. A ResizeObserver also
   * covers window resizes, device rotation, and a sidebar opening beside the
   * viewer, none of which fire a window `resize` event reliably.
   */
  private observeSize(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
      return;
    }
    window.addEventListener('resize', this.onWindowResize);
  }

  private onWindowResize = (): void => {
    this.resize();
  };

  /* ---- setup ---------------------------------------------------------- */

  private compileShader(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${log ?? 'unknown'}`);
    }
    return shader;
  }

  private initialise(): void {
    const { gl } = this;

    const vertex = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      throw new Error(`Program link failed: ${log ?? 'unknown'}`);
    }

    this.program = program;
    gl.useProgram(program);

    this.attributes.position = gl.getAttribLocation(program, 'a_position');
    this.attributes.uv = gl.getAttribLocation(program, 'a_uv');
    this.uniforms = {
      viewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
      preview: gl.getUniformLocation(program, 'u_preview'),
      texture: gl.getUniformLocation(program, 'u_texture'),
      mix: gl.getUniformLocation(program, 'u_mix'),
    };

    gl.uniform1i(this.uniforms.preview, 0);
    gl.uniform1i(this.uniforms.texture, 1);

    this.buildSphere(64, 32);

    // `buildSphere` emits each quad as (a, b, a+1) / (a+1, b, b+1) where `a+1`
    // is to the right and `b` is below. Viewed from the centre — which is
    // where the camera always is — that winding is counter-clockwise, so these
    // are GL *front* faces already and it is the outward-facing side that must
    // be culled. Culling FRONT here (the usual idiom for a sphere wound for
    // outside viewing) discards the entire mesh and renders a blank screen.
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0.06, 0.06, 0.07, 1);

    // A 1×1 grey stands in until real pixels arrive, so the first frame is
    // never an undefined-texture warning or a black flash.
    this.previewTexture = this.createTexture();
    this.mainTexture = this.createTexture();
    this.uploadPlaceholder(this.previewTexture);
    this.uploadPlaceholder(this.mainTexture);
  }

  /**
   * UV sphere generated directly from the equirectangular parameterisation, so
   * texture coordinates need no adjustment and `directionFromAngles` describes
   * the same surface the shader samples.
   */
  private buildSphere(segments: number, rings: number): void {
    const { gl } = this;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let ring = 0; ring <= rings; ring += 1) {
      const v = ring / rings;
      const pitch = (0.5 - v) * Math.PI;
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const yaw = (u - 0.5) * 2 * Math.PI;
        const [x, y, z] = directionFromAngles(yaw, pitch);
        positions.push(x, y, z);
        uvs.push(u, v);
      }
    }

    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = ring * stride + segment;
        const b = a + stride;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    this.uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    this.indexCount = indices.length;
  }

  private createTexture(): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // CLAMP_TO_EDGE rather than REPEAT: the sphere duplicates the seam vertex
    // at u=0 and u=1, so wrapping is never needed — and clamping keeps
    // non-power-of-two panoramas legal on WebGL 1.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  private uploadPlaceholder(texture: WebGLTexture): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([18, 18, 20, 255]),
    );
  }

  /* ---- textures -------------------------------------------------------- */

  private uploadImage(texture: WebGLTexture, source: TexImageSource): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const width = 'width' in source ? Number(source.width) : 0;
    const height = 'height' in source ? Number(source.height) : 0;
    const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;
    const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

    // Mipmaps stop the texture shimmering when the visitor zooms out.
    if (isWebGL2 || (isPowerOfTwo(width) && isPowerOfTwo(height))) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
  }

  /** Uploads the blurred placeholder. Renders immediately, no fade. */
  setPreview(source: TexImageSource): void {
    if (this.disposed || !this.previewTexture) return;
    this.uploadImage(this.previewTexture, source);
    this.needsRender = true;
  }

  /** Uploads the full-resolution panorama and crossfades it in. */
  setTexture(source: TexImageSource, options: { fade?: boolean } = {}): void {
    if (this.disposed || !this.mainTexture) return;
    this.uploadImage(this.mainTexture, source);
    const fade = options.fade ?? !this.options.reducedMotion;
    this.mixTarget = 1;
    if (!fade) this.mixCurrent = 1;
    this.needsRender = true;
    this.options.onReady?.();
  }

  /** Resets to the placeholder pair, for a scene change. */
  clearTextures(): void {
    if (this.disposed) return;
    if (this.previewTexture) this.uploadPlaceholder(this.previewTexture);
    if (this.mainTexture) this.uploadPlaceholder(this.mainTexture);
    this.mixCurrent = 0;
    this.mixTarget = 0;
    this.needsRender = true;
  }

  /* ---- camera ---------------------------------------------------------- */

  getCamera(): PanoramaCamera {
    return { ...this.camera };
  }

  setCamera(next: Partial<PanoramaCamera>, options: { silent?: boolean } = {}): void {
    const yaw = normalizeYaw(next.yaw ?? this.camera.yaw);
    const pitch = clamp(next.pitch ?? this.camera.pitch, this.limits.minPitch, this.limits.maxPitch);
    const fov = clamp(next.fov ?? this.camera.fov, this.limits.minFov, this.limits.maxFov);

    const changed = yaw !== this.camera.yaw || pitch !== this.camera.pitch || fov !== this.camera.fov;
    this.camera = { yaw, pitch, fov };

    if (changed) {
      this.needsRender = true;
      if (!options.silent) this.options.onCameraChange?.(this.getCamera());
    }
  }

  /** Eases toward a target over `durationMs`. Used by "look at this hotspot". */
  animateTo(target: Partial<PanoramaCamera>, durationMs = 600): void {
    if (this.options.reducedMotion || durationMs <= 0) {
      this.setCamera(target);
      return;
    }

    const from = this.getCamera();
    const to = {
      yaw: normalizeYaw(target.yaw ?? from.yaw),
      pitch: clamp(target.pitch ?? from.pitch, this.limits.minPitch, this.limits.maxPitch),
      fov: clamp(target.fov ?? from.fov, this.limits.minFov, this.limits.maxFov),
    };
    // Turn whichever way is shorter, rather than unwinding the long way round.
    const yawDelta = shortestAngle(from.yaw, to.yaw);
    const startedAt = performance.now();

    const step = () => {
      if (this.disposed) return;
      const t = Math.min(1, (performance.now() - startedAt) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.setCamera({
        yaw: from.yaw + yawDelta * eased,
        pitch: from.pitch + (to.pitch - from.pitch) * eased,
        fov: from.fov + (to.fov - from.fov) * eased,
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /**
   * Projects a spherical coordinate to canvas pixels.
   *
   * This is what positions the DOM hotspot overlay each frame.
   */
  project(yawDeg: number, pitchDeg: number): ProjectedPoint {
    return projectAngles(
      this.viewProjection,
      yawDeg,
      pitchDeg,
      this.viewportWidth,
      this.viewportHeight,
    );
  }

  /** Inverse of {@link project}: canvas pixels to spherical coordinates. */
  unproject(screenX: number, screenY: number): { yaw: number; pitch: number } {
    return unprojectPoint(
      this.camera,
      screenX,
      screenY,
      this.viewportWidth,
      this.viewportHeight,
    );
  }

  /* ---- input ----------------------------------------------------------- */

  private attachInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('pointerleave', this.onPointerUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('keydown', this.onKeyDown);
  }

  private detachInput(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('keydown', this.onKeyDown);
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragging = true;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.velocity = { yaw: 0, pitch: 0 };
    this.lastInteractionAt = performance.now();

    if (this.pointers.size === 2) {
      this.pinchDistance = this.currentPinchDistance();
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.lastInteractionAt = performance.now();

    if (this.pointers.size >= 2) {
      const distance = this.currentPinchDistance();
      if (this.pinchDistance > 0 && distance > 0) {
        // Pinching apart zooms in, which means reducing the field of view.
        const ratio = this.pinchDistance / distance;
        this.setCamera({ fov: this.camera.fov * ratio });
      }
      this.pinchDistance = distance;
      return;
    }

    if (!this.dragging) return;

    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.lastPointer = { x: event.clientX, y: event.clientY };

    // Scale by field of view so a drag moves the same amount of *image*
    // whether zoomed in or out — otherwise zoomed-in dragging feels wild.
    const degreesPerPixel = this.camera.fov / this.viewportHeight;
    const yawDelta = -dx * degreesPerPixel;
    const pitchDelta = dy * degreesPerPixel;

    this.setCamera({
      yaw: this.camera.yaw + yawDelta,
      pitch: this.camera.pitch + pitchDelta,
    });

    if (!this.options.reducedMotion) {
      this.velocity = { yaw: yawDelta, pitch: pitchDelta };
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.canvas.releasePointerCapture?.(event.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.lastInteractionAt = performance.now();
    }
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.lastInteractionAt = performance.now();
    // deltaMode 1 is lines rather than pixels; normalise so the step is not
    // ten times larger in Firefox.
    const unit = event.deltaMode === 1 ? 16 : 1;
    this.setCamera({ fov: this.camera.fov + event.deltaY * unit * 0.05 });
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 15 : 5;
    let handled = true;

    switch (event.key) {
      case 'ArrowLeft':
        this.setCamera({ yaw: this.camera.yaw - step });
        break;
      case 'ArrowRight':
        this.setCamera({ yaw: this.camera.yaw + step });
        break;
      case 'ArrowUp':
        this.setCamera({ pitch: this.camera.pitch + step });
        break;
      case 'ArrowDown':
        this.setCamera({ pitch: this.camera.pitch - step });
        break;
      case '+':
      case '=':
        this.setCamera({ fov: this.camera.fov - step });
        break;
      case '-':
      case '_':
        this.setCamera({ fov: this.camera.fov + step });
        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
      this.lastInteractionAt = performance.now();
    }
  };

  private currentPinchDistance(): number {
    const [first, second] = [...this.pointers.values()];
    if (!first || !second) return 0;
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  /* ---- loop ------------------------------------------------------------ */

  /**
   * Re-measures and resizes the drawing buffer.
   *
   * `size` overrides the measurement. Useful when the caller already knows the
   * target dimensions and cannot wait for the ResizeObserver to fire — the
   * fullscreen transition is the real case, where the observed rect lags the
   * layout by a frame and the panorama would otherwise stretch briefly.
   */
  resize(size?: { width: number; height: number }): void {
    const { gl, canvas } = this;
    const measured = size ?? canvas.getBoundingClientRect();

    // A zero measurement means the element is not laid out — inside a
    // collapsed panel, an inactive tab, or a container that is `display: none`.
    // Shrinking the buffer to 1×1 in that state throws away the texture's
    // resolution and makes the scene reappear as a blurred smear until
    // something else happens to trigger another resize. Keep the last good
    // size and wait for the observer to report a real one.
    if (measured.width <= 0 || measured.height <= 0) return;

    // Capped at 2 because a 3× buffer on a phone costs fill rate and battery
    // for a difference nobody can see on a photographic texture.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const width = Math.max(1, Math.round(measured.width));
    const height = Math.max(1, Math.round(measured.height));

    this.viewportWidth = width;
    this.viewportHeight = height;

    const bufferWidth = Math.round(width * dpr);
    const bufferHeight = Math.round(height * dpr);

    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    this.needsRender = true;
  }

  private updateMatrices(): void {
    this.viewProjection = viewProjectionMatrix(
      this.camera,
      this.viewportWidth / this.viewportHeight,
    );
  }

  private render(): void {
    const { gl, program } = this;
    if (!program) return;

    this.updateMatrices();

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.previewTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mainTexture);

    gl.uniform1f(this.uniforms.mix, this.mixCurrent);
    gl.uniformMatrix4fv(this.uniforms.viewProjection, false, this.viewProjection);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.attributes.position);
    gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.attributes.uv);
    gl.vertexAttribPointer(this.attributes.uv, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Draws one frame immediately instead of waiting for the animation loop.
   *
   * Needed whenever a caller must have pixels *now*: capturing a poster image
   * for a scene, or drawing at least once in a context where
   * `requestAnimationFrame` is throttled, such as a background tab.
   */
  renderFrame(): void {
    if (this.disposed) return;
    this.render();
    this.needsRender = false;
  }

  private tick = (): void => {
    if (this.disposed) return;

    const idleFor = performance.now() - this.lastInteractionAt;

    // Crossfade from preview to full texture.
    if (this.mixCurrent < this.mixTarget) {
      this.mixCurrent = Math.min(this.mixTarget, this.mixCurrent + 0.06);
      this.needsRender = true;
    }

    // Inertia after a flick.
    if (!this.dragging && (Math.abs(this.velocity.yaw) > 0.01 || Math.abs(this.velocity.pitch) > 0.01)) {
      this.setCamera({
        yaw: this.camera.yaw + this.velocity.yaw,
        pitch: this.camera.pitch + this.velocity.pitch,
      });
      this.velocity.yaw *= 0.94;
      this.velocity.pitch *= 0.94;
    }

    if (
      this.options.autoRotate &&
      !this.options.reducedMotion &&
      !this.dragging &&
      idleFor > AUTO_ROTATE_RESUME_MS
    ) {
      this.setCamera({ yaw: this.camera.yaw + (this.options.autoRotateSpeed ?? 0.35) * 0.1 });
    }

    if (this.needsRender) {
      this.render();
      this.needsRender = false;
    }

    this.frame = requestAnimationFrame(this.tick);
  };

  private start(): void {
    this.lastInteractionAt = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.detachInput();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.onWindowResize);

    const { gl } = this;
    if (this.program) gl.deleteProgram(this.program);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
    if (this.previewTexture) gl.deleteTexture(this.previewTexture);
    if (this.mainTexture) gl.deleteTexture(this.mainTexture);

    // Free the GPU context immediately rather than waiting for GC; browsers
    // cap the number of live WebGL contexts, and a tour switching scenes
    // repeatedly would otherwise hit that ceiling.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Wraps to (−180, 180]. */
export function normalizeYaw(yaw: number): number {
  let result = yaw % 360;
  if (result > 180) result -= 360;
  if (result <= -180) result += 360;
  return result;
}

/** Signed shortest rotation from `from` to `to`, in degrees. */
export function shortestAngle(from: number, to: number): number {
  return normalizeYaw(to - from);
}
