/**
 * Minimal WebGL renderer for morphoview scenes (points, lines, triangles).
 */

import {
  MvScene,
  MvDraw,
  MvObject,
  Vec3,
  Vec4,
  formatStride,
  identity
} from './parse';

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
    throw new Error(gl.getProgramInfoLog(p) || 'link error');
  }
  return p;
}

function mulMat4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
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
  // Inverse-transpose of upper 3x3 (assume similarity / uniform-ish scale)
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

interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  mode: number; // gl.TRIANGLES / LINES / POINTS
}

/**
 * Flip triangle windings so geometric normal agrees with averaged vertex normals.
 * Same as morphoview render_orient_facets — required for transparent back/front cull.
 */
function orientFacets(obj: MvObject, dim: number, facets: number[]): number[] {
  if (!obj.format.includes('n') || !obj.format.includes('x') || facets.length < 3) {
    return facets;
  }
  const stride = formatStride(obj.format, dim);
  let xpos = -1;
  let npos = -1;
  let pos = 0;
  for (const ch of obj.format) {
    if (ch === 'x') {
      xpos = pos;
      pos += dim;
    } else if (ch === 'n') {
      npos = pos;
      pos += dim;
    } else if (ch === 'c') {
      pos += 3;
    } else if (ch === 'a') {
      pos += 1;
    }
  }
  if (xpos < 0 || npos < 0) {
    return facets;
  }

  const out = facets.slice();
  for (let t = 0; t + 2 < out.length; t += 3) {
    const i0 = out[t];
    const i1 = out[t + 1];
    const i2 = out[t + 2];
    const p0 = i0 * stride + xpos;
    const p1 = i1 * stride + xpos;
    const p2 = i2 * stride + xpos;
    const n0 = i0 * stride + npos;
    const n1 = i1 * stride + npos;
    const n2 = i2 * stride + npos;
    const p0x = obj.vertices[p0] || 0;
    const p0y = dim > 1 ? obj.vertices[p0 + 1] || 0 : 0;
    const p0z = dim > 2 ? obj.vertices[p0 + 2] || 0 : 0;
    const p1x = obj.vertices[p1] || 0;
    const p1y = dim > 1 ? obj.vertices[p1 + 1] || 0 : 0;
    const p1z = dim > 2 ? obj.vertices[p1 + 2] || 0 : 0;
    const p2x = obj.vertices[p2] || 0;
    const p2y = dim > 1 ? obj.vertices[p2 + 1] || 0 : 0;
    const p2z = dim > 2 ? obj.vertices[p2 + 2] || 0 : 0;
    const n0x = obj.vertices[n0] || 0;
    const n0y = dim > 1 ? obj.vertices[n0 + 1] || 0 : 0;
    const n0z = dim > 2 ? obj.vertices[n0 + 2] || 0 : 0;
    const n1x = obj.vertices[n1] || 0;
    const n1y = dim > 1 ? obj.vertices[n1 + 1] || 0 : 0;
    const n1z = dim > 2 ? obj.vertices[n1 + 2] || 0 : 0;
    const n2x = obj.vertices[n2] || 0;
    const n2y = dim > 1 ? obj.vertices[n2 + 1] || 0 : 0;
    const n2z = dim > 2 ? obj.vertices[n2 + 2] || 0 : 0;

    const e1x = p1x - p0x;
    const e1y = p1y - p0y;
    const e1z = p1z - p0z;
    const e2x = p2x - p0x;
    const e2y = p2y - p0y;
    const e2z = p2z - p0z;
    const gx = e1y * e2z - e1z * e2y;
    const gy = e1z * e2x - e1x * e2z;
    const gz = e1x * e2y - e1y * e2x;
    const nx = n0x + n1x + n2x;
    const ny = n0y + n1y + n2y;
    const nz = n0z + n1z + n2z;
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
  const stride = formatStride(obj.format, dim);
  const nVert = Math.floor(obj.vertices.length / stride);
  if (nVert < 1) {
    return null;
  }

  const indices = isTriangles ? orientFacets(obj, dim, indexList) : indexList;

  const hasN = obj.format.includes('n');
  const hasC = obj.format.includes('c');
  const hasA = obj.format.includes('a');

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  for (let vi = 0; vi < nVert; vi++) {
    const base = vi * stride;
    let o = 0;
    const px = obj.vertices[base + o] || 0;
    const py = dim > 1 ? obj.vertices[base + o + 1] || 0 : 0;
    const pz = dim > 2 ? obj.vertices[base + o + 2] || 0 : 0;
    o += dim;
    let nx = 0;
    let ny = 0;
    let nz = 1;
    if (hasN) {
      nx = obj.vertices[base + o] || 0;
      ny = dim > 1 ? obj.vertices[base + o + 1] || 0 : 0;
      nz = dim > 2 ? obj.vertices[base + o + 2] || 0 : 1;
      o += dim;
    }
    let cr = 1;
    let cg = 1;
    let cb = 1;
    let ca = 1;
    if (hasC) {
      cr = obj.vertices[base + o] || 0;
      cg = obj.vertices[base + o + 1] || 0;
      cb = obj.vertices[base + o + 2] || 0;
      o += 3;
    }
    if (hasA) {
      ca = obj.vertices[base + o] ?? 1;
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
    // Uniform override still allows vertex alpha when format has a and color override is RGB from C
    if (!draw.useVertexColor && draw.color && hasA) {
      // morphoview: C RGB override keeps vertex a — approximate by keeping ca from vertex
      ca =
        obj.vertices[
          base + (hasC ? dim + (hasN ? dim : 0) + 3 : dim + (hasN ? dim : 0))
        ] ?? draw.color[3];
    }

    positions.push(px, py, pz);
    normals.push(nx, ny, nz);
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

/**
 * Match morphoview text sizing (scene.c / text.h):
 *   size is in points; raster at 720 DPI → sizepx = size * 10
 *   world = FreeType pixels * TEXT_WORLD_SCALE (1/720)
 */
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
  // Host .ttf paths from morphoview are unavailable in-browser.
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
  // Re-set after resize (canvas reset clears state).
  ctx.font = font;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Baseline at pad+ascent so the full glyph fits in [0, textH).
  ctx.fillText(text, pad, pad + ascent);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  // No Y flip: canvas row 0 (top) → texture v=0. UVs map top of quad → low v.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

  // Baseline at y=0 (morphoview): top of texture above baseline, bottom below.
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
    const stride = formatStride(obj.format, dim);
    const nVert = Math.floor(obj.vertices.length / stride);
    for (let vi = 0; vi < nVert; vi++) {
      const base = vi * stride;
      const x = obj.vertices[base] || 0;
      const y = dim > 1 ? obj.vertices[base + 1] || 0 : 0;
      const z = dim > 2 ? obj.vertices[base + 2] || 0 : 0;
      includePoint(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14]
      );
    }
  }

  if (!any) {
    return pack([-1, -1, -1], [1, 1, 1]);
  }
  return pack(min, max);
}

/** Local-space AABB centroid of object positions (morphoview render_object_centroid). */
function objectLocalCentroid(obj: MvObject, dim: number): Vec3 {
  const stride = formatStride(obj.format, dim);
  const nVert = Math.floor(obj.vertices.length / stride);
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
    const base = vi * stride;
    const x = obj.vertices[base] || 0;
    const y = dim > 1 ? obj.vertices[base + 1] || 0 : 0;
    const z = dim > 2 ? obj.vertices[base + 2] || 0 : 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return [0.5 * (minX + maxX), 0.5 * (minY + maxY), 0.5 * (minZ + maxZ)];
}

/** View-space z of model*local (column-major); morphoview render_view_depth. */
function viewDepth(view: Float32Array, model: Float32Array, local: Vec3): number {
  const wx =
    model[0] * local[0] + model[4] * local[1] + model[8] * local[2] + model[12];
  const wy =
    model[1] * local[0] + model[5] * local[1] + model[9] * local[2] + model[13];
  const wz =
    model[2] * local[0] + model[6] * local[1] + model[10] * local[2] + model[14];
  return view[2] * wx + view[6] * wy + view[10] * wz + view[14];
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

export class MorphoviewGL {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private textProgram: WebGLProgram;
  private locs: Record<string, WebGLUniformLocation | null>;
  private attribs: Record<string, number>;
  private textLocs: Record<string, WebGLUniformLocation | null>;
  private textAttribs: Record<string, number>;
  // Match morphoview's fitted home view: look along +Z at the scene center.
  private yaw = 0;
  private pitch = 0;
  /** Uniform view scale (morphoview display_fit / scroll zoom). */
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

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) {
      throw new Error('WebGL not available');
    }
    this.gl = gl;
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

    // Click-to-interact so notebook scrolling is not captured by the canvas.
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';
    canvas.title = 'Click to interact · drag to orbit · scroll to zoom · Tab to reset view';

    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) {
        return;
      }
      this.interactive = true;
      canvas.focus();
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    canvas.addEventListener('pointercancel', () => {
      this.dragging = false;
    });
    canvas.addEventListener('pointermove', e => {
      // Require an active primary-button drag (avoids rotate while scrolling).
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
      this.draw();
    });
    canvas.addEventListener(
      'wheel',
      e => {
        // Let the notebook scroll unless the user has clicked the viewer.
        if (!this.interactive || document.activeElement !== canvas) {
          return;
        }
        e.preventDefault();
        this.viewScale *= e.deltaY > 0 ? 0.95 : 1.05;
        this.viewScale = Math.max(1e-4, Math.min(1e4, this.viewScale));
        this.draw();
      },
      { passive: false }
    );
    canvas.addEventListener('keydown', e => {
      if (e.key !== 'Tab') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.resetView();
    });
    canvas.addEventListener('blur', () => {
      this.interactive = false;
      this.dragging = false;
    });
  }

  /** Restore morphoview-style home view (Tab). */
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
    this.applyFit(/*assignViewScale=*/ true);
    this.draw();
  }

  /**
   * morphoview display_fit: scale so AABB fills the window with 10% margin;
   * ortho near/far from scaled Z half-extent.
   */
  private applyFit(assignViewScale: boolean): void {
    if (!this.scene) {
      return;
    }
    const aspect =
      this.canvas.width / Math.max(1, this.canvas.height) || 1;
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
  }

  private drawText(draw: MvDraw, mvpBase: Float32Array): void {
    if (!draw.text) {
      return;
    }
    const gl = this.gl;
    const color: Vec4 = draw.color ?? [1, 1, 1, 1];
    const fontSize = draw.fontSize ?? 12;
    const { texture, width, yTop, yBottom, u, v } = rasterizeText(
      gl,
      draw.text,
      fontSize
    );

    // Positions: BL, BR, TR, BL, TR, TL (y up, baseline at 0). Without
    // UNPACK_FLIP_Y, canvas top is texture v=0 → top of quad uses low v.
    const positions = new Float32Array([
      0, yBottom, 0,
      width, yBottom, 0,
      width, yTop, 0,
      0, yBottom, 0,
      width, yTop, 0,
      0, yTop, 0
    ]);
    const uvs = new Float32Array([
      0, v, u, v, u, 0,
      0, v, u, 0, 0, 0
    ]);

    const mvp = mulMat4(mvpBase, draw.matrix);
    gl.useProgram(this.textProgram);
    // Avoid leftover mesh attribs from the lit program.
    if (this.attribs.aNormal >= 0) {
      gl.disableVertexAttribArray(this.attribs.aNormal);
    }
    if (this.attribs.aColor >= 0) {
      gl.disableVertexAttribArray(this.attribs.aColor);
    }
    gl.uniformMatrix4fv(this.textLocs.uMVP, false, mvp);
    gl.uniform4fv(this.textLocs.uColor, color);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.textLocs.uTex, 0);

    const pb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.textAttribs.aPosition);
    gl.vertexAttribPointer(this.textAttribs.aPosition, 3, gl.FLOAT, false, 0, 0);

    const ub = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, ub);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.textAttribs.aUV);
    gl.vertexAttribPointer(this.textAttribs.aUV, 2, gl.FLOAT, false, 0, 0);

    const depthWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (depthWasEnabled) {
      gl.enable(gl.DEPTH_TEST);
    }

    gl.disableVertexAttribArray(this.textAttribs.aUV);
    gl.deleteBuffer(pb);
    gl.deleteBuffer(ub);
    gl.deleteTexture(texture);
    gl.useProgram(this.program);
  }

  private drawDraw(
    draw: MvDraw,
    obj: MvObject,
    dim: number,
    mvpBase: Float32Array,
    eye: Vec3,
    light: Vec3,
    lightColor: Vec3,
    transparentPass: boolean
  ): void {
    const gl = this.gl;
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

    for (const batch of batches) {
      const mesh = expandObject(
        obj,
        dim,
        draw,
        batch.mode,
        batch.indices,
        batch.mode === gl.TRIANGLES
      );
      if (!mesh) {
        continue;
      }
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

      const pb = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, pb);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(this.attribs.aPosition);
      gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);

      const nb = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(this.attribs.aNormal);
      gl.vertexAttribPointer(this.attribs.aNormal, 3, gl.FLOAT, false, 0, 0);

      const cb = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(this.attribs.aColor);
      gl.vertexAttribPointer(this.attribs.aColor, 4, gl.FLOAT, false, 0, 0);

      const ib = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      // WebGL1 may lack OES_element_index_uint — fall back to Uint16 when possible
      const ext = gl.getExtension('OES_element_index_uint');
      const indexType = ext ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      if (ext) {
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STREAM_DRAW);
      } else {
        const shortIdx = new Uint16Array(mesh.indices.length);
        for (let i = 0; i < mesh.indices.length; i++) {
          shortIdx[i] = mesh.indices[i] & 0xffff;
        }
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shortIdx, gl.STREAM_DRAW);
      }

      // Closed translucent meshes: back faces then front (morphoview).
      if (transparentPass && mesh.mode === gl.TRIANGLES) {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
        gl.drawElements(mesh.mode, mesh.indices.length, indexType, 0);
        gl.cullFace(gl.BACK);
        gl.drawElements(mesh.mode, mesh.indices.length, indexType, 0);
        gl.disable(gl.CULL_FACE);
      } else {
        gl.drawElements(mesh.mode, mesh.indices.length, indexType, 0);
      }

      gl.deleteBuffer(pb);
      gl.deleteBuffer(nb);
      gl.deleteBuffer(cb);
      gl.deleteBuffer(ib);
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

    // morphoview: ortho ±aspect / ±1, view = Rx Ry S T(-center)
    const proj = ortho(-aspect, aspect, -1, 1, this.orthoNear, this.orthoFar);
    let view = translateMat(-b.center[0], -b.center[1], -b.center[2]);
    view = mulMat4(scaleMat(this.viewScale), view);
    view = mulMat4(rotateYMat(this.yaw), view);
    view = mulMat4(rotateXMat(this.pitch), view);
    const mvpBase = mulMat4(proj, view);

    const invView = invertMat4(view);
    const eye: Vec3 = [invView[12], invView[13], invView[14]];

    // morphoview AABB auto-light: center + (0.7, 1.0, 1.5) * radius
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
    // Far → near (ascending view-z), same as morphoview render_tdraw_cmp.
    transparent.sort((a, b) => a.depth - b.depth);

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const d of opaque) {
      const obj = scene.objects.get(d.objectId);
      if (obj) {
        this.drawDraw(d, obj, dim, mvpBase, eye, light, lightColor, false);
      }
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const { draw: d } of transparent) {
      const obj = scene.objects.get(d.objectId);
      if (obj) {
        this.drawDraw(d, obj, dim, mvpBase, eye, light, lightColor, true);
      }
    }

    gl.depthMask(true);
    for (const d of scene.draws) {
      if (d.text) {
        this.drawText(d, mvpBase);
      }
    }
  }
}
