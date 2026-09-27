'use strict';
/* Construye en node la fábrica del arte procedural (arte-procedural.js, Tablero3D.ArteProcedural) con un lienzo de
   mentira y un THREE de mentira, para leer de lo que devuelve (paleta, CHARS, CHAR_ART, ROOF_*, TERR, CAN, selout…) en
   vez de recortar su texto. El lienzo guarda píxeles RGBA de verdad (fillRect, drawImage con escala y el volteo de
   mirror, getImageData/putImageData/createImageData, clearRect), así que CAN, el atlas y los sprites tienen los píxeles
   que pinta el motor; la fusión alfa es la «source-over» sin premultiplicar (aproximada en los píxeles semitransparentes
   de sombra y halo, que ningún test mira). THREE sólo guarda la imagen de cada textura.
   Se ejecuta en este mismo reino (runInThisContext), así que sus objetos se comparan con deepStrictEqual.
     loadArte({ TEX } | { getTEX }) → el objeto de la fábrica (TEX por defecto 32, el del motor al arrancar; getTEX para cambiarlo)
     fakeCanvas(w, h) → un lienzo suelto; `px` son sus píxeles */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MOD } = require('./engine');

// null si no es un color: el lienzo de verdad ignora un fillStyle no válido (drawDecor pinta alguna vez con G[6], undefined)
function parseColor(c) {
  if (typeof c !== 'string') return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).concat(255);
  const m = c.match(/^rgba?\(([^)]+)\)$/);
  if (!m) throw new Error('color desconocido: ' + c);
  const v = m[1].split(',').map(Number);
  return [v[0], v[1], v[2], Math.round((v.length > 3 ? v[3] : 1) * 255)];
}

function fakeCanvas(w0 = 300, h0 = 150) {
  let W = w0, H = h0, px = new Uint8ClampedArray(W * H * 4), fill = [0, 0, 0, 255], T = [1, 0, 0, 1, 0, 0];   // a b c d e f (sólo escala y traslación)
  const resize = () => { px = new Uint8ClampedArray(W * H * 4); };
  const blend = (o, s) => {
    const sa = s[3] / 255; if (sa <= 0) return;
    if (sa >= 1) { px[o] = s[0]; px[o + 1] = s[1]; px[o + 2] = s[2]; px[o + 3] = 255; return; }
    const da = px[o + 3] / 255, oa = sa + da * (1 - sa);
    for (let i = 0; i < 3; i++) px[o + i] = Math.round((s[i] * sa + px[o + i] * da * (1 - sa)) / oa);
    px[o + 3] = Math.round(oa * 255);
  };
  const dev = (x, y) => [Math.floor(T[0] * x + T[4]), Math.floor(T[3] * y + T[5])];
  const x = {
    imageSmoothingEnabled: true,
    set fillStyle(c) { fill = parseColor(c) || fill; },
    fillRect(a, b, rw, rh) {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
        const [X, Y] = dev(a + i + 0.5, b + j + 0.5); if (X >= 0 && Y >= 0 && X < W && Y < H) blend((Y * W + X) * 4, fill);
      }
    },
    clearRect(a, b, rw, rh) {
      for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
        const [X, Y] = dev(a + i + 0.5, b + j + 0.5); if (X >= 0 && Y >= 0 && X < W && Y < H) px.fill(0, (Y * W + X) * 4, (Y * W + X) * 4 + 4);
      }
    },
    translate(tx, ty) { T[4] += T[0] * tx; T[5] += T[3] * ty; },
    scale(sx, sy) { T[0] *= sx; T[3] *= sy; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(a, b, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const X = a + i, Y = b + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        data.set(px.subarray((Y * W + X) * 4, (Y * W + X) * 4 + 4), (j * w + i) * 4);
      }
      return { width: w, height: h, data };
    },
    putImageData(img, a = 0, b = 0) {
      for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
        const X = a + i, Y = b + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        px.set(img.data.subarray((j * img.width + i) * 4, (j * img.width + i) * 4 + 4), (Y * W + X) * 4);
      }
    },
    drawImage(src, ...a) {
      let sx = 0, sy = 0, sw = src.width, sh = src.height, dx, dy, dw = src.width, dh = src.height;
      if (a.length === 2) [dx, dy] = a; else if (a.length === 4) [dx, dy, dw, dh] = a; else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
      const sp = src.px;
      for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
        const [X, Y] = dev(dx + i + 0.5, dy + j + 0.5); if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const u = sx + Math.floor((i + 0.5) * sw / dw), v = sy + Math.floor((j + 0.5) * sh / dh);
        if (u < 0 || v < 0 || u >= src.width || v >= src.height) continue;
        const o = (v * src.width + u) * 4; blend((Y * W + X) * 4, [sp[o], sp[o + 1], sp[o + 2], sp[o + 3]]);
      }
    },
  };
  return {
    get width() { return W; }, set width(v) { W = v; resize(); },
    get height() { return H; }, set height(v) { H = v; resize(); },
    get px() { return px; },
    getContext: () => x,
  };
}

const fakeDocument = { createElement: (tag) => { if (tag !== 'canvas') throw new Error(tag); return fakeCanvas(); } };
class CanvasTexture { constructor(image) { this.image = image; } dispose() {} }
class BufferGeometry { setAttribute() {} computeBoundingSphere() {} dispose() {} }
class Float32BufferAttribute { constructor(a, n) { this.array = a; this.itemSize = n; } }
const fakeTHREE = { CanvasTexture, BufferGeometry, Float32BufferAttribute, NearestFilter: 1003 };

// personajes.js no es UMD y arte-procedural.js pide document: se ejecutan con window y document propios en este reino
const FILES = ['personajes.js', 'base.js', 'objetos3d.js', 'arte-procedural.js'];
function loadModules() {
  const src = FILES.map((f) => fs.readFileSync(path.join(MOD, f), 'utf8')).join('\n;\n');
  const win = {};
  // module a undefined: las colas UMD registran en window aunque quien llame tenga `module` (node -e)
  vm.runInThisContext(`(function(window,document,module){\n${src}\n})`, { filename: 'arte-procedural (helper)' })(win, fakeDocument, undefined);
  return win.Tablero3D;
}

function loadArte({ TEX = 32, getTEX = () => TEX } = {}) {
  const T = loadModules();
  return T.ArteProcedural({ THREE: fakeTHREE, Personajes: T.Personajes, Objetos3D: T.Objetos3D, Base: T.Base, getTEX });
}

module.exports = { loadArte, fakeCanvas };
