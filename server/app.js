'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { q, tx, now, randCode, newSceneId, loginOrCreate, ensureUser, createBoard, seedSamples, DB_FILE } = require('./db');
const { acceptUpgrade } = require('./ws');
const R = require('./rules');

const PUBLIC = path.resolve(__dirname, '..', 'public');
if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
  console.error(`\n  No encuentro la interfaz en ${PUBLIC}`);
  console.error('  Descomprime el zip completo y ejecuta el programa desde la carpeta just-another-vtt.\n');
  process.exit(1);
}
const MAX_BODY = 22 * 1024 * 1024;
const MAX_IMAGE = 15 * 1024 * 1024;
const BOARD_QUOTA = 500 * 1024 * 1024;

seedSamples(path.join(PUBLIC, 'muestras'));

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
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const userFrom = (req) => { const t = cookies(req).jav_session; return t ? q.sessionUser.get(t) || null : null; };
const publicUser = (u) => u && { id: u.id, name: u.name, color: u.color };
function cleanName(v) {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (s.length < 2 || s.length > 24) return null;
  if (!/^[\p{L}\p{N} ._-]+$/u.test(s)) return null;
  return s;
}
const memberOf = (boardId, uid) => q.member.get(boardId, uid) || null;

/* ---------------- tableros en memoria ---------------- */
const CELL = 50;
const live = new Map();
let lastObjId = 0;
const newObjId = () => { let v = Date.now() * 1000 + Math.floor(Math.random() * 1000); if (v <= lastObjId) v = lastObjId + 1; lastObjId = v; return v; };

function loadScene(row) {
  const objects = new Map();
  for (const r of q.sceneObjects.all(row.id)) { try { const o = JSON.parse(r.data); objects.set(o.id, o); } catch {} }
  let settings = {};
  try { settings = R.splitSettings(JSON.parse(row.settings || '{}')).scene; } catch {}
  return { id: row.id, name: row.name, sort: row.sort, settings: Object.assign({}, R.DEFAULT_SCENE, settings), objects, dirty: new Set(), removed: new Set(), settingsDirty: false };
}
function openBoard(id) {
  let b = live.get(id);
  if (b) return b;
  const row = q.board.get(id);
  if (!row) return null;
  const scenes = new Map();
  for (const sr of q.scenes.all(id)) scenes.set(sr.id, loadScene(sr));
  let bs = {};
  try { bs = R.splitSettings(JSON.parse(row.settings || '{}')).board; } catch {}
  b = {
    id, name: row.name, owner_id: row.owner_id, invite_code: row.invite_code,
    active: scenes.has(row.active_scene) ? row.active_scene : [...scenes.keys()][0],
    settings: Object.assign({}, R.DEFAULT_BOARD, bs), settingsDirty: false,
    scenes, clients: new Set(),
  };
  live.set(id, b);
  return b;
}
function flush(b) {
  const touched = [...b.scenes.values()].some((s) => s.dirty.size || s.removed.size || s.settingsDirty) || b.settingsDirty;
  if (!touched) return;
  tx(() => {
    for (const sc of b.scenes.values()) {
      for (const id of sc.removed) q.deleteObject.run(b.id, id);
      for (const id of sc.dirty) { const o = sc.objects.get(id); if (o) q.upsertObject.run(b.id, id, sc.id, o.type, JSON.stringify(o)); }
      if (sc.settingsDirty) q.setSceneSettings.run(JSON.stringify(sc.settings), sc.id);
      sc.dirty.clear(); sc.removed.clear(); sc.settingsDirty = false;
    }
    if (b.settingsDirty) q.setSettings.run(JSON.stringify(b.settings), now(), b.id);
    else q.touchBoard.run(now(), b.id);
    b.settingsDirty = false;
  });
}
setInterval(() => {
  for (const b of live.values()) {
    try { flush(b); } catch (e) { console.error('No se pudo guardar el tablero', b.id, e.message); }
    if (!b.clients.size) live.delete(b.id);
  }
}, 400);

const sceneList = (b) => [...b.scenes.values()].sort((x, y) => x.sort - y.sort).map((s) => ({ id: s.id, name: s.name }));
function memberScenes(b) {
  const where = {};
  for (const m of q.members.all(b.id)) where[m.id] = b.scenes.has(m.scene_id) ? m.scene_id : b.active;
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

function stateFor(b, c) {
  const sc = b.scenes.get(c.sceneId);
  const member = { role: c.role, user_id: c.user.id };
  const fog = c.role === 'gm' ? [] : q.fogFor.all(sc.id, c.user.id).map((r) => ({ cx: r.cx, cy: r.cy, data: 'data:image/png;base64,' + Buffer.from(r.data).toString('base64') }));
  return {
    t: 'state',
    me: publicUser(c.user), role: c.role,
    board: { id: b.id, name: b.name, owner_id: b.owner_id, invite_code: c.role === 'gm' ? b.invite_code : undefined },
    scene: { id: sc.id, name: sc.name },
    scenes: sceneList(b), where: memberScenes(b), active: b.active,
    settings: Object.assign({}, sc.settings, b.settings),
    objects: [...sc.objects.values()].filter((o) => R.visibleTo(o, member, sc.settings)),
    members: q.members.all(b.id),
    online: onlineList(b),
    fog,
  };
}
function sendMembers(boardId) {
  const b = live.get(boardId);
  if (!b) return;
  broadcast(b, { t: 'members', members: q.members.all(boardId) });
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
function moveUser(b, uid, targetId, point) {
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
  q.setMemberScene.run(targetId, b.id, uid);
  for (const c of b.clients) if (c.user.id === uid) { c.sceneId = targetId; c.ws.send(stateFor(b, c)); }
}
function gather(b, targetId, portalId) {
  const target = b.scenes.get(targetId);
  if (!target) return;
  const members = q.members.all(b.id);
  const players = members.filter((m) => m.role !== 'gm');
  const pts = arrivalPoints(target, portalId, Math.max(1, players.length));
  players.forEach((m, i) => moveUser(b, m.id, targetId, ownedCount(b, m.id) ? pts[i] : null));
  for (const m of members) if (m.role === 'gm') moveUser(b, m.id, targetId, null);
  b.active = targetId; q.setActiveScene.run(targetId, b.id);
  sendScenes(b);
}

function handleOps(b, c, d) {
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
    accepted.push({ old, obj: result, changed: JSON.stringify(result) !== JSON.stringify(neu) });
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
    const { board, scene } = R.splitSettings(d.settings);
    if ('plansReleased' in scene && scene.plansReleased !== sc.settings.plansReleased) resendPlayers = true;
    const bsBefore = JSON.stringify(b.settings);
    Object.assign(sc.settings, scene); sc.settingsDirty = true;
    Object.assign(b.settings, board);
    if (JSON.stringify(b.settings) !== bsBefore) { b.settingsDirty = true; boardChanged = true; }
  }
  const back = corrections.filter(Boolean);
  for (const a of accepted) if (a.changed) back.push(a.obj);
  if (back.length || dels.length || (d.settings && !gm)) {
    c.ws.send({ t: 'ops', up: back, del: dels, settings: d.settings && !gm ? Object.assign({}, sc.settings, b.settings) : undefined, fix: true });
  }
  for (const other of b.clients) {
    if (other === c) continue;
    if (other.sceneId !== c.sceneId) {
      if (boardChanged) other.ws.send({ t: 'ops', settings: Object.assign({}, b.settings) });
      continue;
    }
    const member = { role: other.role, user_id: other.user.id };
    if (resendPlayers && other.role !== 'gm') { other.ws.send(stateFor(b, other)); continue; }
    const up = [], del = [...removed];
    for (const a of accepted) {
      const vis = R.visibleTo(a.obj, member, sc.settings);
      if (vis) up.push(a.obj);
      else if (!a.old || R.visibleTo(a.old, member, sc.settings)) del.push(a.obj.id);
    }
    const settings = d.settings && gm ? Object.assign({}, sc.settings, b.settings) : undefined;
    if (up.length || del.length || settings) other.ws.send({ t: 'ops', up, del, settings, by: c.user.id });
  }
}

function handleReplace(b, c, d) {
  if (c.role !== 'gm' || (d.scene && d.scene !== c.sceneId)) return;
  const sc = b.scenes.get(c.sceneId);
  // las fichas de jugadores que estén en otras escenas no se tocan
  const elsewhere = new Set();
  for (const o of b.scenes.values()) if (o !== sc) for (const id of o.objects.keys()) elsewhere.add(id);
  const objs = (Array.isArray(d.objects) ? d.objects : []).map(R.sanitize).filter((o) => o && !elsewhere.has(o.id)).slice(0, 20000);
  sc.objects.clear();
  for (const o of objs) sc.objects.set(o.id, o);
  if (d.settings) { const { board, scene } = R.splitSettings(d.settings); Object.assign(sc.settings, scene); Object.assign(b.settings, board); b.settingsDirty = true; }
  if (typeof d.name === 'string' && d.name.trim()) { sc.name = R.str(d.name, 60).trim(); q.renameScene.run(sc.name, sc.id); }
  tx(() => {
    q.clearSceneObjects.run(sc.id);
    for (const o of objs) q.upsertObject.run(b.id, o.id, sc.id, o.type, JSON.stringify(o));
    q.setSceneSettings.run(JSON.stringify(sc.settings), sc.id);
  });
  sc.dirty.clear(); sc.removed.clear(); sc.settingsDirty = false;
  for (const other of b.clients) if (other !== c && other.sceneId === sc.id) other.ws.send(Object.assign(stateFor(b, other), { by: c.user.id, replaced: true }));
  sendScenes(b);
}

function handleScene(b, c, d) {
  if (c.role !== 'gm') return;
  switch (d.op) {
    case 'create': {
      const id = newSceneId();
      const sort = Math.max(0, ...[...b.scenes.values()].map((s) => s.sort)) + 1;
      const name = R.str(d.name, 60).trim() || `Escena ${b.scenes.size + 1}`;
      q.insertScene.run(id, b.id, name, JSON.stringify(R.DEFAULT_SCENE), sort, now());
      b.scenes.set(id, loadScene({ id, name, sort, settings: '{}' }));
      if (d.open) { c.sceneId = id; q.setMemberScene.run(id, b.id, c.user.id); c.ws.send(Object.assign(stateFor(b, c), { created: true })); }
      break;
    }
    case 'rename': {
      const sc = b.scenes.get(d.id); const name = R.str(d.name, 60).trim();
      if (sc && name) { sc.name = name; q.renameScene.run(name, sc.id); }
      break;
    }
    case 'duplicate': {
      const src = b.scenes.get(d.id); if (!src) return;
      flush(b);
      const id = newSceneId();
      const sort = Math.max(0, ...[...b.scenes.values()].map((s) => s.sort)) + 1;
      const name = R.str(`${src.name} (copia)`, 60);
      const idMap = new Map(), groupMap = new Map();
      const copy = [];
      for (const o of src.objects.values()) {
        if (o.type === 'token' && o.owner != null) continue; // los personajes no se duplican
        const n = JSON.parse(JSON.stringify(o)); n.id = newObjId(); idMap.set(o.id, n.id);
        if (n.group != null) { if (!groupMap.has(n.group)) groupMap.set(n.group, newObjId()); n.group = groupMap.get(n.group); }
        if (n.physics) { if (!groupMap.has(n.physics.group)) groupMap.set(n.physics.group, newObjId()); n.physics.group = groupMap.get(n.physics.group); }
        copy.push(n);
      }
      tx(() => {
        q.insertScene.run(id, b.id, name, JSON.stringify(src.settings), sort, now());
        for (const o of copy) q.upsertObject.run(b.id, o.id, id, o.type, JSON.stringify(o));
      });
      b.scenes.set(id, loadScene({ id, name, sort, settings: JSON.stringify(src.settings) }));
      break;
    }
    case 'delete': {
      const sc = b.scenes.get(d.id);
      if (!sc || b.scenes.size < 2) return c.ws.send({ t: 'error', error: 'Un tablero necesita al menos una escena' });
      const fallback = [...b.scenes.values()].find((s) => s.id !== sc.id);
      flush(b);
      // quien estaba allí (y su personaje) pasa a otra escena
      const inside = Object.entries(memberScenes(b)).filter(([, sid]) => sid === sc.id).map(([uid]) => Number(uid));
      const pts = arrivalPoints(fallback, null, Math.max(1, inside.length));
      inside.forEach((uid, i) => moveUser(b, uid, fallback.id, pts[i]));
      for (const cl of b.clients) if (cl.sceneId === sc.id) { cl.sceneId = fallback.id; cl.ws.send(stateFor(b, cl)); }
      b.scenes.delete(sc.id);
      tx(() => { q.clearSceneObjects.run(sc.id); q.deleteScene.run(sc.id); });
      // los portales que llevaban allí se quedan sin destino
      for (const other of b.scenes.values()) {
        const fixed = [];
        for (const o of other.objects.values()) if (o.kind === 'portal' && o.target && o.target.scene === sc.id) { o.target = null; other.dirty.add(o.id); fixed.push(o); }
        if (fixed.length) broadcast(b, { t: 'ops', up: fixed, by: c.user.id }, null, other.id);
      }
      if (b.active === sc.id) { b.active = fallback.id; q.setActiveScene.run(fallback.id, b.id); }
      break;
    }
    case 'view': {
      if (!b.scenes.has(d.id)) return;
      c.sceneId = d.id; q.setMemberScene.run(d.id, b.id, c.user.id);
      c.ws.send(stateFor(b, c));
      break;
    }
    case 'gather': if (b.scenes.has(d.id)) gather(b, d.id, Number.isInteger(d.portal) ? d.portal : null); return;
    case 'send': {
      const uid = Number(d.user);
      const m = q.member.get(b.id, uid);
      const target = b.scenes.get(d.id);
      if (!m || !target) return;
      moveUser(b, uid, target.id, ownedCount(b, uid) ? arrivalPoints(target, null, 1)[0] : null);
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
      q.clearFog.run(sc.id);
      broadcast(b, { t: 'fogreset', scene: sc.id }, null, sc.id);
      return;
    }
  }
  sendScenes(b);
}

function handleTravel(b, c, d) {
  const sc = b.scenes.get(c.sceneId);
  const portal = sc.objects.get(d.portal);
  if (!portal || portal.type !== 'wall' || portal.kind !== 'portal' || !portal.target || !b.scenes.has(portal.target.scene)) {
    return c.ws.send({ t: 'error', error: 'Ese portal no lleva a ninguna escena' });
  }
  const target = b.scenes.get(portal.target.scene);
  if (c.role === 'gm') {
    if (d.all) return gather(b, target.id, portal.target.portal);
    c.sceneId = target.id; q.setMemberScene.run(target.id, b.id, c.user.id);
    c.ws.send(stateFor(b, c)); sendScenes(b);
    return;
  }
  const mine = [...sc.objects.values()].find((o) => o.type === 'token' && o.owner === c.user.id);
  if (mine) {
    const m = { x: (portal.a.x + portal.b.x) / 2, y: (portal.a.y + portal.b.y) / 2 };
    if (Math.hypot(mine.x - m.x, mine.y - m.y) > CELL * 3) return c.ws.send({ t: 'error', error: 'Acércate más al portal para cruzarlo' });
  }
  moveUser(b, c.user.id, target.id, mine ? arrivalPoints(target, portal.target.portal, 1)[0] : null);
  sendScenes(b);
}

function handleFog(b, c, d) {
  if (c.role === 'gm' || d.scene !== c.sceneId) return;
  if (!Number.isInteger(d.cx) || !Number.isInteger(d.cy) || Math.abs(d.cx) > 1e6 || Math.abs(d.cy) > 1e6) return;
  const m = /^data:image\/png;base64,/.exec(d.data || '');
  if (!m) return;
  const buf = Buffer.from(d.data.slice(m[0].length), 'base64');
  if (buf.length > 400 * 1024) return;
  q.upsertFog.run(c.sceneId, c.user.id, d.cx, d.cy, buf, now());
}

function onSocket(ws, user, boardId) {
  const member = memberOf(boardId, user.id);
  const b = member && openBoard(boardId);
  if (!b) { ws.send({ t: 'error', error: 'No perteneces a este tablero' }); ws.close(4403); return; }
  const sceneId = b.scenes.has(member.scene_id) ? member.scene_id : b.active;
  const c = { ws, user, role: member.role, board: b, sceneId };
  b.clients.add(c);
  ws.send(stateFor(b, c));
  sendScenes(b);
  ws.on('message', (text) => {
    let d; try { d = JSON.parse(text); } catch { return; }
    if (!d || typeof d !== 'object') return;
    try {
      switch (d.t) {
        case 'ops': handleOps(b, c, d); break;
        case 'replace': handleReplace(b, c, d); break;
        case 'scene': handleScene(b, c, d); break;
        case 'travel': handleTravel(b, c, d); break;
        case 'fog': handleFog(b, c, d); break;
        case 'cursor':
          if (Number.isFinite(d.x) && Number.isFinite(d.y)) broadcast(b, { t: 'cursor', uid: user.id, x: d.x, y: d.y }, c, c.sceneId);
          else broadcast(b, { t: 'cursor', uid: user.id, x: null, y: null }, c);
          break;
        case 'ping': ws.send({ t: 'pong', at: d.at }); break;
        case 'rename':
          if (c.role === 'gm') { const n = R.str(d.name, 60).trim(); if (n) { b.name = n; q.renameBoard.run(n, now(), b.id); broadcast(b, { t: 'board', name: n }, c); } }
          break;
      }
    } catch (e) { console.error('Mensaje descartado:', e); }
  });
  ws.on('close', () => {
    b.clients.delete(c);
    sendScenes(b);
    broadcast(b, { t: 'cursor', uid: user.id, x: null, y: null });
  });
}
setInterval(() => {
  for (const b of live.values()) for (const c of b.clients) { if (!c.ws.alive) c.ws.close(1001); else c.ws.ping(); }
}, 25000);
function kick(boardId, uid) {
  const b = live.get(boardId);
  if (!b) return;
  for (const c of [...b.clients]) if (c.user.id === uid) { c.ws.send({ t: 'kicked' }); c.ws.close(4403); }
}

/* ---------------- API ---------------- */
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // sin "api"
  const M = req.method;
  if (M === 'POST' && parts[0] === 'login') {
    const body = await readJson(req);
    const name = cleanName(body.name);
    if (!name) return fail(res, 400, 'El nombre debe tener entre 2 y 24 letras, números, espacios, puntos o guiones');
    const { user, token } = loginOrCreate(name);
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': `jav_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000` });
  }
  const user = userFrom(req);
  if (!user) return fail(res, 401, 'Inicia sesión');

  if (parts[0] === 'logout' && M === 'POST') {
    q.deleteSession.run(cookies(req).jav_session);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'jav_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (parts[0] === 'me') {
    if (M === 'GET') return send(res, 200, { user: publicUser(user) });
    if (M === 'PATCH') {
      const body = await readJson(req);
      if (typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color)) q.setColor.run(body.color, user.id);
      return send(res, 200, { user: publicUser(q.userById.get(user.id)) });
    }
  }
  if (parts[0] === 'join' && M === 'POST') {
    const body = await readJson(req);
    const code = String(body.code || '').trim().toUpperCase();
    const b = q.boardByCode.get(code);
    if (!b) return fail(res, 404, 'Ese código de invitación no existe');
    q.addMember.run(b.id, user.id, 'player', now());
    sendMembers(b.id);
    return send(res, 200, { board: { id: b.id, name: b.name } });
  }
  if (parts[0] === 'boards') {
    const id = parts[1];
    if (!id) {
      if (M === 'GET') return send(res, 200, { boards: q.boardsForUser.all(user.id) });
      if (M === 'POST') {
        const body = await readJson(req);
        const name = R.str(body.name, 60).trim() || 'Tablero sin nombre';
        const b = createBoard(name, user.id);
        return send(res, 201, { board: { id: b.id, name: b.name } });
      }
    }
    const board = q.board.get(id);
    const me = board && memberOf(id, user.id);
    if (!board || !me) return fail(res, 404, 'Tablero no encontrado');
    const gm = me.role === 'gm';
    const sub = parts[2];
    if (!sub) {
      if (M === 'GET') return send(res, 200, { board: { id: board.id, name: board.name, owner_id: board.owner_id, role: me.role, invite_code: gm ? board.invite_code : undefined } });
      if (M === 'PATCH' && gm) {
        const body = await readJson(req);
        const name = R.str(body.name, 60).trim();
        if (name) { q.renameBoard.run(name, now(), id); const b = live.get(id); if (b) { b.name = name; broadcast(b, { t: 'board', name }); } }
        return send(res, 200, { ok: true });
      }
      if (M === 'DELETE') {
        if (board.owner_id === user.id) {
          const b = live.get(id);
          if (b) { for (const c of [...b.clients]) { c.ws.send({ t: 'kicked', deleted: true }); c.ws.close(4403); } live.delete(id); }
          q.deleteBoard.run(id);
          return send(res, 200, { ok: true });
        }
        q.removeMember.run(id, user.id); kick(id, user.id); sendMembers(id);
        return send(res, 200, { ok: true, left: true });
      }
    }
    if (sub === 'members') {
      if (M === 'GET') return send(res, 200, { members: q.members.all(id) });
      if (M === 'POST' && gm) {
        const body = await readJson(req);
        const name = cleanName(body.name);
        if (!name) return fail(res, 400, 'Nombre de usuario no válido');
        const u = ensureUser(name);
        q.addMember.run(id, u.id, 'player', now());
        sendMembers(id);
        return send(res, 200, { members: q.members.all(id) });
      }
      if (M === 'DELETE' && gm && parts[3]) {
        const uid = Number(parts[3]);
        if (uid === board.owner_id) return fail(res, 400, 'El director no puede salir de su propio tablero');
        q.removeMember.run(id, uid); kick(id, uid); sendMembers(id);
        return send(res, 200, { members: q.members.all(id) });
      }
    }
    if (sub === 'scenes' && parts[3] && parts[4] === 'portals' && M === 'GET') {
      const b = openBoard(id);
      const sc = b && b.scenes.get(parts[3]);
      if (!sc) return fail(res, 404, 'Escena no encontrada');
      const portals = [...sc.objects.values()].filter((o) => o.type === 'wall' && o.kind === 'portal').map((o) => ({ id: o.id, name: o.name || '', target: o.target || null }));
      if (!b.clients.size) live.delete(id);
      return send(res, 200, { scene: { id: sc.id, name: sc.name }, portals });
    }
    if (sub === 'invite' && M === 'POST' && gm) {
      let code = randCode(6);
      while (q.boardByCode.get(code)) code = randCode(6);
      q.setInvite.run(code, id);
      const b = live.get(id); if (b) b.invite_code = code;
      return send(res, 200, { invite_code: code });
    }
    if (sub === 'images') {
      if (M === 'GET') {
        const u = q.boardUsage.get(id);
        return send(res, 200, { images: q.imagesForBoard.all(id), usage: { count: u.count, bytes: u.bytes, quota: BOARD_QUOTA } });
      }
      if (M === 'POST') {
        const body = await readJson(req);
        const category = ['board', 'prop', 'pc', 'npc'].includes(body.category) ? body.category : 'prop';
        if (!gm && category !== 'pc') return fail(res, 403, 'Los jugadores solo pueden subir retratos');
        const m = /^data:(image\/(png|jpeg|webp|gif));base64,/.exec(body.data || '');
        if (!m) return fail(res, 400, 'Formato de imagen no admitido (PNG, JPG, WebP o GIF)');
        const data = Buffer.from(body.data.slice(m[0].length), 'base64');
        if (data.length > MAX_IMAGE) return fail(res, 413, 'La imagen supera 15 MB');
        const usage = q.boardUsage.get(id);
        if (usage.bytes + data.length > BOARD_QUOTA) return fail(res, 413, 'El almacén del tablero está lleno');
        let thumb = null, thumbMime = null;
        const tm = /^data:(image\/(png|jpeg|webp));base64,/.exec(body.thumb || '');
        if (tm) { thumb = Buffer.from(body.thumb.slice(tm[0].length), 'base64'); thumbMime = tm[1]; }
        const imgId = 'img_' + crypto.randomBytes(9).toString('hex');
        const w = Number.isInteger(body.width) ? body.width : 0, h = Number.isInteger(body.height) ? body.height : 0;
        const ppc = Number.isFinite(body.ppc) && body.ppc > 0 ? body.ppc : 0;
        q.insertImage.run(imgId, id, user.id, R.str(body.name, 40) || 'imagen', category, m[1], w, h, ppc, data.length, 'local', data, thumb, thumbMime, now());
        const b = live.get(id); if (b) broadcast(b, { t: 'images' });
        return send(res, 201, { image: q.imageMeta.get(imgId) });
      }
    }
    return fail(res, 404, 'Ruta no encontrada');
  }
  if (parts[0] === 'images' && parts[1]) {
    const imgRow = q.imageMeta.get(parts[1]);
    if (!imgRow) return fail(res, 404, 'Imagen no encontrada');
    const me = imgRow.board_id ? memberOf(imgRow.board_id, user.id) : { role: 'player' };
    if (!me) return fail(res, 403, 'Sin acceso a esta imagen');
    if (M === 'GET') {
      const cache = { 'Cache-Control': 'private, max-age=86400' };
      if (parts[2] === 'thumb') {
        const r = q.imageThumb.get(parts[1]);
        return r.thumb ? send(res, 200, Buffer.from(r.thumb), Object.assign({ 'Content-Type': r.thumb_mime }, cache)) : send(res, 200, Buffer.from(r.data), Object.assign({ 'Content-Type': r.mime }, cache));
      }
      const r = q.imageData.get(parts[1]);
      return send(res, 200, Buffer.from(r.data), Object.assign({ 'Content-Type': r.mime }, cache));
    }
    if (!imgRow.board_id) return fail(res, 403, 'Las imágenes de muestra no se pueden cambiar');
    if (me.role !== 'gm') return fail(res, 403, 'Solo el director puede cambiar la biblioteca');
    if (M === 'PATCH') {
      const body = await readJson(req);
      const name = R.str(body.name, 40).trim() || imgRow.name;
      const category = ['board', 'prop', 'pc', 'npc'].includes(body.category) ? body.category : imgRow.category;
      const ppc = Number.isFinite(body.ppc) && body.ppc > 0 ? body.ppc : imgRow.ppc;
      q.updateImage.run(name, category, ppc, imgRow.id);
      const b = live.get(imgRow.board_id); if (b) broadcast(b, { t: 'images' });
      return send(res, 200, { image: q.imageMeta.get(imgRow.id) });
    }
    if (M === 'DELETE') {
      q.deleteImage.run(imgRow.id);
      const b = live.get(imgRow.board_id); if (b) broadcast(b, { t: 'images' });
      return send(res, 200, { ok: true });
    }
  }
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
      console.warn(`  404: ${url.pathname} (buscado en ${file})`);
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
    if (!e.status) console.error(e);
  }
});
server.on('upgrade', (req, sock) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname !== '/ws') return sock.destroy();
  const user = userFrom(req);
  if (!user) { sock.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
  const ws = acceptUpgrade(req, sock);
  if (ws) onSocket(ws, user, url.searchParams.get('board') || '');
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}
function openBrowser(url) {
  const { spawn } = require('node:child_process');
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', () => console.log(`  Abre tú el navegador en ${url}`));
    p.unref();
  } catch { console.log(`  Abre tú el navegador en ${url}`); }
}
function start(port, tries = 10, openIt = false) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries > 0) { console.log(`  El puerto ${port} está ocupado por otro programa, probando ${port + 1}…`); start(port + 1, tries - 1, openIt); }
    else { console.error(e); process.exit(1); }
  });
  server.listen(port, '0.0.0.0', () => {
    console.log('\n  Just Another VTT está en marcha\n');
    console.log(`  En este equipo:      http://localhost:${port}`);
    for (const ip of lanAddresses()) console.log(`  En tu red local:     http://${ip}:${port}`);
    console.log(`\n  Base de datos: ${DB_FILE}`);
    console.log('  Para detenerlo pulsa Ctrl+C.\n');
    if (openIt) openBrowser(`http://localhost:${port}`);
  });
}
function shutdown() {
  for (const b of live.values()) { try { flush(b); } catch {} }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { start, server };
