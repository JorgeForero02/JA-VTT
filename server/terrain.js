'use strict';
/* Módulo puro de terreno 2.5D: formato, generación de escenas de muestra y ops de edición.
   Sin dependencias de three, DOM ni red; se compara contra el cliente. */

const TERRAIN_LIMITS = {
  N_MIN: 22,
  N_MAX: 118,
  GROW_STEP: 8,
  H_MAX: 9,
  MAT_COUNT: 7,
  MAX_CELLS_PER_OP: 2000,
  MAX_SPRINGS: 64,
  MAX_SINKS: 512
};

const MATS = [
  { name: 'Pasto', swatch: '#6aab45' },
  { name: 'Piedra', swatch: '#8b8f94' },
  { name: 'Arena', swatch: '#e2cf8f' },
  { name: 'Camino', swatch: '#a88b62' },
  { name: 'Losas', swatch: '#61656c' },
  { name: 'Corte', swatch: '#2f3237', hidden: true },
  { name: 'Quemado', swatch: '#3b2f28', scorch: true }
];

const OBJ_KINDS = {
  arbol: { move: 1, sight: 1 },
  pino: { move: 1, sight: 1 },
  columna: { move: 1, sight: 1 },
  puerta: { move: 1, sight: 1, fixed: 1, door: 1 },
  valla: { move: 1, fixed: 1 },
  barril: { move: 1 },
  barrilx: { move: 1, explosive: 'media' },
  caja: { move: 1 },
  cofre: { move: 1 },
  baul: { move: 1 },
  mesa: { move: 1 },
  taburete: { move: 0 },
  estante: { move: 1, fixed: 1 },
  lapida: { move: 1, fixed: 1 },
  cruz: { move: 1, fixed: 1 },
  estandarte: { move: 1, fixed: 1, mount: 1 },
  estandarte2: { move: 1, fixed: 1, mount: 1 },
  fuente: { mountOnly: 1 },
  grieta: { mountOnly: 1 },
  limo: { mountOnly: 1 },
  craneo: { move: 0 },
  pocion: { move: 0 },
  pinchos: { move: 0, flat: 1 }
};

const BORDERS = {
  valle: (ax, az) => ({ h: Math.max(1, Math.min(6, Math.round(2.6 + .55 * Math.sin(ax * .33 + .5) + .55 * Math.cos(az * .29) + .4 * Math.sin((ax - az) * .17)))), m: 0 }),
  cripta: () => ({ h: 5, m: 1 }),
  blank: () => ({ h: 1, m: 0 })
};

const SCENE_INFO = {
  valle: { randomTrees: true, tufts: true },
  cripta: { randomTrees: false, tufts: false },
  blank: { randomTrees: false, tufts: false }
};

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const I = (x, z, N) => z * N + x;
const cxOf = (i, N) => i % N;
const czOf = (i, N) => Math.floor(i / N);
const inb = (x, z, N) => x >= 0 && z >= 0 && x < N && z < N;

function blankTerrain(n, h = 1, m = 0) {
  return {
    n,
    h: new Uint8Array(n * n).fill(h),
    m: new Uint8Array(n * n).fill(m),
    chan: new Uint8Array(n * n),
    extras: {
      objs: {},
      mounts: {},
      springs: [],
      sinks: [],
      pools: [],
      evap: 0.0012,
      edgeDrain: true,
      cutOn: false,
      cutH: 3,
      scene: 'blank',
      off: 0
    },
    version: 0
  };
}

function buildValle(N) {
  const CELLS = N * N;
  const H = new Uint8Array(CELLS).fill(1);
  const M = new Uint8Array(CELLS).fill(0);
  const W = new Float32Array(CELLS);
  const chan = new Uint8Array(CELLS);

  const blank = (h, m) => {
    H.fill(h);
    M.fill(m);
    W.fill(0);
    chan.fill(0);
  };
  const carveLine = (x0, z0, x1, z1) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    const cells = [[x0, z0]];
    let px = x0, pz = z0;
    for (let s = 1; s <= steps; s++) {
      const x = Math.round(x0 + (x1 - x0) * s / steps);
      const z = Math.round(z0 + (z1 - z0) * s / steps);
      if (x !== px && z !== pz) cells.push([x, pz]);
      cells.push([x, z]);
      px = x; pz = z;
    }
    let prev = 99;
    for (const [x, z] of cells) {
      const i = I(x, z, N);
      let h = Math.max(1, H[i] - 1);
      if (h > prev) h = prev;
      H[i] = h;
      prev = h;
      M[i] = 2;
      chan[i] = 1;
    }
  };

  blank(1, 0);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const h = 3.6 - (x + z) / (2 * N) * 2.2 + Math.sin(x * 0.7) * 0.35 + Math.cos(z * 0.55 + 1) * 0.35;
      H[I(x, z, N)] = Math.max(1, Math.min(TERRAIN_LIMITS.H_MAX, Math.round(h)));
    }
  }
  for (let z = 0; z <= 6; z++) {
    for (let x = 0; x <= 7; x++) {
      if ((x === 7 && z === 6) || (x === 0 && z === 6)) continue;
      H[I(x, z, N)] = 6;
      M[I(x, z, N)] = 1;
    }
  }
  H[I(1, 0, N)] = 7; H[I(2, 0, N)] = 7; H[I(0, 1, N)] = 7;
  for (const z of [2, 3]) {
    H[I(8, z, N)] = 5; H[I(9, z, N)] = 4; H[I(10, z, N)] = 3;
    M[I(8, z, N)] = M[I(9, z, N)] = M[I(10, z, N)] = 3;
  }
  for (let z = 2; z <= 9; z++) {
    const i = I(11, z, N);
    H[i] = Math.min(H[i], 3);
    M[i] = 3;
  }
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - 15, z - 15);
      const i = I(x, z, N);
      if (d < 3.2) {
        H[i] = 1; M[i] = 2; W[i] = 1; chan[i] = 1;
      } else if (d < 4.4) {
        H[i] = Math.min(H[i], 2); M[i] = 2;
      }
    }
  }
  for (const z of [4, 5, 6]) {
    H[I(4, z, N)] = 5;
    M[I(4, z, N)] = 1;
    chan[I(4, z, N)] = 1;
  }
  carveLine(4, 7, 12, 13);
  for (let i = 0; i < CELLS; i++) {
    if (!chan[i] || W[i] > 0) continue;
    const x = cxOf(i, N), z = czOf(i, N);
    if (z <= 6 && x <= 7) continue;
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (!inb(nx, nz, N)) continue;
      const j = I(nx, nz, N);
      if (!chan[j] && H[j] < H[i] + 1) H[j] = Math.min(TERRAIN_LIMITS.H_MAX, H[i] + 1);
    }
  }
  const lake = [];
  for (let i = 0; i < CELLS; i++) {
    if (W[i] > 0) lake.push({ cell: i, level: 1.88 });
  }
  for (let z = 1; z <= 4; z++) {
    for (let x = 15; x <= 18; x++) M[I(x, z, N)] = 3;
  }

  return {
    n: N,
    h: H,
    m: M,
    chan,
    extras: {
      springs: [{ cell: I(4, 4, N), rate: 0.07, cap: 0.6 }],
      sinks: lake,
      pools: lake.map(s => ({ cell: s.cell, level: 1 })),
      evap: 0.0012,
      edgeDrain: true,
      cutOn: false,
      cutH: 3
    },
    fixedObjs: [
      ['pino', 1, 5], ['pino', 6, 0], ['pino', 0, 2], ['arbol', 19, 6], ['arbol', 3, 12], ['pino', 2, 17], ['arbol', 8, 19], ['pino', 20, 5],
      ['cofre', 1, 3], ['barrilx', 13, 3], ['barrilx', 14, 4],
      ['barril', 12, 3], ['barril', 12, 4], ['caja', 10, 5], ['valla', 12, 7, 1], ['valla', 12, 8, 1], ['valla', 12, 9, 1],
      ['lapida', 15, 2, 0], ['lapida', 17, 2, 0], ['cruz', 16, 1, 0], ['cruz', 18, 3, 0], ['craneo', 16, 4],
      ['taburete', 5, 15], ['taburete', 7, 16], ['mesa', 6, 17]
    ],
    fixedMounts: [
      ['estandarte', 7, 1, 0], ['estandarte2', 2, 6, 2], ['limo', 6, 6, 2]
    ],
    randomTrees: true,
    tufts: true
  };
}

function buildCripta(N) {
  const CELLS = N * N;
  const H = new Uint8Array(CELLS).fill(5);
  const M = new Uint8Array(CELLS).fill(1);
  const W = new Float32Array(CELLS);
  const chan = new Uint8Array(CELLS);

  const blank = (h, m) => {
    H.fill(h);
    M.fill(m);
    W.fill(0);
    chan.fill(0);
  };
  const floor = (x0, z0, x1, z1, h, m) => {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        H[I(x, z, N)] = h || 2;
        M[I(x, z, N)] = m == null ? 4 : m;
      }
    }
  };

  blank(5, 1);
  floor(1, 15, 5, 20);
  floor(6, 17, 9, 17);
  floor(10, 13, 17, 20);
  floor(13, 8, 14, 12);
  floor(9, 1, 18, 7);
  floor(12, 1, 15, 2, 3);
  floor(7, 4, 8, 4);
  floor(1, 1, 6, 8);
  floor(2, 9, 2, 14);
  for (let x = 10; x <= 17; x++) {
    const i = I(x, 16, N);
    if (x === 13 || x === 14) { M[i] = 3; continue; }
    H[i] = 1; M[i] = 1; W[i] = 1; chan[i] = 1;
  }
  H[I(5, 6, N)] = 3; M[I(5, 6, N)] = 1;
  H[I(1, 20, N)] = 3; M[I(1, 20, N)] = 1;

  return {
    n: N,
    h: H,
    m: M,
    chan,
    extras: {
      springs: [],
      sinks: [],
      pools: [],
      evap: 0,
      edgeDrain: false,
      cutOn: true,
      cutH: 4
    },
    fixedObjs: [
      ['puerta', 7, 17], ['puerta', 8, 4], ['puerta', 2, 12],
      ['barril', 5, 15], ['barril', 5, 20], ['caja', 4, 20], ['craneo', 2, 16],
      ['pinchos', 8, 17],
      ['lapida', 11, 19, 0], ['lapida', 12, 20, 0], ['lapida', 16, 20, 0], ['cruz', 17, 19, 0], ['lapida', 11, 14, 0], ['cruz', 16, 13, 0], ['craneo', 12, 17], ['pocion', 17, 14],
      ['columna', 11, 4], ['columna', 16, 4], ['columna', 11, 6], ['columna', 16, 6],
      ['cofre', 13, 1], ['baul', 14, 1], ['craneo', 12, 5], ['craneo', 15, 6],
      ['barril', 5, 1], ['barril', 6, 2], ['barrilx', 6, 3], ['barrilx', 10, 6], ['caja', 1, 7], ['mesa', 4, 7], ['taburete', 3, 7], ['estante', 3, 1, 0], ['pocion', 4, 6]
    ],
    fixedMounts: [
      ['estandarte2', 4, 14, 2], ['estandarte', 10, 0, 2], ['estandarte', 17, 0, 2],
      ['fuente', 18, 18, 1], ['grieta', 12, 21, 3], ['limo', 11, 12, 2], ['grieta', 0, 4, 0], ['limo', 6, 0, 2]
    ],
    randomTrees: false,
    tufts: false
  };
}

function finalize(cfg) {
  const t = {
    n: cfg.n,
    h: cfg.h,
    m: cfg.m,
    chan: cfg.chan,
    extras: {
      objs: {},
      mounts: {},
      springs: cfg.extras.springs,
      sinks: cfg.extras.sinks,
      pools: cfg.extras.pools,
      evap: cfg.extras.evap,
      edgeDrain: cfg.extras.edgeDrain,
      cutOn: cfg.extras.cutOn,
      cutH: cfg.extras.cutH
    },
    version: 0
  };
  for (const [k, x, z, q] of cfg.fixedObjs) {
    t.extras.objs[I(x, z, cfg.n)] = { kind: k, rot: q == null ? null : q * Math.PI / 2 };
  }
  for (const [k, x, z, d] of cfg.fixedMounts) {
    const wall = I(x, z, cfg.n);
    t.extras.mounts[`${wall}:${d}`] = { kind: k, wall, dir: d };
  }
  const r = rng(2026);
  const cells = cfg.n * cfg.n;
  for (let i = 0; i < cells; i++) {
    if (t.m[i] !== 0 || t.chan[i] || t.extras.objs[i]) continue;
    if (cfg.randomTrees && r() < 0.05) {
      t.extras.objs[i] = { kind: r() < 0.5 ? 'arbol' : 'pino', rot: null };
    } else if (cfg.tufts && r() < 0.45) {
      // mata cosmética del cliente; no se persiste
    }
  }
  return t;
}

function generate(kind) {
  if (kind === 'valle') {
    const t = finalize(buildValle(TERRAIN_LIMITS.N_MIN));
    t.extras.scene = 'valle';
    t.extras.off = 0;
    return t;
  }
  if (kind === 'cripta') {
    const t = finalize(buildCripta(TERRAIN_LIMITS.N_MIN));
    t.extras.scene = 'cripta';
    t.extras.off = 0;
    return t;
  }
  throw new Error('Escena desconocida');
}

function encode(t) {
  return {
    n: t.n,
    h: Buffer.from(t.h.buffer, t.h.byteOffset, t.h.byteLength),
    m: Buffer.from(t.m.buffer, t.m.byteOffset, t.m.byteLength),
    chan: Buffer.from(t.chan.buffer, t.chan.byteOffset, t.chan.byteLength),
    extras: t.extras,
    version: t.version
  };
}

function decode(row) {
  return {
    n: row.n,
    h: new Uint8Array(row.h),
    m: new Uint8Array(row.m),
    chan: new Uint8Array(row.chan),
    extras: row.extras || {},
    version: row.version
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function cleanTerrainOp(op) {
  if (!op || typeof op !== 'object') return null;
  const out = {};
  if (Number.isInteger(op.version) && op.version >= 0) out.version = op.version;

  switch (op.type) {
    case 'cells': {
      if (!Array.isArray(op.cells)) return null;
      const cells = [];
      for (const e of op.cells) {
        if (!e || typeof e !== 'object') continue;
        if (!Number.isInteger(e.i) || e.i < 0) continue;
        const ent = { i: e.i };
        let has = false;
        if ('h' in e) {
          const h = Number(e.h);
          if (!Number.isNaN(h)) {
            ent.h = clamp(Math.round(h), 0, TERRAIN_LIMITS.H_MAX);
            has = true;
          }
        }
        if ('m' in e) {
          const m = Number(e.m);
          if (Number.isInteger(m) && m >= 0 && m < TERRAIN_LIMITS.MAT_COUNT) {
            ent.m = m;
            has = true;
          }
        }
        if (has) cells.push(ent);
      }
      if (cells.length === 0) return null;
      if (cells.length > TERRAIN_LIMITS.MAX_CELLS_PER_OP) return null;
      out.type = 'cells';
      out.cells = cells;
      return out;
    }
    case 'grow': {
      const pad = Number(op.pad);
      if (!Number.isInteger(pad)) return null;
      if (pad < 8 || pad > 48) return null;
      if (pad % TERRAIN_LIMITS.GROW_STEP !== 0) return null;
      out.type = 'grow';
      out.pad = pad;
      return out;
    }
    case 'obj': {
      if (!Number.isInteger(op.i) || op.i < 0) return null;
      const kind = op.kind === null ? null : op.kind;
      if (kind !== null && !OBJ_KINDS[kind]) return null;
      out.type = 'obj';
      out.i = op.i;
      out.kind = kind;
      out.rot = typeof op.rot === 'number' ? op.rot : null;
      if ('locked' in op && typeof op.locked === 'boolean') out.locked = op.locked;
      return out;
    }
    case 'door': {
      if (!Number.isInteger(op.i) || op.i < 0) return null;
      out.type = 'door';
      out.i = op.i;
      out.open = !!op.open;
      return out;
    }
    case 'mount': {
      if (typeof op.key !== 'string') return null;
      const m = /^(\d+):(\d)$/.exec(op.key);
      if (!m) return null;
      const dir = Number(m[2]);
      if (dir < 0 || dir > 3) return null;
      const kind = op.kind === null ? null : op.kind;
      if (kind !== null) {
        const K = OBJ_KINDS[kind];
        if (!K || (!K.mount && !K.mountOnly)) return null;
      }
      out.type = 'mount';
      out.key = op.key;
      out.kind = kind;
      return out;
    }
    case 'water': {
      const springs = [];
      if (Array.isArray(op.springs)) {
        for (const s of op.springs) {
          if (!s || typeof s !== 'object') continue;
          if (!Number.isInteger(s.cell) || s.cell < 0) continue;
          springs.push({
            cell: s.cell,
            rate: clamp(Number(s.rate) || 0, 0, 1),
            cap: clamp(Number(s.cap) || 0, 0, 2)
          });
        }
      }
      if (springs.length > TERRAIN_LIMITS.MAX_SPRINGS) return null;
      const sinks = [];
      if (Array.isArray(op.sinks)) {
        for (const s of op.sinks) {
          if (!s || typeof s !== 'object') continue;
          if (!Number.isInteger(s.cell) || s.cell < 0) continue;
          const ent = { cell: s.cell, level: clamp(Number(s.level) || 0, 0, 10) };
          if ('user' in s) ent.user = !!s.user;
          sinks.push(ent);
        }
      }
      if (sinks.length > TERRAIN_LIMITS.MAX_SINKS) return null;
      out.type = 'water';
      out.springs = springs;
      out.sinks = sinks;
      out.evap = clamp(Number(op.evap) || 0, 0, 0.05);
      out.edgeDrain = !!op.edgeDrain;
      return out;
    }
    case 'settings': {
      let has = false;
      if ('style' in op && ['packs', 'pixel', 'pixel32', 'drawn'].includes(op.style)) {
        out.style = op.style; has = true;
      }
      if ('fogAlpha' in op && typeof op.fogAlpha === 'number') {
        out.fogAlpha = clamp(op.fogAlpha, 0, 1); has = true;
      }
      if ('mist' in op && typeof op.mist === 'number') {
        out.mist = clamp(op.mist, 0, 1); has = true;
      }
      if ('cutOn' in op && typeof op.cutOn === 'boolean') {
        out.cutOn = op.cutOn; has = true;
      }
      if ('cutH' in op && Number.isInteger(op.cutH)) {
        out.cutH = clamp(op.cutH, 1, 9); has = true;
      }
      if ('focus' in op && typeof op.focus === 'boolean') {
        out.focus = op.focus; has = true;
      }
      if ('autoGrow' in op && typeof op.autoGrow === 'boolean') {
        out.autoGrow = op.autoGrow; has = true;
      }
      if ('evap' in op && typeof op.evap === 'number') {
        out.evap = clamp(op.evap, 0, 0.05); has = true;
      }
      if ('edgeDrain' in op && typeof op.edgeDrain === 'boolean') {
        out.edgeDrain = op.edgeDrain; has = true;
      }
      if (!has) return null;
      out.type = 'settings';
      return out;
    }
    default:
      return null;
  }
}

function applyTerrainOp(t, op) {
  switch (op.type) {
    case 'cells': {
      const total = t.n * t.n;
      for (const c of op.cells) {
        if (c.i < 0 || c.i >= total) continue;
        if ('h' in c) t.h[c.i] = c.h;
        if ('m' in c) t.m[c.i] = c.m;
      }
      break;
    }
    case 'grow': {
      const pad = op.pad;
      const oN = t.n;
      if (oN + pad * 2 > TERRAIN_LIMITS.N_MAX) throw new Error('Tablero en su tamaño máximo');
      const re = (i) => (Math.floor(i / oN) + pad) * (oN + pad * 2) + (i % oN) + pad;
      const nN = oN + pad * 2;
      const nH = new Uint8Array(nN * nN).fill(1);
      const nM = new Uint8Array(nN * nN).fill(0);
      const nChan = new Uint8Array(nN * nN);
      for (let z = pad; z < nN - pad; z++) {
        for (let x = pad; x < nN - pad; x++) {
          const i = z * nN + x;
          const o = (z - pad) * oN + (x - pad);
          nH[i] = t.h[o];
          nM[i] = t.m[o];
          nChan[i] = t.chan[o];
        }
      }
      t.n = nN;
      t.h = nH;
      t.m = nM;
      t.chan = nChan;
      const newObjs = {};
      for (const [k, v] of Object.entries(t.extras.objs)) newObjs[re(Number(k))] = v;
      t.extras.objs = newObjs;
      const newMounts = {};
      for (const [, v] of Object.entries(t.extras.mounts)) {
        const wall = re(v.wall);
        newMounts[`${wall}:${v.dir}`] = { kind: v.kind, wall, dir: v.dir };
      }
      t.extras.mounts = newMounts;
      t.extras.springs = t.extras.springs.map(s => ({ ...s, cell: re(s.cell) }));
      t.extras.sinks = t.extras.sinks.map(s => ({ ...s, cell: re(s.cell) }));
      t.extras.pools = t.extras.pools.map(p => ({ ...p, cell: re(p.cell) }));
      const scene = t.extras.scene || 'valle';
      const oldOff = t.extras.off || 0;
      const off = oldOff + pad;
      t.extras.off = off;
      for (let z = 0; z < nN; z++) {
        for (let x = 0; x < nN; x++) {
          const ox = x - pad, oz = z - pad;
          if (ox >= 0 && oz >= 0 && ox < oN && oz < oN) continue;
          const i = z * nN + x;
          const b = BORDERS[scene](x - off, z - off);
          t.h[i] = b.h;
          t.m[i] = b.m;
        }
      }
      const info = SCENE_INFO[scene];
      const r = rng(oldOff * 131 + nN);
      for (let z = 0; z < nN; z++) {
        for (let x = 0; x < nN; x++) {
          const ox = x - pad, oz = z - pad;
          if (ox >= 0 && oz >= 0 && ox < oN && oz < oN) continue;
          const i = z * nN + x;
          if (t.m[i] !== 0) continue;
          if (info.randomTrees && r() < .06) t.extras.objs[i] = { kind: r() < .5 ? 'arbol' : 'pino', rot: null };
          else if (info.tufts && r() < .4) { r(); r(); }
        }
      }
      break;
    }
    case 'obj': {
      if (op.kind === null) {
        delete t.extras.objs[op.i];
      } else {
        const o = { kind: op.kind, rot: op.rot };
        if ('locked' in op) o.locked = op.locked;
        t.extras.objs[op.i] = o;
      }
      break;
    }
    case 'door': {
      const o = t.extras.objs[op.i];
      if (o && OBJ_KINDS[o.kind] && OBJ_KINDS[o.kind].door) {
        o.open = op.open;
      }
      break;
    }
    case 'mount': {
      if (op.kind === null) {
        delete t.extras.mounts[op.key];
      } else {
        const [wallStr, dirStr] = op.key.split(':');
        t.extras.mounts[op.key] = { kind: op.kind, wall: Number(wallStr), dir: Number(dirStr) };
      }
      break;
    }
    case 'water': {
      t.extras.springs = op.springs;
      t.extras.sinks = op.sinks;
      t.extras.evap = op.evap;
      t.extras.edgeDrain = op.edgeDrain;
      break;
    }
    case 'settings': {
      for (const key of Object.keys(op)) {
        if (key === 'type' || key === 'version') continue;
        t.extras[key] = op[key];
      }
      break;
    }
    default:
      throw new Error('Op de terreno desconocida');
  }
  t.version++;
  return t;
}

module.exports = {
  TERRAIN_LIMITS,
  MATS,
  OBJ_KINDS,
  BORDERS,
  SCENE_INFO,
  rng,
  blankTerrain,
  generate,
  encode,
  decode,
  cleanTerrainOp,
  applyTerrainOp
};
