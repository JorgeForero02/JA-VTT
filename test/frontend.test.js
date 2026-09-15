'use strict';
/* El cliente no tiene framework de tests: se comprueba el contrato entre HTML, JS y API. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', 'public', p), 'utf8');

test('index.html: el formulario tiene nombre, contraseña y las dos pestañas (entrar / crear cuenta)', () => {
  const html = read('index.html');
  assert.match(html, /<form id="loginForm"[^>]*data-mode="login"/);
  assert.match(html, /<input id="loginName"[^>]*autocomplete="username"/);
  assert.match(html, /<input id="loginPassword"[^>]*type="password"[^>]*minlength="6"/);
  assert.match(html, /class="gateTab" data-mode="login"/);
  assert.match(html, /class="gateTab" data-mode="register"/);
  assert.doesNotMatch(html, /No hay contraseña/);
  assert.doesNotMatch(html, /Mini VTT/);
});

test('main.js: envía nombre y contraseña a /api/login o /api/register según la pestaña', () => {
  const js = read('js/main.js');
  assert.match(js, /mode==='register'\?'\/api\/register':'\/api\/login'/);
  assert.match(js, /JSON\.stringify\(\{name,password\}\)/);
  assert.match(js, /function setLoginMode\(mode\)/);
});

test('todos los scripts del cliente compilan', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).filter((f) => f.endsWith('.js'))) {
    assert.doesNotThrow(() => new Function(read('js/' + f)), f);
  }
});
