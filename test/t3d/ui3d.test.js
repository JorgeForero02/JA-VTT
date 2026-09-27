'use strict';
/* ui3d.js (Tablero3D.UI) cargado en vm con un DOM mínimo falso: mkBtn (aria-pressed, disabled, título, clic), esc
   (escapa & < > " y deja ' como hoy) y lsGet/lsSet tolerantes (sin localStorage o con uno que lanza). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MOD } = require('./helpers/engine');

function fakeEl(tag) {
  const attrs = {};
  return { tagName: tag, className: '', textContent: '', title: '', disabled: false, children: [],
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return k in attrs ? attrs[k] : null; },
    hasAttribute(k) { return k in attrs; }, appendChild(c) { this.children.push(c); return c; } };
}
function loadUI(storage) {
  const ctx = { document: { createElement: fakeEl } };
  if (storage !== undefined) ctx.localStorage = storage;
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(MOD, 'ui3d.js'), 'utf8'), ctx);
  return ctx.Tablero3D.UI({ $: () => null, icon: () => '' });
}
const memStorage = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
// los objetos creados dentro de vm tienen otro Object.prototype: se comparan por su JSON
const plain = (x) => JSON.parse(JSON.stringify(x));
const throwingStorage = () => ({ getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); } });

test('mkBtn: aria-pressed "true"/"false" según pressed y ausente sin la opción', () => {
  const { mkBtn } = loadUI();
  assert.strictEqual(mkBtn('a', null, { pressed: 1 }).getAttribute('aria-pressed'), 'true');
  assert.strictEqual(mkBtn('a', null, { pressed: 0 }).getAttribute('aria-pressed'), 'false');
  assert.strictEqual(mkBtn('a', null, {}).hasAttribute('aria-pressed'), false);
  assert.strictEqual(mkBtn('a', null).hasAttribute('aria-pressed'), false);
});

test('mkBtn: clase, texto, título, disabled y onclick', () => {
  const { mkBtn } = loadUI();
  const fn = () => 1;
  const b = mkBtn('Hola', fn, { title: 'T', disabled: 1 });
  assert.strictEqual(b.tagName, 'button');
  assert.strictEqual(b.className, 'btn');
  assert.strictEqual(b.textContent, 'Hola');
  assert.strictEqual(b.title, 'T');
  assert.strictEqual(b.disabled, true);
  assert.strictEqual(b.onclick, fn);
  assert.strictEqual(mkBtn('x', fn).disabled, false);
});

test('esc escapa & < > " y deja la comilla simple', () => {
  const { esc } = loadUI();
  assert.strictEqual(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;\'&lt;/a&gt;');
  assert.strictEqual(esc(5), '5');
});

test('el, sepEl, lblEl crean el elemento con su clase y texto', () => {
  const { el, sepEl, lblEl } = loadUI();
  const e = el('div', 'c', 'txt');
  assert.deepStrictEqual([e.tagName, e.className, e.textContent], ['div', 'c', 'txt']);
  assert.strictEqual(el('p').className, '');
  assert.strictEqual(sepEl().className, 't3d-sep');
  const l = lblEl('R'); assert.deepStrictEqual([l.className, l.textContent], ['t3d-lbl', 'R']);
});

test('lsGet/lsSet: ida y vuelta con almacenamiento', () => {
  const { lsGet, lsSet } = loadUI(memStorage());
  assert.deepStrictEqual(plain(lsGet('k')), {});
  assert.strictEqual(lsSet('k', { a: 1 }), true);
  assert.deepStrictEqual(plain(lsGet('k')), { a: 1 });
});

test('lsGet/lsSet: sin localStorage o si lanza, caen a {} / false', () => {
  for (const s of [undefined, throwingStorage()]) {
    const { lsGet, lsSet } = loadUI(s);
    assert.deepStrictEqual(plain(lsGet('k')), {});
    assert.strictEqual(lsSet('k', { a: 1 }), false);
  }
  const bad = memStorage(); bad.setItem('k', '{no json');
  assert.deepStrictEqual(plain(loadUI(bad).lsGet('k')), {});
  const nul = memStorage(); nul.setItem('k', 'null');
  assert.deepStrictEqual(plain(loadUI(nul).lsGet('k')), {});
});
