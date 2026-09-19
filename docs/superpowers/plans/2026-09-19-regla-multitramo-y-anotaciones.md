# Regla multitramo y anotaciones de mapa — plan de implementación (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P-22 — la regla admite puntos de quiebre (Espacio o clic derecho durante el arrastre) y muestra la distancia de cada tramo y la acumulada. P-23 — el director coloca anotaciones de texto (pines) en el mapa, con opción «sólo el director la ve».

**Architecture:** La regla es estado efímero de UI (`UI.act.pts`), no viaja por red; la aritmética vive en una función pura de `core.js` para poder probarla. Las anotaciones son un tipo nuevo de objeto `note` (`{x, y, text, gmOnly}`) en `objects.data` (jsonb, sin migración): `rules.js` lo sanea y `visibleTo` lo oculta a los jugadores cuando `gmOnly`; el cliente lo pinta como pin + etiqueta y lo edita con el editor existente.

**Tech Stack:** Node 22+ (`node:test`), PostgreSQL 16 (tests de integración), cliente vanilla (canvas 2D), Playwright + Edge (`npm run test:ui`).

**Spec:** `docs/superpowers/specs/2026-09-19-condiciones-srd-y-tactica-design.md` §4 y §5 (y la tabla de decisiones: «Regla con waypoints» y «Anotaciones de mapa»). §6 (audio) es el plan C.

**Rama:** `prod-2d`. Un commit por tarea. **No desplegar** al terminar.

## Global Constraints

- Todo el SQL en `server/db.js`; **sin migraciones** (la columna `objects.type` es `TEXT` sin restricción: `server/migrations/001-inicial.sql:54`).
- Reglas de negocio sólo en `server/rules.js`. `app.js` no se toca en este plan.
- Cero dependencias nuevas. Cliente = scripts clásicos, ámbito global, estilo compacto (imitar el fichero que se toca).
- Textos de usuario en castellano. Sin `prompt()`/`alert()`/`confirm()` (bloquean el navegador en las pruebas).
- Cada test se rompe una vez a propósito antes de commitear. `npm run check` verde en cada commit; `npm run test:ui` verde al cerrar el plan.
- Distancias: casilla `CELL=50` px = `FT=5` pies (`core.js:3`). Regla de diagonales del juego, la que ya usa la regla: **un tramo mide `max(|dx|,|dy|)` casillas × 5** (`render.js:430`).
- Nombres fijos: `rulerSegments(pts)` (core) · tipo `note` · colección `S.notes` · capa `notes` · herramienta `note` (tecla **N**) · icono `map-pin` (ya existe en `icons.js`).

---

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `public/js/core.js` | `rulerSegments(pts)`; `note` en `LAYER_OF`/`COLL`; capa `notes` en `LAYERS`; `notes:[]` en `blankState` |
| `public/js/editor.js` | Regla: `pts` en `UI.act`, Espacio / clic derecho añade punto; herramienta `note`: colocar, `hitTest`, `describe`, `openEditor`, pista de la subbarra, tecla N |
| `public/js/render.js` | Regla multitramo con etiquetas; `drawNotes` en `drawOverlay` |
| `public/index.html` | Botón de herramienta `note` (gmOnly) |
| `server/rules.js` | `note` en `TYPES`, saneado, `notes` en `LAYER_IDS`, `visibleTo` con `gmOnly` |
| `test/rules.test.js`, `test/realtime.test.js`, `test/frontend.test.js`, `test/e2e/ui.mjs` | Tests |
| `docs/01`, `02`, `05`, `06`, `07`, `00`, `README.md` | Documentación |

---

### Task 1: `rulerSegments` — aritmética pura de la regla

**Files:**
- Modify: `public/js/core.js` (tras `const snapCell=...`, L286)
- Test: `test/frontend.test.js`

**Interfaces:**
- Produces (global del cliente): `rulerSegments(pts)` → `{ segs: number[], total: number, straight: number }` donde `pts` es un array de ≥ 1 puntos `{x,y}` en píxeles de mundo; `segs[i]` = pies del tramo `i` (regla `max(|dx|,|dy|)/CELL*FT`, redondeado), `total` = suma, `straight` = pies en línea recta euclídea del primer al último punto, redondeado (`pxFt(dist(...))`). Con 1 punto: `{segs:[], total:0, straight:0}`.

- [ ] **Step 1: Test que falla** — el cliente no tiene framework: se evalúa la función extrayéndola del fuente.

```js
test('rulerSegments: tramos con la regla de diagonales del juego, total acumulado y línea recta', () => {
  const core = read('js/core.js');
  const m = core.match(/^function rulerSegments\(pts\)\{[\s\S]*?\n\}$/m);
  assert.ok(m, 'function rulerSegments(pts){...} en core.js, cerrada con } en su propia línea');
  const fn = new Function('CELL', 'FT', 'dist', 'pxFt', m[0] + '; return rulerSegments;')(50, 5, (a, b) => Math.hypot(a.x - b.x, a.y - b.y), (px) => px / 50 * 5);
  assert.deepEqual(fn([{ x: 25, y: 25 }]), { segs: [], total: 0, straight: 0 });
  assert.deepEqual(fn([{ x: 25, y: 25 }, { x: 175, y: 25 }]), { segs: [15], total: 15, straight: 15 });
  // 3 casillas en diagonal cuentan 3 (no 4,2): max(|dx|,|dy|)
  assert.deepEqual(fn([{ x: 25, y: 25 }, { x: 175, y: 175 }]), { segs: [15], total: 15, straight: 21 });
  // rodear una esquina: 3 a la derecha + 2 abajo = 25 ft; en línea recta serían 18
  assert.deepEqual(fn([{ x: 25, y: 25 }, { x: 175, y: 25 }, { x: 175, y: 125 }]), { segs: [15, 10], total: 25, straight: 18 });
});
```

- [ ] **Step 2: Ver que falla** — `node --test test/frontend.test.js 2>&1 | grep -E "^not ok"` → `not ok … rulerSegments`.

- [ ] **Step 3: Implementar** en `core.js`, tras `snapCell`:

```js
/* Regla multitramo: cada tramo con la regla de diagonales del juego (max(dx,dy)); total acumulado y línea recta */
function rulerSegments(pts){
  const segs=[];
  for(let i=1;i<pts.length;i++)segs.push(Math.round(Math.max(Math.abs(pts[i].x-pts[i-1].x),Math.abs(pts[i].y-pts[i-1].y))/CELL*FT));
  const total=segs.reduce((a,b)=>a+b,0);
  const straight=pts.length>1?Math.round(pxFt(dist(pts[0],pts[pts.length-1]))):0;
  return{segs,total,straight};
}
```

- [ ] **Step 4: Verde + mutación** — `node --test test/frontend.test.js 2>&1 | grep -E "^# (pass|fail)"` → `fail 0`. Mutación: cambiar `Math.max` por `Math.hypot` → falla la diagonal. Restaurar.

- [ ] **Step 5: Commit**

```bash
npm run check && git add public/js/core.js test/frontend.test.js && git commit -m "feat(regla): rulerSegments — tramos, total y línea recta"
```

---

### Task 2: Regla con puntos de quiebre en el editor y el render

**Files:**
- Modify: `public/js/editor.js` (`pointerdown` L206, `pointermove` L282, `pointerup` L325, `contextmenu` L369, `keydown` L409, pista L868)
- Modify: `public/js/render.js` (bloque `A.kind==='ruler'` L429–434)
- Test: `test/frontend.test.js`, `test/e2e/ui.mjs`

**Interfaces:**
- Consumes: `rulerSegments(pts)` (Task 1), `snapCell`, `label(c,p,text,align)`.
- Produces: `UI.act = {kind:'ruler', pts:[p0,...], b:p}` — `pts` son los puntos fijados (el primero al empezar el arrastre), `b` el punto vivo bajo el ratón. `rulerAddPoint()` añade `b` a `pts` si no coincide con el último. Espacio (durante el arrastre) y clic derecho (durante el arrastre) llaman a `rulerAddPoint()`. Escape cancela (ya lo hace: `UI.act=null`).

- [ ] **Step 1: Test de contrato que falla**

```js
test('regla multitramo: pts en UI.act, Espacio y clic derecho añaden punto, el render suma tramos', () => {
  const editor = read('js/editor.js');
  assert.match(editor, /case 'ruler':UI\.act=\{kind:'ruler',pts:\[snapCell\(p\)\],b:snapCell\(p\)\};requestRender\(\);return;/);
  assert.match(editor, /^function rulerAddPoint\(\)\{const A=UI\.act;if\(!A\|\|A\.kind!=='ruler'\)return;const q=A\.b,last=A\.pts\[A\.pts\.length-1\];if\(q\.x!==last\.x\|\|q\.y!==last\.y\)A\.pts\.push\(\{x:q\.x,y:q\.y\}\);requestRender\(\)\}$/m);
  assert.match(editor, /if\(e\.code==='Space'\)\{if\(UI\.act&&UI\.act\.kind==='ruler'\)\{rulerAddPoint\(\);e\.preventDefault\(\);return\}/, 'Espacio durante la regla añade punto en vez de activar el desplazamiento');
  assert.match(editor, /if\(UI\.act&&UI\.act\.kind==='ruler'\)\{rulerAddPoint\(\);return\}/, 'clic derecho durante la regla añade punto');
  assert.match(editor, /Espacio o clic derecho para fijar un punto y rodear esquinas/);
  const render = read('js/render.js');
  assert.match(render, /const pts=\[\.\.\.A\.pts,A\.b\],R=rulerSegments\(pts\);/);
  assert.match(render, /R\.segs\.length>1/, 'con varios tramos se etiqueta cada uno');
  assert.doesNotMatch(render, /Math\.abs\(A\.b\.x-A\.a\.x\)/, 'la aritmética vieja desaparece del render');
});
```

- [ ] **Step 2: Ver que falla** — `node --test test/frontend.test.js 2>&1 | grep -E "^not ok"`.

- [ ] **Step 3: `editor.js`**

`pointerdown` (L206): `case 'ruler':UI.act={kind:'ruler',pts:[snapCell(p)],b:snapCell(p)};requestRender();return;`

`pointermove` (L282): `case 'ruler':A.b=snapCell(p);break;` (sin cambio; se deja).

`pointerup` (L325): `case 'ruler':break;` (sin cambio).

Nueva función, justo antes de `/* ---------- Teclado ---------- */`:

```js
/* Regla: fija el punto vivo como quiebre (Espacio o clic derecho mientras se arrastra) */
function rulerAddPoint(){const A=UI.act;if(!A||A.kind!=='ruler')return;const q=A.b,last=A.pts[A.pts.length-1];if(q.x!==last.x||q.y!==last.y)A.pts.push({x:q.x,y:q.y});requestRender()}
```

`keydown` (L409): sustituir `if(e.code==='Space'){UI.space=true;stage.style.cursor='grab';e.preventDefault();return}` por

```js
  if(e.code==='Space'){if(UI.act&&UI.act.kind==='ruler'){rulerAddPoint();e.preventDefault();return}UI.space=true;stage.style.cursor='grab';e.preventDefault();return}
```

`contextmenu` (L369), como **primera** línea tras `e.preventDefault();`:

```js
  if(UI.act&&UI.act.kind==='ruler'){rulerAddPoint();return}
```

Pista (L868): `else if(t==='ruler'){hint('Arrastra para medir. Espacio o clic derecho para fijar un punto y rodear esquinas. Distancia en casillas de 5 pies.')}`

- [ ] **Step 4: `render.js`** — sustituir el bloque L429–434 por:

```js
  if(A&&A.kind==='ruler'){
    const pts=[...A.pts,A.b],R=rulerSegments(pts);
    c.save();c.strokeStyle='#F0B35A';c.lineWidth=px(3);c.setLineDash([px(8),px(6)]);c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.stroke();c.setLineDash([]);
    c.fillStyle='#F0B35A';for(const q of pts){c.beginPath();c.arc(q.x,q.y,px(5),0,Math.PI*2);c.fill()}c.restore();
    if(R.segs.length>1)for(let i=1;i<pts.length;i++)label(c,{x:(pts[i-1].x+pts[i].x)/2,y:(pts[i-1].y+pts[i].y)/2-px(14)},`${R.segs[i-1]} ft`);
    label(c,{x:A.b.x+px(12),y:A.b.y-px(16)},R.segs.length>1?`${R.total} ft en total (${R.straight} en línea recta)`:`${R.total} ft (${R.straight} en línea recta)`,'left');
  }
```

- [ ] **Step 5: Verde de contrato + lint** — `node --test test/frontend.test.js 2>&1 | grep -E "^# (pass|fail)"` y `npm run lint`.

- [ ] **Step 6: Paso visual en `ui.mjs`** — tras el bloque de fichas (antes de `// clima 2D`):

```js
  // regla multitramo: arrastre con Espacio en medio → dos tramos y total acumulado (estado de UI, no viaja)
  await gm.click('[data-tool="ruler"]');
  const st3 = await gm.evaluate(() => { UI.cam.zoom = 1; UI.cam.x = 800; UI.cam.y = 550; requestRender(); const r = document.getElementById('stage').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  const w2s = (x, y) => [st3.l + st3.w / 2 + (x - 800), st3.t + st3.h / 2 + (y - 550)];
  await gm.mouse.move(...w2s(625, 525)); await gm.mouse.down();
  await gm.mouse.move(...w2s(775, 525), { steps: 4 });
  await gm.keyboard.press('Space');
  await gm.mouse.move(...w2s(775, 675), { steps: 4 });
  const ruler = await gm.evaluate(() => { const A = UI.act; return A && A.kind === 'ruler' ? Object.assign({ n: A.pts.length }, rulerSegments([...A.pts, A.b])) : null; });
  await shot(gm, '10-regla-multitramo');
  await gm.mouse.up();
  step('regla: Espacio fija un quiebre; 3 casillas + 3 casillas = 30 ft (21 en línea recta)', !!ruler && ruler.n === 2 && ruler.total === 30 && ruler.straight === 21, JSON.stringify(ruler));
  const rulerGone = await gm.evaluate(() => UI.act === null);
  step('regla: al soltar se limpia', rulerGone);
  await gm.click('[data-tool="select"]');
```

Nota: `snapCell` centra en casilla, por eso las coordenadas acaban en 25/75. Si el `UI.act` sale `null` al leerlo, es porque `pointerdown` no llegó al `stage` (algún popover abierto): añade `await gm.evaluate(() => closePops())` antes del `mouse.down()`.

Run (servidor local en 3999): `npm run test:ui 2>&1 | tail -6` → 37/37. Abrir `10-regla-multitramo.png`: línea en L con dos etiquetas de tramo y una de total.

- [ ] **Step 7: Mutación** — en `rulerAddPoint`, quitar el `A.pts.push(...)` → el paso «Espacio fija un quiebre» falla. Restaurar.

- [ ] **Step 8: Commit**

```bash
npm run check && git add public/js/editor.js public/js/render.js test/frontend.test.js test/e2e/ui.mjs && git commit -m "feat(regla): puntos de quiebre con Espacio o clic derecho; tramos y total acumulado"
```

---

### Task 3: `rules.js` — tipo `note` saneado, capa `notes`, `gmOnly` invisible para jugadores

**Files:**
- Modify: `server/rules.js` (`TYPES`, `LAYER_IDS`, `sanitize`, `visibleTo`)
- Test: `test/rules.test.js`

**Interfaces:**
- Produces: `sanitize({type:'note', id, x, y, text, gmOnly})` → `{id, type:'note', x, y, text: string (≤200, recortada), gmOnly: boolean}`; sin `x/y` finitos → `null`. `visibleTo(note, member, settings)` → `false` para jugadores si `gmOnly`. `playerUpsert` ya devuelve `null` para cualquier tipo no contemplado: un jugador no puede crear ni editar notas (no hay que tocarlo). `LAYER_IDS` incluye `'notes'` (para que `settings.layers.notes` se acepte).

- [ ] **Step 1: Test que falla**

```js
test('note: texto recortado a 200, gmOnly booleano, sin posición → null; los jugadores no ven las gmOnly', () => {
  const n = R.sanitize({ id: 9, type: 'note', x: 10, y: 20, text: 'Trampa DC 15', gmOnly: 1 });
  assert.deepEqual(n, { id: 9, type: 'note', x: 10, y: 20, text: 'Trampa DC 15', gmOnly: true });
  assert.equal(R.sanitize({ id: 9, type: 'note', x: 10, y: 20, text: 'x'.repeat(300) }).text.length, 200);
  assert.deepEqual(R.sanitize({ id: 9, type: 'note', x: 10, y: 20 }), { id: 9, type: 'note', x: 10, y: 20, text: '', gmOnly: false });
  assert.equal(R.sanitize({ id: 9, type: 'note', text: 'sin sitio' }), null);
  const player = { role: 'player', user_id: 7 }, gm = { role: 'gm', user_id: 1 };
  assert.equal(R.visibleTo(n, player, {}), false);
  assert.equal(R.visibleTo(n, gm, {}), true);
  assert.equal(R.visibleTo(Object.assign({}, n, { gmOnly: false }), player, {}), true);
  assert.equal(R.playerUpsert(7, null, n, { settings: {} }, 0, 0), null, 'un jugador no crea notas');
  assert.deepEqual(R.cleanSettings({ layers: { notes: { visible: false } } }).layers.notes, { visible: false, locked: false });
});
```

- [ ] **Step 2: Ver que falla** — `node --test test/rules.test.js 2>&1 | grep -E "^not ok"`.

- [ ] **Step 3: Implementar**

```js
const TYPES = ['wall', 'light', 'token', 'asset', 'plan', 'zone', 'note'];
const LAYER_IDS = ['map', 'props', 'zones', 'plans', 'tokens', 'lights', 'walls', 'notes'];
```

En `sanitize`, tras el bloque de `zone` (antes de `if (o.type === 'asset')`):

```js
  if (o.type === 'note') {
    Object.assign(c, { text: str(o.text, 200), gmOnly: !!o.gmOnly });
    return c;
  }
```

(`c.x`/`c.y` ya se han puesto con `pt(o)` justo antes; si `pt` devolvió `null` la función ya ha devuelto `null`.)

En `visibleTo`, tras la línea de los tokens ocultos:

```js
  if (o.type === 'note' && o.gmOnly) return false;
```

- [ ] **Step 4: Verde + mutación** — `node --test test/rules.test.js` → `fail 0`. Mutación: quitar la línea de `visibleTo` → falla. Restaurar.

- [ ] **Step 5: Commit**

```bash
npm run check && git add server/rules.js test/rules.test.js && git commit -m "feat(rules): tipo note {x,y,text,gmOnly} y capa notes; las gmOnly no llegan a los jugadores"
```

---

### Task 4: Integración — una nota `gmOnly` no viaja al jugador; al quitarle `gmOnly` aparece; al ponérselo se borra

**Files:**
- Test: `test/realtime.test.js`

**Interfaces:** consume el `handleOps` existente: cuando un objeto deja de ser visible para un cliente, recibe `del` (`app.js` ~L352: `else if(!a.old||R.visibleTo(a.old,...)) del.push(a.obj.id)`). No hay que tocar `app.js`.

- [ ] **Step 1: Test que falla**

```js
test('notas: una gmOnly no llega al jugador ni en estado ni en ops; al publicarla llega; al ocultarla recibe del', async () => {
  const gm = connect(base, boardId, gmCookie);
  const player = connect(base, boardId, playerCookie);
  await gm.opened; await player.opened;
  await gm.next(isState); await player.next(isState);
  const note = { id: 4001, type: 'note', x: 300, y: 300, text: 'Trampa DC 15', gmOnly: true };
  gm.send({ t: 'ops', scene: sceneId, up: [note], del: [] });
  assert.equal(await player.silence((m) => isOps(m) && (m.up || []).some((o) => o.id === 4001)), true, 'el jugador no recibe la nota');
  const fresh = connect(base, boardId, playerCookie); await fresh.opened;
  const st = await fresh.next(isState);
  assert.equal(st.objects.some((o) => o.id === 4001), false, 'tampoco en el estado inicial');
  await fresh.close();
  gm.send({ t: 'ops', scene: sceneId, up: [Object.assign({}, note, { gmOnly: false })], del: [] });
  const shown = await player.next((m) => isOps(m) && (m.up || []).some((o) => o.id === 4001));
  assert.equal(shown.up.find((o) => o.id === 4001).text, 'Trampa DC 15');
  gm.send({ t: 'ops', scene: sceneId, up: [note], del: [] });
  const hidden = await player.next((m) => isOps(m) && (m.del || []).includes(4001));
  assert.ok(hidden);
  // el jugador intenta crear una nota: se le borra
  player.send({ t: 'ops', scene: sceneId, up: [{ id: 4002, type: 'note', x: 1, y: 1, text: 'mía' }], del: [] });
  const fix = await player.next((m) => isOps(m) && m.fix);
  assert.ok(fix.del.includes(4002));
  await gm.close(); await player.close();
});
```

- [ ] **Step 2: Ejecutar** — `node --test test/realtime.test.js 2>&1 | grep -E "^# (pass|fail)"`. Debe pasar **ya** con Task 3 (la lógica de `del` existe). Si pasa a la primera, el test se valida por mutación: comentar la línea `if (o.type === 'note' && o.gmOnly) return false;` en `rules.js` → falla «el jugador no recibe la nota». Restaurar.

- [ ] **Step 3: Commit**

```bash
npm run check && git add test/realtime.test.js && git commit -m "test(ws): notas gmOnly no llegan al jugador; publicar/ocultar manda up/del"
```

---

### Task 5: Cliente — colección `notes`, capa, herramienta N, colocar, seleccionar, editar

**Files:**
- Modify: `public/js/core.js` (`LAYERS`, `LAYER_OF`, `COLL`, `blankState`)
- Modify: `public/index.html` (botón tras `data-tool="enemy"`, L124)
- Modify: `public/js/editor.js` (`newNote`, `pointerdown` switch, `hitTest`, `describe`, `openEditor`, tecla `n`, pista, `deleteSel` no requiere cambio: usa `COLL`)
- Test: `test/frontend.test.js`

**Interfaces:**
- Consumes: `addObj`, `pushUndo`, `changed`, `openEditor`, `text`/`check` del editor, `snapOn`, `snapCell`, `fine`.
- Produces: `S.notes: []`; `LAYER_OF.note='notes'`, `COLL.note='notes'`; capa `{id:'notes',name:'Anotaciones'}`; `newNote(p)` → `{id:nid(),type:'note',x,y,text:'Nota',gmOnly:true}` (por defecto **sólo el director**: lo seguro); herramienta `note` (botón gmOnly, tecla N): clic coloca la nota y abre el editor; `hitTest` la encuentra a `px(14)` del pin (sólo director); `describe` → `o.text||'Anotación'`; `openEditor` → campo «Texto» y casilla «Sólo el director la ve».

- [ ] **Step 1: Test de contrato que falla**

```js
test('anotaciones: colección, capa, herramienta N, colocar con el editor abierto, hitTest y campos', () => {
  const core = read('js/core.js');
  assert.match(core, /\{id:'plans',name:'Planos'\},\s*\{id:'notes',name:'Anotaciones'\}/);
  assert.match(core, /const LAYER_OF=\{asset:'map',zone:'zones',plan:'plans',token:'tokens',light:'lights',wall:'walls',note:'notes'\};/);
  assert.match(core, /const COLL=\{asset:'assets',zone:'zones',plan:'plans',token:'tokens',light:'lights',wall:'walls',note:'notes'\};/);
  assert.match(core, /plans:\[\],zones:\[\],notes:\[\],nextId:1/);
  assert.match(read('index.html'), /<button class="tool gmOnly" data-tool="note" data-ic="map-pin" title="Anotación en el mapa \(N\)"><kbd>N<\/kbd><\/button>/);
  const editor = read('js/editor.js');
  assert.match(editor, /^function newNote\(p\)\{return\{id:nid\(\),type:'note',x:p\.x,y:p\.y,text:'Nota',gmOnly:true\}\}$/m);
  assert.match(editor, /case 'note':pushUndo\(\);\{const n=addObj\(newNote\(snapOn\('notes',e\)\?snapCell\(p\):fine\(p\)\)\);UI\.selected=\[n\.id\];changed\(\);openEditor\(n,sp\)\}return;/);
  assert.match(editor, /for\(const n of\[\.\.\.S\.notes\]\.reverse\(\)\)if\(usable\(n\)&&dist\(n,p\)<=px\(14\)\)return n;/);
  assert.match(editor, /if\(o\.type==='note'\)return o\.text\|\|'Anotación';/);
  assert.match(editor, /\}else if\(o\.type==='note'\)\{\s*text\('Texto',o\.text,v=>o\.text=v\);\s*check\('Sólo el director la ve',o\.gmOnly,v=>o\.gmOnly=v\);/);
  assert.match(editor, /m:'plan',n:'note'\}/);
  assert.match(editor, /else if\(t==='note'\)\{hint\('Clic para clavar una anotación\. Por defecto sólo la ves tú; en sus propiedades puedes publicarla\.'\)\}/);
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: `core.js`**

```js
const LAYERS=[
  {id:'map',name:'Tablero'},{id:'props',name:'Objetos'},{id:'zones',name:'Zonas interiores'},{id:'plans',name:'Planos'},
  {id:'notes',name:'Anotaciones'},
  {id:'tokens',name:'Fichas'},{id:'lights',name:'Luces'},{id:'walls',name:'Muros y puertas'}
];
const LAYER_OF={asset:'map',zone:'zones',plan:'plans',token:'tokens',light:'lights',wall:'walls',note:'notes'};
const COLL={asset:'assets',zone:'zones',plan:'plans',token:'tokens',light:'lights',wall:'walls',note:'notes'};
```

`blankState`: `walls:[],lights:[],tokens:[],assets:[],plans:[],zones:[],notes:[],nextId:1`.

Comprobar `snapOn`: `grep -n "function snapOn\|const snapOn" public/js/core.js` — si usa una lista fija de capas para la preferencia de ajuste, añade `notes` a esa lista (por defecto **sin** ajuste a casilla: una nota va donde se pincha).

- [ ] **Step 4: `index.html`** — tras el botón `data-tool="enemy"`:

```html
    <button class="tool gmOnly" data-tool="note" data-ic="map-pin" title="Anotación en el mapa (N)"><kbd>N</kbd></button>
```

Y comprobar cómo se enganchan los botones `.tool` (`grep -n "'.tool'" public/js/editor.js`): si hay un `forEach` genérico sobre `data-tool`, no hay que añadir nada; si cada botón tiene su `onclick` (como `#zoneToolBtn`), añadir el equivalente.

- [ ] **Step 5: `editor.js`**

Tras `function newToken(...)`:

```js
function newNote(p){return{id:nid(),type:'note',x:p.x,y:p.y,text:'Nota',gmOnly:true}}
```

`pointerdown`, en el `switch(UI.tool)`, junto a `case 'player':case 'enemy':`:

```js
    case 'note':pushUndo();{const n=addObj(newNote(snapOn('notes',e)?snapCell(p):fine(p)));UI.selected=[n.id];changed();openEditor(n,sp)}return;
```

`hitTest`, rama del director, justo después de la línea de las luces (`for(const l of [...S.lights]...`):

```js
  for(const n of[...S.notes].reverse())if(usable(n)&&dist(n,p)<=px(14))return n;
```

`describe`: antes de `return 'Elemento';` → `if(o.type==='note')return o.text||'Anotación';`

`openEditor`: nueva rama antes del `}else if(o.type==='zone'){`:

```js
  }else if(o.type==='note'){
    text('Texto',o.text,v=>o.text=v);
    check('Sólo el director la ve',o.gmOnly,v=>o.gmOnly=v);
    note('Los jugadores ven el pin y el texto de las anotaciones publicadas.');
```

Tecla: `const map={v:'select',h:'pan',r:'ruler',w:'wall',z:'zone',l:'light',p:'player',e:'enemy',m:'plan',n:'note'};`

Pista en `renderSubbar`: `else if(t==='note'){hint('Clic para clavar una anotación. Por defecto sólo la ves tú; en sus propiedades puedes publicarla.')}`

`PLAYER_TOOLS` no cambia (la herramienta es del director).

- [ ] **Step 6: Verde + lint** — `node --test test/frontend.test.js` y `npm run lint`. Comprobar además que el test existente «todos los scripts del cliente compilan» sigue verde.

- [ ] **Step 7: Commit**

```bash
npm run check && git add public/js/core.js public/js/editor.js public/index.html test/frontend.test.js && git commit -m "feat(notas): herramienta N, colección notes, capa Anotaciones y editor (texto, sólo director)"
```

---

### Task 6: Render de anotaciones + prueba visual

**Files:**
- Modify: `public/js/render.js` (`drawOverlay`, tras el bloque de planos L400; nueva `drawNotes`)
- Test: `test/frontend.test.js`, `test/e2e/ui.mjs`

**Interfaces:**
- Consumes: `iconImage('map-pin', color)`, `roundRect`, `px`, `isSel`, `S.layers`.
- Produces: `drawNotes(c,gm)`: por cada nota (si la capa es visible; **ojo**: escenas guardadas antes no tienen `S.layers.notes` → usar `(S.layers.notes||{visible:true}).visible`): pin `map-pin` de `px(20)` con la punta en `(x,y)` (icono centrado en `(x, y-px(10))`), color `#F0B35A` si seleccionada, `#E9E3D5` si publicada, `#CDB8E6` (violeta, el de las zonas) si `gmOnly`; etiqueta con el texto a la derecha del pin (`label(c,{x:x+px(12),y:y-px(10)},text,'left')`) sólo si `UI.cam.zoom>.3` y hay texto; si `gmOnly`, un `eye-off` de `px(12)` sobre el pin para el director. Los jugadores nunca reciben notas `gmOnly` (servidor), así que el cliente no filtra por rol.

- [ ] **Step 1: Test de contrato que falla**

```js
test('render: drawNotes pinta pin, etiqueta y eye-off si es sólo del director; tolera escenas sin la capa notes', () => {
  const r = read('js/render.js');
  assert.match(r, /^function drawNotes\(c,gm\)\{/m);
  assert.match(r, /drawNotes\(c,gm\);/, 'drawOverlay la llama');
  assert.match(r, /\(S\.layers\.notes\|\|\{visible:true\}\)\.visible/);
  assert.match(r, /iconImage\('map-pin',/);
  assert.match(r, /n\.gmOnly\?'#CDB8E6':'#E9E3D5'/);
  assert.match(r, /if\(gm&&n\.gmOnly\)/);
});
```

- [ ] **Step 2: Ver que falla.**

- [ ] **Step 3: Implementar** — en `drawOverlay`, justo después de la línea de los planos (`if(S.layers.plans.visible){...drawPlan...}`), añadir `drawNotes(c,gm);`. Nueva función tras `drawPlan`:

```js
/* Anotaciones: pin con la punta en (x,y), texto a la derecha; las sólo-director van en violeta con un ojo tachado */
function drawNotes(c,gm){
  if(!(S.layers.notes||{visible:true}).visible)return;
  for(const n of S.notes){
    const color=isSel(n)?'#F0B35A':n.gmOnly?'#CDB8E6':'#E9E3D5',s=px(20),ic=iconImage('map-pin',color);
    c.save();c.fillStyle='rgba(0,0,0,.35)';c.beginPath();c.ellipse(n.x,n.y+px(1),px(5),px(2.5),0,0,Math.PI*2);c.fill();c.restore();
    if(ic.complete)c.drawImage(ic,n.x-s/2,n.y-s,s,s);
    if(n.text&&UI.cam.zoom>.3)label(c,{x:n.x+px(12),y:n.y-px(10)},n.text,'left');
    if(gm&&n.gmOnly){const e=iconImage('eye-off','#CDB8E6'),es=px(12);if(e.complete)c.drawImage(e,n.x-es/2,n.y-s-es,es,es)}
  }
}
```

Selección: el bloque «selección de fichas y mapas» (`for(const o of selObjs())`) ya pinta un aro para tokens; las notas se distinguen por el color ámbar del pin: suficiente.

- [ ] **Step 4: Verde + lint.**

- [ ] **Step 5: Paso visual en `ui.mjs`** — tras el bloque de la regla (Task 2):

```js
  // anotaciones: el director clava una nota sólo-director (el jugador no la recibe); la publica y el jugador la ve
  await gm.evaluate(() => { const n = addObj(newNote({ x: 950, y: 400 })); n.text = 'Trampa DC 15'; changed(); });
  await gm.waitForTimeout(800);
  const plHasSecret = await pl.evaluate(() => S.notes.some((n) => n.text === 'Trampa DC 15'));
  step('notas: la anotación sólo-director no llega al jugador', !plHasSecret);
  await gm.evaluate(() => { S.notes.find((n) => n.text === 'Trampa DC 15').gmOnly = false; changed(); });
  await pl.waitForFunction(() => S.notes.some((n) => n.text === 'Trampa DC 15' && n.gmOnly === false), null, { timeout: 5000 });
  await pl.evaluate(() => { UI.cam.zoom = 1; UI.cam.x = 800; UI.cam.y = 550; requestRender(); }); await pl.waitForTimeout(400);
  await shot(pl, '11-nota-publicada-jugador');
  step('notas: publicada, el jugador la recibe con su texto', true);
  await gm.evaluate(() => { S.notes.find((n) => n.text === 'Trampa DC 15').gmOnly = true; changed(); });
  await pl.waitForFunction(() => !S.notes.some((n) => n.text === 'Trampa DC 15'), null, { timeout: 5000 });
  step('notas: al volver a ocultarla desaparece del jugador', true);
  await gm.evaluate(() => { S.notes = []; changed(); });
```

Run: `npm run test:ui 2>&1 | tail -6` → 40/40. Mirar `11-nota-publicada-jugador.png`: pin claro con «Trampa DC 15» a la derecha, sin ojo tachado (es jugador y está publicada).

- [ ] **Step 6: Mutación** — en `rules.js` `visibleTo`, comentar la línea de `note` → «no llega al jugador» falla. Restaurar.

- [ ] **Step 7: Commit**

```bash
npm run check && git add public/js/render.js test/frontend.test.js test/e2e/ui.mjs && git commit -m "feat(notas): pin y etiqueta en el lienzo; sólo-director en violeta con ojo tachado"
```

---

### Task 7: Documentación de cierre

**Files:** `docs/01-arquitectura.md`, `docs/02-funcional.md`, `docs/05-runbook.md`, `docs/06-pendientes.md`, `docs/07-historial.md`, `docs/00-INDEX.md`, `README.md`.

- [ ] **Step 1: `01-arquitectura.md`** — en el modelo de datos, tipo nuevo:

```markdown
- `note` — `{x, y, text (≤200), gmOnly}`. Sólo el director la crea/edita (`playerUpsert` devuelve `null` para el tipo). Con `gmOnly` no se envía a jugadores (`visibleTo`); al cambiar `gmOnly` el `handleOps` existente manda `up`/`del`. Capa `notes` en `LAYER_IDS`/`LAYERS`.
```

y en tiempo real / UI: `La regla multitramo es estado de UI (`UI.act.pts`), no viaja por red; su aritmética es `rulerSegments` en core.js.`

- [ ] **Step 2: `02-funcional.md`**

```markdown
### Regla multitramo y anotaciones (2026-09-19)

- **Regla (R):** arrastra para medir; **Espacio o clic derecho** durante el arrastre fija un punto y sigue midiendo desde ahí (para rodear esquinas). Cada tramo muestra sus pies; al final, el total y la línea recta. Diagonales a 5 pies (regla de mesa: `max(dx,dy)`).
- **Anotaciones (N, director):** clic clava un pin con texto («Trampa DC 15», «Palanca»). Por defecto **sólo el director la ve** (pin violeta con ojo tachado); en sus propiedades se publica y los jugadores ven pin y texto. Capa «Anotaciones» en Capas.
```

- [ ] **Step 3: `05-runbook.md`** — gotcha: `Escenas guardadas antes del 2026-09-19 no tienen `layers.notes`: el render usa `(S.layers.notes||{visible:true})`. Al guardar la escena la capa aparece sola.`

- [ ] **Step 4: `07-historial.md`**

```markdown
## 2026-09-19 — Regla multitramo y anotaciones (plan B; P-22, P-23)

- **Qué:** `rulerSegments` + `UI.act.pts` (Espacio / clic derecho); tipo `note` con `gmOnly`, herramienta N, capa `notes`, render con pin. Sin migración. Tests: `frontend.test.js` (+4), `rules.test.js` (+1), `realtime.test.js` (+1), `ui.mjs` (+5 pasos).
- **Por qué:** spec `2026-09-19-condiciones-srd-y-tactica-design.md` §4–5.
- **Revertir:** `git revert` de los commits `feat(regla)…` y `feat(notas)…`/`feat(rules): tipo note…` de esta fecha. Notas ya guardadas quedan en `objects` con `type='note'`: `sanitize` las descarta si el tipo no existe, no rompen nada.
```

- [ ] **Step 5: `06-pendientes.md`** — P-22 y P-23 a cerrados con evidencia (`ui.mjs` pasos regla/notas, capturas 10/11). Fecha de cabecera.

- [ ] **Step 6: `00-INDEX.md`** — conteo de tests (confirmar con `npm test`), y en «Funciones»: `· regla multitramo · anotaciones con «sólo director»`.

- [ ] **Step 7: `README.md`** — en «Qué puede hacer cada rol»: director `Anotaciones (N) con opción de sólo director`; ambos `Regla con puntos de quiebre (Espacio)`.

- [ ] **Step 8: Verificación final y commit**

```bash
npm run check && npm run test:ui && git add docs README.md && git commit -m "docs: regla multitramo y anotaciones (01, 02, 05, 06, 07, 00, README)"
```

**No desplegar.** Avisar al usuario.

---

### Task 8 (añadida el 2026-09-19, P-27): las anotaciones publicadas se ven sólo donde el grupo ve

**Contexto:** decisión del usuario (P-27): una nota publicada se comporta como una ficha enemiga: el jugador la ve
sólo si alguna de sus fichas con visión alcanza ese punto (luz o visión en la oscuridad, sin muro por medio).
El director la ve siempre. No cambia nada del servidor (`gmOnly` sigue filtrando en difusión).

**Files:**
- Modify: `public/js/core.js` (tras `propVisibleToPlayers`, ~L237)
- Modify: `public/js/render.js` (`drawNotes`)
- Modify: `docs/02-funcional.md`, `docs/06-pendientes.md`, `docs/07-historial.md`
- Test: `test/frontend.test.js`, `test/e2e/ui.mjs`

**Interfaces:**
- Consumes: `viewers()`, `canSee(v,p,'hide')`, `frame` (caché por fotograma, como `visibleToPlayers`).
- Produces (global): `noteVisibleToPlayers(n)` → `true` si algún `viewer` ve el punto `{x:n.x,y:n.y}` con `canSee(v,n,'hide')`; cacheado en `frame.nvis` por `n.id`. `drawNotes(c,gm)` salta la nota si `!gm&&!noteVisibleToPlayers(n)`.

- [ ] **Step 1: Test de contrato que falla**

```js
test('notas: para el jugador, una anotación publicada sólo se pinta donde el grupo ve (noteVisibleToPlayers)', () => {
  const core = read('js/core.js');
  assert.match(core, /^function noteVisibleToPlayers\(n\)\{\s*frame\.nvis=frame\.nvis\|\|new Map\(\);if\(frame\.nvis\.has\(n\.id\)\)return frame\.nvis\.get\(n\.id\);\s*const ok=viewers\(\)\.some\(v=>canSee\(v,n,'hide'\)\);\s*frame\.nvis\.set\(n\.id,ok\);return ok;\s*\}$/m);
  const render = read('js/render.js');
  assert.match(render, /for\(const n of S\.notes\)\{\s*if\(!gm&&!noteVisibleToPlayers\(n\)\)continue;/);
});
```

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^not ok"` → falla.

- [ ] **Step 2: Implementar**

`core.js`, tras `propVisibleToPlayers` (antes de `doorVisibleToPlayers`):

```js
/* Una anotación publicada se ve donde el grupo ve (luz o visión en la oscuridad, sin muro por medio) */
function noteVisibleToPlayers(n){
  frame.nvis=frame.nvis||new Map();if(frame.nvis.has(n.id))return frame.nvis.get(n.id);
  const ok=viewers().some(v=>canSee(v,n,'hide'));
  frame.nvis.set(n.id,ok);return ok;
}
```

Comprobar cómo se vacía `frame` en cada fotograma (`grep -n "frame.vis=\|frame={}\|frame.pvis=" public/js/*.js`): si se reinicia con `frame={}` o borrando claves concretas, `nvis` debe reiniciarse igual (si borra claves una a una, añade `frame.nvis`).

`render.js`, en `drawNotes`, primera línea del bucle:

```js
  for(const n of S.notes){
    if(!gm&&!noteVisibleToPlayers(n))continue;
```

Run: `node --test test/frontend.test.js 2>&1 | grep -E "^# (pass|fail)"` y `npm run lint` → verdes.

- [ ] **Step 3: Paso visual en `ui.mjs`** — dentro del bloque de notas, sustituir el paso `step('notas: publicada, el jugador la recibe con su texto', true);` por:

```js
  // publicada pero el jugador no tiene ficha: la recibe (S.notes) pero no la ve (sin visión no se pinta)
  const seenBlind = await pl.evaluate(() => { frame.nvis = null; return noteVisibleToPlayers(S.notes.find((n) => n.text === 'Trampa DC 15')); });
  step('notas: publicada, el jugador la recibe pero sin ficha con visión no la ve', seenBlind === false);
  // el director le da una ficha con antorcha junto a la nota: ahora sí
  await gm.evaluate((pid) => { const t = addObj(newToken({ x: 900, y: 450 }, 'player', { owner: pid })); t.name = 'Vigía'; changed(); }, playerId);
  await pl.waitForFunction(() => S.tokens.some((t) => t.name === 'Vigía'), null, { timeout: 5000 });
  await pl.waitForTimeout(400);
  const seenLit = await pl.evaluate(() => { frame.nvis = null; return noteVisibleToPlayers(S.notes.find((n) => n.text === 'Trampa DC 15')); });
  await shot(pl, '11-nota-publicada-jugador');
  step('notas: con una ficha con antorcha al lado, el jugador la ve', seenLit === true);
```

y al final del bloque, en la limpieza, borrar también la ficha: `await gm.evaluate(() => { S.notes = []; S.tokens = S.tokens.filter((t) => t.name !== 'Vigía'); changed(); });`

`playerId` ya existe (bloque de fichas). `newToken(...,'player')` lleva antorcha por defecto (`tokenLightFrom('torch', true)`), alcance suficiente para 50 px. Si `frame` no es global accesible desde `evaluate`, usa `requestRender()` + `waitForTimeout(300)` en vez de `frame.nvis=null` y lee el resultado igualmente.

Run (servidor local en 3999): `npm run test:ui 2>&1 | tail -6` → 41/41. Abrir `11-nota-publicada-jugador.png`: la nota junto a la ficha «Vigía» iluminada.

- [ ] **Step 4: Mutación** — en `drawNotes`, quitar el `continue` → el paso «sin ficha con visión no la ve» sigue pasando (mide la función, no el dibujo), pero el de contrato falla. En `noteVisibleToPlayers`, cambiar `'hide'` por `'sight'`... no cambia el resultado aquí; la mutación válida es devolver `true` fijo → falla el paso visual «no la ve». Restaurar.

- [ ] **Step 5: Docs y commit**

`docs/02-funcional.md`, en «Regla multitramo y anotaciones»: `- Una anotación **publicada** se ve donde el grupo ve (como una ficha enemiga): en la oscuridad o tras un muro no aparece. Decisión P-27, 2026-09-19.`
`docs/06-pendientes.md`: P-27 a cerrados (`decidido: tapada por visión; test en ui.mjs`).
`docs/07-historial.md`: `## 2026-09-19 — P-27: las notas publicadas se ven sólo donde el grupo ve` (qué: `noteVisibleToPlayers` + salto en `drawNotes` / por qué: decisión del usuario, evitaba leer notas a oscuras / revertir: `git revert` del commit).

```bash
npm run check && git add public/js/core.js public/js/render.js test/frontend.test.js test/e2e/ui.mjs docs/02-funcional.md docs/06-pendientes.md docs/07-historial.md && git commit -m "feat(notas): las anotaciones publicadas se ven sólo donde el grupo ve (P-27)"
```

---

## Self-review

- **Spec §4:** waypoints con Espacio ✓ (Task 2), «con clic» → clic **derecho** (el izquierdo termina el arrastre; decisión documentada en 02) ✓; distancia acumulada y por tramo ✓. Criterio de aceptación 5 («al presionar Espacio se añade un punto y la distancia suma ambos tramos») → paso visual «3 + 3 = 30 ft».
- **Spec §5:** etiquetas/pines con texto ✓ (Tasks 3, 5, 6); `gmOnly` filtrado en difusión ✓ (Task 3 + Task 4 lo prueba por WebSocket); «validado en rules.js» ✓. Se eligió tipo propio `note` (no subtipo de `plan`) porque `plan` tiene semántica de jugador (`owner`, `plansReleased`).
- **Placeholders:** ninguno. Cada paso con código y comando.
- **Nombres:** `rulerSegments`, `rulerAddPoint`, `UI.act.pts`, `note`/`notes`, `newNote`, `drawNotes(c,gm)`, tecla `n`, `data-tool="note"`.
- **Fuera de alcance (a propósito):** mover una nota arrastrándola funciona ya por `translateObj` (tiene `x,y`); duplicar/borrar por el menú contextual genérico del director. Jugadores no crean notas (spec no lo pide).
