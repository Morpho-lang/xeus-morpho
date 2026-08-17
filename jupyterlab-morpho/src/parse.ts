/**
 * Parse morphoview ASCII command IR into a scene description for WebGL.
 * See morpho-morphoview docs/commandapi.md.
 */

import { identity, multiply, type Mat4 } from './mat4';

export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type { Mat4 };

/** Keep in sync with `SCENE_MAX_LIGHTS` in morphoview scene.h. */
export const SCENE_MAX_LIGHTS = 4;

/** Named camera-relative rigs, or an explicit world-space point list. */
export type MvLightMode = 'neutral' | 'threepoint' | 'explicit';

export interface MvLight {
  pos: Vec3;
  color: Vec3;
}

export interface MvObject {
  id: number;
  format: string;
  vertices: number[];
  points: number[];
  lines: number[];
  facets: number[];
}

export interface MvDraw {
  drawId: number;
  objectId: number;
  matrix: Mat4;
  /** uniform RGBA; null means vertex colors / white */
  color: Vec4 | null;
  useVertexColor: boolean;
  flat: boolean;
  ka: number;
  kd: number;
  ks: number;
  shininess: number;
  /** Present for text draw-slots (`T`). */
  text?: string;
  fontId?: number;
  fontSize?: number;
}

export interface MvFont {
  id: number;
  path: string;
  size: number;
}

export interface MvScene {
  id: number;
  dim: number;
  background: Vec3;
  bounds: number[] | null;
  lighting: MvLightMode;
  lights: MvLight[];
  objects: Map<number, MvObject>;
  draws: MvDraw[];
  fonts: Map<number, MvFont>;
  title: string;
}

function translate(m: Mat4, t: Vec3): Mat4 {
  const T = identity();
  T[12] = t[0];
  T[13] = t[1];
  T[14] = t[2];
  // morphoview: out = T * in (left-multiply)
  return multiply(T, m);
}

function scaleMat(m: Mat4, s: Vec3): Mat4 {
  const S = identity();
  S[0] = s[0];
  S[5] = s[1];
  S[10] = s[2];
  return multiply(S, m);
}

function rotateMat(m: Mat4, angle: number, axis: Vec3): Mat4 {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const x = axis[0] / len;
  const y = axis[1] / len;
  const z = axis[2] / len;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const R = new Float32Array([
    t * x * x + c,
    t * x * y + s * z,
    t * x * z - s * y,
    0,
    t * x * y - s * z,
    t * y * y + c,
    t * y * z + s * x,
    0,
    t * x * z + s * y,
    t * y * z - s * x,
    t * z * z + c,
    0,
    0,
    0,
    0,
    1
  ]);
  return multiply(R, m);
}

/** Tokenize: numbers, quoted strings, bare words/letters. */
function tokenize(src: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    while (i < n && /\s/.test(src[i])) {
      i++;
    }
    if (i >= n) {
      break;
    }
    if (src[i] === '"') {
      i++;
      let s = '';
      while (i < n) {
        if (src[i] === '\\' && i + 1 < n) {
          s += src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          i++;
          break;
        }
        s += src[i++];
      }
      tokens.push(`"${s}"`);
      continue;
    }
    if (/[A-Za-z_]/.test(src[i])) {
      const start = i;
      while (i < n && /[A-Za-z_]/.test(src[i])) {
        i++;
      }
      tokens.push(src.slice(start, i));
      continue;
    }
    // number or single punctuation
    if (/[0-9.+-]/.test(src[i])) {
      const start = i;
      if (src[i] === '+' || src[i] === '-') {
        i++;
      }
      while (i < n && /[0-9.]/.test(src[i])) {
        i++;
      }
      if (i < n && /[eE]/.test(src[i])) {
        i++;
        if (i < n && /[+-]/.test(src[i])) {
          i++;
        }
        while (i < n && /[0-9]/.test(src[i])) {
          i++;
        }
      }
      if (i > start && !(i === start + 1 && /[+-]/.test(src[start]))) {
        tokens.push(src.slice(start, i));
        continue;
      }
      i = start;
    }
    tokens.push(src[i++]);
  }
  return tokens;
}

function unquote(tok: string): string {
  if (tok.startsWith('"') && tok.endsWith('"') && tok.length >= 2) {
    return tok.slice(1, -1);
  }
  return tok;
}

function isNum(tok: string | undefined): boolean {
  if (!tok || tok.startsWith('"')) {
    return false;
  }
  if (/^[A-Za-z_]/.test(tok)) {
    return false;
  }
  return !Number.isNaN(parseFloat(tok));
}

function num(tok: string): number {
  return parseFloat(tok);
}

class Reader {
  i = 0;
  constructor(private readonly tokens: string[]) {}
  peek(): string | undefined {
    return this.tokens[this.i];
  }
  next(): string {
    return this.tokens[this.i++] ?? '';
  }
  eof(): boolean {
    return this.i >= this.tokens.length;
  }
  gatherNumbers(): number[] {
    const out: number[] = [];
    while (!this.eof() && isNum(this.peek())) {
      out.push(num(this.next()));
    }
    return out;
  }
}

/** `L "neutral"|"threepoint"|"auto"|"off"` | `L <n> "x"|"xc" ...` | `L 0`. */
function parseLightCommand(r: Reader, sc: MvScene): void {
  const peek = r.peek();
  if (peek?.startsWith('"')) {
    const name = unquote(r.next());
    if (name === 'threepoint') {
      sc.lighting = 'threepoint';
      sc.lights = [];
    } else if (name === 'off') {
      sc.lighting = 'explicit';
      sc.lights = [];
    } else {
      sc.lighting = 'neutral';
      sc.lights = [];
    }
    return;
  }
  if (!isNum(peek)) {
    return;
  }
  const n = Math.trunc(num(r.next()));
  if (n < 0) {
    return;
  }
  const lights: MvLight[] = [];
  if (n > 0) {
    if (!r.peek()?.startsWith('"')) {
      return;
    }
    const fmt = unquote(r.next());
    const hasColor = fmt === 'xc';
    if (!hasColor && fmt !== 'x') {
      r.gatherNumbers();
      return;
    }
    const stride = hasColor ? 6 : 3;
    const vals = r.gatherNumbers();
    const count = Math.min(n, SCENE_MAX_LIGHTS, Math.floor(vals.length / stride));
    for (let i = 0; i < count; i++) {
      const b = i * stride;
      lights.push({
        pos: [vals[b], vals[b + 1], vals[b + 2]],
        color: hasColor
          ? [vals[b + 3], vals[b + 4], vals[b + 5]]
          : [1, 1, 1]
      });
    }
  }
  sc.lighting = 'explicit';
  sc.lights = lights;
}

function ensureObject(scene: MvScene, id: number): MvObject {
  let o = scene.objects.get(id);
  if (!o) {
    o = { id, format: 'xn', vertices: [], points: [], lines: [], facets: [] };
    scene.objects.set(id, o);
  }
  return o;
}

function emptyScene(id: number, dim = 3): MvScene {
  return {
    id,
    dim,
    background: [0.12, 0.12, 0.16],
    bounds: null,
    lighting: 'neutral',
    lights: [],
    objects: new Map(),
    draws: [],
    fonts: new Map(),
    title: ''
  };
}

function resolvePendingColor(
  pendingC: number | null | undefined,
  colors: Map<number, Vec4>,
  existing: MvDraw | undefined,
  fallbackColor: Vec4 | null
): { color: Vec4 | null; useVertexColor: boolean } {
  if (pendingC !== undefined) {
    if (pendingC === null) {
      return { color: null, useVertexColor: true };
    }
    return { color: colors.get(pendingC) ?? [1, 1, 1, 1], useVertexColor: false };
  }
  return {
    color: existing?.color ?? fallbackColor,
    useVertexColor: existing?.useVertexColor ?? true
  };
}

export function parseMorphoview(ascii: string): MvScene[] {
  const r = new Reader(tokenize(ascii));
  const scenes: MvScene[] = [];
  let scene: MvScene | null = null;
  let currentObject = 0;
  let matrix = identity();
  let matrixDirty = false;
  const colors = new Map<number, Vec4>();
  // undefined = no C since last d; null = bare C; number = C id
  let pendingC: number | null | undefined = undefined;
  let flat = false;
  let ka = 0.5;
  let kd = 0.5;
  let ks = 0;
  let shininess = 8;

  const ensureScene = (): MvScene => {
    if (!scene) {
      scene = emptyScene(0);
      scenes.push(scene);
    }
    return scene;
  };

  const takeMatrix = (prev?: Mat4): Mat4 => {
    if (matrixDirty) {
      matrixDirty = false;
      return new Float32Array(matrix);
    }
    return prev ? new Float32Array(prev) : identity();
  };

  while (!r.eof()) {
    const tok = r.next();
    if (!tok) {
      break;
    }

    if (tok === 'S') {
      const id = num(r.next());
      const dim = num(r.next()) || 3;
      let existing = scenes.find(s => s.id === id);
      if (!existing) {
        existing = emptyScene(id, dim);
        scenes.push(existing);
      } else {
        existing.dim = dim;
      }
      scene = existing;
      matrix = identity();
      matrixDirty = false;
      continue;
    }

    if (tok === 'U') {
      const which = r.next();
      if (which === 'S') {
        const id = num(r.next());
        let existing = scenes.find(s => s.id === id);
        if (!existing) {
          existing = emptyScene(id);
          scenes.push(existing);
        } else {
          existing.objects.clear();
          existing.draws = [];
          existing.bounds = null;
          existing.fonts.clear();
        }
        scene = existing;
        colors.clear();
        pendingC = undefined;
      } else if (which === 'O') {
        const id = num(r.next());
        const o = ensureObject(ensureScene(), id);
        o.vertices = [];
        o.points = [];
        o.lines = [];
        o.facets = [];
        currentObject = id;
      } else if (which === 'V') {
        const id = num(r.next());
        const o = ensureObject(ensureScene(), id);
        if (r.peek()?.startsWith('"')) {
          o.format = unquote(r.next());
        }
        o.vertices = r.gatherNumbers();
      }
      continue;
    }

    if (tok === 'X') {
      const which = r.next();
      const id = num(r.next());
      const sc = ensureScene();
      if (which === 'O') {
        sc.objects.delete(id);
        sc.draws = sc.draws.filter(d => d.objectId !== id);
      } else if (which === 'D') {
        sc.draws = sc.draws.filter(d => d.drawId !== id);
      } else if (which === 'S') {
        const idx = scenes.findIndex(s => s.id === id);
        if (idx >= 0) {
          scenes.splice(idx, 1);
        }
        if (scene?.id === id) {
          scene = scenes[scenes.length - 1] ?? null;
        }
      }
      continue;
    }

    if (tok === 'Q') {
      scenes.length = 0;
      scene = null;
      continue;
    }

    if (tok === 'W') {
      ensureScene().title = unquote(r.next());
      continue;
    }

    if (tok === 'B') {
      ensureScene().bounds = r.gatherNumbers().slice(0, 6);
      continue;
    }

    if (tok === 'L') {
      parseLightCommand(r, ensureScene());
      continue;
    }

    if (tok === 'G') {
      const rgb = r.gatherNumbers();
      if (rgb.length >= 3) {
        ensureScene().background = [rgb[0], rgb[1], rgb[2]];
      }
      continue;
    }

    if (tok === 'o') {
      currentObject = num(r.next());
      ensureObject(ensureScene(), currentObject);
      continue;
    }

    if (tok === 'v') {
      const o = ensureObject(ensureScene(), currentObject);
      if (r.peek()?.startsWith('"')) {
        o.format = unquote(r.next());
      }
      o.vertices = o.vertices.concat(r.gatherNumbers());
      continue;
    }

    if (tok === 'p' || tok === 'l' || tok === 'f') {
      const o = ensureObject(ensureScene(), currentObject);
      const idx = r.gatherNumbers().map(v => Math.trunc(v));
      if (tok === 'p') {
        o.points.push(...idx);
      } else if (tok === 'l') {
        o.lines.push(...idx);
      } else {
        o.facets.push(...idx);
      }
      continue;
    }

    if (tok === 'c') {
      const id = num(r.next());
      const comps = r.gatherNumbers();
      if (comps.length >= 4) {
        colors.set(id, [comps[0], comps[1], comps[2], comps[3]]);
      } else if (comps.length >= 3) {
        colors.set(id, [comps[0], comps[1], comps[2], 1]);
      }
      continue;
    }

    if (tok === 'C') {
      if (isNum(r.peek())) {
        pendingC = Math.trunc(num(r.next()));
      } else {
        pendingC = null;
      }
      continue;
    }

    if (tok === 'M') {
      const mode = r.next();
      flat = mode === 'flat';
      ka = 0.5;
      kd = 0.5;
      ks = 0;
      shininess = 8;
      const coeffs = r.gatherNumbers();
      if (coeffs[0] !== undefined) {
        ka = coeffs[0];
      }
      if (coeffs[1] !== undefined) {
        kd = coeffs[1];
      }
      if (coeffs[2] !== undefined) {
        ks = coeffs[2];
      }
      if (coeffs[3] !== undefined) {
        shininess = coeffs[3];
      }
      continue;
    }

    if (tok === 'd') {
      const drawId = num(r.next());
      let objectId = drawId;
      if (isNum(r.peek())) {
        objectId = num(r.next());
      }
      const sc = ensureScene();
      const existing = sc.draws.find(d => d.drawId === drawId);
      const { color, useVertexColor } = resolvePendingColor(
        pendingC,
        colors,
        existing,
        null
      );
      const draw: MvDraw = {
        drawId,
        objectId,
        matrix: takeMatrix(existing?.matrix),
        color,
        useVertexColor,
        flat,
        ka,
        kd,
        ks,
        shininess
      };
      if (existing) {
        Object.assign(existing, draw);
      } else {
        sc.draws.push(draw);
      }
      pendingC = undefined;
      continue;
    }

    if (tok === 'D') {
      ensureScene().draws = [];
      continue;
    }

    if (tok === 'F') {
      const id = num(r.next());
      const path = unquote(r.next());
      const size = num(r.next()) || 12;
      ensureScene().fonts.set(id, { id, path, size });
      continue;
    }

    if (tok === 'T') {
      // T fontid "text"  OR  T drawId fontid "text"
      const a = r.next();
      const b = r.next();
      const sc = ensureScene();
      let drawId: number;
      let fontId: number;
      let text: string;
      if (b.startsWith('"')) {
        // Legacy append: T <fontId> "text"
        drawId = sc.draws.length ? Math.max(...sc.draws.map(d => d.drawId)) + 1 : 1;
        fontId = num(a);
        text = unquote(b);
      } else {
        drawId = num(a);
        fontId = num(b);
        text = unquote(r.next());
      }
      const font = sc.fonts.get(fontId);
      const existing = sc.draws.find(d => d.drawId === drawId);
      const { color, useVertexColor } = resolvePendingColor(
        pendingC,
        colors,
        existing,
        [1, 1, 1, 1]
      );
      const draw: MvDraw = {
        drawId,
        objectId: drawId,
        matrix: takeMatrix(existing?.matrix),
        color: color ?? existing?.color ?? [1, 1, 1, 1],
        useVertexColor,
        flat: true,
        ka,
        kd,
        ks,
        shininess,
        text,
        fontId,
        fontSize: font?.size ?? existing?.fontSize ?? 12
      };
      if (existing) {
        Object.assign(existing, draw);
      } else {
        sc.draws.push(draw);
      }
      pendingC = undefined;
      continue;
    }

    if (tok === 'i') {
      matrix = identity();
      matrixDirty = true;
      continue;
    }

    if (tok === 'm') {
      const vals = r.gatherNumbers();
      if (vals.length >= 16) {
        matrix = multiply(matrix, new Float32Array(vals.slice(0, 16)));
        matrixDirty = true;
      }
      continue;
    }

    if (tok === 'r') {
      const vals = r.gatherNumbers();
      if (vals.length >= 4) {
        matrix = rotateMat(matrix, vals[0], [vals[1], vals[2], vals[3]]);
        matrixDirty = true;
      }
      continue;
    }

    if (tok === 's') {
      const vals = r.gatherNumbers();
      if (vals.length >= 3) {
        matrix = scaleMat(matrix, [vals[0], vals[1], vals[2]]);
      } else if (vals.length >= 1) {
        matrix = scaleMat(matrix, [vals[0], vals[0], vals[0]]);
      }
      matrixDirty = true;
      continue;
    }

    if (tok === 't') {
      const vals = r.gatherNumbers();
      if (vals.length >= 3) {
        matrix = translate(matrix, [vals[0], vals[1], vals[2]]);
        matrixDirty = true;
      }
      continue;
    }
  }

  return scenes;
}

export interface FormatLayout {
  stride: number;
  x: number;
  n: number;
  c: number;
  a: number;
}

/** Offsets of `x`/`n`/`c`/`a` in a vertex format string (morphoview render.c). */
export function formatLayout(format: string, dim: number): FormatLayout {
  let stride = 0;
  let x = -1;
  let n = -1;
  let c = -1;
  let a = -1;
  for (const ch of format) {
    if (ch === 'x') {
      x = stride;
      stride += dim;
    } else if (ch === 'n') {
      n = stride;
      stride += dim;
    } else if (ch === 'c') {
      c = stride;
      stride += 3;
    } else if (ch === 'a') {
      a = stride;
      stride += 1;
    }
  }
  return { stride: Math.max(stride, dim), x, n, c, a };
}

export function formatStride(format: string, dim: number): number {
  return formatLayout(format, dim).stride;
}
