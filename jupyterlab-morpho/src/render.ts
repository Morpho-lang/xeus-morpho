/**
 * Minimal WebGL renderer for morphoview scenes (points, lines, triangles).
 */

import {
  MvScene,
  MvDraw,
  MvObject,
  Vec3,
  Vec4,
  formatLayout
} from './parse';
import { identity, mulMat4 } from './mat4';

const VS = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec4 aColor;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform mat3 uNormalMat;
varying vec3 vNormal;
varying vec3 vPos;
varying vec4 vColor;
void main() {
  vec4 wp = uModel * vec4(aPosition, 1.0);
  vPos = wp.xyz;
  vNormal = normalize(uNormalMat * aNormal);
  vColor = aColor;
  gl_Position = uMVP * vec4(aPosition, 1.0);
  gl_PointSize = 4.0;
}
`;

const FS = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vPos;
varying vec4 vColor;
uniform vec3 uLightPos;
uniform vec3 uLightColor;
uniform vec3 uEye;
uniform float uKa;
uniform float uKd;
uniform float uKs;
uniform float uShininess;
uniform bool uFlat;
void main() {
  vec3 albedo = vColor.rgb;
  float alpha = vColor.a;
  if (uFlat) {
    gl_FragColor = vec4(albedo, alpha);
    return;
  }
  vec3 N = normalize(vNormal);
  // morphoview: two-sided lighting (transparent back-face pass).
  if (!gl_FrontFacing) {
    N = -N;
  }
  vec3 L = normalize(uLightPos - vPos);
  vec3 V = normalize(uEye - vPos);
  vec3 R = reflect(-L, N);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(R, V), 0.0), uShininess);
  vec3 color = (uKa + uKd * diff + uKs * spec) * uLightColor * albedo;
  gl_FragColor = vec4(color, alpha);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'shader error';
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function link(
  gl: WebGLRenderingContext,
  vs: WebGLShader,
  fs: WebGLShader
): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || 'link error';
    gl.deleteProgram(p);
    throw new Error(log);
  }
  gl.detachShader(p, vs);
  gl.detachShader(p, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

/** Symmetric orthographic projection — matches morphoview mat3d_ortho for ±bounds. */
function ortho(
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
): Float32Array {
  const out = new Float32Array(16);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[15] = 1;
  return out;
}

function translateMat(tx: number, ty: number, tz: number): Float32Array {
  const out = identity();
  out[12] = tx;
  out[13] = ty;
  out[14] = tz;
  return out;
}

function scaleMat(s: number): Float32Array {
  const out = identity();
  out[0] = s;
  out[5] = s;
  out[10] = s;
  return out;
}

function rotateXMat(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = identity();
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
}

function rotateYMat(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = identity();
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
}

/** Affine inverse for view matrices (column-major). */
function invertMat4(m: Float32Array): Float32Array {
  const out = new Float32Array(16);
  const n11 = m[0];
  const n21 = m[1];
  const n31 = m[2];
  const n12 = m[4];
  const n22 = m[5];
  const n32 = m[6];
  const n13 = m[8];
  const n23 = m[9];
  const n33 = m[10];
  const t1 = m[12];
  const t2 = m[13];
  const t3 = m[14];
  const det =
    n11 * (n22 * n33 - n23 * n32) -
    n21 * (n12 * n33 - n13 * n32) +
    n31 * (n12 * n23 - n13 * n22);
  const id = det ? 1 / det : 1;
  out[0] = (n22 * n33 - n23 * n32) * id;
  out[1] = (n23 * n31 - n21 * n33) * id;
  out[2] = (n21 * n32 - n22 * n31) * id;
  out[4] = (n13 * n32 - n12 * n33) * id;
  out[5] = (n11 * n33 - n13 * n31) * id;
  out[6] = (n12 * n31 - n11 * n32) * id;
  out[8] = (n12 * n23 - n13 * n22) * id;
  out[9] = (n13 * n21 - n11 * n23) * id;
  out[10] = (n11 * n22 - n12 * n21) * id;
  out[12] = -(out[0] * t1 + out[4] * t2 + out[8] * t3);
  out[13] = -(out[1] * t1 + out[5] * t2 + out[9] * t3);
  out[14] = -(out[2] * t1 + out[6] * t2 + out[10] * t3);
  out[15] = 1;
  return out;
}

function normalMatrix(model: Float32Array): Float32Array {
  const a00 = model[0];
  const a01 = model[1];
  const a02 = model[2];
  const a10 = model[4];
  const a11 = model[5];
  const a12 = model[6];
  const a20 = model[8];
  const a21 = model[9];
  const a22 = model[10];
  const det =
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20);
  const id = det ? 1 / det : 1;
  return new Float32Array([
    (a11 * a22 - a12 * a21) * id,
    (a02 * a21 - a01 * a22) * id,
    (a01 * a12 - a02 * a11) * id,
    (a12 * a20 - a10 * a22) * id,
    (a00 * a22 - a02 * a20) * id,
    (a02 * a10 - a00 * a12) * id,
    (a10 * a21 - a11 * a20) * id,
    (a01 * a20 - a00 * a21) * id,
    (a00 * a11 - a01 * a10) * id
  ]);
}

function transformPoint(m: Float32Array, x: number, y: number, z: number): Vec3 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

function readVec3(verts: number[], offset: number, dim: number, fallbackZ = 0): Vec3 {
  return [
    verts[offset] || 0,
    dim > 1 ? verts[offset + 1] || 0 : 0,
    dim > 2 ? verts[offset + 2] || 0 : fallbackZ
  ];
}

interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  mode: number;
}

interface GpuMesh {
  pos: WebGLBuffer;
  nrm: WebGLBuffer;
  col: WebGLBuffer;
  idx: WebGLBuffer;
  count: number;
  mode: number;
  indexType: number;
}

interface GpuText {
  texture: WebGLTexture;
  pos: WebGLBuffer;
  uv: WebGLBuffer;
}

/**
 * Flip triangle windings so geometric normal agrees with averaged vertex normals.
 * Same as morphoview render_orient_facets — required for transparent back/front cull.
 */
function orientFacets(obj: MvObject, dim: number, facets: number[]): number[] {
  const layout = formatLayout(obj.format, dim);
  if (layout.x < 0 || layout.n < 0 || facets.length < 3) {
    return facets;
  }
  const stride = layout.stride;
  const xpos = layout.x;
  const npos = layout.n;

  const out = facets.slice();
  for (let t = 0; t + 2 < out.length; t += 3) {
    const i0 = out[t];
    const i1 = out[t + 1];
    const i2 = out[t + 2];
    const p0 = readVec3(obj.vertices, i0 * stride + xpos, dim);
    const p1 = readVec3(obj.vertices, i1 * stride + xpos, dim);
    const p2 = readVec3(obj.vertices, i2 * stride + xpos, dim);
    const n0 = readVec3(obj.vertices, i0 * stride + npos, dim);
    const n1 = readVec3(obj.vertices, i1 * stride + npos, dim);
    const n2 = readVec3(obj.vertices, i2 * stride + npos, dim);

    const e1x = p1[0] - p0[0];
    const e1y = p1[1] - p0[1];
    const e1z = p1[2] - p0[2];
    const e2x = p2[0] - p0[0];
    const e2y = p2[1] - p0[1];
    const e2z = p2[2] - p0[2];
    const gx = e1y * e2z - e1z * e2y;
    const gy = e1z * e2x - e1x * e2z;
    const gz = e1x * e2y - e1y * e2x;
    const nx = n0[0] + n1[0] + n2[0];
    const ny = n0[1] + n1[1] + n2[1];
    const nz = n0[2] + n1[2] + n2[2];
    if (gx * nx + gy * ny + gz * nz < 0) {
      out[t + 1] = i2;
      out[t + 2] = i1;
    }
  }
  return out;
}

function expandObject(
  obj: MvObject,
  dim: number,
  draw: MvDraw,
  glMode: number,
  indexList: number[],
  isTriangles: boolean
): MeshData | null {
  if (!indexList.length || !obj.vertices.length) {
    return null;
  }
  const layout = formatLayout(obj.format, dim);
  const stride = layout.stride;
  const nVert = Math.floor(obj.vertices.length / stride);
  if (nVert < 1) {
    return null;
  }

  const indices = isTriangles ? orientFacets(obj, dim, indexList) : indexList;
  const hasC = layout.c >= 0;
  const hasA = layout.a >= 0;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  for (let vi = 0; vi < nVert; vi++) {
    const base = vi * stride;
    const p =
      layout.x >= 0 ? readVec3(obj.vertices, base + layout.x, dim) : ([0, 0, 0] as Vec3);
    const nrm =
      layout.n >= 0
        ? readVec3(obj.vertices, base + layout.n, dim, 1)
        : ([0, 0, 1] as Vec3);

    let cr = 1;
    let cg = 1;
    let cb = 1;
    let ca = 1;
    if (hasC) {
      cr = obj.vertices[base + layout.c] || 0;
      cg = obj.vertices[base + layout.c + 1] || 0;
      cb = obj.vertices[base + layout.c + 2] || 0;
    }
    if (hasA) {
      ca = obj.vertices[base + layout.a] ?? 1;
    }
    if (!draw.useVertexColor && draw.color) {
      cr = draw.color[0];
      cg = draw.color[1];
      cb = draw.color[2];
      ca = draw.color[3];
    } else if (draw.useVertexColor && !hasC && draw.color) {
      cr = draw.color[0];
      cg = draw.color[1];
      cb = draw.color[2];
      ca = draw.color[3];
    } else if (draw.useVertexColor && !hasC) {
      cr = cg = cb = 1;
      ca = 1;
    }
    // Uniform RGB override keeps vertex alpha when format has `a` (morphoview).
    if (!draw.useVertexColor && draw.color && hasA) {
      ca = obj.vertices[base + layout.a] ?? draw.color[3];
    }

    positions.push(p[0], p[1], p[2]);
    normals.push(nrm[0], nrm[1], nrm[2]);
    colors.push(cr, cg, cb, ca);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    mode: glMode
  };
}

const TEXT_VS = `
attribute vec3 aPosition;
attribute vec2 aUV;
uniform mat4 uMVP;
varying vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uMVP * vec4(aPosition, 1.0);
}
`;

const TEXT_FS = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform vec4 uColor;
void main() {
  float a = texture2D(uTex, vUV).a;
  if (a < 0.05) discard;
  gl_FragColor = vec4(uColor.rgb, uColor.a * a);
}
`;

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) {
    p <<= 1;
  }
  return Math.max(p, 2);
}

const TEXT_DPI = 720;
const TEXT_WORLD_SCALE = 1 / TEXT_DPI;

/** Rasterize text to an alpha texture. */
function rasterizeText(
  gl: WebGLRenderingContext,
  text: string,
  fontSizePt: number
): {
  texture: WebGLTexture;
  width: number;
  yTop: number;
  yBottom: number;
  u: number;
  v: number;
} {
  const pad = 4;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const sizePx = Math.max(8, Math.round((fontSizePt / 72) * TEXT_DPI));
  const font = `${sizePx}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const ascent = Math.ceil(
    metrics.actualBoundingBoxAscent > 0
      ? metrics.actualBoundingBoxAscent
      : sizePx * 0.8
  );
  const descent = Math.ceil(
    metrics.actualBoundingBoxDescent > 0
      ? metrics.actualBoundingBoxDescent
      : sizePx * 0.2
  );
  const textW = Math.max(2, Math.ceil(metrics.width) + pad * 2);
  const textH = Math.max(2, ascent + descent + pad * 2);
  canvas.width = nextPow2(textW);
  canvas.height = nextPow2(textH);
  ctx.font = font;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(text, pad, pad + ascent);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

  const yTop = (pad + ascent) * TEXT_WORLD_SCALE;
  const yBottom = yTop - textH * TEXT_WORLD_SCALE;
  return {
    texture,
    width: textW * TEXT_WORLD_SCALE,
    yTop,
    yBottom,
    u: textW / canvas.width,
    v: textH / canvas.height
  };
}

function sceneBounds(scene: MvScene): {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  radius: number;
  hx: number;
  hy: number;
  hz: number;
} {
  const pack = (min: Vec3, max: Vec3) => {
    const center: Vec3 = [
      0.5 * (min[0] + max[0]),
      0.5 * (min[1] + max[1]),
      0.5 * (min[2] + max[2])
    ];
    const hx = 0.5 * (max[0] - min[0]);
    const hy = 0.5 * (max[1] - min[1]);
    const hz = 0.5 * (max[2] - min[2]);
    const radius = Math.hypot(hx, hy, hz) || 1;
    return { min, max, center, radius, hx, hy, hz };
  };

  if (scene.bounds && scene.bounds.length >= 6) {
    return pack(
      [scene.bounds[0], scene.bounds[2], scene.bounds[4]],
      [scene.bounds[1], scene.bounds[3], scene.bounds[5]]
    );
  }

  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let any = false;
  const dim = scene.dim || 3;

  const includePoint = (wx: number, wy: number, wz: number) => {
    min = [Math.min(min[0], wx), Math.min(min[1], wy), Math.min(min[2], wz)];
    max = [Math.max(max[0], wx), Math.max(max[1], wy), Math.max(max[2], wz)];
    any = true;
  };

  for (const draw of scene.draws) {
    const m = draw.matrix;
    if (draw.text) {
      includePoint(m[12], m[13], m[14]);
      continue;
    }
    const obj = scene.objects.get(draw.objectId);
    if (!obj) {
      continue;
    }
    const layout = formatLayout(obj.format, dim);
    if (layout.x < 0) {
      continue;
    }
    const nVert = Math.floor(obj.vertices.length / layout.stride);
    for (let vi = 0; vi < nVert; vi++) {
      const p = readVec3(obj.vertices, vi * layout.stride + layout.x, dim);
      const w = transformPoint(m, p[0], p[1], p[2]);
      includePoint(w[0], w[1], w[2]);
    }
  }

  if (!any) {
    return pack([-1, -1, -1], [1, 1, 1]);
  }
  return pack(min, max);
}

function objectLocalCentroid(obj: MvObject, dim: number): Vec3 {
  const layout = formatLayout(obj.format, dim);
  if (layout.x < 0) {
    return [0, 0, 0];
  }
  const nVert = Math.floor(obj.vertices.length / layout.stride);
  if (nVert < 1) {
    return [0, 0, 0];
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let vi = 0; vi < nVert; vi++) {
    const p = readVec3(obj.vertices, vi * layout.stride + layout.x, dim);
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  return [0.5 * (minX + maxX), 0.5 * (minY + maxY), 0.5 * (minZ + maxZ)];
}

function viewDepth(view: Float32Array, model: Float32Array, local: Vec3): number {
  const w = transformPoint(model, local[0], local[1], local[2]);
  return view[2] * w[0] + view[6] * w[1] + view[10] * w[2] + view[14];
}

function isTransparentDraw(draw: MvDraw, obj: MvObject | undefined): boolean {
  if (draw.color && draw.color[3] < 0.999) {
    return true;
  }
  if (obj && obj.format.includes('a')) {
    return true;
  }
  return false;
}

const INTERACT_HINT =
  'Click to interact · drag to orbit · scroll to zoom · Tab to reset view';

export class MorphoviewGL {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private textProgram: WebGLProgram;
  private locs: Record<string, WebGLUniformLocation | null>;
  private attribs: Record<string, number>;
  private textLocs: Record<string, WebGLUniformLocation | null>;
  private textAttribs: Record<string, number>;
  private yaw = 0;
  private pitch = 0;
  private viewScale = 1;
  private homeScale = 1;
  private orthoNear = -2;
  private orthoFar = 2;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private interactive = false;
  private scene: MvScene | null = null;
  private raf = 0;
  private uint32Indices: boolean;
  private meshCache = new Map<number, GpuMesh[]>();
  private textCache = new Map<number, GpuText>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) {
      throw new Error('WebGL not available');
    }
    this.gl = gl;
    this.uint32Indices = gl.getExtension('OES_element_index_uint') !== null;
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    this.program = link(gl, vs, fs);
    const tvs = compile(gl, gl.VERTEX_SHADER, TEXT_VS);
    const tfs = compile(gl, gl.FRAGMENT_SHADER, TEXT_FS);
    this.textProgram = link(gl, tvs, tfs);
    gl.useProgram(this.program);
    this.locs = {
      uMVP: gl.getUniformLocation(this.program, 'uMVP'),
      uModel: gl.getUniformLocation(this.program, 'uModel'),
      uNormalMat: gl.getUniformLocation(this.program, 'uNormalMat'),
      uLightPos: gl.getUniformLocation(this.program, 'uLightPos'),
      uLightColor: gl.getUniformLocation(this.program, 'uLightColor'),
      uEye: gl.getUniformLocation(this.program, 'uEye'),
      uKa: gl.getUniformLocation(this.program, 'uKa'),
      uKd: gl.getUniformLocation(this.program, 'uKd'),
      uKs: gl.getUniformLocation(this.program, 'uKs'),
      uShininess: gl.getUniformLocation(this.program, 'uShininess'),
      uFlat: gl.getUniformLocation(this.program, 'uFlat')
    };
    this.attribs = {
      aPosition: gl.getAttribLocation(this.program, 'aPosition'),
      aNormal: gl.getAttribLocation(this.program, 'aNormal'),
      aColor: gl.getAttribLocation(this.program, 'aColor')
    };
    this.textLocs = {
      uMVP: gl.getUniformLocation(this.textProgram, 'uMVP'),
      uTex: gl.getUniformLocation(this.textProgram, 'uTex'),
      uColor: gl.getUniformLocation(this.textProgram, 'uColor')
    };
    this.textAttribs = {
      aPosition: gl.getAttribLocation(this.textProgram, 'aPosition'),
      aUV: gl.getAttribLocation(this.textProgram, 'aUV')
    };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    canvas.tabIndex = 0;
    canvas.style.outline = 'none';
    canvas.title = INTERACT_HINT;

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('blur', this.onBlur);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) {
      return;
    }
    this.interactive = true;
    this.canvas.focus();
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging || (e.buttons & 1) === 0) {
      return;
    }
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.yaw += dx * 0.01;
    this.pitch += dy * 0.01;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    this.scheduleDraw();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.interactive || document.activeElement !== this.canvas) {
      return;
    }
    e.preventDefault();
    this.viewScale *= e.deltaY > 0 ? 0.95 : 1.05;
    this.viewScale = Math.max(1e-4, Math.min(1e4, this.viewScale));
    this.scheduleDraw();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') {
      return;
    }
    e.preventDefault();
    this.resetView();
    this.canvas.blur();
  };

  private readonly onBlur = (): void => {
    this.interactive = false;
    this.dragging = false;
  };

  private scheduleDraw(): void {
    if (this.raf) {
      return;
    }
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  resetView(): void {
    this.yaw = 0;
    this.pitch = 0;
    this.applyFit(/*assignViewScale=*/ true);
    this.draw();
  }

  setScene(scene: MvScene): void {
    this.scene = scene;
    this.yaw = 0;
    this.pitch = 0;
    this.prepareGpu();
    this.applyFit(/*assignViewScale=*/ true);
    this.draw();
  }

  private applyFit(assignViewScale: boolean): void {
    if (!this.scene) {
      return;
    }
    const aspect = this.canvas.width / Math.max(1, this.canvas.height) || 1;
    const b = sceneBounds(this.scene);
    const extent = Math.max(b.hx / aspect, b.hy);
    const scale = extent > 1e-6 ? 1 / (extent * 1.1) : 1;
    this.homeScale = scale;
    if (assignViewScale) {
      this.viewScale = scale;
    }
    let zspan = scale * b.hz + 1;
    if (zspan < 2) {
      zspan = 2;
    }
    this.orthoNear = -zspan;
    this.orthoFar = zspan;
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const atHome =
      this.yaw === 0 &&
      this.pitch === 0 &&
      Math.abs(this.viewScale - this.homeScale) < 1e-9 * Math.max(1, this.homeScale);
    this.applyFit(atHome);
    this.draw();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('keydown', this.onKeyDown);
    canvas.removeEventListener('blur', this.onBlur);
    this.clearGpu();
    this.gl.deleteProgram(this.program);
    this.gl.deleteProgram(this.textProgram);
  }

  private clearGpu(): void {
    const gl = this.gl;
    for (const meshes of this.meshCache.values()) {
      for (const m of meshes) {
        gl.deleteBuffer(m.pos);
        gl.deleteBuffer(m.nrm);
        gl.deleteBuffer(m.col);
        gl.deleteBuffer(m.idx);
      }
    }
    this.meshCache.clear();
    for (const t of this.textCache.values()) {
      gl.deleteTexture(t.texture);
      gl.deleteBuffer(t.pos);
      gl.deleteBuffer(t.uv);
    }
    this.textCache.clear();
  }

  private uploadMesh(mesh: MeshData): GpuMesh {
    const gl = this.gl;
    let maxIndex = 0;
    for (let i = 0; i < mesh.indices.length; i++) {
      if (mesh.indices[i] > maxIndex) {
        maxIndex = mesh.indices[i];
      }
    }
    if (maxIndex > 65535 && !this.uint32Indices) {
      throw new Error(
        'Mesh has more than 65535 vertices, but OES_element_index_uint is unavailable'
      );
    }
    const useUint32 = this.uint32Indices;
    const pos = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    const nrm = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    const col = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, col);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    const idx = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    if (useUint32) {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    } else {
      gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(mesh.indices),
        gl.STATIC_DRAW
      );
    }
    return {
      pos,
      nrm,
      col,
      idx,
      count: mesh.indices.length,
      mode: mesh.mode,
      indexType: useUint32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
    };
  }

  private prepareGpu(): void {
    this.clearGpu();
    const scene = this.scene;
    if (!scene) {
      return;
    }
    const gl = this.gl;
    const dim = scene.dim || 3;
    for (const draw of scene.draws) {
      if (draw.text) {
        const fontSize = draw.fontSize ?? 12;
        const rast = rasterizeText(gl, draw.text, fontSize);
        const positions = new Float32Array([
          0, rast.yBottom, 0,
          rast.width, rast.yBottom, 0,
          rast.width, rast.yTop, 0,
          0, rast.yBottom, 0,
          rast.width, rast.yTop, 0,
          0, rast.yTop, 0
        ]);
        const uvs = new Float32Array([
          0, rast.v, rast.u, rast.v, rast.u, 0,
          0, rast.v, rast.u, 0, 0, 0
        ]);
        const pb = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, pb);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        const ub = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, ub);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
        this.textCache.set(draw.drawId, {
          texture: rast.texture,
          pos: pb,
          uv: ub
        });
        continue;
      }
      const obj = scene.objects.get(draw.objectId);
      if (!obj) {
        continue;
      }
      const batches: Array<{ mode: number; indices: number[] }> = [];
      if (obj.facets.length) {
        batches.push({ mode: gl.TRIANGLES, indices: obj.facets });
      }
      if (obj.lines.length) {
        batches.push({ mode: gl.LINES, indices: obj.lines });
      }
      if (obj.points.length) {
        batches.push({ mode: gl.POINTS, indices: obj.points });
      }
      const gpu: GpuMesh[] = [];
      for (const batch of batches) {
        const mesh = expandObject(
          obj,
          dim,
          draw,
          batch.mode,
          batch.indices,
          batch.mode === gl.TRIANGLES
        );
        if (mesh) {
          gpu.push(this.uploadMesh(mesh));
        }
      }
      if (gpu.length) {
        this.meshCache.set(draw.drawId, gpu);
      }
    }
  }

  private drawText(draw: MvDraw, mvpBase: Float32Array): void {
    const cached = this.textCache.get(draw.drawId);
    if (!cached) {
      return;
    }
    const gl = this.gl;
    const color: Vec4 = draw.color ?? [1, 1, 1, 1];
    const mvp = mulMat4(mvpBase, draw.matrix);
    gl.useProgram(this.textProgram);
    if (this.attribs.aNormal >= 0) {
      gl.disableVertexAttribArray(this.attribs.aNormal);
    }
    if (this.attribs.aColor >= 0) {
      gl.disableVertexAttribArray(this.attribs.aColor);
    }
    gl.uniformMatrix4fv(this.textLocs.uMVP, false, mvp);
    gl.uniform4fv(this.textLocs.uColor, color);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cached.texture);
    gl.uniform1i(this.textLocs.uTex, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cached.pos);
    gl.enableVertexAttribArray(this.textAttribs.aPosition);
    gl.vertexAttribPointer(this.textAttribs.aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cached.uv);
    gl.enableVertexAttribArray(this.textAttribs.aUV);
    gl.vertexAttribPointer(this.textAttribs.aUV, 2, gl.FLOAT, false, 0, 0);

    const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (depthWasEnabled) {
      gl.enable(gl.DEPTH_TEST);
    }

    gl.disableVertexAttribArray(this.textAttribs.aUV);
    gl.useProgram(this.program);
  }

  private drawDraw(
    draw: MvDraw,
    mvpBase: Float32Array,
    eye: Vec3,
    light: Vec3,
    lightColor: Vec3,
    transparentPass: boolean
  ): void {
    const meshes = this.meshCache.get(draw.drawId);
    if (!meshes) {
      return;
    }
    const gl = this.gl;
    const model = draw.matrix;
    const mvp = mulMat4(mvpBase, model);
    const nmat = normalMatrix(model);

    gl.uniformMatrix4fv(this.locs.uMVP, false, mvp);
    gl.uniformMatrix4fv(this.locs.uModel, false, model);
    gl.uniformMatrix3fv(this.locs.uNormalMat, false, nmat);
    gl.uniform3fv(this.locs.uLightPos, light);
    gl.uniform3fv(this.locs.uLightColor, lightColor);
    gl.uniform3fv(this.locs.uEye, eye);
    gl.uniform1f(this.locs.uKa, draw.ka);
    gl.uniform1f(this.locs.uKd, draw.kd);
    gl.uniform1f(this.locs.uKs, draw.ks);
    gl.uniform1f(this.locs.uShininess, draw.shininess);
    gl.uniform1i(this.locs.uFlat, draw.flat ? 1 : 0);

    for (const mesh of meshes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
      gl.enableVertexAttribArray(this.attribs.aPosition);
      gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
      gl.enableVertexAttribArray(this.attribs.aNormal);
      gl.vertexAttribPointer(this.attribs.aNormal, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.col);
      gl.enableVertexAttribArray(this.attribs.aColor);
      gl.vertexAttribPointer(this.attribs.aColor, 4, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);

      if (transparentPass && mesh.mode === gl.TRIANGLES) {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
        gl.drawElements(mesh.mode, mesh.count, mesh.indexType, 0);
        gl.cullFace(gl.BACK);
        gl.drawElements(mesh.mode, mesh.count, mesh.indexType, 0);
        gl.disable(gl.CULL_FACE);
      } else {
        gl.drawElements(mesh.mode, mesh.count, mesh.indexType, 0);
      }
    }
  }

  draw(): void {
    const gl = this.gl;
    const scene = this.scene;
    if (!scene) {
      return;
    }
    const bg = scene.background;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const b = sceneBounds(scene);
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);

    const proj = ortho(-aspect, aspect, -1, 1, this.orthoNear, this.orthoFar);
    let view = translateMat(-b.center[0], -b.center[1], -b.center[2]);
    view = mulMat4(scaleMat(this.viewScale), view);
    view = mulMat4(rotateYMat(this.yaw), view);
    view = mulMat4(rotateXMat(this.pitch), view);
    const mvpBase = mulMat4(proj, view);

    const invView = invertMat4(view);
    const eye: Vec3 = [invView[12], invView[13], invView[14]];

    const light: Vec3 = scene.lightPos
      ? scene.lightPos
      : [
          b.center[0] + 0.7 * b.radius,
          b.center[1] + 1.0 * b.radius,
          b.center[2] + 1.5 * b.radius
        ];
    const lightColor = scene.lightColor;
    const dim = scene.dim || 3;

    const opaque: MvDraw[] = [];
    const transparent: Array<{ draw: MvDraw; depth: number }> = [];
    for (const d of scene.draws) {
      if (d.text) {
        continue;
      }
      const obj = scene.objects.get(d.objectId);
      if (isTransparentDraw(d, obj)) {
        const local = obj ? objectLocalCentroid(obj, dim) : ([0, 0, 0] as Vec3);
        transparent.push({
          draw: d,
          depth: viewDepth(view, d.matrix, local)
        });
      } else {
        opaque.push(d);
      }
    }
    transparent.sort((a, b) => a.depth - b.depth);

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const d of opaque) {
      this.drawDraw(d, mvpBase, eye, light, lightColor, false);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const { draw: d } of transparent) {
      this.drawDraw(d, mvpBase, eye, light, lightColor, true);
    }

    gl.depthMask(true);
    for (const d of scene.draws) {
      if (d.text) {
        this.drawText(d, mvpBase);
      }
    }
  }
}
