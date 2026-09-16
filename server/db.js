'use strict';
/* Acceso a PostgreSQL: pool, migraciones y todas las consultas del servidor.
   Nada fuera de este archivo escribe SQL. Las funciones de `q` devuelven filas ya
   convertidas: enteros como Number, JSONB como objetos, BYTEA como Buffer. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool, types } = require('pg');

// BIGINT (oid 20) llega como texto; todos nuestros valores caben en Number sin pérdida.
types.setTypeParser(20, (v) => Number(v));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\n  Falta la variable de entorno DATABASE_URL (postgres://usuario:clave@host:5432/base).\n');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
pool.on('error', (e) => console.error('Error en la conexión con PostgreSQL:', e.message));

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_LOCK = 7318204;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at BIGINT NOT NULL)');
    const applied = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();
    const appliedNow = [];
    for (const file of files) {
      const version = Number(file.slice(0, 3));
      if (applied.has(version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)', [version, file, Date.now()]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`La migración ${file} falló: ${e.message}`);
      }
      appliedNow.push(file);
    }
    return appliedNow;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
}

const now = () => Date.now();
const randCode = (n) => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of crypto.randomBytes(n)) s += abc[b % abc.length];
  return s;
};
const newSceneId = () => 's_' + crypto.randomBytes(6).toString('hex');
const COLORS = ['#F0B35A', '#6FB8A8', '#D9705F', '#8EC5E8', '#B79BD8', '#9ED3A6', '#E8A0BF', '#C9A26B'];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

const USER_COLS = 'id, name, color, password_hash, recovery_code, created_at';
const IMAGE_META = 'id, board_id, owner_id, name, category, mime, width, height, ppc, size, origin, created_at';

/* `exec` es el pool o un cliente dentro de una transacción; las consultas son las mismas. */
function makeQueries(exec) {
  const one = async (sql, params) => (await exec.query(sql, params)).rows[0] || null;
  const all = async (sql, params) => (await exec.query(sql, params)).rows;
  const run = async (sql, params) => (await exec.query(sql, params)).rowCount;
  return {
    userByName: (name) => one(`SELECT ${USER_COLS} FROM users WHERE lower(name) = lower($1)`, [name]),
    userById: (id) => one(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]),
    insertUser: (name, color, passwordHash) => one(`INSERT INTO users (name, color, password_hash, created_at) VALUES ($1, $2, $3, $4) RETURNING ${USER_COLS}`, [name, color, passwordHash, now()]),
    setColor: (color, id) => run('UPDATE users SET color = $1 WHERE id = $2', [color, id]),
    insertSession: (token, userId) => run('INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)', [token, userId, now()]),
    sessionUser: (token) => one('SELECT u.id, u.name, u.color, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1', [token]),
    deleteSession: (token) => run('DELETE FROM sessions WHERE token = $1', [token]),
    deleteUserSessions: (userId) => run('DELETE FROM sessions WHERE user_id = $1', [userId]),
    setPassword: (passwordHash, id) => run('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]),
    setRecoveryCode: (code, id) => run('UPDATE users SET recovery_code = $1 WHERE id = $2', [code, id]),

    insertChat: (boardId, userId, kind, body) => one('INSERT INTO chat_messages (board_id, user_id, kind, body, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at', [boardId, userId, kind, JSON.stringify(body), now()]),
    recentChat: (boardId, limit) => all(`SELECT m.id, m.user_id, u.name AS user_name, u.color AS user_color, m.kind, m.body, m.created_at
      FROM chat_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.board_id = $1 ORDER BY m.id DESC LIMIT $2`, [boardId, limit]),
    trimChat: (boardId, keep) => run('DELETE FROM chat_messages WHERE board_id = $1 AND id < (SELECT COALESCE(MIN(id), 0) FROM (SELECT id FROM chat_messages WHERE board_id = $1 ORDER BY id DESC LIMIT $2) k)', [boardId, keep]),

    boardsForUser: (userId) => all(`
      SELECT b.id, b.name, b.owner_id, b.created_at, b.updated_at, m.role, u.name AS owner_name,
        COALESCE(b.settings->>'mode', '2d') AS mode,
        (SELECT COUNT(*) FROM board_members x WHERE x.board_id = b.id) AS members,
        (SELECT COUNT(*) FROM scenes z WHERE z.board_id = b.id) AS scenes
      FROM board_members m JOIN boards b ON b.id = m.board_id JOIN users u ON u.id = b.owner_id
      WHERE m.user_id = $1 ORDER BY b.updated_at DESC`, [userId]),
    board: (id) => one('SELECT id, name, owner_id, invite_code, settings, active_scene, created_at, updated_at FROM boards WHERE id = $1', [id]),
    boardByCode: (code) => one('SELECT id, name, owner_id, invite_code, active_scene FROM boards WHERE invite_code = $1', [code]),
    insertBoard: (id, name, ownerId, code, settings) => run('INSERT INTO boards (id, name, owner_id, invite_code, settings, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)', [id, name, ownerId, code, JSON.stringify(settings), now()]),
    renameBoard: (name, id) => run('UPDATE boards SET name = $1, updated_at = $2 WHERE id = $3', [name, now(), id]),
    touchBoard: (id) => run('UPDATE boards SET updated_at = $1 WHERE id = $2', [now(), id]),
    setSettings: (settings, id) => run('UPDATE boards SET settings = $1, updated_at = $2 WHERE id = $3', [JSON.stringify(settings), now(), id]),
    setInvite: (code, id) => run('UPDATE boards SET invite_code = $1 WHERE id = $2', [code, id]),
    setActiveScene: (sceneId, boardId) => run('UPDATE boards SET active_scene = $1 WHERE id = $2', [sceneId, boardId]),
    deleteBoard: (id) => run('DELETE FROM boards WHERE id = $1', [id]),

    member: (boardId, userId) => one('SELECT board_id, user_id, role, joined_at, scene_id FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]),
    members: (boardId) => all(`SELECT u.id, u.name, u.color, m.role, m.joined_at, m.scene_id FROM board_members m
      JOIN users u ON u.id = m.user_id WHERE m.board_id = $1 ORDER BY m.role DESC, u.name`, [boardId]),
    addMember: (boardId, userId, role) => run(`INSERT INTO board_members (board_id, user_id, role, joined_at, scene_id)
      VALUES ($1, $2, $3, $4, (SELECT active_scene FROM boards WHERE id = $1)) ON CONFLICT DO NOTHING`, [boardId, userId, role, now()]),
    setMemberScene: (sceneId, boardId, userId) => run('UPDATE board_members SET scene_id = $1 WHERE board_id = $2 AND user_id = $3', [sceneId, boardId, userId]),
    removeMember: (boardId, userId) => run('DELETE FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]),

    scenes: (boardId) => all('SELECT id, name, settings, sort, created_at FROM scenes WHERE board_id = $1 ORDER BY sort, created_at', [boardId]),
    insertScene: (id, boardId, name, settings, sort) => run('INSERT INTO scenes (id, board_id, name, settings, sort, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [id, boardId, name, JSON.stringify(settings), sort, now()]),
    renameScene: (name, id) => run('UPDATE scenes SET name = $1 WHERE id = $2', [name, id]),
    setSceneSettings: (settings, id) => run('UPDATE scenes SET settings = $1 WHERE id = $2', [JSON.stringify(settings), id]),
    deleteScene: (id) => run('DELETE FROM scenes WHERE id = $1', [id]),

    sceneObjects: async (sceneId) => (await all('SELECT data FROM objects WHERE scene_id = $1', [sceneId])).map((r) => r.data),
    clearSceneObjects: (sceneId) => run('DELETE FROM objects WHERE scene_id = $1', [sceneId]),
    upsertObject: (boardId, id, sceneId, type, object) => run(`INSERT INTO objects (board_id, id, scene_id, type, data) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (board_id, id) DO UPDATE SET scene_id = EXCLUDED.scene_id, type = EXCLUDED.type, data = EXCLUDED.data`, [boardId, id, sceneId, type, JSON.stringify(object)]),
    deleteObject: (boardId, id) => run('DELETE FROM objects WHERE board_id = $1 AND id = $2', [boardId, id]),

    fogFor: (sceneId, userId) => all('SELECT cx, cy, data FROM fog WHERE scene_id = $1 AND user_id = $2', [sceneId, userId]),
    upsertFog: (sceneId, userId, cx, cy, data) => run(`INSERT INTO fog (scene_id, user_id, cx, cy, data, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (scene_id, user_id, cx, cy) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [sceneId, userId, cx, cy, data, now()]),
    clearFog: (sceneId) => run('DELETE FROM fog WHERE scene_id = $1', [sceneId]),

    imagesForBoard: (boardId) => all(`SELECT ${IMAGE_META} FROM images WHERE board_id = $1 OR board_id IS NULL ORDER BY created_at DESC`, [boardId]),
    imageMeta: (id) => one(`SELECT ${IMAGE_META} FROM images WHERE id = $1`, [id]),
    imageData: (id) => one('SELECT mime, data, board_id FROM images WHERE id = $1', [id]),
    imageThumb: (id) => one('SELECT thumb_mime, thumb, mime, data, board_id FROM images WHERE id = $1', [id]),
    insertImage: (img) => run(`INSERT INTO images (id, board_id, owner_id, name, category, mime, width, height, ppc, size, origin, data, thumb, thumb_mime, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [img.id, img.boardId, img.ownerId, img.name, img.category, img.mime, img.width, img.height, img.ppc, img.size, img.origin, img.data, img.thumb, img.thumbMime, now()]),
    updateImage: (name, category, ppc, id) => run('UPDATE images SET name = $1, category = $2, ppc = $3 WHERE id = $4', [name, category, ppc, id]),
    deleteImage: (id) => run('DELETE FROM images WHERE id = $1', [id]),
    boardUsage: (boardId) => one('SELECT COUNT(*)::int AS count, COALESCE(SUM(size), 0)::bigint AS bytes FROM images WHERE board_id = $1', [boardId]),
    imageExists: async (id) => !!(await one('SELECT 1 AS ok FROM images WHERE id = $1', [id])),
  };
}

const q = makeQueries(pool);

/* Ejecuta `fn(t)` en una transacción; `t` tiene las mismas consultas que `q`. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(makeQueries(client));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const newRecoveryCode = () => randCode(12).replace(/(.{4})(?=.)/g, '$1-');

async function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  await q.insertSession(token, userId);
  return token;
}

async function createUser(name, passwordHash) {
  const user = await q.insertUser(name, randomColor(), passwordHash);
  user.recovery_code = newRecoveryCode();
  await q.setRecoveryCode(user.recovery_code, user.id);
  return user;
}

async function createBoard(name, ownerId, mode = '2d') {
  const id = randCode(8).toLowerCase();
  let code = randCode(6);
  while (await q.boardByCode(code)) code = randCode(6);
  const sceneId = newSceneId();
  await tx(async (t) => {
    await t.insertBoard(id, name, ownerId, code, { mode });
    await t.insertScene(sceneId, id, 'Escena 1', {}, 0);
    await t.setActiveScene(sceneId, id);
    await t.addMember(id, ownerId, 'gm');
  });
  return q.board(id);
}

const close = () => pool.end();

module.exports = { pool, q, tx, migrate, now, randCode, newSceneId, newRecoveryCode, createUser, createSession, createBoard, close, DATABASE_URL };
