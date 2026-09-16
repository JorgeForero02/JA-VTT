'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../server/dice');

test('parse: fórmulas válidas', () => {
  assert.deepEqual(D.parse('2d6+3'), { terms: [{ n: 2, sides: 6, sign: 1 }], mod: 3 });
  assert.deepEqual(D.parse('D20'), { terms: [{ n: 1, sides: 20, sign: 1 }], mod: 0 });
  assert.deepEqual(D.parse(' 4d6 + 2d8 - 1 '), { terms: [{ n: 4, sides: 6, sign: 1 }, { n: 2, sides: 8, sign: 1 }], mod: -1 });
  assert.deepEqual(D.parse('1d100-1d4'), { terms: [{ n: 1, sides: 100, sign: 1 }, { n: 1, sides: 4, sign: -1 }], mod: 0 });
});

test('parse: rechaza lo que no toca', () => {
  assert.throws(() => D.parse('d7'), /No hay dados de 7/);
  assert.throws(() => D.parse('30d6'), /Entre 1 y 20/);
  assert.throws(() => D.parse('0d6'), /Entre 1 y 20/);
  assert.throws(() => D.parse('5'), /al menos un dado/);
  assert.throws(() => D.parse(''), /vacía/);
  assert.throws(() => D.parse('2d6+hola'), /No entiendo/);
  assert.throws(() => D.parse('d6+d6+d6+d6+d6+d6'), /Como mucho 5/);
  assert.throws(() => D.parse('d6+5000'), /Modificador/);
  assert.throws(() => D.parse('2d6*3'), /No entiendo|no válida/);
});

test('roll: resultados dentro del rango y total coherente; fórmula normalizada', () => {
  for (let i = 0; i < 200; i++) {
    const r = D.roll('3d6+2d20-2');
    assert.equal(r.formula, '3d6+2d20-2');
    assert.equal(r.dice[0].rolls.length, 3);
    assert.ok(r.dice[0].rolls.every((v) => v >= 1 && v <= 6));
    assert.ok(r.dice[1].rolls.every((v) => v >= 1 && v <= 20));
    const sum = r.dice[0].rolls.reduce((a, b) => a + b, 0) + r.dice[1].rolls.reduce((a, b) => a + b, 0) - 2;
    assert.equal(r.total, sum);
  }
  const d100 = D.roll('d100');
  assert.ok(d100.total >= 1 && d100.total <= 100);
  assert.equal(D.roll('d20').formula, '1d20');
});

test('roll: los dados restados restan del total', () => {
  for (let i = 0; i < 50; i++) {
    const r = D.roll('d4-d4');
    assert.equal(r.total, r.dice[0].rolls[0] - r.dice[1].rolls[0]);
  }
});
