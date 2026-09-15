'use strict';
/* Todo se guarda en un único archivo SQLite: usuarios, sesiones, tableros,
   miembros, objetos de cada escena e imágenes (como BLOB). */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.VTT_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'minivtt.sqlite');
const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('gm','player')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (board_id, user_id)
);
CREATE TABLE IF NOT EXISTS objects (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  id INTEGER NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (board_id, id)
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  ppc REAL NOT NULL DEFAULT 0,
  size INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'local',
  data BLOB NOT NULL,
  thumb BLOB,
  thumb_mime TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS images_board ON images(board_id);
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scenes_board ON scenes(board_id);
CREATE TABLE IF NOT EXISTS fog (
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cx INTEGER NOT NULL,
  cy INTEGER NOT NULL,
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scene_id, user_id, cx, cy)
);
`);

/* Migración desde la versión con una sola escena por tablero */
const columns = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
if (!columns('objects').includes('scene_id')) db.exec('ALTER TABLE objects ADD COLUMN scene_id TEXT');
if (!columns('boards').includes('active_scene')) db.exec('ALTER TABLE boards ADD COLUMN active_scene TEXT');
if (!columns('board_members').includes('scene_id')) db.exec('ALTER TABLE board_members ADD COLUMN scene_id TEXT');
db.exec('CREATE INDEX IF NOT EXISTS objects_scene ON objects(scene_id)');
const newSceneId = () => 's_' + crypto.randomBytes(6).toString('hex');
{
  const orphan = db.prepare('SELECT b.id, b.settings FROM boards b WHERE NOT EXISTS (SELECT 1 FROM scenes s WHERE s.board_id = b.id)').all();
  for (const b of orphan) {
    const sid = newSceneId();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO scenes (id, board_id, name, settings, sort, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(sid, b.id, 'Escena 1', b.settings || '{}', Date.now());
      db.prepare('UPDATE objects SET scene_id = ? WHERE board_id = ? AND scene_id IS NULL').run(sid, b.id);
      db.prepare('UPDATE boards SET active_scene = ? WHERE id = ?').run(sid, b.id);
      db.prepare('UPDATE board_members SET scene_id = ? WHERE board_id = ?').run(sid, b.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}

const now = () => Date.now();
const randCode = (n) => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(n)) s += abc[b % abc.length];
  return s;
};
const COLORS = ['#F0B35A', '#6FB8A8', '#D9705F', '#8EC5E8', '#B79BD8', '#9ED3A6', '#E8A0BF', '#C9A26B'];

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE name = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare('INSERT INTO users (name, color, created_at) VALUES (?, ?, ?)'),
  setColor: db.prepare('UPDATE users SET color = ? WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'),
  sessionUser: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),

  boardsForUser: db.prepare(`
    SELECT b.id, b.name, b.owner_id, b.created_at, b.updated_at, m.role,
      u.name AS owner_name,
      (SELECT COUNT(*) FROM board_members x WHERE x.board_id = b.id) AS members,
      (SELECT COUNT(*) FROM scenes z WHERE z.board_id = b.id) AS scenes
    FROM board_members m JOIN boards b ON b.id = m.board_id JOIN users u ON u.id = b.owner_id
    WHERE m.user_id = ? ORDER BY b.updated_at DESC`),
  board: db.prepare('SELECT * FROM boards WHERE id = ?'),
  boardByCode: db.prepare('SELECT * FROM boards WHERE invite_code = ?'),
  insertBoard: db.prepare('INSERT INTO boards (id, name, owner_id, invite_code, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  renameBoard: db.prepare('UPDATE boards SET name = ?, updated_at = ? WHERE id = ?'),
  touchBoard: db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?'),
  setSettings: db.prepare('UPDATE boards SET settings = ?, updated_at = ? WHERE id = ?'),
  setInvite: db.prepare('UPDATE boards SET invite_code = ? WHERE id = ?'),
  deleteBoard: db.prepare('DELETE FROM boards WHERE id = ?'),

  member: db.prepare('SELECT * FROM board_members WHERE board_id = ? AND user_id = ?'),
  members: db.prepare(`SELECT u.id, u.name, u.color, m.role, m.joined_at, m.scene_id FROM board_members m
    JOIN users u ON u.id = m.user_id WHERE m.board_id = ? ORDER BY m.role DESC, u.name`),
  addMember: db.prepare('INSERT OR IGNORE INTO board_members (board_id, user_id, role, joined_at, scene_id) VALUES (?, ?, ?, ?, (SELECT active_scene FROM boards WHERE id = ?1))'),
  setMemberScene: db.prepare('UPDATE board_members SET scene_id = ? WHERE board_id = ? AND user_id = ?'),
  setActiveScene: db.prepare('UPDATE boards SET active_scene = ? WHERE id = ?'),
  scenes: db.prepare('SELECT id, name, settings, sort, created_at FROM scenes WHERE board_id = ? ORDER BY sort, created_at'),
  insertScene: db.prepare('INSERT INTO scenes (id, board_id, name, settings, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  renameScene: db.prepare('UPDATE scenes SET name = ? WHERE id = ?'),
  setSceneSettings: db.prepare('UPDATE scenes SET settings = ? WHERE id = ?'),
  deleteScene: db.prepare('DELETE FROM scenes WHERE id = ?'),
  sceneObjects: db.prepare('SELECT data FROM objects WHERE scene_id = ?'),
  clearSceneObjects: db.prepare('DELETE FROM objects WHERE scene_id = ?'),
  fogFor: db.prepare('SELECT cx, cy, data FROM fog WHERE scene_id = ? AND user_id = ?'),
  upsertFog: db.prepare(`INSERT INTO fog (scene_id, user_id, cx, cy, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(scene_id, user_id, cx, cy) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`),
  clearFog: db.prepare('DELETE FROM fog WHERE scene_id = ?'),
  removeMember: db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?'),

  objects: db.prepare('SELECT data FROM objects WHERE board_id = ?'),
  upsertObject: db.prepare(`INSERT INTO objects (board_id, id, scene_id, type, data) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(board_id, id) DO UPDATE SET scene_id = excluded.scene_id, type = excluded.type, data = excluded.data`),
  deleteObject: db.prepare('DELETE FROM objects WHERE board_id = ? AND id = ?'),
  clearObjects: db.prepare('DELETE FROM objects WHERE board_id = ?'),

  imagesForBoard: db.prepare(`SELECT id, board_id, owner_id, name, category, mime, width, height, ppc, size, origin, created_at
    FROM images WHERE board_id = ? OR board_id IS NULL ORDER BY created_at DESC`),
  imageMeta: db.prepare('SELECT id, board_id, owner_id, name, category, mime, width, height, ppc, size, origin, created_at FROM images WHERE id = ?'),
  imageData: db.prepare('SELECT mime, data, board_id FROM images WHERE id = ?'),
  imageThumb: db.prepare('SELECT thumb_mime, thumb, mime, data, board_id FROM images WHERE id = ?'),
  insertImage: db.prepare(`INSERT INTO images (id, board_id, owner_id, name, category, mime, width, height, ppc, size, origin, data, thumb, thumb_mime, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  updateImage: db.prepare('UPDATE images SET name = ?, category = ?, ppc = ? WHERE id = ?'),
  deleteImage: db.prepare('DELETE FROM images WHERE id = ?'),
  boardUsage: db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM images WHERE board_id = ?'),
  imageExists: db.prepare('SELECT 1 FROM images WHERE id = ?'),
};

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

function loginOrCreate(name) {
  let u = q.userByName.get(name);
  if (!u) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const r = q.insertUser.run(name, color, now());
    u = q.userById.get(Number(r.lastInsertRowid));
  }
  const token = crypto.randomBytes(24).toString('hex');
  q.insertSession.run(token, u.id, now());
  return { user: u, token };
}

function ensureUser(name) {
  let u = q.userByName.get(name);
  if (!u) {
    const r = q.insertUser.run(name, COLORS[Math.floor(Math.random() * COLORS.length)], now());
    u = q.userById.get(Number(r.lastInsertRowid));
  }
  return u;
}

function createBoard(name, ownerId) {
  const id = randCode(8).toLowerCase();
  let code = randCode(6);
  while (q.boardByCode.get(code)) code = randCode(6);
  const sid = newSceneId();
  tx(() => {
    q.insertBoard.run(id, name, ownerId, code, JSON.stringify({}), now(), now());
    q.insertScene.run(sid, id, 'Escena 1', '{}', 0, now());
    q.setActiveScene.run(sid, id);
    q.addMember.run(id, ownerId, 'gm', now());
  });
  return q.board.get(id);
}

/* Imágenes de las plantillas: se cargan una vez desde public/muestras */
const SAMPLES = [
  { id: 'muestra-tablero', file: 'granja-tablero.webp', name: 'Granja del cruce', category: 'board', ppc: 25 },
  { id: 'muestra-herbolario', file: 'herbolario.webp', name: 'Herbolario, planta 1', category: 'board', ppc: 72 },
  { id: 'muestra-mesa', file: 'mesa-redonda.webp', name: 'Mesa redonda', category: 'prop', ppc: 0 },
  { id: 'muestra-barril', file: 'barril.webp', name: 'Barril', category: 'prop', ppc: 0 },
  { id: 'muestra-guerrera', file: 'guerrera.webp', name: 'Guerrera', category: 'pc', ppc: 0 },
  { id: 'muestra-goblin', file: 'goblin.webp', name: 'Goblin', category: 'npc', ppc: 0 },
];
function webpSize(buf) {
  // VP8X / VP8L / VP8
  const fmt = buf.toString('ascii', 12, 16);
  if (fmt === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (fmt === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
  if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  return { w: 0, h: 0 };
}
function seedSamples(dir) {
  for (const s of SAMPLES) {
    if (q.imageExists.get(s.id)) continue;
    const file = path.join(dir, s.file);
    if (!fs.existsSync(file)) continue;
    const data = fs.readFileSync(file);
    const { w, h } = webpSize(data);
    q.insertImage.run(s.id, null, null, s.name, s.category, 'image/webp', w, h, s.ppc, data.length, 'muestra', data, null, null, now());
  }
}

module.exports = { db, q, tx, now, randCode, newSceneId, loginOrCreate, ensureUser, createBoard, seedSamples, DB_FILE };
