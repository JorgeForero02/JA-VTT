'use strict';
/* Muros y portales del tablero 3D (Tablero3D.Muros), sin dependencias: se prueban en test/frontend.test.js.
   Los tipos son los de Just Another VTT (WALL_TYPES de su public/js/core.js y WALL_KINDS de su server/rules.js; fijo
   test/fixtures/ja-vtt/wall-types.json): mismos ids, nombres, iconos, colores, trazos, descripciones y banderas
   sight (tapa la vista), light (tapa la luz), move (impide el paso), hide (oculta fichas y objetos de detrás), door y portal.
   En 3D van por casilla (primera fase; los muros finos entre casillas quedan en la hoja de ruta):
     wall    = casilla de terreno 'w' (como siempre)
     door    = objetos puerta (`door`, `gate`) con `open` y `locked`
     window, veil, cover, barrier, portal = objetos del mismo nombre.
   Un portal lleva `id` (entero, único en la escena), `name`, `look` (aspecto) y `target: {scene, portal}` como JA-VTT.
   `normProp` lee igual que `cleanWallProp` del servidor; `arrival` calcula igual que el servidor dónde aparecen las fichas
   que cruzan (otro test los compara). */
(window.Tablero3D=window.Tablero3D||{}).Muros=(()=>{
  const C=window.Tablero3D.Catalogo;   // catalogo.js se carga antes (t3d.js)
  const WALL_TYPES={
    wall:{name:'Muro',icon:'brick-wall',sight:1,light:1,move:1,color:'#6FB8A8',desc:'Bloquea vista, luz y paso'},
    door:{name:'Puerta',icon:'door-closed',sight:1,light:1,move:1,color:'#F0B35A',door:1,desc:'Como un muro mientras está cerrada'},
    window:{name:'Ventana',icon:'window-wall',sight:0,light:0,move:1,color:'#8EC5E8',dash:[10,6],desc:'Deja pasar vista y luz, no el paso'},
    veil:{name:'Velo',icon:'cloud-fog',sight:1,light:1,move:0,color:'#B79BD8',dash:[3,5],desc:'Follaje, humo o cortinas: tapa la vista, se puede cruzar'},
    cover:{name:'Maleza',icon:'trees',sight:0,light:0,move:0,hide:1,color:'#9ED3A6',dash:[6,4],desc:'Hierba alta, niebla baja: el fondo y la luz se ven, pero oculta a las fichas y objetos que haya detrás; se puede cruzar'},
    barrier:{name:'Barrera',icon:'fence',sight:0,light:0,move:1,color:'#A7AFAF',dash:[2,8],desc:'Invisible: solo frena el movimiento'},
    portal:{name:'Portal',icon:'log-in',sight:1,light:1,move:1,color:'#E8A0BF',portal:1,desc:'Puerta a otra escena: un clic junto a él lleva al personaje allí'}
  };
  const WALL_KINDS=Object.keys(WALL_TYPES);
  const FACT=Object.keys(C.FACTORY).filter(k=>C.FACTORY[k].class!=='terrain').map(k=>k.slice(2));
  const DOOR_PROPS=FACT.filter(t=>C.isDoor({type:t}));
  const PROP_KINDS=['window','veil','cover','barrier','portal'];
  /* Aspectos de un portal: cada uno es un objeto por capas del motor (PROP3D, oculto en la paleta y editable en «Todo el arte»).
     Los de suelo (escalera, trampilla) no tapan la vista ni la luz: se ven por encima; los de pie, sí (como en JA-VTT). */
  const PORTAL_LOOKS={
    door:{name:'Puerta',prop:'portal',upright:true},
    stairs:{name:'Escalera',prop:'portal_stairs',upright:false},
    cave:{name:'Boca de cueva',prop:'portal_cave',upright:true},
    trapdoor:{name:'Trampilla',prop:'portal_trap',upright:false},
    magic:{name:'Portal mágico',prop:'portal_magic',upright:true,light:'crystal'}
  };
  const LOOK_IDS=Object.keys(PORTAL_LOOKS);
  const MAP_MAX=160;
  const SCENE_ID=/^[A-Za-z0-9_-]{1,64}$/, CAMP_ID=/^[a-z0-9]{2,16}$/;
  /* Lo que el servidor necesita saber de los objetos para colocar fichas (lo comprueba un test contra PROP3D):
     los que se pisan y los que ocupan varias casillas [ancho, fondo] desde su esquina (girados 90° se cambian). */
  const PASSABLE=FACT.filter(t=>!C.blocksMove({type:t})&&!C.isDoor({type:t}));
  const SPANS=Object.fromEntries(FACT.map(t=>[t,C.span({type:t})]).filter(([,s])=>s[0]>1||s[1]>1));

  const kindOf=p=>!p||typeof p.type!=='string'?null:C.wallKind(p);
  // ¿tapa este objeto (flag: 'sight' | 'light' | 'move' | 'hide')? Lo dice su definición (catalogo.js)
  function blocks(p,flag){ return C.blocks(p,flag); }
  // id del portal en que se convierte una escalera de campaña de antes: sale de su casilla, así la de ida y la de vuelta se
  // encuentran sin mirar la otra escena (el cliente y el servidor lo calculan igual)
  const stairsId=(x,z)=>1+z*MAP_MAX+x;
  const int=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
  /* Un objeto de muro saneado (o null si no es de muro). `x`, `z` ya comprobados por quien llama. Las escaleras de campaña de
     antes (`stairs` con `to`, `tx`, `tz`) pasan a portales con aspecto de escalera. */
  function normProp(p){
    if(p.type==='stairs'&&typeof p.to==='string'&&CAMP_ID.test(p.to))
      return {type:'portal',x:p.x,z:p.z,v:0,id:stairsId(p.x,p.z),look:'stairs',target:{scene:p.to,portal:int(p.tx,0,MAP_MAX-1)&&int(p.tz,0,MAP_MAX-1)?stairsId(p.tx,p.tz):null}};
    const k=kindOf(p); if(!k) return null;
    const v=int(p.v,0,3)?p.v:0;
    if(k==='door'){ const o={type:p.type,x:p.x,z:p.z,v,open:!!p.open}; if(p.locked===true) o.locked=true; return o; }
    if(k!=='portal') return {type:p.type,x:p.x,z:p.z,v};
    const o={type:'portal',x:p.x,z:p.z,v,id:int(p.id,1,1e6)?p.id:0,look:LOOK_IDS.includes(p.look)?p.look:'door',target:null};
    const nm=typeof p.name==='string'?p.name.trim().slice(0,40):''; if(nm) o.name=nm;
    const t=p.target; if(t&&typeof t==='object'&&typeof t.scene==='string'&&SCENE_ID.test(t.scene)) o.target={scene:t.scene,portal:int(t.portal,1,1e6)?t.portal:null};
    return o;
  }
  // ids de portal únicos en la escena: los que faltan o se repiten toman el siguiente libre
  function fixPortalIds(props){ let max=0; const seen=new Set();
    for(const p of props) if(p.type==='portal'&&p.id>max) max=p.id;
    for(const p of props) if(p.type==='portal'){ if(!p.id||seen.has(p.id)) p.id=++max; seen.add(p.id); }
    return props; }
  const nextPortalId=props=>1+props.reduce((m,p)=>p.type==='portal'&&p.id>m?p.id:m,0);

  /* ---- llegada: dónde aparecen las fichas que cruzan un portal (la idea de arrivalPoints de JA-VTT, por casillas) ----
     Rejilla de una escena guardada (`serialize`) o cargada: se pisa si no es muro, lava ni agua, no hay un objeto que ocupe
     la casilla (salvo los que se pisan) ni otra ficha. */
  function gridOf(m){
    const w=m.w, d=m.d, n=w*d, open=new Uint8Array(n), h=new Int8Array(n);
    for(let i=0;i<n;i++){ const tt=m.t[i], hv=typeof m.h==='string'?parseInt(m.h[i],36):m.h[i], ws=m.wsrc!=null?m.wsrc:m.src;
      const water=ws!=null&&ws.length===n&&String(ws[i])!=='0';
      h[i]=hv|0; open[i]=tt!=='w'&&tt!=='l'&&tt!=='~'&&!water?1:0; }
    const off=(x,z,sw,sd)=>{ for(let j=0;j<sd;j++) for(let k=0;k<sw;k++){ const X=x+k, Z=z+j; if(X>=0&&Z>=0&&X<w&&Z<d) open[Z*w+X]=0; } };
    for(const p of m.props||[]) if(p&&(C.blocksMove(p)||C.isDoor(p))&&Number.isInteger(p.x)&&Number.isInteger(p.z)){ const [sw,sd]=C.span(p); off(p.x,p.z,sw,sd); }
    for(const q of m.minis||[]) if(q&&Number.isInteger(q.x)&&Number.isInteger(q.z)){ const s=q.sheet&&int(q.sheet.size,1,4)?q.sheet.size:1; off(q.x,q.z,s,s); }
    for(const i of m.blockCells||[]) if(Number.isInteger(i)&&i>=0&&i<n) open[i]=0;   // R18: lo que tapan piezas del director que este cliente no tiene
    return {w,d,open:i=>open[i]===1,h:i=>h[i]};
  }
  const D4=[[1,0],[-1,0],[0,1],[0,-1]], D8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  /* Esquinas [x,z] (o null si no cabe) para fichas de `sizes` casillas por lado, junto a la casilla (px,pz) del portal de
     llegada, del lado por el que se anda: se recorre lo pisable desde las casillas de al lado del portal (primero la más
     cercana a `start`, el punto de entrada de la escena) y cada ficha toma el primer hueco en que cabe. */
  function arrival(g,px,pz,sizes,start){
    const N=g.w*g.d, inb=(x,z)=>x>=0&&z>=0&&x<g.w&&z<g.d, seen=new Uint8Array(N), order=[];
    const sx=start?start[0]:px, sz=start?start[1]:pz;
    const bfs=i0=>{ const q=[i0]; seen[i0]=1;
      for(let k=0;k<q.length;k++){ const c=q[k], cx=c%g.w, cz=(c/g.w)|0; order.push(c);
        for(const [dx,dz] of D4){ const X=cx+dx, Z=cz+dz; if(!inb(X,Z)) continue; const j=Z*g.w+X;
          if(seen[j]||!g.open(j)||Math.abs(g.h(j)-g.h(c))>2) continue; seen[j]=1; q.push(j); } } };
    if(inb(px,pz)&&g.open(pz*g.w+px)) bfs(pz*g.w+px);
    const seeds=D8.map(([dx,dz])=>[px+dx,pz+dz]).filter(([x,z])=>inb(x,z)&&g.open(z*g.w+x))
      .sort((a,b)=>Math.hypot(a[0]-sx,a[1]-sz)-Math.hypot(b[0]-sx,b[1]-sz));
    for(const [x,z] of seeds){ const i=z*g.w+x; if(!seen[i]) bfs(i); }
    const taken=new Uint8Array(N), out=[];
    const fits=(x,z,n)=>{ if(x<0||z<0||x+n>g.w||z+n>g.d) return false;
      for(let j=0;j<n;j++) for(let k=0;k<n;k++){ const i=(z+j)*g.w+x+k; if(!seen[i]||taken[i]) return false; } return true; };
    for(const n of sizes){ let at=null;
      for(const c of order){ const x=c%g.w, z=(c/g.w)|0; if(fits(x,z,n)){ at=[x,z]; break; } }
      if(at) for(let j=0;j<n;j++) for(let k=0;k<n;k++) taken[(at[1]+j)*g.w+at[0]+k]=1;
      out.push(at); }
    return out;
  }
  // ¿está una ficha de n casillas en (x,z) junto al portal (o encima)? Como la distancia de 5.ª edición: a una casilla o menos
  function near(x,z,n,p){ const dx=Math.max(0,p.x-(x+n-1),x-p.x), dz=Math.max(0,p.z-(z+n-1),z-p.z); return Math.max(dx,dz)<=1; }

  return {WALL_TYPES,WALL_KINDS,DOOR_PROPS,PROP_KINDS,PORTAL_LOOKS,LOOK_IDS,PASSABLE,SPANS,kindOf,blocks,stairsId,normProp,fixPortalIds,nextPortalId,gridOf,arrival,near};
})();
