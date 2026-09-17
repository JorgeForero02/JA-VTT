'use strict';
/* HTTP, API REST y tiempo real. Los tableros abiertos viven en memoria (`live`) y
   se vuelcan a PostgreSQL cada FLUSH_MS; cada tablero procesa sus mensajes en serie. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const db = require('./db');
const { q, tx, randCode, newSceneId, createBoard } = db;
const { hashPassword, verifyPassword, validPassword, MIN_PASSWORD } = require('./auth');
const { acceptUpgrade } = require('./ws');
const R = require('./rules');
const T = require('./terrain');
const dice = require('./dice');

const PUBLIC = path.resolve(__dirname, '..', 'public');
if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
  console.error(`\n  No encuentro la interfaz en ${PUBLIC}`);
  console.error('  Ejecuta el programa desde la carpeta just-another-vtt.\n');
  process.exit(1);
}
const MAX_BODY = 22 * 1024 * 1024;
const MAX_IMAGE = 15 * 1024 * 1024;
const BOARD_QUOTA = 500 * 1024 * 1024;
const FLUSH_MS = 400;
const SESSION_COOKIE = 'jav_session';
const SESSION_MAX_AGE = 31536000;
const IMAGE_CATEGORIES = ['board', 'prop', 'pc', 'npc'];
const CHAT_HISTORY = 100;
const FOG_PNG = 'data:image/png;base64,';
const FOG_RAW = 'base64:';   // 2.5D: bytes crudos por celda, no imagen
const CHAT_KEEP = 200;
const CHAT_MAX_TEXT = 500;

/* ---------------- utilidades HTTP ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, Object.assign({
    'Content-Type': isBuf ? 'application/octet-stream' : (typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'),
    'Content-Length': data.length,
  }, headers));
  res.end(data);
}
const fail = (res, status, error) => send(res, status, { error });
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('La petición es demasiado grande'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('JSON no válido'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const sessionCookie = (token) => `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
const clearedCookie = () => `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
async function userFrom(req) {
  const token = cookies(req)[SESSION_COOKIE];
  return token ? q.sessionUser(token) : null;
}
const publicUser = (u) => u && { id: u.id, name: u.name, color: u.color };
const normCode = (v) => (typeof v === 'string' ? v.replace(/[\s-]/g, '').toUpperCase() : null);
const sameCode = (a, b) => normCode(a) !== null && normCode(a) === normCode(b);
function cleanName(v) {
  const s = String(v || '').trim().replace(/\s+/g, ' ');
  if (s.length < 2 || s.length > 24) return null;
  if (!/^[\p{L}\p{N} ._-]+$/u.test(s)) return null;
  return s;
}
const memberOf = (boardId, uid) => q.member(boardId, uid);

/* ---------------- tableros en memoria ---------------- */
const CELL = 50;
const live = new Map();
let lastObjId = 0;
const newObjId = () => { let v = Date.now() * 1000 + Math.floor(Math.random() * 1000); if (v <= lastObjId) v = lastObjId + 1; lastObjId = v; return v; };

function makeScene(row, objects) {
  const settings = R.splitSettings(row.settings || {}).scene;
  return { id: row.id, name: row.name, sort: row.sort, settings: Object.assign({}, R.DEFAULT_SCENE, settings), objects, terrain: null, terrainDirty: false, dirty: new Set(), removed: new Set(), settingsDirty: false };
}
async function loadScene(row, mode) {
  const objects = new Map();
  for (const o of await q.sceneObjects(row.id)) objects.set(o.id, o);
  const sc = makeScene(row, objects);
  if (mode === '2.5d') {
    const tr = await q.terrain(row.id);
    sc.terrain = tr ? T.decode(tr) : T.generate('valle');
    if (!tr) sc.terrainDirty = true;
  }
  return sc;
}
async function openBoard(id) {
  const cached = live.get(id);
  if (cached) return cached;
  const row = await q.board(id);
  if (!row) return null;
  const boardSettings = R.splitSettings(row.settings || {}).board;
  const mode = boardSettings.mode || '2d';
  const scenes = new Map();
  for (const sr of await q.scenes(id)) scenes.set(sr.id, await loadScene(sr, mode));
  const b = {
    id, name: row.name, owner_id: row.owner_id, invite_code: row.invite_code,
    active: scenes.has(row.active_scene) ? row.active_scene : [...scenes.keys()][0],
    settings: Object.assign({}, R.DEFAULT_BOARD, boardSettings), settingsDirty: false,
    scenes, clients: new Set(), members: await q.members(id),
    flushing: false, chain: Promise.resolve(),
  };
  // otra petición pudo abrirlo mientras esperábamos
  if (live.has(id)) return live.get(id);
  live.set(id, b);
  return b;
}
/* Serializa el trabajo sobre un tablero: los mensajes de sus clientes no se solapan. */
function enqueue(b, work) {
  b.chain = b.chain.then(work).catch((e) => console.error('Error procesando el tablero', b.id, e));
  return b.chain;
}
async function refreshMembers(b) { b.members = await q.members(b.id); }
async function setMemberScene(b, uid, sceneId) {
  await q.setMemberScene(sceneId, b.id, uid);
  const m = b.members.find((x) => x.id === uid);
  if (m) m.scene_id = sceneId;
}

async function flush(b) {
  if (b.flushing) return;
  const pending = [];
  for (const sc of b.scenes.values()) {
    if (!sc.dirty.size && !sc.removed.size && !sc.settingsDirty && !sc.terrainDirty) continue;
    pending.push({ sc, removed: [...sc.removed], dirty: [...sc.dirty].map((id) => sc.objects.get(id)).filter(Boolean), settings: sc.settingsDirty ? Object.assign({}, sc.settings) : null, terrain: sc.terrainDirty ? sc.terrain : null });
    sc.dirty.clear(); sc.removed.clear(); sc.settingsDirty = false; sc.terrainDirty = false;
  }
  const boardSettings = b.settingsDirty ? Object.assign({}, b.settings) : null;
  b.settingsDirty = false;
  if (!pending.length && !boardSettings) return;
  b.flushing = true;
  try {
    await tx(async (t) => {
      for (const p of pending) {
        for (const id of p.removed) await t.deleteObject(b.id, id);
        for (const o of p.dirty) await t.upsertObject(b.id, o.id, p.sc.id, o.type, o);
        if (p.settings) await t.setSceneSettings(p.settings, p.sc.id);
        if (p.terrain) await t.upsertTerrain(p.sc.id, T.encode(p.terrain));
      }
      if (boardSettings) await t.setSettings(boardSettings, b.id);
      else await t.touchBoard(b.id);
    });
  } catch (e) {
    // se vuelve a marcar todo para reintentarlo en el siguiente ciclo
    for (const p of pending) { for (const id of p.removed) p.sc.removed.add(id); for (const o of p.dirty) p.sc.dirty.add(o.id); if (p.settings) p.sc.settingsDirty = true; if (p.terrain) p.sc.terrainDirty = true; }
    if (boardSettings) b.settingsDirty = true;
    throw e;
  } finally {
    b.flushing = false;
  }
}
async function flushAll() {
  for (const b of live.values()) {
    try { await flush(b); } catch (e) { console.error('No se pudo guardar el tablero', b.id, e.message); }
    if (!b.clients.size && !b.flushing) live.delete(b.id);
  }
}
const flushTimer = setInterval(flushAll, FLUSH_MS);

const sceneList = (b) => [...b.scenes.values()].sort((x, y) => x.sort - y.sort).map((s) => ({ id: s.id, name: s.name }));
function memberScenes(b) {
  const where = {};
  for (const m of b.members) where[m.id] = b.scenes.has(m.scene_id) ? m.scene_id : b.active;
  return where;
}
function onlineList(b) {
  const seen = new Map();
  for (const c of b.clients) seen.set(c.user.id, { id: c.user.id, name: c.user.name, color: c.user.color, role: c.role, scene: c.sceneId });
  return [...seen.values()];
}
function broadcast(b, msg, except, sceneId) {
  const s = JSON.stringify(msg);
  for (const c of b.clients) if (c !== except && (!sceneId || c.sceneId === sceneId)) c.ws.send(s);
}
function sendScenes(b) { broadcast(b, { t: 'scenes', scenes: sceneList(b), where: memberScenes(b), active: b.active, online: onlineList(b) }); }
const ownedCount = (b, uid) => { let n = 0; for (const sc of b.scenes.values()) for (const o of sc.objects.values()) if (o.type === 'token' && o.owner === uid) n++; return n; };

/* Ajustes que ve un cliente: la iniciativa nunca viaja dentro de settings a un jugador (va aparte, filtrada) */
function settingsFor(b, sc, role) {
  const all = Object.assign({}, sc.settings, b.settings);
  if (role !== 'gm') delete all.initiative;
  return all;
}
const initiativeFor = (b, c) => R.initiativeFor(b.settings, { role: c.role }, b.scenes.get(c.sceneId).objects.values());
function sendInitiative(b) { for (const c of b.clients) c.ws.send({ t: 'initiative', initiative: initiativeFor(b, c) }); }
async function chatHistory(b) { return (await q.recentChat(b.id, CHAT_HISTORY)).reverse(); }

function terrainFor(sc) {
  const t = sc.terrain;
  if (!t) return undefined;
  return {
    n: t.n,
    h: Buffer.from(t.h).toString('base64'),
    m: Buffer.from(t.m).toString('base64'),
    chan: Buffer.from(t.chan).toString('base64'),
    extras: t.extras,
    version: t.version
  };
}

async function stateFor(b, c) {
  const sc = b.scenes.get(c.sceneId);
  const member = { role: c.role, user_id: c.user.id };
  const pre = b.settings.mode === '2.5d' ? FOG_RAW : FOG_PNG;
  const fog = c.role === 'gm' ? [] : (await q.fogFor(sc.id, c.user.id)).map((r) => ({ cx: r.cx, cy: r.cy, data: pre + r.data.toString('base64') }));
  return {
    t: 'state',
    me: publicUser(c.user), role: c.role,
    board: { id: b.id, name: b.name, owner_id: b.owner_id, invite_code: c.role === 'gm' ? b.invite_code : undefined },
    scene: { id: sc.id, name: sc.name },
    scenes: sceneList(b), where: memberScenes(b), active: b.active,
    settings: settingsFor(b, sc, c.role),
    objects: [...sc.objects.values()].filter((o) => R.visibleTo(o, member, sc.settings)),
    members: b.members,
    online: onlineList(b),
    fog,
    terrain: terrainFor(sc),
    chat: await chatHistory(b),
    initiative: initiativeFor(b, c),
  };
}
async function sendState(b, c, extra) { c.ws.send(Object.assign(await stateFor(b, c), extra || {})); }
async function sendMembers(boardId) {
  const b = live.get(boardId);
  if (!b) return;
  await refreshMembers(b);
  broadcast(b, { t: 'members', members: b.members });
  sendScenes(b);
}

/* Punto de llegada: junto al portal de destino, del lado con más contenido; si no, el centro de la escena */
function arrivalPoints(sc, portalId, count) {
  const objs = [...sc.objects.values()];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const o of objs) { if (o.a) { add(o.a.x, o.a.y); add(o.b.x, o.b.y); } else if (Number.isFinite(o.x)) add(o.x, o.y); }
  const center = x0 === Infinity ? { x: 0, y: 0 } : { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  let base = center, dir = { x: 1, y: 0 };
  const portal = portalId != null ? sc.objects.get(portalId) : null;
  if (portal && portal.type === 'wall') {
    const m = { x: (portal.a.x + portal.b.x) / 2, y: (portal.a.y + portal.b.y) / 2 };
    const len = Math.hypot(portal.b.x - portal.a.x, portal.b.y - portal.a.y) || 1;
    let n = { x: -(portal.b.y - portal.a.y) / len, y: (portal.b.x - portal.a.x) / len };
    if ((center.x - m.x) * n.x + (center.y - m.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    base = { x: m.x + n.x * CELL * 0.9, y: m.y + n.y * CELL * 0.9 };
    dir = { x: (portal.b.x - portal.a.x) / len, y: (portal.b.y - portal.a.y) / len };
  }
  const snap = (p) => ({ x: Math.floor(p.x / CELL) * CELL + CELL / 2, y: Math.floor(p.y / CELL) * CELL + CELL / 2 });
  const pts = [];
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  for (let i = 0; pts.length < count; i++) {
    const row = Math.floor(i / offsets.length), k = offsets[i % offsets.length];
    const n = portal ? { x: -dir.y, y: dir.x } : { x: 0, y: 1 };
    const sign = portal ? Math.sign((base.x - (portal.a.x + portal.b.x) / 2) * n.x + (base.y - (portal.a.y + portal.b.y) / 2) * n.y) || 1 : 1;
    pts.push(snap({ x: base.x + dir.x * k * CELL + n.x * sign * row * CELL, y: base.y + dir.y * k * CELL + n.y * sign * row * CELL }));
  }
  return pts;
}

/* Lleva a un usuario (y sus fichas) a otra escena */
async function moveUser(b, uid, targetId, point) {
  const target = b.scenes.get(targetId);
  if (!target) return;
  for (const sc of b.scenes.values()) {
    if (sc.id === targetId) continue;
    const moved = [];
    for (const o of [...sc.objects.values()]) {
      if (o.type !== 'token' || o.owner !== uid) continue;
      sc.objects.delete(o.id); sc.dirty.delete(o.id);
      const t = Object.assign({}, o, point ? { x: point.x, y: point.y } : {});
      target.objects.set(t.id, t); target.dirty.add(t.id);
      moved.push(t);
    }
    if (moved.length) {
      broadcast(b, { t: 'ops', del: moved.map((o) => o.id) }, null, sc.id);
      for (const c of b.clients) if (c.sceneId === targetId && c.user.id !== uid) {
        const vis = moved.filter((o) => R.visibleTo(o, { role: c.role, user_id: c.user.id }, target.settings));
        if (vis.length) c.ws.send({ t: 'ops', up: vis, by: uid });
      }
    }
  }
  if (point) for (const o of target.objects.values()) if (o.type === 'token' && o.owner === uid && (o.x !== point.x || o.y !== point.y)) {
    o.x = point.x; o.y = point.y; target.dirty.add(o.id);
    broadcast(b, { t: 'ops', up: [o], by: uid }, null, targetId);
  }
  await setMemberScene(b, uid, targetId);
  for (const c of b.clients) if (c.user.id === uid) { c.sceneId = targetId; await sendState(b, c); }
}
async function gather(b, targetId, portalId) {
  const target = b.scenes.get(targetId);
  if (!target) return;
  const players = b.members.filter((m) => m.role !== 'gm');
  const pts = arrivalPoints(target, portalId, Math.max(1, players.length));
  for (const [i, m] of players.entries()) await moveUser(b, m.id, targetId, ownedCount(b, m.id) ? pts[i] : null);
  for (const m of b.members) if (m.role === 'gm') await moveUser(b, m.id, targetId, null);
  b.active = targetId; await q.setActiveScene(targetId, b.id);
  sendScenes(b);
}

async function handleOps(b, c, d) {
  if (d.scene && d.scene !== c.sceneId) return; // cambios de una escena que ya no está abierta
  const sc = b.scenes.get(c.sceneId);
  const gm = c.role === 'gm';
  const accepted = []; const corrections = []; const dels = [];
  for (const raw of Array.isArray(d.up) ? d.up.slice(0, 2000) : []) {
    const neu = R.sanitize(raw);
    if (!neu) continue;
    const old = sc.objects.get(neu.id) || null;
    if (old && old.type !== neu.type) { corrections.push(old); continue; }
    if (!old && [...b.scenes.values()].some((o) => o !== sc && o.objects.has(neu.id))) continue; // el id vive en otra escena
    const plans = gm ? 0 : [...sc.objects.values()].filter((o) => o.type === 'plan' && o.owner === c.user.id).length;
    const result = gm ? neu : R.playerUpsert(c.user.id, old, neu, b, ownedCount(b, c.user.id), plans);
    if (!result) { if (old) corrections.push(old); else dels.push(neu.id); continue; }
    sc.objects.set(result.id, result); sc.dirty.add(result.id); sc.removed.delete(result.id);
    accepted.push({ old, obj: result, changed: !R.sameObject(result, neu) });
  }
  const removed = [];
  if (gm && Array.isArray(d.del)) {
    for (const id of d.del.slice(0, 5000)) {
      if (!Number.isInteger(id) || !sc.objects.has(id)) continue;
      sc.objects.delete(id); sc.dirty.delete(id); sc.removed.add(id); removed.push(id);
    }
  } else if (Array.isArray(d.del) && d.del.length) {
    // un jugador solo puede borrar sus propios planos
    for (const id of d.del.slice(0, 500)) {
      const o = sc.objects.get(id);
      if (!o) continue;
      if (o.type === 'plan' && o.owner === c.user.id) { sc.objects.delete(id); sc.dirty.delete(id); sc.removed.add(id); removed.push(id); }
      else corrections.push(o);
    }
  }
  let resendPlayers = false, boardChanged = false;
  if (d.settings && gm) {
    const { board, scene } = R.boardSettingsPatch(d.settings);
    if ('plansReleased' in scene && scene.plansReleased !== sc.settings.plansReleased) resendPlayers = true;
    const bsBefore = JSON.stringify(b.settings);
    Object.assign(sc.settings, scene); sc.settingsDirty = true;
    Object.assign(b.settings, board);
    if (JSON.stringify(b.settings) !== bsBefore) { b.settingsDirty = true; boardChanged = true; }
  }
  const back = corrections.filter(Boolean);
  for (const a of accepted) if (a.changed) back.push(a.obj);
  if (back.length || dels.length || (d.settings && !gm)) {
    c.ws.send({ t: 'ops', up: back, del: dels, settings: d.settings && !gm ? settingsFor(b, sc, c.role) : undefined, fix: true });
  }
  for (const other of b.clients) {
    if (other === c) continue;
    if (other.sceneId !== c.sceneId) {
      if (boardChanged) other.ws.send({ t: 'ops', settings: settingsFor(b, b.scenes.get(other.sceneId), other.role) });
      continue;
    }
    const member = { role: other.role, user_id: other.user.id };
    if (resendPlayers && other.role !== 'gm') { await sendState(b, other); continue; }
    const up = [], del = [...removed];
    for (const a of accepted) {
      const vis = R.visibleTo(a.obj, member, sc.settings);
      if (vis) up.push(a.obj);
      else if (!a.old || R.visibleTo(a.old, member, sc.settings)) del.push(a.obj.id);
    }
    const settings = d.settings && gm ? settingsFor(b, sc, other.role) : undefined;
    if (up.length || del.length || settings) other.ws.send({ t: 'ops', up, del, settings, by: c.user.id });
  }
  if (boardChanged) sendInitiative(b); // mostrar u ocultar la iniciativa cambia lo que ve cada jugador
}

/* ---------------- chat, dados e iniciativa ---------------- */
async function postChat(b, c, kind, body) {
  const row = await q.insertChat(b.id, c.user.id, kind, body);
  const msg = { id: row.id, user_id: c.user.id, user_name: c.user.name, user_color: c.user.color, kind, body, created_at: row.created_at };
  broadcast(b, { t: 'chat', msg });
  if (row.id % 50 === 0) await q.trimChat(b.id, CHAT_KEEP);
}
/* Chat y dados se apagan para todo el mundo, director incluido: así nadie los ve */
async function handleChat(b, c, d) {
  if (b.settings.chatEnabled === false) return c.ws.send({ t: 'error', error: 'El chat está desactivado en este tablero' });
  const text = R.str(d.text, CHAT_MAX_TEXT).trim();
  if (!text) return;
  await postChat(b, c, 'text', { text });
}
/* Tirada privada del director: sólo la reciben sus propias pantallas y no se guarda */
async function handleRoll(b, c, d) {
  if (b.settings.diceEnabled === false) return c.ws.send({ t: 'error', error: 'Los dados están desactivados en este tablero' });
  let result;
  try { result = dice.roll(d.formula); } catch (e) { return c.ws.send({ t: 'error', error: e.message }); }
  const label = R.str(d.label, 60).trim();
  const body = Object.assign(result, label ? { label } : {});
  if (d.secret && c.role === 'gm') {
    const msg = { id: -Date.now(), user_id: c.user.id, user_name: c.user.name, user_color: c.user.color, kind: 'roll', body, created_at: Date.now(), secret: true };
    for (const other of b.clients) if (other.role === 'gm') other.ws.send({ t: 'chat', msg });
    return;
  }
  await postChat(b, c, 'roll', body);
}
async function handleInitiative(b, c, d) {
  if (c.role !== 'gm') return;
  b.settings.initiative = R.cleanInitiative(d.initiative);
  b.settingsDirty = true;
  sendInitiative(b);
}

async function handleReplace(b, c, d) {
  if (c.role !== 'gm' || (d.scene && d.scene !== c.sceneId)) return;
  const sc = b.scenes.get(c.sceneId);
  // las fichas de jugadores que estén en otras escenas no se tocan
  const elsewhere = new Set();
  for (const o of b.scenes.values()) if (o !== sc) for (const id of o.objects.keys()) elsewhere.add(id);
  const objs = (Array.isArray(d.objects) ? d.objects : []).map(R.sanitize).filter((o) => o && !elsewhere.has(o.id)).slice(0, 20000);
  sc.objects.clear();
  for (const o of objs) sc.objects.set(o.id, o);
  if (d.settings) { const { board, scene } = R.boardSettingsPatch(d.settings); Object.assign(sc.settings, scene); Object.assign(b.settings, board); b.settingsDirty = true; }
  if (typeof d.name === 'string' && d.name.trim()) { sc.name = R.str(d.name, 60).trim(); await q.renameScene(sc.name, sc.id); }
  await tx(async (t) => {
    await t.clearSceneObjects(sc.id);
    for (const o of objs) await t.upsertObject(b.id, o.id, sc.id, o.type, o);
    await t.setSceneSettings(sc.settings, sc.id);
  });
  sc.dirty.clear(); sc.removed.clear(); sc.settingsDirty = false;
  for (const other of b.clients) if (other !== c && other.sceneId === sc.id) await sendState(b, other, { by: c.user.id, replaced: true });
  sendScenes(b);
}

const nextSort = (b) => Math.max(0, ...[...b.scenes.values()].map((s) => s.sort)) + 1;

async function handleScene(b, c, d) {
  if (c.role !== 'gm') return;
  switch (d.op) {
    case 'create': {
      const id = newSceneId();
      const sort = nextSort(b);
      const name = R.str(d.name, 60).trim() || `Escena ${b.scenes.size + 1}`;
      await q.insertScene(id, b.id, name, R.DEFAULT_SCENE, sort);
      const sc = makeScene({ id, name, sort, settings: {} }, new Map());
      if (b.settings.mode === '2.5d') { sc.terrain = T.blankTerrain(22); sc.terrainDirty = true; }
      b.scenes.set(id, sc);
      if (d.open) { c.sceneId = id; await setMemberScene(b, c.user.id, id); await sendState(b, c, { created: true }); }
      break;
    }
    case 'rename': {
      const sc = b.scenes.get(d.id); const name = R.str(d.name, 60).trim();
      if (sc && name) { sc.name = name; await q.renameScene(name, sc.id); }
      break;
    }
    case 'duplicate': {
      const src = b.scenes.get(d.id); if (!src) return;
      await flush(b);
      const id = newSceneId();
      const sort = nextSort(b);
      const name = R.str(`${src.name} (copia)`, 60);
      const groupMap = new Map();
      const copy = new Map();
      for (const o of src.objects.values()) {
        if (o.type === 'token' && o.owner != null) continue; // los personajes no se duplican
        const n = JSON.parse(JSON.stringify(o)); n.id = newObjId();
        if (n.group != null) { if (!groupMap.has(n.group)) groupMap.set(n.group, newObjId()); n.group = groupMap.get(n.group); }
        if (n.physics) { if (!groupMap.has(n.physics.group)) groupMap.set(n.physics.group, newObjId()); n.physics.group = groupMap.get(n.physics.group); }
        copy.set(n.id, n);
      }
      await tx(async (t) => {
        await t.insertScene(id, b.id, name, src.settings, sort);
        for (const o of copy.values()) await t.upsertObject(b.id, o.id, id, o.type, o);
      });
      const sc = makeScene({ id, name, sort, settings: src.settings }, copy);
      if (b.settings.mode === '2.5d' && src.terrain) {
        sc.terrain = {
          n: src.terrain.n,
          h: new Uint8Array(src.terrain.h),
          m: new Uint8Array(src.terrain.m),
          chan: new Uint8Array(src.terrain.chan),
          extras: JSON.parse(JSON.stringify(src.terrain.extras)),
          version: 0
        };
        sc.terrainDirty = true;
      }
      b.scenes.set(id, sc);
      break;
    }
    case 'delete': {
      const sc = b.scenes.get(d.id);
      if (!sc || b.scenes.size < 2) return c.ws.send({ t: 'error', error: 'Un tablero necesita al menos una escena' });
      const fallback = [...b.scenes.values()].find((s) => s.id !== sc.id);
      await flush(b);
      // quien estaba allí (y su personaje) pasa a otra escena
      const inside = Object.entries(memberScenes(b)).filter(([, sid]) => sid === sc.id).map(([uid]) => Number(uid));
      const pts = arrivalPoints(fallback, null, Math.max(1, inside.length));
      for (const [i, uid] of inside.entries()) await moveUser(b, uid, fallback.id, pts[i]);
      for (const cl of b.clients) if (cl.sceneId === sc.id) { cl.sceneId = fallback.id; await sendState(b, cl); }
      b.scenes.delete(sc.id);
      await q.deleteScene(sc.id);
      // los portales que llevaban allí se quedan sin destino
      for (const other of b.scenes.values()) {
        const fixed = [];
        for (const o of other.objects.values()) if (o.kind === 'portal' && o.target && o.target.scene === sc.id) { o.target = null; other.dirty.add(o.id); fixed.push(o); }
        if (fixed.length) broadcast(b, { t: 'ops', up: fixed, by: c.user.id }, null, other.id);
      }
      if (b.active === sc.id) { b.active = fallback.id; await q.setActiveScene(fallback.id, b.id); }
      break;
    }
    case 'view': {
      if (!b.scenes.has(d.id)) return;
      c.sceneId = d.id; await setMemberScene(b, c.user.id, d.id);
      await sendState(b, c);
      break;
    }
    case 'gather': if (b.scenes.has(d.id)) await gather(b, d.id, Number.isInteger(d.portal) ? d.portal : null); return;
    case 'send': {
      const uid = Number(d.user);
      const m = b.members.find((x) => x.id === uid);
      const target = b.scenes.get(d.id);
      if (!m || !target) return;
      await moveUser(b, uid, target.id, ownedCount(b, uid) ? arrivalPoints(target, null, 1)[0] : null);
      break;
    }
    case 'backlink': {
      const target = b.scenes.get(d.toScene);
      const portal = target && target.objects.get(d.toPortal);
      if (!portal || portal.kind !== 'portal' || !b.scenes.has(d.fromScene)) return;
      portal.target = { scene: d.fromScene, portal: Number.isInteger(d.fromPortal) ? d.fromPortal : null };
      target.dirty.add(portal.id);
      broadcast(b, { t: 'ops', up: [portal], by: c.user.id }, null, target.id);
      break;
    }
    case 'fogreset': {
      const sc = b.scenes.get(c.sceneId);
      await q.clearFog(sc.id);
      broadcast(b, { t: 'fogreset', scene: sc.id }, null, sc.id);
      return;
    }
    default: return;
  }
  sendScenes(b);
}

async function handleTravel(b, c, d) {
  const sc = b.scenes.get(c.sceneId);
  const portal = sc.objects.get(d.portal);
  if (!portal || portal.type !== 'wall' || portal.kind !== 'portal' || !portal.target || !b.scenes.has(portal.target.scene)) {
    return c.ws.send({ t: 'error', error: 'Ese portal no lleva a ninguna escena' });
  }
  const target = b.scenes.get(portal.target.scene);
  if (c.role === 'gm') {
    if (d.all) return gather(b, target.id, portal.target.portal);
    c.sceneId = target.id; await setMemberScene(b, c.user.id, target.id);
    await sendState(b, c); sendScenes(b);
    return;
  }
  const mine = [...sc.objects.values()].find((o) => o.type === 'token' && o.owner === c.user.id);
  if (mine) {
    const m = { x: (portal.a.x + portal.b.x) / 2, y: (portal.a.y + portal.b.y) / 2 };
    if (Math.hypot(mine.x - m.x, mine.y - m.y) > CELL * 3) return c.ws.send({ t: 'error', error: 'Acércate más al portal para cruzarlo' });
  }
  await moveUser(b, c.user.id, target.id, mine ? arrivalPoints(target, portal.target.portal, 1)[0] : null);
  sendScenes(b);
}

async function handleFog(b, c, d) {
  if (c.role === 'gm' || d.scene !== c.sceneId) return;
  if (!Number.isInteger(d.cx) || !Number.isInteger(d.cy) || Math.abs(d.cx) > 1e6 || Math.abs(d.cy) > 1e6) return;
  const raw = b.settings.mode === '2.5d';
  if (raw && (d.cx !== 0 || d.cy !== 0)) return;   // en 2.5D hay una sola fila por escena y usuario
  const pre = raw ? FOG_RAW : FOG_PNG;
  if (typeof d.data !== 'string' || !d.data.startsWith(pre)) return;
  const buf = Buffer.from(d.data.slice(pre.length), 'base64');
  if (!buf.length || buf.length > 400 * 1024) return;
  await q.upsertFog(c.sceneId, c.user.id, d.cx, d.cy, buf);
}

async function handleRename(b, c, d) {
  if (c.role !== 'gm') return;
  const name = R.str(d.name, 60).trim();
  if (!name) return;
  b.name = name; await q.renameBoard(name, b.id);
  broadcast(b, { t: 'board', name }, c);
}

async function handleTerrain(b, c, d) {
  const sc = b.scenes.get(d.scene);
  if (!sc || !sc.terrain || d.scene !== c.sceneId) return;
  if (d.want === 'full') { c.ws.send({ t: 'terrain', scene: sc.id, full: terrainFor(sc) }); return; }
  const op = R.cleanTerrainOp(d.op);
  const member = { role: c.role, user_id: c.user.id };
  if (!op || !R.terrainOpAllowed(member, op, b.settings, sc.terrain)) { c.ws.send({ t: 'terrain', scene: sc.id, fix: true, full: terrainFor(sc) }); return; }
  if (Number.isInteger(op.version) && op.version !== sc.terrain.version) { c.ws.send({ t: 'terrain', scene: sc.id, full: terrainFor(sc) }); return; }
  try { T.applyTerrainOp(sc.terrain, op); } catch (e) { c.ws.send({ t: 'terrain', scene: sc.id, fix: true, error: e.message, full: terrainFor(sc) }); return; }
  sc.terrainDirty = true;
  delete op.version;
  c.ws.send({ t: 'terrain', scene: sc.id, ack: true, version: sc.terrain.version });
  broadcast(b, { t: 'terrain', scene: sc.id, op, version: sc.terrain.version }, c, sc.id);
}

function handleMessage(b, c, d) {
  switch (d.t) {
    case 'ops': return handleOps(b, c, d);
    case 'replace': return handleReplace(b, c, d);
    case 'scene': return handleScene(b, c, d);
    case 'travel': return handleTravel(b, c, d);
    case 'fog': return handleFog(b, c, d);
    case 'rename': return handleRename(b, c, d);
    case 'terrain': return handleTerrain(b, c, d);
    case 'chat': return handleChat(b, c, d);
    case 'roll': return handleRoll(b, c, d);
    case 'initiative': return handleInitiative(b, c, d);
    case 'cursor':
      if (Number.isFinite(d.x) && Number.isFinite(d.y)) broadcast(b, { t: 'cursor', uid: c.user.id, x: d.x, y: d.y }, c, c.sceneId);
      else broadcast(b, { t: 'cursor', uid: c.user.id, x: null, y: null }, c);
      return;
    case 'ping': c.ws.send({ t: 'pong', at: d.at }); return;
    default: return;
  }
}

async function onSocket(ws, user, boardId) {
  const member = await memberOf(boardId, user.id);
  const b = member && await openBoard(boardId);
  if (!b) { ws.send({ t: 'error', error: 'No perteneces a este tablero' }); ws.close(4403); return; }
  const sceneId = b.scenes.has(member.scene_id) ? member.scene_id : b.active;
  const c = { ws, user, role: member.role, board: b, sceneId };
  b.clients.add(c);
  await enqueue(b, async () => { await sendState(b, c); sendScenes(b); });
  ws.on('message', (text) => {
    let d; try { d = JSON.parse(text); } catch { return; }
    if (!d || typeof d !== 'object') return;
    enqueue(b, () => handleMessage(b, c, d));
  });
  ws.on('close', () => {
    b.clients.delete(c);
    sendScenes(b);
    broadcast(b, { t: 'cursor', uid: user.id, x: null, y: null });
  });
}
const pingTimer = setInterval(() => {
  for (const b of live.values()) for (const c of b.clients) { if (!c.ws.alive) c.ws.close(1001); else c.ws.ping(); }
}, 25000);
function kick(boardId, uid) {
  const b = live.get(boardId);
  if (!b) return;
  for (const c of [...b.clients]) if (c.user.id === uid) { c.ws.send({ t: 'kicked' }); c.ws.close(4403); }
}

/* ---------------- API: cuentas ---------------- */
const INVALID_NAME = 'El nombre debe tener entre 2 y 24 letras, números, espacios, puntos o guiones';
async function register(req, res) {
  const body = await readJson(req);
  const name = cleanName(body.name);
  if (!name) return fail(res, 400, INVALID_NAME);
  if (!validPassword(body.password)) return fail(res, 400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  if (await q.userByName(name)) return fail(res, 409, 'Ese nombre de usuario ya está en uso');
  let user;
  try { user = await db.createUser(name, await hashPassword(body.password)); }
  catch (e) { if (e.code === '23505') return fail(res, 409, 'Ese nombre de usuario ya está en uso'); throw e; }
  const token = await db.createSession(user.id);
  return send(res, 201, { user: publicUser(user), recovery_code: user.recovery_code }, { 'Set-Cookie': sessionCookie(token) });
}
/* Contraseña nueva con nombre + código de recuperación. Cierra las demás sesiones. */
async function recover(req, res) {
  const body = await readJson(req);
  const name = cleanName(body.name);
  if (!validPassword(body.password)) return fail(res, 400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  const user = name ? await q.userByName(name) : null;
  if (!user || !user.recovery_code || !sameCode(body.code, user.recovery_code)) return fail(res, 401, 'Usuario o código de recuperación incorrectos');
  await q.setPassword(await hashPassword(body.password), user.id);
  await q.deleteUserSessions(user.id);
  const token = await db.createSession(user.id);
  return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token) });
}
/* Las cuentas anteriores a la migración 002 no tienen código: se les da uno al entrar o al mirar el perfil */
async function ensureRecoveryCode(user) {
  if (user.recovery_code) return user.recovery_code;
  user.recovery_code = db.newRecoveryCode();
  await q.setRecoveryCode(user.recovery_code, user.id);
  return user.recovery_code;
}
async function meRoutes(req, res, user, parts) {
  const M = req.method;
  if (parts[1] === 'recovery') {
    if (M === 'GET') return send(res, 200, { recovery_code: await ensureRecoveryCode(await q.userById(user.id)) });
    if (M === 'POST') { const code = db.newRecoveryCode(); await q.setRecoveryCode(code, user.id); return send(res, 200, { recovery_code: code }); }
  }
  if (parts[1] === 'password' && M === 'POST') {
    const body = await readJson(req);
    const full = await q.userById(user.id);
    if (!(await verifyPassword(body.current, full.password_hash))) return fail(res, 401, 'La contraseña actual no es correcta');
    if (!validPassword(body.password)) return fail(res, 400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
    await q.setPassword(await hashPassword(body.password), user.id);
    return send(res, 200, { ok: true });
  }
  if (parts[1]) return fail(res, 404, 'Ruta no encontrada');
  if (M === 'GET') return send(res, 200, { user: publicUser(user) });
  if (M === 'PATCH') {
    const body = await readJson(req);
    if (typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color)) await q.setColor(body.color, user.id);
    return send(res, 200, { user: publicUser(await q.userById(user.id)) });
  }
  return fail(res, 404, 'Ruta no encontrada');
}
async function login(req, res) {
  const body = await readJson(req);
  const name = cleanName(body.name);
  const user = name ? await q.userByName(name) : null;
  const ok = user ? await verifyPassword(body.password, user.password_hash) : false;
  if (!ok) return fail(res, 401, 'Usuario o contraseña incorrectos');
  await ensureRecoveryCode(user);
  const token = await db.createSession(user.id);
  return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token) });
}

/* ---------------- API: tableros e imágenes ---------------- */
function parseImageUpload(body, gm) {
  const category = IMAGE_CATEGORIES.includes(body.category) ? body.category : 'prop';
  if (!gm && category !== 'pc') return { error: [403, 'Los jugadores solo pueden subir retratos'] };
  const m = /^data:(image\/(png|jpeg|webp|gif));base64,/.exec(body.data || '');
  if (!m) return { error: [400, 'Formato de imagen no admitido (PNG, JPG, WebP o GIF)'] };
  const data = Buffer.from(body.data.slice(m[0].length), 'base64');
  if (data.length > MAX_IMAGE) return { error: [413, 'La imagen supera 15 MB'] };
  let thumb = null, thumbMime = null;
  const tm = /^data:(image\/(png|jpeg|webp));base64,/.exec(body.thumb || '');
  if (tm) { thumb = Buffer.from(body.thumb.slice(tm[0].length), 'base64'); thumbMime = tm[1]; }
  return {
    image: {
      id: 'img_' + crypto.randomBytes(9).toString('hex'),
      name: R.str(body.name, 40) || 'imagen', category, mime: m[1],
      width: Number.isInteger(body.width) ? body.width : 0, height: Number.isInteger(body.height) ? body.height : 0,
      ppc: Number.isFinite(body.ppc) && body.ppc > 0 ? body.ppc : 0,
      size: data.length, origin: 'local', data, thumb, thumbMime,
    },
  };
}

async function boardRoutes(req, res, user, parts) {
  const M = req.method;
  const id = parts[1];
  if (!id) {
    if (M === 'GET') return send(res, 200, { boards: await q.boardsForUser(user.id) });
    if (M === 'POST') {
      const body = await readJson(req);
      const name = R.str(body.name, 60).trim() || 'Tablero sin nombre';
      const mode = R.MODES.includes(body.mode) ? body.mode : '2d';
      const b = await createBoard(name, user.id, mode);
      return send(res, 201, { board: { id: b.id, name: b.name, mode } });
    }
    return fail(res, 404, 'Ruta no encontrada');
  }
  const board = await q.board(id);
  const me = board && await memberOf(id, user.id);
  if (!board || !me) return fail(res, 404, 'Tablero no encontrado');
  const gm = me.role === 'gm';
  const sub = parts[2];
  if (!sub) {
    if (M === 'GET') return send(res, 200, { board: { id: board.id, name: board.name, owner_id: board.owner_id, role: me.role, mode: (board.settings && board.settings.mode) || '2d', invite_code: gm ? board.invite_code : undefined } });
    if (M === 'PATCH' && gm) {
      const body = await readJson(req);
      const name = R.str(body.name, 60).trim();
      if (name) { await q.renameBoard(name, id); const b = live.get(id); if (b) { b.name = name; broadcast(b, { t: 'board', name }); } }
      return send(res, 200, { ok: true });
    }
    if (M === 'DELETE') {
      if (board.owner_id === user.id) {
        const b = live.get(id);
        if (b) { for (const c of [...b.clients]) { c.ws.send({ t: 'kicked', deleted: true }); c.ws.close(4403); } live.delete(id); }
        await q.deleteBoard(id);
        return send(res, 200, { ok: true });
      }
      await q.removeMember(id, user.id); kick(id, user.id); await sendMembers(id);
      return send(res, 200, { ok: true, left: true });
    }
  }
  if (sub === 'members') {
    if (M === 'GET') return send(res, 200, { members: await q.members(id) });
    if (M === 'POST' && gm) {
      const body = await readJson(req);
      const name = cleanName(body.name);
      if (!name) return fail(res, 400, 'Nombre de usuario no válido');
      const u = await q.userByName(name);
      if (!u) return fail(res, 404, 'Ese usuario no existe: tiene que registrarse antes');
      await q.addMember(id, u.id, 'player');
      await sendMembers(id);
      return send(res, 200, { members: await q.members(id) });
    }
    if (M === 'DELETE' && gm && parts[3]) {
      const uid = Number(parts[3]);
      if (uid === board.owner_id) return fail(res, 400, 'El director no puede salir de su propio tablero');
      await q.removeMember(id, uid); kick(id, uid); await sendMembers(id);
      return send(res, 200, { members: await q.members(id) });
    }
  }
  if (sub === 'scenes' && parts[3] && parts[4] === 'portals' && M === 'GET') {
    const b = await openBoard(id);
    const sc = b && b.scenes.get(parts[3]);
    if (!sc) return fail(res, 404, 'Escena no encontrada');
    const portals = [...sc.objects.values()].filter((o) => o.type === 'wall' && o.kind === 'portal').map((o) => ({ id: o.id, name: o.name || '', target: o.target || null }));
    return send(res, 200, { scene: { id: sc.id, name: sc.name }, portals });
  }
  if (sub === 'invite' && M === 'POST' && gm) {
    let code = randCode(6);
    while (await q.boardByCode(code)) code = randCode(6);
    await q.setInvite(code, id);
    const b = live.get(id); if (b) b.invite_code = code;
    return send(res, 200, { invite_code: code });
  }
  if (sub === 'images') {
    if (M === 'GET') {
      const u = await q.boardUsage(id);
      return send(res, 200, { images: await q.imagesForBoard(id), usage: { count: u.count, bytes: u.bytes, quota: BOARD_QUOTA } });
    }
    if (M === 'POST') {
      const parsed = parseImageUpload(await readJson(req), gm);
      if (parsed.error) return fail(res, ...parsed.error);
      const usage = await q.boardUsage(id);
      if (usage.bytes + parsed.image.size > BOARD_QUOTA) return fail(res, 413, 'El almacén del tablero está lleno');
      await q.insertImage(Object.assign(parsed.image, { boardId: id, ownerId: user.id }));
      const b = live.get(id); if (b) broadcast(b, { t: 'images' });
      return send(res, 201, { image: await q.imageMeta(parsed.image.id) });
    }
  }
  return fail(res, 404, 'Ruta no encontrada');
}

async function imageRoutes(req, res, user, parts) {
  const M = req.method;
  const imgRow = await q.imageMeta(parts[1]);
  if (!imgRow) return fail(res, 404, 'Imagen no encontrada');
  const me = imgRow.board_id ? await memberOf(imgRow.board_id, user.id) : { role: 'player' };
  if (!me) return fail(res, 403, 'Sin acceso a esta imagen');
  if (M === 'GET') {
    const cache = { 'Cache-Control': 'private, max-age=86400' };
    if (parts[2] === 'thumb') {
      const r = await q.imageThumb(parts[1]);
      return r.thumb ? send(res, 200, r.thumb, Object.assign({ 'Content-Type': r.thumb_mime }, cache)) : send(res, 200, r.data, Object.assign({ 'Content-Type': r.mime }, cache));
    }
    const r = await q.imageData(parts[1]);
    return send(res, 200, r.data, Object.assign({ 'Content-Type': r.mime }, cache));
  }
  if (!imgRow.board_id) return fail(res, 403, 'Esta imagen no pertenece a ningún tablero');
  if (me.role !== 'gm') return fail(res, 403, 'Solo el director puede cambiar la biblioteca');
  if (M === 'PATCH') {
    const body = await readJson(req);
    const name = R.str(body.name, 40).trim() || imgRow.name;
    const category = IMAGE_CATEGORIES.includes(body.category) ? body.category : imgRow.category;
    const ppc = Number.isFinite(body.ppc) && body.ppc > 0 ? body.ppc : imgRow.ppc;
    await q.updateImage(name, category, ppc, imgRow.id);
    const b = live.get(imgRow.board_id); if (b) broadcast(b, { t: 'images' });
    return send(res, 200, { image: await q.imageMeta(imgRow.id) });
  }
  if (M === 'DELETE') {
    await q.deleteImage(imgRow.id);
    const b = live.get(imgRow.board_id); if (b) broadcast(b, { t: 'images' });
    return send(res, 200, { ok: true });
  }
  return fail(res, 404, 'Ruta no encontrada');
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // sin "api"
  const M = req.method;
  if (M === 'GET' && parts[0] === 'health') return send(res, 200, { ok: true });
  if (M === 'POST' && parts[0] === 'register') return register(req, res);
  if (M === 'POST' && parts[0] === 'login') return login(req, res);
  if (M === 'POST' && parts[0] === 'recover') return recover(req, res);
  const user = await userFrom(req);
  if (!user) return fail(res, 401, 'Inicia sesión');

  if (parts[0] === 'logout' && M === 'POST') {
    await q.deleteSession(cookies(req)[SESSION_COOKIE]);
    return send(res, 200, { ok: true }, { 'Set-Cookie': clearedCookie() });
  }
  if (parts[0] === 'me') return meRoutes(req, res, user, parts);
  if (parts[0] === 'join' && M === 'POST') {
    const body = await readJson(req);
    const code = String(body.code || '').trim().toUpperCase();
    const b = await q.boardByCode(code);
    if (!b) return fail(res, 404, 'Ese código de invitación no existe');
    await q.addMember(b.id, user.id, 'player');
    await sendMembers(b.id);
    return send(res, 200, { board: { id: b.id, name: b.name } });
  }
  if (parts[0] === 'boards') return boardRoutes(req, res, user, parts);
  if (parts[0] === 'images' && parts[1]) return imageRoutes(req, res, user, parts);
  return fail(res, 404, 'Ruta no encontrada');
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.resolve(PUBLIC, '.' + p);
  const rel = path.relative(PUBLIC, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return fail(res, 403, 'Prohibido');
  fs.readFile(file, (err, data) => {
    if (err) {
      if (!path.extname(p)) return serveStatic(req, res, new URL('/index.html', url));
      return send(res, 404, `Just Another VTT: no existe ${url.pathname}`);
    }
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Error interno del servidor');
    if (!e.status) console.error(`Error en ${req.method} ${url.pathname}:`, e);
  }
});
server.on('upgrade', async (req, sock) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname !== '/ws') return sock.destroy();
  try {
    const user = await userFrom(req);
    if (!user) { sock.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
    const ws = acceptUpgrade(req, sock);
    if (ws) await onSocket(ws, user, url.searchParams.get('board') || '');
  } catch (e) {
    console.error('Error aceptando WebSocket:', e);
    sock.destroy();
  }
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

async function prepare() {
  const applied = await db.migrate();
  if (applied.length) console.log(`  Migraciones aplicadas: ${applied.join(', ')}`);
}

function listen(port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve(server.address().port));
  });
}

async function start(port) {
  await prepare();
  const bound = await listen(port);
  console.log('\n  Just Another VTT está en marcha\n');
  console.log(`  En este equipo:      http://localhost:${bound}`);
  for (const ip of lanAddresses()) console.log(`  En tu red local:     http://${ip}:${bound}`);
  console.log('  Para detenerlo pulsa Ctrl+C.\n');
  return bound;
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(flushTimer); clearInterval(pingTimer);
  for (const b of live.values()) for (const c of [...b.clients]) c.ws.close(1001);
  await flushAll();
  live.clear();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
}
async function shutdown(signal) {
  console.log(`\n  Recibido ${signal}: guardando y cerrando…`);
  try { await stop(); process.exit(0); }
  catch (e) { console.error('Error al cerrar:', e); process.exit(1); }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { start, stop, prepare, listen, server, live, flushAll };
