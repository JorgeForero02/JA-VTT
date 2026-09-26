'use strict';
/**
 * Módulo del tablero 3D (escenas, campañas, dibujos y mesa en vivo), montable dentro de un
 * anfitrión con el núcleo de Just Another VTT (users, sessions, boards, board_members,
 * chat_messages). Sus tablas viven en el esquema `t3d` y todo su SQL en ./db.js. Lo que el
 * anfitrión tiene que añadir está en docs/08-integracion-ja-vtt.md.
 *
 * createTablero3D(host), con `host`:
 *   pool                                   pg.Pool del anfitrión, que ya convierte BIGINT a Number.
 *   memberRole(boardId, userId)          → 'gm' | 'player' | null (null: no es miembro o no existe).
 *   postChat(boardId, user, kind, body)    guarda un mensaje en chat_messages del anfitrión (y, si
 *                                          quiere, lo reparte a su chat); `user` = { id, name, color }.
 *                                          El módulo lo usa para las tiradas: kind 'roll' y el cuerpo de
 *                                          JA-VTT { formula, dice: [{ n, sides, sign, rolls }], mod, total, label? }
 *                                          (más `adv` con ventaja o desventaja), ver ./dice.js.
 *   touchBoard(boardId)                    opcional: marca boards.updated_at.
 *   boardSettings(boardId)               → opcional (con setBoardSettings): los ajustes del tablero del anfitrión (JA-VTT: su
 *                                          b.settings en memoria o, sin abrir, boards.settings). Con los dos, los ajustes con
 *                                          clave de JA-VTT (rules.HOST_SETTINGS: su BOARD_KEYS salvo `initiative`) son los
 *                                          del anfitrión, la única fuente: el módulo los lee aquí (saneados con
 *                                          rules.cleanSettings) y en t3d.boards.settings guarda sólo los propios del 3D.
 *                                          Sin ellos (suelto, este repo), todo en t3d.boards.settings.
 *   setBoardSettings(boardId, patch)       opcional (con boardSettings): guarda en el anfitrión los ajustes con clave de
 *                                          JA-VTT que cambia el director en el 3D (ya saneados) y avisa a sus clientes.
 *                                          No hace falta que llame a settingsChanged: el módulo ya reparte los suyos.
 *   enabled                                opcional: false deja el módulo apagado (rutas 404, sin migrar).
 *   allBoards3D                            opcional: true en un anfitrión en el que todo tablero es 3D (este repo):
 *                                          migrate() marca como 3D todos los tableros que haya. JA-VTT no lo pone.
 *
 * Tipo de mesa: un tablero es 3D si tiene fila en t3d.boards. Se elige al crear el tablero y es fijo:
 * no hay ruta ni función para quitarlo. Todo lo del 3D (rutas, /t3d/ws, join) responde 404 en un
 * tablero que no es 3D.
 *
 * Devuelve:
 *   name, publicDir                    't3d' y la carpeta del cliente del módulo.
 *   migrate()                          sus migraciones, control en t3d.schema_migrations. Después de las del anfitrión.
 *                                      Con allBoards3D, además marca como 3D los tableros existentes (en cada arranque).
 *   serve(req, res, url)               estáticos del cliente bajo /t3d/ (el anfitrión se lo pasa todo lo que empiece por /t3d/).
 *   api(req, res, url, user, parts)    rutas /api/t3d/boards/:id (GET: ¿es 3D?; POST: marcarlo 3D al crearlo,
 *                                      sólo el director y en los MARK_WINDOW_MS tras crearlo) y
 *                                      /api/t3d/boards/:id/{scenes,campaigns,drawings,usage,settings,travel} y
 *                                      …/scenes/:sid/portals (sólo tableros 3D);
 *                                      `parts` sin «api» (parts[0] === 't3d'). Los errores con `status`
 *                                      se lanzan como en el anfitrión, que responde { error }.
 *   socket(ws, user, boardId)          conexión propia del módulo (/t3d/ws?board=…): el anfitrión acepta el
 *                                      upgrade con su ws.js y se la pasa. Así el anfitrión no toca su WebSocket.
 *   kick(boardId, userId)              cierra las conexiones propias de quien sale o es expulsado del tablero.
 *   onBoardDeleted(boardId)            antes de borrar un tablero: olvida su mesa y cierra sus conexiones.
 *   markBoard(boardId)                 marca como 3D un tablero que el anfitrión acaba de crear (sin permisos ni plazo:
 *                                      lo llama el servidor del anfitrión, no el navegador). Idempotente.
 *   tagBoards(boards)                  para el panel: añade `t3d: true` a los tableros 3D y no toca nada más.
 *   describeBoards(boards)             tagBoards y además `scenes` (escenas 3D). Sólo para un anfitrión sin escenas propias
 *                                      (este repo): en JA-VTT pisaría su recuento de escenas 2D.
 *   settingsChanged(boardId)           el anfitrión con boardSettings avisa de que cambió sus ajustes por su cuenta (JA-VTT:
 *                                      desde su pestaña Mesa): la mesa 3D abierta los relee y los reparte (`settings` y las
 *                                      vistas que dependen de ellos). Además, cada tirada, cambio de la mesa y cruce relee
 *                                      los del anfitrión antes de decidir, así que un aviso que falte no deja pasar nada.
 *   close()                            al apagar: cierra conexiones, para el volcado y vuelca lo pendiente.
 *   isLoaded(boardId), flushAll()      la mesa en vivo se vuelca sola cada FLUSH_MS.
 *   join(conn) / ws(conn, msg) / leave(conn)
 *                                      alternativa a `socket` para un anfitrión que reparta la mesa por su
 *                                      propio WebSocket (este repo): join → campos extra del `state`
 *                                      ({ peer, peers, live, settings }); ws → true si el mensaje era del 3D (`live`,
 *                                      `emit`, `presence`, `roll`, `travel`, `gather`); leave al cerrarse. Cada
 *                                      conexión recibe la mesa filtrada para su rol (rules.liveDocFor: fichas
 *                                      ocultas, CA, vida, anotaciones, planos e iniciativa del jugador). `conn` = { ws: { send(objeto |
 *                                      texto) }, user: { id, name, color }, role, board: { id } }; los tres, en
 *                                      serie por tablero (la cola del anfitrión).
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createDb } = require('./db');
const R = require('./rules');
const dice = require('./dice');

const BOARD_QUOTA = 500 * 1024 * 1024;
const FLUSH_MS = 400;
const LIST_LIMIT = { scenes: 40, campaigns: 30, drawings: 120 };
const MAX_EMIT = 4096;
const MAX_PRESENCE = 4096;
const RESERVED_TOPICS = ['roll', 'travelAsk']; // sólo los manda el servidor
const PING_MS = 25000;
const MARK_WINDOW_MS = 10 * 60 * 1000; // plazo para elegir «Mesa 3D» tras crear el tablero en el anfitrión
const NOT_3D = 'Este tablero no es una mesa 3D';
const PUBLIC_DIR = path.join(__dirname, 'public');
const PREFIX = '/t3d';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
};

/* Respuesta y cuerpo JSON propios: cada ruta con su límite (R.BODY_LIMITS, sacado del documento más grande que acepta). */
function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length });
  res.end(data);
}
const fail = (res, status, error) => json(res, status, { error });
const sizeText = (n) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const tooBig = () => Object.assign(new Error(`La petición es demasiado grande: aquí se admiten hasta ${sizeText(limit)}`), { status: 413 });
    // lo que sobra se descarta sin guardarlo (y sin cortar la conexión, para que llegue la respuesta 413)
    if (Number(req.headers['content-length']) > limit) { req.resume(); return reject(tooBig()); }
    let size = 0, over = false; const chunks = [];
    req.on('data', (c) => { if (over) return; size += c.length; if (size > limit) { over = true; chunks.length = 0; reject(tooBig()); } else chunks.push(c); });
    req.on('end', () => { if (over) return; try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('JSON no válido'), { status: 400 })); } });
    req.on('error', reject);
  });
}

/* Estáticos del cliente (/t3d/…): el módulo los sirve él mismo para no depender del servidor de archivos del anfitrión. */
function serve(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname).slice(PREFIX.length); } catch { return fail(res, 400, 'Ruta no válida'); }
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  const inside = path.relative(PUBLIC_DIR, file);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return fail(res, 403, 'Prohibido');
  fs.readFile(file, (err, data) => {
    if (err) return fail(res, 404, `Tablero 3D: no existe ${url.pathname}`);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* Módulo apagado (host.enabled === false): mismas funciones, sin rutas, sin tablas y sin temporizadores. */
function disabled() {
  const off = (req, res) => fail(res, 404, 'Ruta no encontrada');
  const nothing = () => {};
  // t3d.js vacío (y no un 404): la página del anfitrión carga sin errores y sin `Tablero3D`, y esconde la entrada al 3D
  const serveOff = (req, res, url) => {
    if (url.pathname !== PREFIX + '/t3d.js') return off(req, res);
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
    res.end('/* Tablero 3D desactivado (T3D=off) */\n');
  };
  return {
    name: 't3d', publicDir: PUBLIC_DIR, enabled: false,
    migrate: async () => [], serve: serveOff, api: async (req, res) => off(req, res),
    socket: (ws) => { ws.send({ t: 'error', error: 'El tablero 3D no está activado' }); ws.close(4404); },
    kick: nothing, onBoardDeleted: nothing, settingsChanged: async () => {}, describeBoards: async (boards) => boards, tagBoards: async (boards) => boards,
    markBoard: async () => false, close: async () => {},
    isLoaded: () => false, flushAll: async () => {}, join: async () => ({}), ws: async () => false, leave: nothing,
  };
}

function createTablero3D(host) {
  if (host.enabled === false) return disabled();
  const { q, tx, migrate: migrateDb, saveDrawing } = createDb(host.pool);
  const touch = (boardId) => (host.touchBoard ? host.touchBoard(boardId) : null);

  /* Ajustes del tablero: integrado (boardSettings + setBoardSettings), los de clave de JA-VTT son los del anfitrión; suelto,
     todos en t3d.boards.settings. `own` = lo guardado en t3d.boards.settings (sólo cuentan sus claves propias del 3D). */
  const hostSettings = typeof host.boardSettings === 'function' && typeof host.setBoardSettings === 'function';
  const withHost = async (id, own) => R.cleanSettings(R.settingsParts(await host.boardSettings(id)).host, R.settingsParts(own).own);
  async function readSettings(id) {
    const own = await q.boardSettings(id);
    return hostSettings ? withHost(id, own) : R.cleanSettings(own);
  }
  async function writeSettings(id, patch) {
    const next = R.cleanSettings(patch, await readSettings(id));
    if (!hostSettings) { await q.setBoardSettings(id, next); return next; }
    const parts = R.settingsParts(next);
    await host.setBoardSettings(id, parts.host);
    await q.setBoardSettings(id, parts.own);
    return next;
  }

  /* ---------------- API REST ---------------- */
  const sceneOut = (r) => Object.assign({}, r.data, { id: r.id, name: r.name, updated: r.updated_at });
  const campaignOut = (r) => Object.assign({}, r.data, { id: r.id, name: r.name, updated: r.updated_at });
  async function drawingsOut(boardId, rows) {
    const layers = rows.length ? await q.drawingLayers(boardId, rows.map((r) => r.id)) : [];
    return rows.map((r) => R.drawingRecord(r, layers.filter((l) => l.drawing_id === r.id)));
  }
  // el documento que se sustituye no cuenta dos veces: uso sin él + su tamaño nuevo (la misma medida que guarda db.js)
  async function overQuota(boardId, kind, docId, size) {
    return (await q.boardUsage(boardId, { kind, id: docId })).bytes + size > BOARD_QUOTA;
  }

  /* Definiciones de piezas del tablero (fase 0 del arte propio): las leen los miembros (el jugador, sin las gmOnly) y las
     cambia el director. El id de la ruta es el de la definición sin «p:». `boardPieces` es lo que reciben cleanMap,
     cleanCampaign, sceneFor, campaignFor… (Ruling R3b) para que una pieza `p:` valide y se filtre igual que una de fábrica. */
  const MAX_PIECES = 300;
  const PIECE_IN_USE = 'Esa pieza está colocada en el tablero: quítala de sus escenas antes de borrarla';
  async function boardPieces(id) { return new Map((await q.pieces(id)).map((r) => [r.id, r.data])); }
  // Ronda de arreglos 1, «Importante 1b»: además de escenas y campañas guardadas (q.pieceInUse), la mesa en vivo
  // cargada puede tener la pieza en su documento `board` sin haberlo volcado aún.
  function liveUsesPiece(id, defId) {
    const L = live.get(id), bd = L && L.docs.get('board');
    return !!(bd && bd.board && Array.isArray(bd.board.props) && bd.board.props.some((p) => p.def === defId));
  }
  async function piecesRoutes(req, res, id, role, pid) {
    const M = req.method;
    if (!pid) {
      if (M !== 'GET') return fail(res, 404, 'Ruta no encontrada');
      const defs = (await q.pieces(id)).map((r) => r.data).filter((d) => role === 'gm' || !(d.components && d.components.gmOnly));
      return json(res, 200, { pieces: defs });
    }
    if (role !== 'gm') return fail(res, 403, 'Solo el director cambia las piezas del tablero');
    if (!/^[a-z0-9]{2,40}$/.test(pid)) return fail(res, 400, 'Identificador no válido');
    const defId = 'p:' + pid;
    if (M === 'DELETE') {
      if (await q.pieceInUse(id, defId) || liveUsesPiece(id, defId)) return fail(res, 409, PIECE_IN_USE);
      await q.deletePiece(id, defId);
      await touch(id);
      bumpPiecesRev(id);
      await refreshLivePieces(id);
      return json(res, 200, { ok: true });
    }
    if (M !== 'PUT') return fail(res, 404, 'Ruta no encontrada');
    const body = await readJson(req, R.BODY_LIMITS.small);
    const def = R.cleanPiece(body);
    if (!def || def.id !== defId) return fail(res, 400, 'La pieza no es válida');
    const exists = await q.pieceExists(id, def.id);
    if (!exists && (await q.countPieces(id)) >= MAX_PIECES) return fail(res, 413, `Un tablero admite hasta ${MAX_PIECES} piezas`);
    if (await overQuota(id, 'pieces', def.id, R.docBytes(def))) return fail(res, 413, 'El almacén del tablero está lleno');
    await q.upsertPiece(id, def.id, def.name, def);
    await touch(id);
    bumpPiecesRev(id);
    await refreshLivePieces(id);
    return json(res, 200, { ok: true });
  }

  /* Escenas, campañas y dibujos: los leen todos los miembros (el jugador, filtrados como en la mesa: sin fichas ocultas, CA
     ni vida ajenas, anotaciones del director ni planos sin publicar); los cambia el director. `board` (Ruling R3b): las
     definiciones `p:` del tablero, para que cleanMap/cleanCampaign/sceneFor/campaignFor validen y filtren igual que una
     pieza de fábrica. Sólo hace falta para escenas y campañas (los dibujos no tienen piezas). */
  async function contentRoutes(req, res, user, id, gm, kind, itemId) {
    const M = req.method;
    const member = { role: gm ? 'gm' : 'player', user_id: user.id };
    const settings = gm || kind === 'drawings' ? null : await readSettings(id);
    const board = kind === 'scenes' || kind === 'campaigns' ? await boardPieces(id) : null;
    const sceneView = (r) => (gm ? sceneOut(r) : Object.assign(R.sceneFor(r.data, member, settings, board), { id: r.id, name: r.name, updated: r.updated_at }));
    const campaignView = (r) => (gm ? campaignOut(r) : R.campaignFor(campaignOut(r), member, settings, board));
    if (!itemId) {
      if (M !== 'GET') return fail(res, 404, 'Ruta no encontrada');
      if (kind === 'scenes') return json(res, 200, { scenes: (await q.scenes(id, LIST_LIMIT.scenes)).map(sceneView) });
      if (kind === 'campaigns') return json(res, 200, { campaigns: (await q.campaigns(id, LIST_LIMIT.campaigns)).map(campaignView) });
      return json(res, 200, { drawings: await drawingsOut(id, await q.drawings(id, LIST_LIMIT.drawings)) });
    }
    const docId = R.docId(itemId);
    if (!docId) return fail(res, 400, 'Identificador no válido');
    if (M === 'GET' && kind === 'scenes') {
      const row = await q.scene(id, docId);
      return row ? json(res, 200, { scene: sceneView(row) }) : fail(res, 404, 'Escena no encontrada');
    }
    if (!gm) return fail(res, 403, 'Solo el director puede cambiar el contenido del tablero');
    if (M === 'DELETE') {
      const del = { scenes: q.deleteScene, campaigns: q.deleteCampaign, drawings: q.deleteDrawing }[kind];
      await del(id, docId);
      if (kind === 'scenes') await clearPortalsTo(id, docId);
      await touch(id);
      return json(res, 200, { ok: true });
    }
    if (M !== 'PUT') return fail(res, 404, 'Ruta no encontrada');
    const body = await readJson(req, R.BODY_LIMITS[kind]);
    const full = 'El almacén del tablero está lleno';
    if (kind === 'scenes') {
      const map = R.cleanMap(body, board);
      if (!map) return fail(res, 400, 'La escena no es válida o es demasiado grande');
      if (await overQuota(id, kind, docId, R.docBytes(map))) return fail(res, 413, full);
      await q.upsertScene(id, docId, map.name, map.w, map.d, map);
    } else if (kind === 'campaigns') {
      const camp = R.cleanCampaign(Object.assign({}, body, { id: docId }), board);
      if (!camp) return fail(res, 400, 'La campaña no es válida o es demasiado grande');
      if (await overQuota(id, kind, docId, R.docBytes(camp))) return fail(res, 413, full);
      await q.upsertCampaign(id, docId, camp.name, camp);
    } else {
      const parsed = R.cleanDrawing(body);
      if (!parsed) return fail(res, 400, 'El dibujo no es válido o es demasiado grande');
      if (await overQuota(id, kind, docId, parsed.drawing.size)) return fail(res, 413, full);
      await saveDrawing(id, Object.assign(parsed.drawing, { id: docId, ownerId: user.id }), parsed.layers);
    }
    await touch(id);
    return json(res, 200, { ok: true });
  }

  /* ---------------- portales (como los de JA-VTT, entre escenas 3D del tablero) ---------------- */
  // al borrar una escena, los portales que llevaban allí se quedan sin destino: en las escenas guardadas y en la mesa abierta
  async function clearPortalsTo(boardId, sceneId) {
    const board = await boardPieces(boardId);
    for (const r of await q.allScenes(boardId)) {
      const map = R.cleanMap(r.data, board);
      if (map && R.clearPortalsTo(map, sceneId)) await q.setSceneData(boardId, r.id, map);
    }
    const L = live.get(boardId), bd = L && L.docs.get('board');
    if (bd && bd.board && R.clearPortalsTo(bd.board, sceneId)) {
      bd.rev = Date.now(); L.dirty.add('board');
      broadcastDoc(L, 'board');
    }
  }
  const newTokenId = () => 'm' + crypto.randomBytes(4).toString('hex');
  const httpError = (status, message) => Object.assign(new Error(message), { status });
  /* Lleva fichas de la escena `fromId` (su mapa `src`, con los personajes) a `targetId`, junto a su portal `portalId` (o al
     punto de entrada), y guarda las dos escenas. pick = { ids } o { players: true } (todo el grupo, «Reunir al grupo»).
     `board` (Ruling R3b): las definiciones `p:` del tablero, para R.cleanMap y R.travelPlan (una pieza del tablero bloquea
     igual que una de fábrica al buscar sitio de llegada). */
  async function moveScenes(boardId, fromId, src, targetId, portalId, pick, board) {
    const same = targetId === fromId;
    const row = same ? null : await q.scene(boardId, targetId);
    const dst = same ? src : row && R.cleanMap(row.data, board);
    if (!dst) throw httpError(404, 'Esa escena ya no existe');
    const plan = R.travelPlan(src, dst, Object.assign({ portal: portalId }, pick), board);
    await tx(async (t) => {
      if (!same) await t.upsertScene(boardId, fromId, plan.src.name, plan.src.w, plan.src.d, plan.src);
      await t.upsertScene(boardId, targetId, plan.dst.name, plan.dst.w, plan.dst.d, plan.dst);
    });
    await touch(boardId);
    return plan;
  }
  // destino de un cruce: por un portal de `map` (con destino) o, al reunir al grupo, una escena
  function destination(map, d) {
    if (Number.isInteger(d.portal)) {
      const portal = R.portalIn(map, d.portal);
      if (!portal || !portal.target) throw httpError(400, 'Ese portal no lleva a ninguna escena');
      return { portal, targetId: portal.target.scene, portalId: portal.target.portal };
    }
    const targetId = R.docId(d.scene);
    if (!targetId) throw httpError(400, 'Elige la escena a la que va el grupo');
    return { portal: null, targetId, portalId: null };
  }
  const pickOf = (d) => (d.all || !Number.isInteger(d.portal) ? { players: true } : { ids: Array.isArray(d.tokens) ? d.tokens.filter((x) => typeof x === 'string').slice(0, 500) : [] });
  /* Fuera de la mesa en vivo, el director cruza (o reúne al grupo) con la escena que tiene abierta: la manda con sus personajes */
  async function travelRoute(req, res, id) {
    const body = await readJson(req, R.BODY_LIMITS.travel);
    const board = await boardPieces(id);
    const fromId = R.docId(body.from), map = R.cleanMap(body.map, board);
    if (!fromId || !map) return fail(res, 400, 'La escena de origen no es válida');
    const { targetId, portalId } = destination(map, { portal: body.portal, scene: body.to });
    const plan = await moveScenes(id, fromId, map, targetId, portalId, pickOf(body), board);
    return json(res, 200, { scene: Object.assign({}, plan.dst, { id: targetId }), moved: plan.moved, left: plan.left });
  }
  async function portalsRoute(res, id, sceneId) {
    const row = sceneId && await q.scene(id, sceneId);
    const map = row && R.cleanMap(row.data, await boardPieces(id));
    if (!map) return fail(res, 404, 'Escena no encontrada');
    const portals = map.props.filter((p) => p.type === 'portal').map((p) => ({ id: p.id, name: p.name || '', look: p.look, target: p.target }));
    return json(res, 200, { scene: { id: row.id, name: row.name }, portals });
  }
  /* Ajustes del tablero (los de JA-VTT: playersDoors, dados, vida…): los leen los miembros y los cambia el director; la mesa
     abierta se entera al momento. Integrado, se leen y guardan en el anfitrión (readSettings/writeSettings). */
  async function settingsRoute(req, res, id, role) {
    if (req.method === 'GET') return json(res, 200, { settings: await readSettings(id) });
    if (req.method !== 'PATCH') return fail(res, 404, 'Ruta no encontrada');
    if (role !== 'gm') return fail(res, 403, 'Solo el director cambia los ajustes del tablero');
    const settings = await writeSettings(id, await readJson(req, R.BODY_LIMITS.small));
    const L = live.get(id);
    if (L) pushSettings(L, settings, true);
    return json(res, 200, { settings });
  }
  /* Nuevos ajustes en la mesa abierta: se reparten (y las vistas que dependen de ellos) si cambian o si `always` */
  function pushSettings(L, settings, always) {
    if (!always && JSON.stringify(settings) === JSON.stringify(L.settings)) return;
    L.settings = settings; broadcast(L, { t: 'settings', settings });
    // la vida, la CA y la iniciativa que ve cada jugador dependen de los ajustes
    for (const k of ['tokens', 'combat']) if (L.docs.has(k)) broadcastDoc(L, k, (c) => c.role !== 'gm');
  }
  // integrado: los ajustes del anfitrión pueden haber cambiado por su cuenta; se releen (en memoria en JA-VTT) antes de decidir
  async function syncSettings(L) {
    if (hostSettings) pushSettings(L, await withHost(L.id, L.settings));
  }
  async function settingsChanged(boardId) {
    const L = live.get(boardId);
    if (L && hostSettings) await syncSettings(L);
  }

  async function migrate() {
    const applied = await migrateDb();
    if (host.allBoards3D) await q.markAll3d();
    return applied;
  }

  /* Tipo de mesa: consultarlo (miembros) y elegir «Mesa 3D» al crear el tablero (director, una vez y sin vuelta atrás) */
  async function typeRoutes(req, res, id, role) {
    const M = req.method;
    if (M === 'GET') return json(res, 200, { board: { id, t3d: await q.is3d(id), role } });
    if (M === 'POST') {
      if (role !== 'gm') return fail(res, 403, 'Solo el director elige el tipo de mesa');
      if (!await q.mark3d(id, Date.now() - MARK_WINDOW_MS)) return fail(res, 409, 'El tipo de mesa se elige al crear el tablero y ya no se puede cambiar');
      return json(res, 200, { board: { id, t3d: true, role } });
    }
    if (M === 'DELETE') return fail(res, 409, 'El tipo de mesa es fijo: un tablero 3D no vuelve a 2D');
    return fail(res, 404, 'Ruta no encontrada');
  }

  async function api(req, res, url, user, parts) {
    const [, top, id, kind, itemId] = parts;
    if (top !== 'boards' || !id) return fail(res, 404, 'Ruta no encontrada');
    const role = await host.memberRole(id, user.id);
    if (!role) return fail(res, 404, 'Tablero no encontrado');
    if (!kind) return typeRoutes(req, res, id, role);
    if (!await q.is3d(id)) return fail(res, 404, NOT_3D);
    if (kind === 'usage' && req.method === 'GET') return json(res, 200, { usage: { bytes: (await q.boardUsage(id)).bytes, quota: BOARD_QUOTA } });
    if (kind === 'settings' && !itemId) return settingsRoute(req, res, id, role);
    if (kind === 'travel' && !itemId && req.method === 'POST') {
      if (role !== 'gm') return fail(res, 403, 'Fuera de la mesa en vivo sólo el director cruza portales');
      return travelRoute(req, res, id);
    }
    if (kind === 'scenes' && parts[5] === 'portals' && req.method === 'GET') return portalsRoute(res, id, R.docId(itemId));
    if (kind === 'pieces') return piecesRoutes(req, res, id, role, itemId);
    if (['scenes', 'campaigns', 'drawings'].includes(kind)) return contentRoutes(req, res, user, id, role === 'gm', kind, itemId);
    return fail(res, 404, 'Ruta no encontrada');
  }

  async function tagBoards(boards) {
    const is3d = new Set(boards.length ? (await q.boards3d(boards.map((b) => b.id))).map((r) => r.board_id) : []);
    for (const b of boards) if (is3d.has(b.id)) b.t3d = true;
    return boards;
  }
  async function describeBoards(boards) {
    const counts = boards.length ? await q.sceneCounts(boards.map((b) => b.id)) : [];
    const n = new Map(counts.map((r) => [r.board_id, r.n]));
    for (const b of boards) b.scenes = n.get(b.id) || 0;
    return tagBoards(boards);
  }
  const markBoard = (boardId) => q.mark3d(boardId, null);

  /* ---------------- mesa en vivo en memoria ---------------- */
  // boardId → { id, docs, dirty, removed, clients: Map(conn → { peer, presence, updatedAt }), flushing }
  const live = new Map();
  // Ronda de arreglos 1, «Menor 2»: boardId → número, lo incrementa cada PUT/DELETE de pieza (bumpPiecesRev);
  // openLive lo lee antes y después de cargar las definiciones para no quedarse con una versión a medio abrir
  // si una pieza cambió justo mientras `boardPieces` estaba en vuelo.
  const piecesRev = new Map();
  const bumpPiecesRev = (id) => piecesRev.set(id, (piecesRev.get(id) || 0) + 1);

  async function openLive(id) {
    const cached = live.get(id);
    if (cached) return cached;
    const docs = new Map();
    for (const r of await q.liveDocs(id)) docs.set(r.key, r.data);
    // un combate guardado con el formato de antes (order) pasa a la iniciativa de JA-VTT
    const cb = docs.get('combat');
    if (cb && !cb.initiative) docs.set('combat', R.cleanLiveDoc('combat', cb, (docs.get('tokens') || {}).tokens));
    const settings = await readSettings(id);
    const rev0 = piecesRev.get(id) || 0;
    let pieces = await boardPieces(id); // Ruling R3b: las definiciones `p:` del tablero, para toda la mesa en vivo
    if ((piecesRev.get(id) || 0) !== rev0) pieces = await boardPieces(id); // cambió mientras cargaba: la de antes no vale
    if (live.has(id)) return live.get(id);
    const L = { id, docs, settings, pieces, dirty: new Set(), removed: new Set(), clients: new Map(), flushing: false };
    live.set(id, L);
    return L;
  }
  /* Tras un PUT/DELETE de una pieza del tablero (Ruling R3b): si la mesa está cargada, refresca sus definiciones para que
     la próxima lectura (viewFor, liveChange, handleTravel) las vea al día sin esperar a que la mesa se descargue, y
     reparte otra vez el documento `board` (Menor 1): un cambio a gmOnly tiene que aplicarse ya a los jugadores conectados,
     no sólo a la próxima vez que se toque la mesa. */
  async function refreshLivePieces(id) {
    const L = live.get(id);
    if (!L) return;
    L.pieces = await boardPieces(id);
    if (L.docs.has('board')) broadcastDoc(L, 'board');
  }

  async function flush(L) {
    if (L.flushing || (!L.dirty.size && !L.removed.size)) return;
    const dirty = [...L.dirty].filter((k) => L.docs.has(k)).map((k) => [k, L.docs.get(k)]);
    const removed = [...L.removed];
    L.dirty.clear(); L.removed.clear();
    L.flushing = true;
    try {
      await tx(async (t) => {
        for (const k of removed) await t.deleteLiveDoc(L.id, k);
        for (const [k, data] of dirty) await t.upsertLiveDoc(L.id, k, data);
      });
    } catch (e) {
      // se vuelve a marcar todo para reintentarlo en el siguiente ciclo
      for (const k of removed) if (!L.docs.has(k)) L.removed.add(k);
      for (const [k] of dirty) L.dirty.add(k);
      throw e;
    } finally {
      L.flushing = false;
    }
    await touch(L.id);
  }
  async function flushAll() {
    for (const L of live.values()) {
      try { await flush(L); } catch (e) { console.error('No se pudo guardar la mesa 3D del tablero', L.id, e.message); }
      if (!L.clients.size && !L.flushing && !L.dirty.size && !L.removed.size) live.delete(L.id);
    }
  }
  const flushTimer = setInterval(flushAll, FLUSH_MS);
  flushTimer.unref();

  const peerList = (L) => [...L.clients].map(([c, p]) => ({ peer: p.peer, by: String(c.user.id), presence: p.presence, updatedAt: p.updatedAt }));
  function onlineList(L) {
    const seen = new Map();
    for (const c of L.clients.keys()) seen.set(c.user.id, { id: c.user.id, name: c.user.name, color: c.user.color, role: c.role });
    return [...seen.values()];
  }
  function broadcast(L, msg, except) {
    const s = JSON.stringify(msg);
    for (const c of L.clients.keys()) if (c !== except) c.ws.send(s);
  }
  /* Un documento de la mesa a cada conexión, filtrado para su rol (R.liveDocFor); `only(conn)` limita a quién va */
  const docsOf = (L) => Object.fromEntries(L.docs);
  const viewFor = (L, c, key) => R.liveDocFor(key, L.docs.has(key) ? L.docs.get(key) : null, { role: c.role, user_id: c.user.id }, L.settings, docsOf(L), L.pieces);
  function broadcastDoc(L, key, only) {
    const cache = new Map(); // mismo rol y usuario, misma vista
    for (const c of L.clients.keys()) {
      if (only && !only(c)) continue;
      const k = c.role === 'gm' ? 'gm' : 'u' + c.user.id;
      if (!cache.has(k)) cache.set(k, JSON.stringify({ t: 'doc', key, data: viewFor(L, c, key) }));
      c.ws.send(cache.get(k));
    }
  }
  const sendPeers = (L, except) => broadcast(L, { t: 'peers', peers: peerList(L), online: onlineList(L) }, except);

  async function join(conn) {
    if (!await q.is3d(conn.board.id)) return {}; // tablero 2D: el módulo no lo atiende (ws devolverá false)
    const L = await openLive(conn.board.id);
    if (!live.has(L.id)) live.set(L.id, L); // pudo descargarse mientras se abría
    await syncSettings(L);
    const p = { peer: 'p' + crypto.randomBytes(5).toString('hex'), presence: {}, updatedAt: Date.now() };
    L.clients.set(conn, p);
    sendPeers(L, conn); // quien entra recibe lo mismo dentro de su `state`
    const views = {};
    for (const k of L.docs.keys()) views[k] = viewFor(L, conn, k);
    return { peer: p.peer, peers: peerList(L), live: views, settings: L.settings };
  }
  function leave(conn) {
    const L = live.get(conn.board.id);
    if (!L || !L.clients.delete(conn)) return;
    sendPeers(L);
  }

  /* Cambios de la mesa en vivo: el servidor decide (rules.liveChange) y reenvía a todos */
  function handleLive(L, c, d) {
    const key = String(d.key || '');
    const member = { role: c.role, user_id: c.user.id };
    const tokens = (L.docs.get('tokens') || { tokens: {} }).tokens;
    const result = R.liveChange(member, key, d.op, d.data, L.docs.get(key) || null, { board: L.docs.get('board'), settings: L.settings, tokens, pieces: L.pieces });
    const ack = (ok, error) => { if (d.req != null) c.ws.send({ t: 'ack', req: d.req, ok, error }); };
    if (result.error) return ack(false, result.error);
    if (result.doc === null) { L.docs.delete(key); L.dirty.delete(key); L.removed.add(key); }
    else { L.docs.set(key, result.doc); L.dirty.add(key); L.removed.delete(key); }
    ack(true);
    broadcastDoc(L, key);
    // lo que ve un jugador del combate depende de las fichas (las ocultas no salen en su iniciativa)
    if (key === 'tokens' && L.docs.has('combat')) broadcastDoc(L, 'combat', (conn) => conn.role !== 'gm');
  }

  /* Portales en la mesa en vivo. La mesa sigue la escena del director (live/board.scene): cuando él cruza (con fichas o con
     todo el grupo) o reúne al grupo en otra escena, las que cruzan llegan junto al portal de destino, las que se quedan se
     guardan en la escena de origen y la mesa pasa a la de destino. Un jugador cruza con su ficha si está junto al portal:
     el director recibe el aviso (`travelAsk`) y decide, como con los pasos de campaña de antes. */
  async function handleTravel(L, c, d) {
    const ack = (ok, error, extra) => { if (d.req != null) c.ws.send(Object.assign({ t: 'ack', req: d.req, ok, error }, extra)); };
    const bd = L.docs.get('board');
    if (!bd || !bd.open || !bd.board) return ack(false, 'La mesa en vivo no está abierta');
    const tokens = (L.docs.get('tokens') || { tokens: {} }).tokens, gm = c.role === 'gm';
    if (d.t === 'gather' && !gm) return ack(false, 'Sólo el director reúne al grupo');
    try {
      const dest = destination(bd.board, d.t === 'gather' ? { scene: d.scene } : { portal: d.portal });
      const pick = d.t === 'gather' ? { players: true } : pickOf(d);
      if (!gm) {
        const uid = String(c.user.id), mine = pick.ids.length === 1 ? tokens[pick.ids[0]] : null;
        if (!mine || mine.owner !== uid) return ack(false, 'Solo puedes cruzar con tus propios personajes');
        if (!R.nearPortal(mine, dest.portal)) return ack(false, 'Acércate más al portal para cruzarlo');
        const ask = { t: 'msg', topic: 'travelAsk', data: { portal: dest.portal.id, token: pick.ids[0], scene: dest.targetId }, peer: null, by: uid };
        for (const conn of L.clients.keys()) if (conn.role === 'gm') conn.ws.send(ask);
        return ack(true, undefined, { asked: true });
      }
      if (!bd.scene) return ack(false, 'Guarda la escena en el tablero antes de cruzar');
      const src = Object.assign({}, bd.board, { minis: R.tokensToMinis(tokens) });
      const plan = await moveScenes(L.id, bd.scene, src, dest.targetId, dest.portalId, pick, L.pieces);
      const docs = { board: { open: true, rev: Date.now(), scene: dest.targetId, board: Object.assign({}, plan.dst, { minis: [] }) }, tokens: { tokens: R.minisToTokens(plan.dst.minis, newTokenId) } };
      for (const [k, v] of Object.entries(docs)) { L.docs.set(k, v); L.dirty.add(k); L.removed.delete(k); }
      for (const k of Object.keys(docs)) broadcastDoc(L, k);
      return ack(true, undefined, { moved: plan.moved, left: plan.left });
    } catch (e) {
      if (e.status) return ack(false, e.message);
      throw e;
    }
  }

  /* Momentos: señales y demás avisos entre clientes (las tiradas y los avisos de cruce los manda sólo el servidor) */
  function handleEmit(L, c, p, d) {
    const topic = R.str(d.topic, 40);
    const data = d.data === undefined ? null : d.data;
    if (!topic || RESERVED_TOPICS.includes(topic) || JSON.stringify(data).length > MAX_EMIT) return c.ws.send({ t: 'error', error: 'Mensaje no válido' });
    broadcast(L, { t: 'msg', topic, data, peer: p.peer, by: String(c.user.id) });
  }

  /* Tiradas: como handleRoll de JA-VTT, el servidor tira (./dice.js) y el resultado llega a todos (`msg` con topic 'roll') y
     queda en el chat del tablero (chat_messages, kind 'roll', con el cuerpo de JA-VTT). diceEnabled apagado: nadie tira. */
  async function handleRoll(L, c, p, d) {
    const ack = (ok, error, extra) => { if (d.req != null) c.ws.send(Object.assign({ t: 'ack', req: d.req, ok, error }, extra)); };
    if (L.settings.diceEnabled === false) return ack(false, 'Los dados están desactivados en este tablero');
    let body;
    try { body = dice.roll(d.formula, { adv: d.adv }); } catch (e) { return ack(false, e.message); }
    const label = R.str(d.label, 60).trim();
    if (label) body.label = label;
    broadcast(L, { t: 'msg', topic: 'roll', data: body, peer: p.peer, by: String(c.user.id) });
    ack(true, undefined, { roll: body });
    await host.postChat(L.id, { id: c.user.id, name: c.user.name, color: c.user.color }, 'roll', body);
  }

  function handlePresence(L, c, p, d) {
    const patch = d.patch && typeof d.patch === 'object' && !Array.isArray(d.patch) ? d.patch : {};
    const next = Object.assign({}, p.presence);
    for (const [k, v] of Object.entries(patch).slice(0, 20)) { if (v === null) delete next[k]; else next[k] = v; }
    if (JSON.stringify(next).length > MAX_PRESENCE) return c.ws.send({ t: 'error', error: 'Presencia demasiado grande' });
    p.presence = next; p.updatedAt = Date.now();
    sendPeers(L);
  }

  async function handleMsg(conn, d) {
    const L = live.get(conn.board.id);
    const p = L && L.clients.get(conn);
    if (!p) return false;
    if (['live', 'roll', 'travel', 'gather'].includes(d.t)) await syncSettings(L);
    switch (d.t) {
      case 'live': handleLive(L, conn, d); return true;
      case 'emit': handleEmit(L, conn, p, d); return true;
      case 'roll': await handleRoll(L, conn, p, d); return true;
      case 'presence': handlePresence(L, conn, p, d); return true;
      case 'travel': case 'gather': await handleTravel(L, conn, d); return true;
      default: return false;
    }
  }

  /* ---------------- conexión propia: /t3d/ws ----------------
     Para un anfitrión cuyo WebSocket no reparte mensajes a módulos (JA-VTT): el cliente del módulo
     abre su propio socket y aquí se atiende con la misma mesa (join, ws, leave) y una cola por tablero. */
  const own = new Map(); // boardId → { chain, conns: Set(conn) }
  function ownQueue(boardId, work) {
    const S = own.get(boardId);
    S.chain = S.chain.then(work).catch((e) => console.error('Error en la mesa 3D del tablero', boardId, e));
    return S.chain;
  }
  async function socket(ws, user, boardId) {
    const role = boardId ? await host.memberRole(boardId, user.id) : null;
    if (!role) { ws.send({ t: 'error', error: 'No perteneces a este tablero' }); ws.close(4403); return; }
    if (!await q.is3d(boardId)) { ws.send({ t: 'error', error: NOT_3D }); ws.close(4404); return; }
    if (!own.has(boardId)) own.set(boardId, { chain: Promise.resolve(), conns: new Set() });
    const me = { id: user.id, name: user.name, color: user.color };
    const conn = { ws, user: me, role, board: { id: boardId } };
    own.get(boardId).conns.add(conn);
    // las escuchas antes de entrar: lo que llegue (o el cierre) va a la cola detrás de join
    ws.on('message', (text) => {
      let d; try { d = JSON.parse(text); } catch { return; }
      if (!d || typeof d !== 'object') return;
      if (d.t === 'ping') { ws.send({ t: 'pong', at: d.at }); return; }
      ownQueue(boardId, () => handleMsg(conn, d));
    });
    ws.on('close', () => {
      const S = own.get(boardId);
      S.conns.delete(conn);
      ownQueue(boardId, () => { leave(conn); if (!S.conns.size && own.get(boardId) === S) own.delete(boardId); });
    });
    await ownQueue(boardId, async () => {
      const extra = await join(conn);
      ws.send(Object.assign({ t: 'state', me, role, board: { id: boardId }, members: await q.members(boardId), online: onlineList(live.get(boardId)) }, extra));
    });
  }
  const pingTimer = setInterval(() => {
    for (const S of own.values()) for (const c of S.conns) { if (!c.ws.alive) c.ws.close(1001); else c.ws.ping(); }
  }, PING_MS);
  pingTimer.unref();
  function closeOwn(boardId, uid, msg) {
    const S = own.get(boardId);
    if (!S) return;
    for (const c of [...S.conns]) if (uid == null || c.user.id === uid) { c.ws.send(msg); c.ws.close(4403); }
  }
  const kick = (boardId, uid) => closeOwn(boardId, uid, { t: 'kicked' });

  function onBoardDeleted(boardId) {
    closeOwn(boardId, null, { t: 'kicked', deleted: true });
    live.delete(boardId);
  }

  async function close() {
    clearInterval(flushTimer); clearInterval(pingTimer);
    for (const S of own.values()) for (const c of [...S.conns]) c.ws.close(1001);
    await flushAll();
    live.clear();
  }

  return {
    name: 't3d', publicDir: PUBLIC_DIR, enabled: true,
    migrate, serve, api, socket, kick, onBoardDeleted, markBoard, tagBoards, describeBoards, settingsChanged, close, isLoaded: (id) => live.has(id), flushAll,
    join, ws: handleMsg, leave,
  };
}

module.exports = { createTablero3D };
