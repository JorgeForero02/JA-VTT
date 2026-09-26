'use strict';
/* Todo el SQL del módulo del tablero 3D, siempre sobre el esquema `t3d`. Usa el pool del
   anfitrión (que ya convierte BIGINT a Number) y lleva su propio control de migraciones en
   t3d.schema_migrations, aparte del del anfitrión. Nada fuera de este archivo escribe SQL del módulo. */
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_LOCK = 7318206; // distinto del cerrojo del núcleo (7318205)
const DRAWING_COLS = 'id, owner_id, key, kind, target, name, res, width, height, light, light_spec, char_size, frames, cols, frame_names, size, created_at, updated_at';
const now = () => Date.now();
/* Tamaño que cuenta en la cuota: bytes UTF-8 del JSON que se guarda (el mismo texto que va a Postgres) */
const jsonOf = (data) => { const json = JSON.stringify(data); return [json, Buffer.byteLength(json)]; };

function makeQueries(exec) {
  const one = async (sql, params) => (await exec.query(sql, params)).rows[0] || null;
  const all = async (sql, params) => (await exec.query(sql, params)).rows;
  const run = async (sql, params) => (await exec.query(sql, params)).rowCount;
  return {
    /* Tipo de mesa (t3d.boards): fila = tablero 3D. Sin consulta para quitarla: el tipo es fijo. */
    is3d: async (boardId) => !!(await one('SELECT 1 AS x FROM t3d.boards WHERE board_id = $1', [boardId])),
    boards3d: (boardIds) => all('SELECT board_id FROM t3d.boards WHERE board_id = ANY($1)', [boardIds]),
    // sólo si el tablero existe y se creó después de `since` (null: sin límite); true si queda marcado (o ya lo estaba)
    mark3d: async (boardId, since) => {
      await run(`INSERT INTO t3d.boards (board_id, created_at) SELECT id, $3 FROM public.boards
        WHERE id = $1 AND ($2::bigint IS NULL OR created_at >= $2) ON CONFLICT (board_id) DO NOTHING`, [boardId, since, now()]);
      return !!(await one('SELECT 1 AS x FROM t3d.boards WHERE board_id = $1', [boardId]));
    },
    /* Ajustes del tablero 3D (settings jsonb de t3d.boards): los guarda el módulo sin tocar las tablas del anfitrión */
    boardSettings: async (boardId) => { const r = await one('SELECT settings FROM t3d.boards WHERE board_id = $1', [boardId]); return r ? r.settings : null; },
    setBoardSettings: (boardId, settings) => run('UPDATE t3d.boards SET settings = $2 WHERE board_id = $1', [boardId, JSON.stringify(settings)]),
    markAll3d: () => run('INSERT INTO t3d.boards (board_id, created_at) SELECT id, $1 FROM public.boards ON CONFLICT (board_id) DO NOTHING', [now()]),

    sceneCounts: (boardIds) => all('SELECT board_id, COUNT(*)::int AS n FROM t3d.scenes WHERE board_id = ANY($1) GROUP BY board_id', [boardIds]),
    scenes: (boardId, limit) => all('SELECT id, name, width, depth, data, created_at, updated_at FROM t3d.scenes WHERE board_id = $1 ORDER BY updated_at DESC LIMIT $2', [boardId, limit]),
    scene: (boardId, id) => one('SELECT id, name, width, depth, data, created_at, updated_at FROM t3d.scenes WHERE board_id = $1 AND id = $2', [boardId, id]),
    upsertScene: (boardId, id, name, width, depth, data) => run(`INSERT INTO t3d.scenes (board_id, id, name, width, depth, data, size, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      ON CONFLICT (board_id, id) DO UPDATE SET name = EXCLUDED.name, width = EXCLUDED.width, depth = EXCLUDED.depth, data = EXCLUDED.data, size = EXCLUDED.size, updated_at = EXCLUDED.updated_at`,
    [boardId, id, name, width, depth, ...jsonOf(data), now()]),
    // cambia los datos sin tocar updated_at: al quitar el destino de un portal la escena no pasa a ser «la última guardada»
    setSceneData: (boardId, id, data) => run('UPDATE t3d.scenes SET data = $3, size = $4 WHERE board_id = $1 AND id = $2', [boardId, id, ...jsonOf(data)]),
    allScenes: (boardId) => all('SELECT id, name, data FROM t3d.scenes WHERE board_id = $1', [boardId]),
    deleteScene: (boardId, id) => run('DELETE FROM t3d.scenes WHERE board_id = $1 AND id = $2', [boardId, id]),

    campaigns: (boardId, limit) => all('SELECT id, name, data, created_at, updated_at FROM t3d.campaigns WHERE board_id = $1 ORDER BY updated_at DESC LIMIT $2', [boardId, limit]),
    upsertCampaign: (boardId, id, name, data) => run(`INSERT INTO t3d.campaigns (board_id, id, name, data, size, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (board_id, id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, size = EXCLUDED.size, updated_at = EXCLUDED.updated_at`, [boardId, id, name, ...jsonOf(data), now()]),
    deleteCampaign: (boardId, id) => run('DELETE FROM t3d.campaigns WHERE board_id = $1 AND id = $2', [boardId, id]),

    drawings: (boardId, limit) => all(`SELECT ${DRAWING_COLS} FROM t3d.drawings WHERE board_id = $1 ORDER BY updated_at DESC LIMIT $2`, [boardId, limit]),
    drawingLayers: (boardId, ids) => all('SELECT drawing_id, idx, name, visible, opacity, locked, mime, data FROM t3d.drawing_layers WHERE board_id = $1 AND drawing_id = ANY($2) ORDER BY drawing_id, idx', [boardId, ids]),
    upsertDrawing: (boardId, d) => run(`INSERT INTO t3d.drawings (board_id, id, owner_id, key, kind, target, name, res, width, height, light, frames, cols, frame_names, size, created_at, updated_at, light_spec, char_size)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, $17, $18)
      ON CONFLICT (board_id, id) DO UPDATE SET key = EXCLUDED.key, kind = EXCLUDED.kind, target = EXCLUDED.target, name = EXCLUDED.name, res = EXCLUDED.res,
        width = EXCLUDED.width, height = EXCLUDED.height, light = EXCLUDED.light, frames = EXCLUDED.frames, cols = EXCLUDED.cols,
        frame_names = EXCLUDED.frame_names, size = EXCLUDED.size, updated_at = EXCLUDED.updated_at, light_spec = EXCLUDED.light_spec, char_size = EXCLUDED.char_size`,
    [boardId, d.id, d.ownerId, d.key, d.kind, d.target, d.name, d.res, d.width, d.height, d.light, d.frames, d.cols, JSON.stringify(d.frameNames), d.size, now(),
      d.lightSpec ? JSON.stringify(d.lightSpec) : null, d.charSize || null]),
    clearDrawingLayers: (boardId, id) => run('DELETE FROM t3d.drawing_layers WHERE board_id = $1 AND drawing_id = $2', [boardId, id]),
    insertDrawingLayer: (boardId, id, l) => run('INSERT INTO t3d.drawing_layers (board_id, drawing_id, idx, name, visible, opacity, locked, mime, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [boardId, id, l.idx, l.name, l.visible, l.opacity ?? 100, !!l.locked, l.mime, l.data]),
    deleteDrawing: (boardId, id) => run('DELETE FROM t3d.drawings WHERE board_id = $1 AND id = $2', [boardId, id]),
    /* Uso del almacén (cuota): suma de `size` (JSON de escenas y campañas, capas PNG de los dibujos). `except` = { kind, id }:
       sin contar ese documento, el que se va a sustituir */
    boardUsage: (boardId, except) => one(`SELECT (SELECT COALESCE(SUM(size), 0) FROM t3d.drawings WHERE board_id = $1 AND NOT ($2 = 'drawings' AND id = $3))::bigint
      + (SELECT COALESCE(SUM(size), 0) FROM t3d.scenes WHERE board_id = $1 AND NOT ($2 = 'scenes' AND id = $3))::bigint
      + (SELECT COALESCE(SUM(size), 0) FROM t3d.campaigns WHERE board_id = $1 AND NOT ($2 = 'campaigns' AND id = $3))::bigint AS bytes`,
    [boardId, except ? except.kind : '', except ? except.id : '']),
    // escenas y campañas guardadas antes de la migración 006, sin medir
    unsized: (table) => all(`SELECT board_id, id, data FROM t3d.${table === 'scenes' ? 'scenes' : 'campaigns'} WHERE size IS NULL`),
    setSize: (table, boardId, id, size) => run(`UPDATE t3d.${table === 'scenes' ? 'scenes' : 'campaigns'} SET size = $3 WHERE board_id = $1 AND id = $2`, [boardId, id, size]),

    /* Miembros del tablero (tablas del anfitrión, iguales en JA-VTT): para el `state` de la conexión propia */
    members: (boardId) => all(`SELECT u.id, u.name, u.color, m.role FROM public.board_members m JOIN public.users u ON u.id = m.user_id
      WHERE m.board_id = $1 ORDER BY m.joined_at, u.id`, [boardId]),

    liveDocs: (boardId) => all('SELECT key, data FROM t3d.live_docs WHERE board_id = $1', [boardId]),
    upsertLiveDoc: (boardId, key, data) => run(`INSERT INTO t3d.live_docs (board_id, key, data, updated_at) VALUES ($1, $2, $3, $4)
      ON CONFLICT (board_id, key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`, [boardId, key, JSON.stringify(data), now()]),
    deleteLiveDoc: (boardId, key) => run('DELETE FROM t3d.live_docs WHERE board_id = $1 AND key = $2', [boardId, key]),
  };
}

/* `pool` es un pg.Pool (o cualquier objeto con query() y connect()). */
function createDb(pool) {
  const q = makeQueries(pool);

  async function migrate() {
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
      await client.query('CREATE SCHEMA IF NOT EXISTS t3d');
      await client.query('CREATE TABLE IF NOT EXISTS t3d.schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at BIGINT NOT NULL)');
      const applied = new Set((await client.query('SELECT version FROM t3d.schema_migrations')).rows.map((r) => r.version));
      const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();
      const appliedNow = [];
      for (const file of files) {
        const version = Number(file.slice(0, 3));
        if (applied.has(version)) continue;
        await client.query('BEGIN');
        try {
          await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
          await client.query('INSERT INTO t3d.schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)', [version, file, now()]);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw new Error(`La migración t3d/${file} falló: ${e.message}`);
        }
        appliedNow.push('t3d/' + file);
      }
      // lo guardado antes de 006 se mide igual que al escribir (JSON.stringify del documento: mismos bytes que el jsonb leído)
      for (const table of ['scenes', 'campaigns']) for (const r of await q.unsized(table)) await q.setSize(table, r.board_id, r.id, jsonOf(r.data)[1]);
      return appliedNow;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
      client.release();
    }
  }

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

  /* Guarda un dibujo con sus capas en una transacción: las capas viejas se sustituyen. */
  async function saveDrawing(boardId, drawing, layers) {
    await tx(async (t) => {
      await t.upsertDrawing(boardId, drawing);
      await t.clearDrawingLayers(boardId, drawing.id);
      for (const l of layers) await t.insertDrawingLayer(boardId, drawing.id, l);
    });
  }

  return { q, tx, migrate, saveDrawing };
}

module.exports = { createDb };
