'use strict';
/* editor-arte.js (Tablero3D.EditorArte): lo que se guarda de un dibujo vuelve igual. docToRecord y recordToDoc son
   internas de la fábrica, así que se llega a ellas por su camino real, con un DOM de mentira y el lienzo falso de
   helpers/arte.js (su toDataURL da un «PNG» que FakeImage sabe leer):
     borrador en localStorage → open() → restoreDraft → recordToDoc → setDoc (queda sucio)
     → el temporizador del borrador (every) → docToRecord → localStorage.
   El e2e no puede ver un `res` perdido al guardar: al cargar, recordToDoc lo normaliza a 32. Esta prueba sí (16 y 64). */
const test = require('node:test');
const assert = require('node:assert');
const { loadModules, fakeCanvas, fakeTHREE, FakeImage, FakeImageData } = require('./helpers/arte');

// contexto 2D: el del lienzo falso, y lo que no tiene (trazos, texto, transformaciones) no hace nada
const noop = () => {};
const lenientCtx = (x) => new Proxy(x, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? noop : undefined) });
function fakeEl(tag) {
  const cv = tag === 'canvas' ? fakeCanvas() : null;
  const el = {
    tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    hidden: false, checked: false, disabled: false, files: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    get options() { return el.children; },
    addEventListener: noop, removeEventListener: noop, setAttribute: noop, removeAttribute: noop, getAttribute: () => null,
    hasAttribute: () => false, toggleAttribute: noop, setPointerCapture: noop, releasePointerCapture: noop, focus: noop, click: noop,
    scrollIntoView: noop, remove: noop, append: (...c) => { el.children.push(...c); }, appendChild: (c) => { el.children.push(c); return c; },
    replaceChildren: (...c) => { el.children = c; }, querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 320, right: 320, bottom: 320 }),
    clientWidth: 320, clientHeight: 320,
  };
  if (cv) {
    Object.defineProperties(el, {
      width: { get: () => cv.width, set: (v) => { cv.width = v; } },
      height: { get: () => cv.height, set: (v) => { cv.height = v; } },
      px: { get: () => cv.px },
    });
    el.getContext = () => lenientCtx(cv.getContext('2d'));
    el.toDataURL = cv.toDataURL;
  }
  return el;
}
const CANVAS_IDS = new Set(['artCv', 'artPrev']);

function makeEditor(draft) {
  const store = new Map(), ids = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const $ = (id) => { if (!ids.has(id)) ids.set(id, fakeEl(CANVAS_IDS.has(id) ? 'canvas' : 'div')); return ids.get(id); };
  const document = { createElement: fakeEl };
  const T = loadModules(['personajes.js', 'fichas.js', 'base.js', 'luces.js', 'objetos3d.js', 'pixel.js', 'ui3d.js', 'arte-procedural.js', 'editor-arte.js'],
    { document, localStorage, Image: FakeImage, ImageData: FakeImageData, devicePixelRatio: 1 });
  const art = T.ArteProcedural({ THREE: fakeTHREE, Personajes: T.Personajes, Objetos3D: T.Objetos3D, Base: T.Base, getTEX: () => 32 });
  const timers = [];
  localStorage.setItem('tablero:artDraft', JSON.stringify(draft));
  const editor = T.EditorArte({
    $, icon: () => '', ui: T.UI({ $, icon: () => '' }), pixel: T.Pixel, art, Base: T.Base, Luces: T.Luces, Objetos3D: T.Objetos3D,
    Escena: { ROOF_MAT_IDS: ['tile', 'slate', 'thatch', 'shingle', 'copper'] }, Fichas: T.Fichas,
    getM: () => null, getENV: () => ({ ambient: 1 }), getTEX: () => 32, getDB: () => null, getDL: () => null, getSIN_E: () => 0.8, getCOS_E: () => 0.6,
    uniforms: { uMap: { value: null } }, rebuild: noop, buildDecor: noop, buildRoofs: noop, refreshEntities: noop, syncMinis: noop,
    renderPalette: noop, applyArtMaps: noop, layout: noop, showHint: noop,
    propOpts: () => [], setPropSel: noop, setMiniKind: noop, artSizeId: () => 'medium', stackThumb: () => fakeCanvas(8, 8),
    on: noop, every: (fn) => timers.push(fn), observe: noop,
  });
  return { editor, localStorage, timers };
}

// una casilla (g:top) de res×res con 2 capas y 2 cuadros; cada capa, una hoja con un patrón distinto por píxel
function tileRecord(res) {
  const sheet = (seed) => {
    const c = fakeCanvas(2 * res, res), x = c.getContext('2d'), img = x.createImageData(2 * res, res);
    // un píxel transparente es 0,0,0,0, como lo deja un lienzo de verdad
    for (let i = 0; i < img.data.length; i += 4) { const p = i / 4; if (p % 3) img.data.set([(p * 7 + seed) & 255, (p * 13 + seed * 3) & 255, (p * 5) & 255, 255], i); }
    x.putImageData(img, 0, 0); return c.toDataURL();
  };
  return { key: 'g:top', kind: 'tile', target: 'g:top', name: 'Prueba ' + res, res, w: res, h: res, light: false, lightSpec: null, count: 2, cols: 2,
    frameNames: ['Uno', 'Dos'], layers: [{ name: 'Fondo', vis: true, op: 100, lock: false, sheet: sheet(1) }, { name: 'Tinta', vis: false, op: 40, lock: true, sheet: sheet(9) }],
    updated: 1 };
}

for (const res of [16, 64]) {
  test(`borrador: docToRecord(recordToDoc(r)) devuelve r a res ${res} (res, tamaño, cuadros, capas y píxeles)`, async () => {
    const rec = tileRecord(res);
    const { editor, localStorage, timers } = makeEditor(rec);
    editor.open();
    await new Promise((ok) => setImmediate(ok));   // restoreDraft es asíncrona (decode de cada hoja)
    assert.ok(editor.isOpen());
    localStorage.removeItem('tablero:artDraft');
    assert.strictEqual(timers.length, 1, 'un temporizador: el del borrador');
    timers[0]();
    const back = JSON.parse(localStorage.getItem('tablero:artDraft'));
    assert.ok(back, 'el borrador recuperado queda sucio y se vuelve a guardar');
    assert.strictEqual(back.res, res);
    assert.ok(Number.isInteger(back.updated));
    assert.deepStrictEqual({ ...back, updated: 1 }, rec);
  });
}
