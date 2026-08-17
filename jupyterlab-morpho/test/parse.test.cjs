'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseMorphoview, formatLayout, formatStride } = require('./dist/parse.js');
const { identity, normalMatrix } = require('./dist/mat4.js');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'commandapi-example.mv'),
  'utf8'
);

test('command API example parses one scene with a line draw', () => {
  const scenes = parseMorphoview(fixture);
  assert.equal(scenes.length, 1);
  const scene = scenes[0];
  assert.equal(scene.id, 0);
  assert.equal(scene.dim, 3);
  assert.equal(scene.title, 'Example');
  assert.deepEqual(scene.background, [0, 0, 0]);
  assert.equal(scene.lighting, 'neutral');
  assert.equal(scene.objects.size, 1);
  const obj = scene.objects.get(1);
  assert.ok(obj);
  assert.equal(obj.format, 'xn');
  assert.equal(obj.vertices.length, 18);
  assert.deepEqual(obj.lines, [0, 1, 1, 2, 2, 0]);
  assert.equal(scene.draws.length, 1);
  const draw = scene.draws[0];
  assert.equal(draw.drawId, 1);
  assert.equal(draw.objectId, 1);
  assert.equal(draw.useVertexColor, false);
  assert.deepEqual(draw.color, [1, 0, 0, 1]);
});

test('formatLayout walks x/n/c/a in any order', () => {
  const xn = formatLayout('xn', 3);
  assert.equal(xn.stride, 6);
  assert.equal(xn.x, 0);
  assert.equal(xn.n, 3);
  assert.equal(xn.c, -1);

  const nxc = formatLayout('nxc', 3);
  assert.equal(nxc.n, 0);
  assert.equal(nxc.x, 3);
  assert.equal(nxc.c, 6);
  assert.equal(nxc.stride, 9);
  assert.equal(formatStride('nxc', 3), 9);

  const xca = formatLayout('xca', 3);
  assert.equal(xca.x, 0);
  assert.equal(xca.c, 3);
  assert.equal(xca.a, 6);
  assert.equal(xca.stride, 7);
});

test('m right-multiplies (model = model * X)', () => {
  // Scale then m-translate: S * T puts scaled translation in the last column.
  const ir = `
S 1 3
o 1
v "x" 0 0 0
p 0
i
s 2 2 2
m 1 0 0 0  0 1 0 0  0 0 1 0  1 0 0 1
d 1
`;
  const scene = parseMorphoview(ir)[0];
  const m = scene.draws[0].matrix;
  assert.equal(m[0], 2);
  assert.equal(m[5], 2);
  assert.equal(m[10], 2);
  assert.equal(m[12], 2);
  assert.equal(m[13], 0);
  assert.equal(m[14], 0);
});

test('sticky matrix: second d without a new transform keeps pose', () => {
  const ir = `
S 1 3
o 1
v "x" 0 0 0
p 0
i
t 3 0 0
d 1
d 2 1
`;
  const scene = parseMorphoview(ir)[0];
  assert.equal(scene.draws.length, 2);
  assert.equal(scene.draws[0].matrix[12], 3);
  assert.equal(scene.draws[1].matrix[12], 0);
});

test('d on an existing T slot keeps text', () => {
  const ir = `
S 1 3
F 0 "unused.ttf" 12
i
T 1 0 "hello"
i
t 1 0 0
d 1
`;
  const scene = parseMorphoview(ir)[0];
  assert.equal(scene.draws.length, 1);
  assert.equal(scene.draws[0].text, 'hello');
  assert.equal(scene.draws[0].matrix[12], 1);
});

test('omit L defaults to Neutral', () => {
  const ir = `
S 0 3
o 1
v "x" 0 0 0
p 0
d 1
`;
  const scene = parseMorphoview(ir)[0];
  assert.equal(scene.lighting, 'neutral');
  assert.equal(scene.lights.length, 0);
});

test('L named rigs and explicit lamps', () => {
  const auto = parseMorphoview('S 0 3\nL "auto"\no 1\nv "x" 0 0 0\np 0\nd 1\n')[0];
  assert.equal(auto.lighting, 'neutral');
  assert.equal(auto.lights.length, 0);

  const three = parseMorphoview(
    'S 0 3\nL "threepoint"\no 1\nv "x" 0 0 0\np 0\nd 1\n'
  )[0];
  assert.equal(three.lighting, 'threepoint');

  const white = parseMorphoview(
    'S 0 3\nL 1 "x" 1 2 3\no 1\nv "x" 0 0 0\np 0\nd 1\n'
  )[0];
  assert.equal(white.lighting, 'explicit');
  assert.equal(white.lights.length, 1);
  assert.deepEqual(white.lights[0].pos, [1, 2, 3]);
  assert.deepEqual(white.lights[0].color, [1, 1, 1]);

  const tinted = parseMorphoview(
    'S 0 3\nL 1 "xc" -2.5 0.4 0.2  1.0 0.15 0.08\no 1\nv "x" 0 0 0\np 0\nd 1\n'
  )[0];
  assert.equal(tinted.lighting, 'explicit');
  assert.deepEqual(tinted.lights[0].pos, [-2.5, 0.4, 0.2]);
  assert.deepEqual(tinted.lights[0].color, [1, 0.15, 0.08]);

  const ambient = parseMorphoview(
    'S 0 3\nL 0\no 1\nv "x" 0 0 0\np 0\nd 1\n'
  )[0];
  assert.equal(ambient.lighting, 'explicit');
  assert.equal(ambient.lights.length, 0);

  const off = parseMorphoview(
    'S 0 3\nL "off"\no 1\nv "x" 0 0 0\np 0\nd 1\n'
  )[0];
  assert.equal(off.lighting, 'explicit');
  assert.equal(off.lights.length, 0);

  const namedNeutral = parseMorphoview(
    'S 0 3\nL "neutral"\no 1\nv "x" 0 0 0\np 0\nd 1\n'
  )[0];
  assert.equal(namedNeutral.lighting, 'neutral');
});

test('normalMatrix is inverse-transpose, not inverse', () => {
  // Ry(90°): R^{-T} = R, while R^{-1} = R^T would flip the first column's z.
  const m = identity();
  m[0] = 0;
  m[1] = 0;
  m[2] = -1;
  m[4] = 0;
  m[5] = 1;
  m[6] = 0;
  m[8] = 1;
  m[9] = 0;
  m[10] = 0;
  const n = Array.from(normalMatrix(m), x => x + 0);
  assert.deepEqual(n, [0, 0, -1, 0, 1, 0, 1, 0, 0]);
});
