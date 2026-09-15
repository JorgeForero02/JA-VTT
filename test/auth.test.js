'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, validPassword, MIN_PASSWORD } = require('../server/auth');

test('hashPassword: formato scrypt$N$sal$hash y sal distinta cada vez', async () => {
  const a = await hashPassword('secreto1');
  const b = await hashPassword('secreto1');
  assert.match(a, /^scrypt\$\d+\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(a, b);
});

test('verifyPassword: acepta la correcta y rechaza la incorrecta', async () => {
  const stored = await hashPassword('secreto1');
  assert.equal(await verifyPassword('secreto1', stored), true);
  assert.equal(await verifyPassword('secreto2', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('verifyPassword: hash corrupto o de otro formato devuelve false sin lanzar', async () => {
  assert.equal(await verifyPassword('x', 'bcrypt$algo'), false);
  assert.equal(await verifyPassword('x', 'scrypt$16384$zz$zz'), false);
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', null), false);
});

test('validPassword: cadena de al menos MIN_PASSWORD caracteres y como mucho 200', () => {
  assert.equal(MIN_PASSWORD, 6);
  assert.equal(validPassword('12345'), false);
  assert.equal(validPassword('123456'), true);
  assert.equal(validPassword('a'.repeat(200)), true);
  assert.equal(validPassword('a'.repeat(201)), false);
  assert.equal(validPassword(123456), false);
  assert.equal(validPassword(undefined), false);
});
