/* Generadores de las plantillas del tablero 3D (Tablero3D.Mapas en el navegador; require() en node): claro del
   bosque (demoMap), mazmorra con semilla (dungeonMap), pueblo de Brezo (townMap) y taller de luces
   (lightWorkshopMap). Extraídos literalmente de tablero3d.js (refactor, tarea 4).
   Exporta sólo `make(deps)`, que devuelve { demoMap, dungeonMap, townMap, lightWorkshopMap }. deps:
     defaultSheet(kind), normSheet(o,kind) — la ficha por defecto lee el estado del motor (CUSTOM, CHARS), así que la
       pone el motor (la tarea 5 las lleva a escena.js);
     Fichas — Tablero3D.Fichas (fichas.js no es UMD: en node no se puede hacer require).
   Azar (mulberry32, hash) y luces (LIGHT_TYPES, lightOfType) vienen de base.js y luces.js. */
(function (root) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const Base = node ? require('./base') : root.Tablero3D.Base;
  const Luces = node ? require('./luces') : root.Tablero3D.Luces;
  const { mulberry32, hash } = Base;
  const { LIGHT_TYPES, lightOfType } = Luces;
  function make(deps) {
    const { defaultSheet, normSheet, Fichas } = deps;
function demoMap(){
  const rows=[
    'g2 g2 g2 g3 g3 g4 g4 g4',
    'g2 g2 p2 g3 g3 g4 g4 g4',
    'g2 g2 p2 p2 g3 g3 g4 g4',
    'a1 a1 g2 p2 p2 p2 s2 s2',
    '~0 ~0 a1 g2 g2 p2 s2 w6',
    '~0 ~0 a1 g2 g2 p2 s2 w6',
    '~0 ~0 a1 g2 o3 o3 s2 w6',
    'a1 a1 a1 g2 o3 o3 w6 w6'];
  const w=8,d=8,h=new Int8Array(64),t=new Array(64);
  rows.forEach((row,z)=>row.split(' ').forEach((c,x)=>{ t[z*w+x]=c[0]; h[z*w+x]=+c.slice(1); }));
  return { name:'Claro del bosque 8×8', w,d,h,t, env:'day', start:[4,4], seed:3,
    props:[{type:'tree',x:0,z:0,v:0},{type:'tree',x:4,z:1,v:2},{type:'tree',x:7,z:0,v:1},{type:'tree',x:6,z:1,v:2},{type:'brazier',x:6,z:4},{type:'brazier',x:5,z:7}],
    minis:[{kind:'knight',x:3,z:5,fx:1,fz:0},{kind:'goblin',x:6,z:2,fx:-1,fz:0},{kind:'wolf',x:5,z:2,fx:-1,fz:0},{kind:'rat',x:2,z:2,fx:1,fz:0}] };
}
function dungeonMap(n,seed){
  const r=mulberry32(seed), w=n, d=n, h=new Int8Array(w*d).fill(6), t=new Array(w*d).fill('w');
  const I=(x,z)=>z*w+x, rooms=[], want=Math.floor(n*n/160);
  for(let k=0;k<n*30&&rooms.length<want;k++){
    const rw=5+(r()*7|0), rd=5+(r()*7|0), x=1+(r()*(w-rw-2)|0), z=1+(r()*(d-rd-2)|0);
    if(rooms.some(o=>x<o.x+o.w+2&&x+rw+2>o.x&&z<o.z+o.d+2&&z+rd+2>o.z)) continue;
    rooms.push({x,z,w:rw,d:rd,type:rooms.length===0?0:(r()*4|0)});
  }
  const props=[], minis=[];
  for(const o of rooms){
    for(let z=o.z;z<o.z+o.d;z++)for(let x=o.x;x<o.x+o.w;x++){ t[I(x,z)]=o.type===3?'g':'s'; h[I(x,z)]=2; }
    if(o.w>=7&&o.d>=7){
      if(o.type===1){ for(let z=o.z+1;z<o.z+o.d-1;z++)for(let x=o.x+1;x<o.x+o.w-1;x++) t[I(x,z)]='a';
        for(let z=o.z+2;z<o.z+o.d-2;z++)for(let x=o.x+2;x<o.x+o.w-2;x++){ t[I(x,z)]='~'; h[I(x,z)]=0; } }
      if(o.type===2) for(let z=o.z+2;z<o.z+o.d-2;z++)for(let x=o.x+2;x<o.x+o.w-2;x++){ t[I(x,z)]='o'; h[I(x,z)]=3; }
    }
    o.cx=o.x+(o.w>>1); o.cz=o.z+(o.d>>1);
  }
  const carve=(a,b)=>{
    let x=a.cx, z=a.cz;
    const cell=()=>{ const i=I(x,z); if(t[i]==='w'){ t[i]='p'; h[i]=2; } };
    while(x!==b.cx){ cell(); x+=Math.sign(b.cx-x); }
    while(z!==b.cz){ cell(); z+=Math.sign(b.cz-z); }
  };
  const order=rooms.slice().sort((a,b)=>(a.cx+a.cz*0.5)-(b.cx+b.cz*0.5));
  for(let i=1;i<order.length;i++) carve(order[i-1],order[i]);
  for(let i=0;i<rooms.length/4;i++) carve(rooms[r()*rooms.length|0],rooms[r()*rooms.length|0]);
  const used=new Set();
  const place=(type,x,z,extra={})=>{ const i=I(x,z); if(used.has(i)||t[i]==='w'||t[i]==='~') return false; used.add(i); props.push({type,x,z,...extra}); return true; };
  rooms.forEach((o,k)=>{
    place('brazier',o.x+1,o.z+1); place('brazier',o.x+o.w-2,o.z+o.d-2);
    if(o.w*o.d>60){ place('brazier',o.x+o.w-2,o.z+1); place('brazier',o.x+1,o.z+o.d-2); }
    if(o.type===3) for(let j=0;j<3;j++) place('tree',o.x+1+(r()*(o.w-2)|0),o.z+1+(r()*(o.d-2)|0),{v:(r()*3|0)});
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    if(k===0){ used.add(I(o.cx,o.cz)); minis.push({kind:'knight',x:o.cx,z:o.cz,fx:0,fz:1}); }
    else if(r()<0.45){
      for(let tries=0;tries<10;tries++){ const x=o.x+(r()*o.w|0), z=o.z+(r()*o.d|0), i=I(x,z);
        if(!used.has(i)&&t[i]!=='~'){ used.add(i); const dd=dirs[r()*4|0]; minis.push({kind:['skeleton','goblin','skeleton','bandit'][(x*7+z*3)%4],x,z,fx:dd[0],fz:dd[1]}); break; } }
    }
  });
  return { name:`Mazmorra ${n}×${n}`, w,d,h,t, env:'interior', start:[rooms[0].cx,rooms[0].cz], props, minis, seed };
}
// --- el pueblo de ejemplo: muralla al norte con puerta y torres, atalaya con techo cónico, plaza de mercado con puestos,
// capilla con campanario, molino en una loma, puente sobre el arroyo y tejados de cada material ---
function townMap(){
  const W=48, D=40, h=new Int8Array(W*D).fill(2), t=new Array(W*D).fill('g'), props=[], minis=[], roofs=[];
  const I=(x,z)=>z*W+x, set=(x,z,tt,hh)=>{ if(x>=0&&z>=0&&x<W&&z<D){ t[I(x,z)]=tt; if(hh!=null) h[I(x,z)]=hh; } };
  const put=(type,x,z,v,extra)=>props.push({type,x,z,v:v||0,...(extra||{})});
  const lamp=(id,x,z,hh,extra)=>props.push(Object.assign({type:'light',x,z,v:0},lightOfType(id),{h:hh},extra||{}));
  const block=(x,z,w,d,hh)=>{ for(let zz=z;zz<z+d;zz++) for(let xx=x;xx<x+w;xx++) set(xx,zz,'w',hh); };
  // caminos: el camino real (este–oeste), la calle mayor (norte–sur) y la plaza del mercado
  for(let x=0;x<W;x++){ set(x,16,'c'); set(x,17,'c'); } for(let z=3;z<D;z++){ set(19,z,'c'); set(20,z,'c'); }
  for(let z=13;z<=20;z++) for(let x=15;x<=24;x++) set(x,z,'c');
  // casa: muros de ladrillo, suelo, puerta y techo del material y la forma que se pidan
  const house=(x,z,w,d,door,roof,floor)=>{ for(let zz=z;zz<z+d;zz++) for(let xx=x;xx<x+w;xx++){ const edge=xx===x||zz===z||xx===x+w-1||zz===z+d-1; set(xx,zz,edge?'w':(floor||'o'),edge?6:2); }
    const [dx,dz,v]=door; set(dx,dz,floor||'o',2); put('door',dx,dz,v); roofs.push({x,z,w,d,...(roof||{})}); };
  // ventana en un muro (v 0: muro a lo largo de x; 1: a lo largo de z): de día deja entrar la luz de fuera (T6c)
  const win=(x,z,v,floor)=>{ set(x,z,floor||'o',2); put('window',x,z,v); };
  // muralla del norte con la puerta del camino, sus dos torres (azoteas almenadas) y la torre de la esquina
  for(let x=0;x<W;x++) set(x,2,'w',8);
  for(let z=0;z<2;z++){ set(19,z,'p'); set(20,z,'p'); }
  block(16,1,3,3,10); block(21,1,3,3,10); roofs.push({x:16,z:1,w:3,d:3,shape:'flat'},{x:21,z:1,w:3,d:3,shape:'flat'});
  set(19,2,'c',2); set(20,2,'c',2); put('gate',19,2,0); put('gate',20,2,0);
  lamp('torch',19,3,1.6); lamp('torch',20,3,1.6); lamp('brazier',17,2,0.6); lamp('brazier',22,2,0.6);
  block(0,0,3,4,10); roofs.push({x:0,z:0,w:3,d:4,shape:'flat'});
  // atalaya: torre de 4×4 más alta que la muralla, con puerta al pueblo y techo cónico de pizarra
  for(let z=0;z<4;z++) for(let x=43;x<47;x++){ const edge=x===43||x===46||z===0||z===3; set(x,z,edge?'w':'s',edge?12:2); }
  set(44,3,'s',2); put('door',44,3,0); put('torch',45,1); roofs.push({x:43,z:0,w:4,d:4,mat:'slate',shape:'cone'});
  minis.push({kind:'guard',x:44,z:2,fx:0,fz:1,sheet:{name:'Vigía Bruno'}});
  // taberna (tejas, a cuatro aguas)
  house(22,4,10,9,[26,12,0],{shape:'hip'});
  put('table',24,6,0); put('table',28,6,0); put('table',24,9,0); put('table',28,9,0);
  put('barrel',30,5); put('barrel',30,6); put('barrel',23,5); put('brazier',26,5); put('chest',30,10); put('shelf',23,10,1);
  put('sign',27,13,0); win(24,12,0); win(29,12,0); win(22,8,1); win(31,7,1);
  minis.push({kind:'barmaid',x:27,z:10,fx:0,fz:1,sheet:{name:'Tabernera Olga'}});
  // herrería con fragua de lava (tablillas) y un cobertizo a un agua sobre postes junto a su muro oeste
  house(8,4,7,7,[11,10,0],{mat:'shingle'});
  set(9,5,'l',2); set(10,5,'l',2); put('chest',13,5); put('barrel',13,8); put('shelf',9,8,1);
  for(let z=5;z<=8;z++) for(let x=5;x<=7;x++) set(x,z,'p');
  put('post',5,5); put('post',5,8); put('crates',6,6); put('barrel',6,8); roofs.push({x:5,z:5,w:3,d:4,mat:'shingle',shape:'shed',rot:3});
  put('sign',12,11,0); win(14,7,1);
  minis.push({kind:'smith',x:11,z:7,fx:0,fz:1,sheet:{name:'Herrero Iván'}});
  // casas: dos de paja, una de pizarra, la torre de la maga (cónica de pizarra) y un granero de tablillas
  house(2,19,6,6,[4,19,0],{mat:'thatch'}); put('bed',3,22,1); put('table',6,22,0); put('chest',3,23); put('torch',6,20); win(7,21,1); win(5,24,0);
  house(24,21,6,6,[26,21,0],{mat:'slate'}); put('bed',28,24,1); put('shelf',25,25,0); put('table',26,23,0); put('lamp',28,22); win(29,23,1); win(24,23,1);
  minis.push({kind:'crone',x:25,z:23,fx:1,fz:0,sheet:{name:'Abuela Lía'}});
  house(12,23,5,5,[14,23,0],{mat:'thatch',shape:'hip'}); put('bed',13,25,1); put('chest',15,26); put('torch',15,24); win(16,25,1);
  house(33,18,5,5,[33,20,1],{mat:'slate',shape:'cone'}); put('shelf',35,19,0); put('shelf',36,20,1); put('table',35,21,0); put('chest',36,21); put('torch',34,21);
  house(11,29,6,5,[13,29,0],{mat:'shingle',rot:1}); put('crates',12,31); put('cart',14,31,0); put('barrel',15,30); win(16,31,1);
  house(24,29,5,5,[26,29,0],{mat:'thatch'}); put('bed',27,31,1); put('table',25,31,0); put('torch',27,30); win(24,31,1);
  // capilla de piedra con techo de cobre, bancos, altar con velas, campanario y muro del atrio
  house(37,5,7,9,[40,13,0],{mat:'copper',rot:1},'s');
  for(const [x,z] of [[37,7],[37,11],[43,7],[43,10]]) win(x,z,1,'s');
  put('table',40,6,0); lamp('candle',39,6,1.1); lamp('candle',41,6,1.1);
  for(const z of [8,10]) for(const x of [38,39,41,42]) put('bench',x,z,2);
  put('belfry',44,12); lamp('lantern',40,14,1.6);
  for(let x=36;x<=46;x++) if(x!==40&&x!==41) put('stonewall',x,15,0);
  minis.push({kind:'cleric',x:40,z:9,fx:0,fz:-1,sheet:{name:'Hermana Clara'}});
  // plaza del mercado: pozo, tres puestos, cajas, carreta y bancos; faroles en las esquinas
  put('well',17,14); put('stall',21,13,0); put('stall2',16,20,2); put('stall',22,20,2);
  put('crates',24,14); put('barrel',16,13); put('barrel',15,19); put('barrel',24,19); put('cart',23,18,0); put('bench',15,15,1); put('bench',15,18,1);
  lamp('lantern',22,14,1.5); lamp('lantern',17,19,1.5); lamp('lantern',23,19,1.5);
  for(const [x,z] of [[15,13],[24,13],[15,20],[24,20],[6,15],[33,15],[21,6],[21,27],[18,33],[38,18]]) put('lamp',x,z);
  // estanque, arroyo que sale de él hacia el sur y corre hacia el oeste, y el puente de la calle mayor
  for(let z=25;z<=31;z++) for(let x=30;x<=37;x++){ const d=Math.hypot(x-33.5,z-28); if(d<=3.9) set(x,z,d<=2.6?'~':'a',d<=2.6?0:1); }
  for(let z=31;z<=34;z++){ set(33,z,'~',0); set(34,z,'~',0); if(t[I(32,z)]==='g') set(32,z,'a',1); if(t[I(35,z)]==='g') set(35,z,'a',1); }
  for(let x=0;x<=36;x++){ set(x,35,'~',0); set(x,36,'~',0); for(const z of [34,37]) if(t[I(x,z)]==='g') set(x,z,'a',1); }
  for(const z of [35,36]) put('bridge2',19,z,0);
  put('bridge',33,32,1); put('bridge',34,32,1);
  lamp('moon',33,28,2);
  // huerto con valla de estacas
  for(let z=26;z<=31;z++) for(let x=3;x<=9;x++){ const edge=x===3||x===9||z===26||z===31; if(edge){ if(!(x===6&&z===26)) put('picket',x,z,(z===26||z===31)?0:1); } else set(x,z,(z%2)?'p':'g'); }
  // loma del molino al sureste, con su sendero
  for(let z=23;z<=36;z++) for(let x=38;x<W;x++){ const d=Math.hypot(x+0.5-43.5,z+0.5-29.5); if(d<5.3) set(x,z,'g',2+(d<1.9?3:d<3.3?2:d<4.5?1:0)); }
  for(let z=18;z<=25;z++) set(40,z,'p'); set(41,26,'p'); set(41,27,'p');
  put('windmill',42,28,0); put('cart',45,32,1); put('crates',46,29); lamp('lantern',43,31,1.4);
  minis.push({kind:'miller',x:41,z:31,fx:1,fz:0,sheet:{name:'Molinero Tobías'}});
  // el guardián de la capilla: un gólem de piedra colosal (4×4) entre la capilla y la atalaya, en el lindero del bosque
  minis.push({kind:'golem',x:44,z:6,fx:-1,fz:0,sheet:{name:'Guardián de piedra'}});
  // bosque alrededor (fuera de la muralla, del arroyo y de la loma), sin tapar a las fichas
  for(let z=0;z<D;z++) for(let x=0;x<W;x++){ const band=x<3||x>44||z<2||z>36; if(!band||t[I(x,z)]!=='g'||hash(x,z,31)>0.42) continue;
    if(props.some(p=>Math.abs(p.x-x)<=1&&Math.abs(p.z-z)<=1)) continue;
    if(minis.some(m=>{ const n=Fichas.cellsOf(defaultSheet(m.kind)); return x>=m.x-1&&x<=m.x+n&&z>=m.z-1&&z<=m.z+n; })) continue; put('tree',x,z,Math.floor(hash(x,z,32)*3)); }
  // personajes
  minis.push({kind:'knight',x:19,z:18,fx:0,fz:-1,sheet:{name:'Aria'}});
  minis.push({kind:'mage',x:20,z:18,fx:0,fz:-1,sheet:{name:'Maga Selene'}});
  minis.push({kind:'warrior',x:17,z:18,fx:0,fz:-1,sheet:{name:'Brenna'}}); minis.push({kind:'archer',x:21,z:18,fx:0,fz:-1,sheet:{name:'Ilse'}});
  minis.push({kind:'villager',x:21,z:14,fx:-1,fz:0,sheet:{name:'Pregonero'}});
  minis.push({kind:'goblin',x:37,z:0,fx:-1,fz:0});
  // fichas de varios tamaños, cada una con su arte a su tamaño: un ogro grande (2×2), un trol enorme (3×3), una rata diminuta, un niño pequeño
  // (el gólem colosal, 4×4, está más arriba, antes de plantar el bosque)
  minis.push({kind:'ogre',x:33,z:11,fx:-1,fz:0,sheet:{name:'Ogro del bosque'}});
  minis.push({kind:'troll',x:3,z:10,fx:1,fz:0,sheet:{name:'Trol de la colina'}});
  minis.push({kind:'rat',x:29,z:11,fx:-1,fz:0,sheet:{name:'Rata de la bodega'}});
  minis.push({kind:'boy',x:18,z:21,fx:0,fz:-1,sheet:{name:'Niño Tomás'}});
  return {name:'Pueblo de Brezo 48×40',w:W,d:D,h,t,props,minis:minis.map(m=>({...m,sheet:normSheet(m.sheet?{...defaultSheet(m.kind),...m.sheet}:null,m.kind)})),roofs,env:'day',seed:77,start:[20,17]};
}

// Taller de luces: sala de noche con una alcoba por tipo de luz (nombre sobre cada una al editar) y una galería
// larga con pilares para la linterna sorda. Enseña sombras, conos, parpadeo, pulso y oscuridad mágica.
function lightWorkshopMap(){
  const W=43, D=24, h=new Int8Array(W*D).fill(2), t=new Array(W*D).fill('s'), props=[], minis=[];
  const I=(x,z)=>z*W+x, set=(x,z,tt,hh)=>{ if(x>=0&&z>=0&&x<W&&z<D){ t[I(x,z)]=tt; if(hh!=null) h[I(x,z)]=hh; } };
  const wall=(x,z)=>set(x,z,'w',6), floor=(x0,z0,w,d,tt)=>{ for(let z=z0;z<z0+d;z++) for(let x=x0;x<x0+w;x++) set(x,z,tt,2); };
  const put=(type,x,z,v)=>props.push({type,x,z,v:v||0});
  const lamp=(id,x,z,extra)=>props.push(Object.assign({type:'light',x,z,v:0},lightOfType(id),{name:LIGHT_TYPES[id].name},extra||{}));
  for(let x=0;x<W;x++){ wall(x,0); wall(x,D-1); } for(let z=0;z<D;z++){ wall(0,z); wall(W-1,z); }
  // dos filas de alcobas a los lados de un pasillo; cada alcoba abre al pasillo por un vano de dos casillas
  for(const [zw,zi] of [[7,1],[12,13]]){ for(let x=0;x<W;x++) wall(x,zw); for(let i=0;i<6;i++){ const x0=1+7*i; set(x0+2,zw,'s',2); set(x0+3,zw,'s',2); if(i<5&&!(zi===13&&i===4)) for(let z=zi;z<zi+6;z++) wall(x0+6,z); } }
  for(let x=0;x<W;x++) wall(x,19);
  floor(1,8,W-2,4,'c');
  // fila norte
  floor(1,1,6,6,'o'); put('table',3,3,0); lamp('candle',3,3,{h:1}); put('bed',5,2,1); put('chest',1,6); put('shelf',1,1,0);
  floor(8,1,6,6,'s'); lamp('torch',10,1); put('barrel',8,1); put('barrel',13,1); put('barrel',13,2); put('chest',8,6);
  floor(15,1,6,6,'o'); lamp('lantern',17,3); put('barrel',15,1); put('barrel',16,1); put('chest',20,1); put('chest',20,6); put('table',18,5,0);
  floor(22,1,6,6,'o'); for(const x of [22,23,26,27]) put('shelf',x,1,0); put('table',24,5,0); lamp('magic',24,3);
  floor(29,1,6,6,'s'); floor(30,2,4,3,'s'); for(let z=2;z<5;z++) for(let x=30;x<34;x++) h[I(x,z)]=3; lamp('crystal',31,3);
  floor(36,1,6,6,'o'); for(let x=37;x<41;x++) set(x,0,'w',4); lamp('window',38,1,{rot:90}); put('bed',40,3,1); put('table',37,4,0); put('chest',41,6);
  // fila sur
  floor(1,13,6,6,'a'); lamp('campfire',3,15); put('barrel',1,13); put('barrel',6,18); put('fence',2,17,0); put('fence',5,14,1);
  floor(8,13,6,6,'s'); lamp('brazier',10,15); put('chest',8,18); put('shelf',13,18,0);
  floor(15,13,6,6,'o'); floor(16,14,4,4,'a'); set(17,15,'~',1); set(18,15,'~',1); set(17,16,'~',1); set(18,16,'~',1); lamp('moon',17,15);
  floor(22,13,6,6,'s'); lamp('torch',22,13,{name:'Antorcha (junto a la oscuridad)'}); lamp('darkness',25,17);
  minis.push({kind:'goblin',x:25,z:17,fx:-1,fz:0,sheet:{name:'Goblin en la oscuridad'}});
  floor(29,13,13,6,'g'); put('well',35,16); put('tree',29,13,0); put('tree',41,18,2); put('tree',41,13,1); put('fence',33,18,0); put('fence',37,18,0); lamp('daylight',35,15);
  // galería de la linterna sorda: pilares a los lados del haz
  floor(1,20,W-2,3,'s'); set(40,19,'s',2); for(const [x,z] of [[8,20],[13,22],[18,20],[23,22],[28,20]]) wall(x,z);
  lamp('bullseye',1,21,{rot:0}); put('barrel',41,20); put('barrel',41,22);
  // los muros exteriores del lado de la cámara, bajos: dejan ver la galería y el patio
  for(let x=1;x<W;x++) set(x,D-1,'w',3); for(let z=1;z<D;z++) set(W-1,z,'w',3);
  // el grupo en el pasillo: la maga lleva una vela
  minis.push({kind:'knight',x:20,z:10,fx:0,fz:-1,sheet:{name:'Aria'}});
  minis.push({kind:'mage',x:22,z:10,fx:0,fz:1,sheet:{name:'Maga Selene',light:Fichas.tokenLight('candle')}});
  return {name:'Taller de luces 43×24',w:W,d:D,h,t,props,minis:minis.map(m=>({...m,sheet:normSheet(m.sheet?{...defaultSheet(m.kind),...m.sheet}:null,m.kind)})),roofs:[],env:'night',seed:91,start:[21,10]};
}
    return { demoMap, dungeonMap, townMap, lightWorkshopMap };
  }
  const Mapas = { make };
  if (typeof module === 'object' && module.exports) module.exports = Mapas;
  else (root.Tablero3D = root.Tablero3D || {}).Mapas = Mapas;
})(typeof window !== 'undefined' ? window : globalThis);
