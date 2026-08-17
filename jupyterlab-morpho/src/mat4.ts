/**
 * Column-major 4×4 matrices, matching morphoview command.c / mat3d.
 */

export type Mat4 = Float32Array;

export function identity(): Mat4 {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

/** `out = a * b` (column-major). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
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

export const mulMat4 = multiply;

/**
 * `normalMatrix = transpose(inverse(upper 3×3 of M))`, column-major.
 * Same extract as morphoview `render_normalmatrix` (inverse-transpose, not inverse).
 */
export function normalMatrix(m: Mat4): Float32Array {
  const a00 = m[0];
  const a10 = m[1];
  const a20 = m[2];
  const a01 = m[4];
  const a11 = m[5];
  const a21 = m[6];
  const a02 = m[8];
  const a12 = m[9];
  const a22 = m[10];
  const det =
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20);
  const id = det ? 1 / det : 1;
  // Cofactor matrix / det = inverse-transpose, stored column-major.
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
