/* Escenas del tablero 3D (Tablero3D.Escena en el navegador; require() en node): cómo se lee una escena guardada o
   importada (read, el núcleo de deserialize), cómo se guarda (write, el de serialize), sus techos (normRoof), ajustes,
   planos y notas (readExtras/sceneExtras), level/side de las piezas (levelSide), la escena vacía (blankMap) y la
   validación de una campaña (campValid). Extraído literalmente de tablero3d.js (refactor, tarea 5).
   Exporta sólo `make(mods)`: Muros, Ambiente y Ajustes son módulos de navegador (no UMD), así que llegan como
   dependencias junto con Catalogo; en node los tests los cargan con vm. Luces viene de luces.js.
   make(mods) → { read, write, levelSide, readExtras, sceneExtras, normRoof, blankMap, campValid, ROOF_MAT_IDS, ROOF_SHAPE_IDS }.
   Lo que depende del estado del motor llega en cada llamada (deps):
     read(o, deps) / campValid(o, deps): { pieces, opaque(p), ft(p), terr, miniKinds, normSheet(sheet,kind) };
     write(model, deps): lo mismo más { env, fog }; asigna p.uid a la pieza que no lo tenía (como serialize).
   El azar (la semilla de la escena) se queda en el motor: read no pone `seed` y blankMap la recibe. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const Luces = node ? require('./luces') : root.Tablero3D.Luces;
  const { normLight } = Luces;
  // materiales y formas de techo que se aceptan (los datos de pintado, ROOF_MATS/ROOF_SHAPES, siguen en el motor)
  const ROOF_MAT_IDS=['tile','slate','thatch','shingle','copper'], ROOF_SHAPE_IDS=['gable','hip','flat','cone','shed'];
  // cómo lee un techo guardado el cliente
function normRoof(r,w,d){ if(!r||typeof r!=='object'||![r.x,r.z,r.w,r.d].every(Number.isInteger)||r.w<2||r.d<2||r.x<0||r.z<0||r.x+r.w>w||r.z+r.d>d) return null;
  const o={x:r.x,z:r.z,w:r.w,d:r.d,mat:ROOF_MAT_IDS.includes(r.mat)?r.mat:'tile',shape:ROOF_SHAPE_IDS.includes(r.shape)?r.shape:'gable'};
  if(Number.isInteger(r.rot)&&r.rot>=0&&r.rot<=3) o.rot=r.rot; return o; }
  const CAMP_ID=/^[a-z0-9]{2,16}$/;
  function make(mods) {
    const { Catalogo, Muros, Ambiente, Ajustes } = mods;
// escena vacía: terreno base a elegir y sin personajes; el director la llena desde cero
function blankMap(n,terr,env,seed){
  const tt=/^[gapcson]$/.test(terr||'')?terr:'g', h=new Int8Array(n*n).fill(2), t=new Array(n*n).fill(tt), c=n>>1;
  return {name:'Tablero nuevo '+n+'×'+n,w:n,d:n,h,t,props:[],minis:[],...Ambiente.norm({env}),seed,start:[c,c]};
}
// M2 (ola final): los campos reservados level (0–15) y side (N/E/S/W) viajan como en el servidor (cleanProp)
const levelSide=p=>({...(Number.isInteger(p.level)&&p.level>=0&&p.level<=15?{level:p.level}:{}),...(['N','E','S','W'].includes(p.side)?{side:p.side}:{})});
function write(M,deps){
  const {pieces:PIECES,opaque,ft:FT,env:ENV,fog}=deps;
  return { v:2, name:M.name, w:M.w, d:M.d, h:Array.from(M.h,n=>n.toString(36)).join(''), t:M.t.join(''), wsrc:Array.from(M.src).join(''),
    // formato v2: la forma de siempre + def, uid y state (Catalogo.complete); la pieza que no tenía uid se queda con el suyo
    // la puerta escribe su `state` desde la raíz (open/locked, lo que tocan toggleDoor, lockDoor y la mesa en vivo); la opaca, tal cual
    props:M.props.map(p=>{ if(opaque(p)) return JSON.parse(JSON.stringify(p));
      const door=Catalogo.isDoor(p,PIECES), st=door?Object.assign({},p.state,{open:!!p.open,locked:!!p.locked}):p.state;
      const q=Catalogo.complete({type:p.type,x:p.x,z:p.z,v:p.v||0,open:!!p.open,...(p.locked?{locked:true}:{}),...(p.uid?{uid:p.uid}:{}),...(p.def?{def:p.def}:{}),...(st?{state:st}:{}),...levelSide(p),
      ...(FT(p)==='light'?normLight(p):{}),...(Muros.kindOf(p)?Muros.normProp(p):{})},PIECES); if(!p.uid) p.uid=q.uid; return q; }), roofs:(M.roofs||[]).map(r=>({...r})), start:M.start,
    minis:M.minis.map(m=>({kind:m.kind,x:m.x,z:m.z,fx:m.fx,fz:m.fz,id:m.id,sheet:m.sheet,...(m.owner?{owner:m.owner}:{})})), ...ENV, ...(M.zoneCells?{zoneCells:M.zoneCells}:{}), fog:!!fog, seen:M.seen?Array.from(M.seen).join(''):'',
    ...sceneExtras(M) };
}
function read(o,deps){
  const {pieces:PIECES,opaque,ft:FT,terr:TERR,miniKinds:MINI_KINDS,normSheet}=deps;
  if(!o||typeof o!=='object') throw new Error('bad');
  const w=o.w|0, d=o.d|0;
  if(w<4||d<4||w>160||d>160||typeof o.h!=='string'||typeof o.t!=='string'||o.h.length!==w*d||o.t.length!==w*d) throw new Error('bad');
  const h=new Int8Array(w*d);
  for(let i=0;i<w*d;i++){ const v=parseInt(o.h[i],36); if(!(v>=0&&v<=12)) throw new Error('bad'); h[i]=v; }
  const t=o.t.split(''); if(t.some(c=>!TERR[c])) throw new Error('bad');
  const ok=(x,z)=>Number.isInteger(x)&&Number.isInteger(z)&&x>=0&&z>=0&&x<w&&z<d;
  // escenas v1 y v2: cada pieza se lee contra su definición (catálogo; las p: del tablero en PIECES) y se completa (def, uid, state).
  // Una pieza sin definición se descarta, como en el servidor; un terreno (f:g…) no es una pieza que se coloque. Una p: que
  // no se conoce aquí se conserva opaca (ronda 1 de la Tarea 7).
  const isPiece=p=>{ const D=Catalogo.defOf(p,PIECES); return !!D&&D.class!=='terrain'; };
  const props=(Array.isArray(o.props)?o.props:[]).filter(p=>p&&typeof p.type==='string'&&(isPiece(p)||opaque(p))&&ok(p.x,p.z))
    .map(p=>{ if(opaque(p)) return Catalogo.complete(JSON.parse(JSON.stringify(p)),PIECES);   // tal cual (con uid)
      const q={type:p.type,x:p.x,z:p.z,v:Math.max(0,Math.min(3,p.v|0)),open:Catalogo.isDoor(p,PIECES)&&!!(p.state&&'open' in p.state?p.state.open:p.open)};
      if(typeof p.uid==='string') q.uid=p.uid; if(typeof p.def==='string') q.def=p.def; Object.assign(q,levelSide(p));
      if(p.state&&typeof p.state==='object') q.state=Object.assign({},p.state);
      if(FT(p)==='light') Object.assign(q,normLight(p));
      // muros de JA-VTT: puertas con llave, portales; las escaleras de campaña de antes pasan a portales (Muros.normProp, como el servidor)
      const wp=Muros.normProp(p); if(wp) Object.assign(q,wp,{open:Catalogo.isDoor(wp,PIECES)&&!!q.open});
      if(p.state&&p.state.locked) q.locked=true;
      return Catalogo.complete(q,PIECES); }).slice(0,5000);
  Catalogo.dedupeUids(props);   // M1: uid repetidos, igual que el servidor (el primero conserva el suyo)
  Muros.fixPortalIds(props);
  const minis=(Array.isArray(o.minis)?o.minis:[]).filter(m=>m&&typeof m.kind==='string'&&(MINI_KINDS.includes(m.kind)||/^c_[a-z0-9]{4,16}$/.test(m.kind))&&ok(m.x,m.z))
    .map(m=>{ const fx=Math.sign(m.fx|0), fz=fx?0:(Math.sign(m.fz|0)||1); return {kind:m.kind,x:m.x,z:m.z,fx,fz,id:typeof m.id==='string'&&/^[a-z0-9]{2,12}$/.test(m.id)?m.id:undefined,sheet:normSheet(m.sheet,m.kind),
      ...(typeof m.owner==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(m.owner)?{owner:m.owner}:{})}; }).slice(0,500);
  const src=new Uint8Array(w*d); if(typeof o.wsrc==='string'&&o.wsrc.length===w*d) for(let i=0;i<w*d;i++) src[i]=o.wsrc[i]==='1'?1:o.wsrc[i]==='2'?2:0;
  const k=minis.find(m=>m.kind==='knight')||minis[0];
  const seen=new Uint8Array(w*d); if(typeof o.seen==='string'&&o.seen.length===w*d) for(let i=0;i<w*d;i++) seen[i]=o.seen[i]==='1'?1:0;
  const st0=Array.isArray(o.start)&&Number.isInteger(o.start[0])&&Number.isInteger(o.start[1])&&o.start[0]>=0&&o.start[1]>=0&&o.start[0]<w&&o.start[1]<d?o.start:null;
  const roofs=(Array.isArray(o.roofs)?o.roofs:[]).map(r=>normRoof(r,w,d)).filter(Boolean).slice(0,300);
  const zoneCells=Ambiente.cleanCells(o.zoneCells,w*d);   // zonas interiores pintadas (las de los techos salen de los techos)
  // R18: casillas que bloquean piezas del director que al jugador no le llegan (derivado del servidor: no se serializa)
  const blockCells=new Set((Array.isArray(o.blockCells)?o.blockCells:[]).slice(0,w*d).filter(i=>Number.isInteger(i)&&i>=0&&i<w*d));
  return {roofs,seen,fog:!!o.fog,src,name:String(o.name||'Tablero').slice(0,40),w,d,h,t,props,minis,...Ambiente.norm(o),...(zoneCells?{zoneCells}:{}),...(blockCells.size?{blockCells}:{}),start:st0||(k?[k.x,k.z]:[w>>1,d>>1]),
    ...readExtras(o,w,d)};
}
/* ajustes de escena de JA-VTT (grid, snap, animate, plansReleased), planos del director y anotaciones: como cleanMap del servidor */
function readExtras(o,w,d){ const list=(v,n,f)=>Ajustes.uniq((Array.isArray(v)?v:[]).slice(0,n).map(x=>f(x,w,d)).filter(Boolean));
  return {...Ajustes.sceneFlags(o),plans:list(o.plans,100,Ajustes.normPlan),notes:list(o.notes,300,Ajustes.normNote)}; }
function sceneExtras(m){ return {...Ajustes.sceneFlags(m),...(m.plans&&m.plans.length?{plans:m.plans.map(p=>({...p}))}:{}),...(m.notes&&m.notes.length?{notes:m.notes.map(n=>({...n}))}:{})}; }
// una campaña guardada: sólo los tableros que se pueden leer (read) y sus notas
function campValid(o,deps){ if(!o||typeof o!=='object'||!CAMP_ID.test(o.id||'')||!o.boards||typeof o.boards!=='object') return null;
  const boards={}; for(const [k,v] of Object.entries(o.boards)){ if(!CAMP_ID.test(k)||!v||typeof v!=='object') continue; try{ read(v.data,deps); boards[k]={name:String(v.name||'Tablero').slice(0,40),data:v.data}; }catch(e){} }
  const ids=Object.keys(boards); if(!ids.length) return null;
  const notes={}; for(const k of ids){ const arr=o.notes&&Array.isArray(o.notes[k])?o.notes[k]:[]; notes[k]=arr.filter(n=>n&&Number.isInteger(n.x)&&Number.isInteger(n.z)&&typeof n.text==='string').slice(0,300).map(n=>({x:n.x,z:n.z,text:n.text.slice(0,500)})); }
  return {id:o.id,name:String(o.name||'Campaña').slice(0,40),boards,notes,cur:boards[o.cur]?o.cur:ids[0],updated:o.updated|0}; }
    return { read, write, levelSide, readExtras, sceneExtras, normRoof, blankMap, campValid, ROOF_MAT_IDS, ROOF_SHAPE_IDS };
  }
  const Escena = { make };
  if (typeof module === 'object' && module.exports) module.exports = Escena;
  else (root.Tablero3D = root.Tablero3D || {}).Escena = Escena;
})(typeof window !== 'undefined' ? window : globalThis);
