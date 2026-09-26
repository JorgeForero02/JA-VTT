'use strict';
/* Ajustes, planos, anotaciones e iniciativa con la forma de Just Another VTT (Tablero3D.Ajustes), sin dependencias: se prueban
   en test/frontend.test.js contra el servidor (modules/tablero3d/rules.js) y los fijos de JA-VTT.
   - Ajustes del tablero (t3d.boards.settings): las claves, valores por defecto y HP_VISIBILITY de JA-VTT (`norm` = cleanSettings).
   - Ajustes de escena de JA-VTT que viajan con la escena 3D: grid, snap, animate, plansReleased (`sceneFlags` = cleanSceneFlags).
   - Planos (type 'plan'): shape line/circle/rect/cone con a y b en casillas continuas; las plantillas de medida de la partida
     (regla, círculo, cono, línea, cubo) se fijan como planos (`planOf`) y se pintan con las mismas casillas (`planCells` = `measure`).
   - Anotaciones (type 'note'): texto de hasta 200 en una casilla, gmOnly (`normNote` = cleanNote).
   - Iniciativa ({ entries, turn, round }, `normInitiative` = cleanInitiative) y el documento `combat` de la mesa en vivo tal
     como llega (`readCombat`: el de ahora, la vista del jugador o el de antes con `order`). */
(window.Tablero3D=window.Tablero3D||{}).Ajustes=(()=>{
  const fin=v=>typeof v==='number'&&Number.isFinite(v);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const intIn=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
  const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
  const HEX6=/^#[0-9a-f]{6}$/i, UID=/^\d{1,15}$/, TOK=/^[a-z0-9]{2,12}$/;

  const HP_VISIBILITY=['all','gm','bar_only'];
  const DEFAULTS={sharedVision:true,playersDoors:true,chatEnabled:true,diceEnabled:true,initiativeShown:false,hpVisibility:'all',hpEnabled:true,conditionsEnabled:true,acEnabled:true};
  const BOOLS=Object.keys(DEFAULTS).filter(k=>typeof DEFAULTS[k]==='boolean');
  function norm(s,base){ const out=Object.assign({},DEFAULTS);
    for(const src of [base,s]){ if(!plain(src)) continue; for(const k of BOOLS) if(typeof src[k]==='boolean') out[k]=src[k]; if(HP_VISIBILITY.includes(src.hpVisibility)) out.hpVisibility=src.hpVisibility; }
    return out; }

  const SCENE_FLAGS={grid:true,snap:true,animate:true,plansReleased:false};
  function sceneFlags(o){ const out={}; for(const [k,v] of Object.entries(SCENE_FLAGS)) out[k]=o&&typeof o[k]==='boolean'?o[k]:v; return out; }

  /* ---- planos ---- */
  const PLAN_SHAPES=['line','circle','rect','cone'];
  const PLAN_COLOR='#8ec5e8';
  const r2=v=>Math.round(v*100)/100;
  function normPlan(p,w,d){
    if(!plain(p)||!intIn(p.id,1,1e9)) return null;
    const pt=v=>plain(v)&&fin(v.x)&&fin(v.z)?{x:r2(clamp(v.x,0,w)),z:r2(clamp(v.z,0,d))}:null, a=pt(p.a), b=pt(p.b);
    if(!a||!b) return null;
    const o={id:p.id,shape:PLAN_SHAPES.includes(p.shape)?p.shape:'line',a,b};
    if(o.shape==='line'&&p.area===true) o.area=true;
    if(typeof p.owner==='string'&&UID.test(p.owner)){ o.owner=p.owner; o.color=HEX6.test(p.color||'')?p.color.toLowerCase():PLAN_COLOR; }
    return o;
  }
  const HALF=Math.atan(0.5);   // el cono de 5.ª edición: tan ancho como largo
  /* casillas (índices z*W+x) de una plantilla de la partida: a = casilla de origen, b = casilla a la que apunta (o null),
     L = tamaño en casillas. La regla, de casilla a casilla (Bresenham). Lo mismo que antes hacía el motor. */
  function measure(mode,a,b,L,W,D){
    const out=[];
    if(mode==='ruler'){ let [x0,z0]=a; const [x1,z1]=b, dx=Math.abs(x1-x0), dz=-Math.abs(z1-z0), sx=x0<x1?1:-1, sz=z0<z1?1:-1; let e=dx+dz;
      for(;;){ out.push(z0*W+x0); if(x0===x1&&z0===z1) break; const e2=2*e; if(e2>=dz){ e+=dz; x0+=sx; } if(e2<=dx){ e+=dx; z0+=sz; } } return out; }
    const vx=b?(b[0]-a[0]):1, vz=b?(b[1]-a[1]):0, vl=Math.hypot(vx,vz)||1;
    return area(mode,a[0]+.5,a[1]+.5,vx/vl,vz/vl,L,W,D);
  }
  function area(mode,cx,cz,ux,uz,L,W,D){
    const out=[];
    for(let z=0;z<D;z++) for(let x=0;x<W;x++){ const px=x+.5-cx, pz=z+.5-cz, d=Math.hypot(px,pz); let inside=false;
      if(mode==='circle') inside=d<=L+0.01;
      else if(mode==='cube'){ const h=L/2; inside=Math.abs(px)<h+0.01&&Math.abs(pz)<h+0.01; }
      else if(mode==='cone'){ const along=px*ux+pz*uz; inside=d>0.1&&along>0&&d<=L+0.01&&Math.acos(Math.max(-1,Math.min(1,along/d)))<=HALF+0.02; }
      else if(mode==='line'){ const along=px*ux+pz*uz, perp=Math.abs(-px*uz+pz*ux); inside=along>0.3&&along<=L+0.3&&perp<=0.5; }
      if(inside) out.push(z*W+x); }
    return out;
  }
  /* la plantilla fijada como plano de JA-VTT: regla → line; línea → line con area; círculo → circle; cono → cone; cubo → rect */
  function planOf(mode,a,b,L){
    const c={x:a[0]+.5,z:a[1]+.5};
    if(mode==='ruler') return {shape:'line',a:c,b:{x:b[0]+.5,z:b[1]+.5}};
    if(mode==='circle') return {shape:'circle',a:c,b:{x:c.x+L,z:c.z}};
    if(mode==='cube') return {shape:'rect',a:{x:c.x-L/2,z:c.z-L/2},b:{x:c.x+L/2,z:c.z+L/2}};
    const vx=b?(b[0]-a[0]):1, vz=b?(b[1]-a[1]):0, vl=Math.hypot(vx,vz)||1, tip={x:c.x+vx/vl*L,z:c.z+vz/vl*L};
    return mode==='cone'?{shape:'cone',a:c,b:tip}:{shape:'line',area:true,a:c,b:tip};
  }
  // tamaño (casillas) y tipo de plantilla de un plano
  function planMode(p){ return p.shape==='line'?(p.area?'line':'ruler'):p.shape==='rect'?'cube':p.shape; }
  function planSize(p){ return p.shape==='rect'?Math.abs(p.b.x-p.a.x):Math.hypot(p.b.x-p.a.x,p.b.z-p.a.z); }
  function planCells(p,W,D){
    const mode=planMode(p), L=planSize(p);
    if(mode==='ruler'){ const f=v=>clamp(Math.floor(v),0,1e4); return measure('ruler',[Math.min(f(p.a.x),W-1),Math.min(f(p.a.z),D-1)],[Math.min(f(p.b.x),W-1),Math.min(f(p.b.z),D-1)],0,W,D); }
    if(mode==='cube') return area('cube',(p.a.x+p.b.x)/2,(p.a.z+p.b.z)/2,1,0,L,W,D);
    const vx=p.b.x-p.a.x, vz=p.b.z-p.a.z, vl=Math.hypot(vx,vz)||1;
    return area(mode,p.a.x,p.a.z,vx/vl,vz/vl,L,W,D);
  }
  const nextId=list=>list.reduce((m,x)=>Math.max(m,x.id|0),0)+1;

  /* ---- anotaciones ---- */
  function normNote(n,w,d){
    if(!plain(n)||!intIn(n.id,1,1e9)||!intIn(n.x,0,w-1)||!intIn(n.z,0,d-1)) return null;
    const text=str(n.text,200).trim(); return text?{id:n.id,x:n.x,z:n.z,text,gmOnly:!!n.gmOnly}:null;
  }
  const uniq=list=>{ const seen=new Set(); return list.filter(x=>!seen.has(x.id)&&seen.add(x.id)); };

  /* ---- iniciativa ---- */
  function normInitiative(v){
    const src=plain(v)?v:{};
    const entries=(Array.isArray(src.entries)?src.entries:[]).slice(0,60).map(e=>{
      if(!plain(e)) return null;
      const out={id:fin(e.id)?Math.round(e.id):Date.now(),name:str(e.name,40).trim()||'Sin nombre',value:fin(e.value)?clamp(Math.round(e.value*100)/100,-99,999):0};
      if(fin(e.tokenId)||(typeof e.tokenId==='string'&&TOK.test(e.tokenId))) out.tokenId=e.tokenId;
      if(typeof e.hidden==='boolean') out.hidden=e.hidden;
      if(fin(e.roll)) out.roll=clamp(Math.round(e.roll),1,20);
      if(fin(e.init)) out.init=clamp(Math.round(e.init),-10,20);
      return out; }).filter(Boolean);
    return {entries,turn:fin(src.turn)?clamp(Math.round(src.turn),0,Math.max(0,entries.length-1)):0,round:fin(src.round)?clamp(Math.round(src.round),1,9999):1};
  }
  /* El documento `combat` tal como llega: el del director ({ initiative, left, dashed, active, current }), la vista del jugador
     (initiative null si el director no la muestra; current = la ficha del turno si la puede ver) o uno de antes ({ active,
     order: [{ id, roll, total, init }], turn, round, left, dashed }). Devuelve { entries, turn, round, active, current, left,
     dashed, hiddenOrder }. */
  function readCombat(d){
    if(!plain(d)) return {entries:[],turn:0,round:1,active:false,current:null,left:0,dashed:false,hiddenOrder:false};
    const left=fin(d.left)?clamp(Math.round(d.left),0,1000):0, dashed=!!d.dashed;
    if(Array.isArray(d.order)){
      const order=d.active?d.order.filter(o=>plain(o)&&TOK.test(o.id||'')):[];
      const ini=normInitiative({entries:order.map((o,k)=>({id:k+1,name:'',value:o.total|0,tokenId:o.id,roll:(o.roll|0)||1,init:o.init|0})),turn:d.turn|0,round:(d.round|0)||1});
      const cur=ini.entries[ini.turn];
      return {entries:ini.entries,turn:ini.turn,round:ini.round,active:ini.entries.length>0,current:cur?cur.tokenId:null,left,dashed,hiddenOrder:false};
    }
    const ini=d.initiative==null?null:normInitiative(d.initiative), active=typeof d.active==='boolean'?d.active:!!(ini&&ini.entries.length);
    const cur=ini&&active?ini.entries[ini.turn]:null, curId=cur&&typeof cur.tokenId==='string'?cur.tokenId:null;
    return {entries:ini?ini.entries:[],turn:ini?ini.turn:0,round:ini?ini.round:(fin(d.round)?clamp(Math.round(d.round),1,9999):1),active,
      current:'current' in d?(typeof d.current==='string'?d.current:null):curId,left,dashed,hiddenOrder:!ini&&active};
  }

  return {HP_VISIBILITY,DEFAULTS,norm,SCENE_FLAGS,sceneFlags,PLAN_SHAPES,PLAN_COLOR,normPlan,measure,planOf,planMode,planSize,planCells,nextId,normNote,uniq,normInitiative,readCombat};
})();
