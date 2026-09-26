'use strict';
/* Fichas del tablero 3D (Tablero3D.Fichas), sin dependencias: se prueban en test/frontend.test.js.
   La ficha (`sheet` de cada personaje) lleva sólo lo que usa la mesa, con los campos y las unidades de la
   ficha de Just Another VTT (su server/rules.js, type 'token'): kind, name, size, color, hidden, vision,
   sight y darkvision en pies, light, conditions, elevation en pies, ac y hp {cur,max,temp}; más dos del 3D:
   speed (pies) e init (modificador de iniciativa). Extras del 3D que JA-VTT ignora: neutral (un enemigo que
   no ataca: el «Neutral» de antes), tiny y small (Diminuto y Pequeño ocupan 1 casilla, como en JA-VTT).
   Aquí también: tamaños y ocupación (n×n casillas desde la esquina x,z), distancias de 5.ª edición entre
   fichas y caminos para fichas grandes. `norm` lee igual que cleanSheet del servidor (otro test los compara). */
(window.Tablero3D=window.Tablero3D||{}).Fichas=(()=>{
  const fin=v=>typeof v==='number'&&Number.isFinite(v);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const int=(v,a,b)=>clamp(Math.round(v),a,b);
  const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const HEX6=/^#[0-9a-f]{6}$/i;

  /* Tamaños: los de JA-VTT (1–4 casillas) y dos del 3D que en JA-VTT son 1. art = lienzo del sprite de ese tamaño en
     texeles a la resolución base (16 por casilla, como el terreno; a 32 o 64 se multiplica): el texel del personaje mide
     siempre lo mismo que el del suelo. scale = alto del arte en medianos (ojos y luz que lleva); base = peana. */
  const TEXELS=16;
  const SIZES=[
    {id:'tiny',name:'Diminuto',size:1,tiny:true,art:[10,14],base:0.5},
    {id:'small',name:'Pequeño',size:1,small:true,art:[12,18],base:0.8},
    {id:'medium',name:'Mediano',size:1,art:[16,24],base:1},
    {id:'large',name:'Grande',size:2,art:[32,48],base:2},
    {id:'huge',name:'Enorme',size:3,art:[48,72],base:3},
    {id:'gargantuan',name:'Colosal',size:4,art:[64,96],base:4}
  ].map(z=>Object.assign(z,{scale:+(z.art[1]/24).toFixed(3)}));
  /* Medidas en el mundo de un sprite de w×h píxeles dibujado a `res` píxeles por casilla: el tamaño sale de sus
     propios píxeles, nunca del tamaño de la ficha (un Mediano en una ficha Grande se ve a su escala, sobre la peana grande). */
  const spriteWorld=(w,h,res)=>({w:w/(res||TEXELS),h:h/(res||TEXELS)});
  // lienzo de un tamaño a una resolución (texeles por casilla)
  const artDims=(id,res)=>{ const z=SIZES.find(q=>q.id===id)||SIZES[2], k=(res||TEXELS)/TEXELS; return [z.art[0]*k,z.art[1]*k]; };
  // tamaño al que pertenece un arte de w×h a `res`: el de alto más parecido (un dibujo de antes, 1×1,5 casillas, es Mediano)
  const artSizeOf=(w,h,res)=>{ const hh=h*TEXELS/(res||TEXELS); return SIZES.reduce((a,z)=>Math.abs(z.art[1]-hh)<Math.abs(a.art[1]-hh)?z:a).id; };
  const SIZE_IDS=SIZES.map(z=>z.id);
  const sizeOf=s=>SIZES.find(z=>s&&z.size===(s.size|0)&&!!z.tiny===!!s.tiny&&!!z.small===!!s.small)||SIZES[2];
  const cellsOf=s=>sizeOf(s).size;
  function setSize(s,id){ const z=SIZES.find(q=>q.id===id); if(!z) return s; s.size=z.size; delete s.tiny; delete s.small; if(z.tiny) s.tiny=true; if(z.small) s.small=true; return s; }

  /* Estados: los CONDITION_IDS de JA-VTT con su nombre, abreviatura y color de badge (su core.js, CONDITIONS) */
  const CONDITIONS={
    blinded:{name:'Cegado',abbr:'CE',color:'#5B5F66'},charmed:{name:'Hechizado',abbr:'HE',color:'#C86BA8'},
    deafened:{name:'Ensordecido',abbr:'EN',color:'#7A8590'},frightened:{name:'Asustado',abbr:'AS',color:'#8E6AC8'},
    grappled:{name:'Agarrado',abbr:'AG',color:'#A67C52'},incapacitated:{name:'Incapacitado',abbr:'IN',color:'#B0B0B0'},
    invisible:{name:'Invisible',abbr:'IV',color:'#6FB7D6'},paralyzed:{name:'Paralizado',abbr:'PA',color:'#D6C36F'},
    petrified:{name:'Petrificado',abbr:'PE',color:'#8C8C8C'},poisoned:{name:'Envenenado',abbr:'EV',color:'#5FA85A'},
    prone:{name:'Derribado',abbr:'DE',color:'#C98A3B'},restrained:{name:'Apresado',abbr:'AP',color:'#8A6D3B'},
    stunned:{name:'Aturdido',abbr:'AT',color:'#E0B84C'},unconscious:{name:'Inconsciente',abbr:'IC',color:'#4A4F57'},
    dead:{name:'Muerto',abbr:'MU',color:'#2B2B2B'},concentration:{name:'Concentración',abbr:'CO',color:'#4C8FE0'},
    exhaustion:{name:'Agotamiento',abbr:'AG',color:'#9A6F5F'},burning:{name:'En llamas',abbr:'LL',color:'#E0602E'},
    blessed:{name:'Bendecido',abbr:'BE',color:'#F0C74C'},marked:{name:'Marcado',abbr:'MA',color:'#D9705F'}
  };
  const CONDITION_IDS=Object.keys(CONDITIONS);

  /* Luz que lleva: el objeto `light` de JA-VTT. Los tipos de ficha (TOKEN_LIGHTS) con los valores de su
     LIGHT_PRESETS; el motor 3D alumbra con sus propios parámetros de ese tipo (LIGHT_TYPES). */
  const LIGHT_PRESETS=['candle','torch','lantern','bullseye','campfire','brazier','magic','crystal','moon','daylight','window','darkness','custom','none'];
  const ANIMS=['none','flicker','soft','pulse'];
  const TOKEN_LIGHTS=['none','candle','torch','lantern','bullseye','magic','crystal'];
  const TOKEN_LIGHT_DEFS={
    candle:{bright:5,dim:5,color:'#ffc878',intensity:0.9,anim:'flicker'},
    torch:{bright:20,dim:20,color:'#ffa652',intensity:1,anim:'flicker'},
    lantern:{bright:30,dim:30,color:'#ffd28f',intensity:1,anim:'soft'},
    bullseye:{bright:60,dim:60,color:'#ffe6b8',intensity:1,anim:'none',angle:60},
    magic:{bright:20,dim:20,color:'#dde8ff',intensity:1,anim:'none'},
    crystal:{bright:10,dim:20,color:'#a98bff',intensity:0.9,anim:'pulse'}
  };
  const noLight=()=>({preset:'none',on:false,bright:0,dim:0,color:'#ffffff',intensity:1,anim:'none',angle:360,rot:0});
  function tokenLight(id,on){ const P=TOKEN_LIGHT_DEFS[id]; if(!P) return noLight();
    return {preset:id,on:on!==false,bright:P.bright,dim:P.dim,color:P.color,intensity:P.intensity,anim:P.anim,angle:P.angle||360,rot:0}; }
  // fichas de antes: `luz` era un radio en casillas de luz cálida parpadeante
  const warmLight=r=>({preset:'custom',on:true,bright:r*2.5,dim:r*2.5,color:'#ff9c50',intensity:0.9,anim:'flicker',angle:360,rot:0});
  function cleanLight(L){ if(!plain(L)) return noLight();
    return {preset:LIGHT_PRESETS.includes(L.preset)?L.preset:'custom',on:!!L.on,bright:fin(L.bright)?clamp(L.bright,0,300):0,dim:fin(L.dim)?clamp(L.dim,0,300):0,
      color:HEX6.test(L.color||'')?L.color.toLowerCase():'#ffffff',intensity:fin(L.intensity)?clamp(L.intensity,0,1.2):1,anim:ANIMS.includes(L.anim)?L.anim:'none',
      angle:fin(L.angle)?clamp(L.angle,1,360):360,rot:fin(L.rot)?clamp(L.rot,-3600,3600):0}; }
  function lightFromOld(v){ if(typeof v==='string') return TOKEN_LIGHTS.includes(v)&&v!=='none'?tokenLight(v,true):noLight();
    if(fin(v)){ const r=int(v,0,12); return r>0?warmLight(r):noLight(); } return null; }
  // ¿alumbra? tipo (sin la oscuridad) o a medida con radio
  const lightOn=L=>!!L&&L.on&&L.preset!=='none'&&L.preset!=='darkness'&&(L.preset!=='custom'||L.bright+L.dim>0);

  const TEAM_KIND={pc:'player',enemy:'enemy',npc:'enemy'};
  const clone=o=>JSON.parse(JSON.stringify(o));
  /* Ficha canónica. `o` es lo guardado (formato de ahora o de antes: team, hp/hpMax, vision y dark en casillas,
     luz); `d` es la ficha por defecto del sprite (canónica) para lo que falte. */
  function norm(o,d){
    if(!plain(o)) return clone(d);
    const s={}, has=k=>o[k]!==undefined;
    s.name=typeof o.name==='string'&&o.name.trim()?o.name.slice(0,40):d.name;
    const newKind=o.kind==='player'||o.kind==='enemy';
    s.kind=newKind?o.kind:TEAM_KIND[o.team]||d.kind;
    const neutral=newKind?o.neutral===true:TEAM_KIND[o.team]?o.team==='npc':!!d.neutral;
    if(neutral&&s.kind==='enemy') s.neutral=true;
    s.size=!has('size')?d.size:[1,2,3,4].includes(o.size)?o.size:1;
    const tiny=!has('size')?!!d.tiny:o.size===0.5||o.tiny===true, small=!has('size')?!!d.small:o.small===true;
    if(s.size===1&&tiny) s.tiny=true; else if(s.size===1&&small) s.small=true;
    const col=HEX6.test(o.color||'')?o.color.toLowerCase():d.color; if(col) s.color=col;
    s.hidden=has('hidden')?!!o.hidden:!!d.hidden;
    if(fin(o.vision)){ s.vision=true; s.sight=int(o.vision,1,60)*5; }
    else { s.vision=has('vision')?o.vision!==false:d.vision; s.sight=fin(o.sight)?int(o.sight,0,5000):d.sight; }
    s.darkvision=fin(o.darkvision)?int(o.darkvision,0,300):fin(o.dark)?int(o.dark,0,24)*5:d.darkvision;
    s.light=plain(o.light)?cleanLight(o.light):lightFromOld(o.luz)||clone(d.light);
    s.conditions=Array.isArray(o.conditions)?[...new Set(o.conditions.filter(x=>CONDITION_IDS.includes(x)))]:d.conditions.slice();
    s.elevation=fin(o.elevation)?int(o.elevation,-9999,9999):d.elevation;
    s.ac=fin(o.ac)?int(o.ac,0,99):d.ac;
    if(plain(o.hp)&&fin(o.hp.max)){ const max=int(o.hp.max,1,9999); s.hp={cur:fin(o.hp.cur)?int(o.hp.cur,0,max):max,max,temp:fin(o.hp.temp)?int(o.hp.temp,0,9999):0}; }
    else if(fin(o.hpMax)||fin(o.hp)){ const max=fin(o.hpMax)?int(o.hpMax,1,9999):d.hp.max; s.hp={cur:fin(o.hp)?int(o.hp,0,max):max,max,temp:0}; }
    else s.hp=clone(d.hp);
    s.speed=fin(o.speed)?int(o.speed,0,120):d.speed;
    s.init=fin(o.init)?int(o.init,-10,20):d.init;
    // lo que el servidor no manda al jugador de una ficha ajena (CA, vida) y, con hpVisibility 'bar_only', la barra de vida
    if(Array.isArray(o.withheld)){ const w=[...new Set(o.withheld.filter(k=>k==='ac'||k==='hp'))]; if(w.length) s.withheld=w; }
    if(plain(o.hpBar)&&fin(o.hpBar.cur)) s.hpBar={cur:clamp(o.hpBar.cur,0,1),temp:fin(o.hpBar.temp)?clamp(o.hpBar.temp,0,1):0};
    return s;
  }
  // lo que el motor necesita en casillas (5 pies por casilla); sight 0 = sin límite (hasta 60 casillas)
  const sightCells=s=>s.sight>0?clamp(Math.round(s.sight/5),1,60):60;
  const darkCells=s=>clamp(Math.round((s.darkvision||0)/5),0,60);

  /* ---- ocupación y distancias: una ficha de n casillas ocupa [x, x+n) × [z, z+n) ---- */
  function footprint(x,z,n){ const out=[]; for(let j=0;j<n;j++) for(let k=0;k<n;k++) out.push([x+k,z+j]); return out; }
  const overlaps=(ax,az,an,bx,bz,bn)=>ax<bx+bn&&bx<ax+an&&az<bz+bn&&bz<az+an;
  const covers=(ax,az,an,x,z)=>x>=ax&&z>=az&&x<ax+an&&z<az+an;
  // distancia de 5.ª edición entre dos fichas (de borde a borde, en casillas): 1 = adyacentes; alt = regla 5/10
  function gap(ax,az,an,bx,bz,bn){ const dx=Math.max(0,bx-(ax+an-1),ax-(bx+bn-1)), dz=Math.max(0,bz-(az+an-1),az-(bz+bn-1));
    return {cells:Math.max(dx,dz),alt:Math.max(dx,dz)+Math.floor(Math.min(dx,dz)/2)}; }
  // esquina para que la ficha quede sobre la casilla (cx,cz), dentro del mapa
  const anchorFor=(cx,cz,n,w,d)=>[clamp(cx-((n-1)>>1),0,Math.max(0,w-n)),clamp(cz-((n-1)>>1),0,Math.max(0,d-n))];

  /* ---- caminos (5.ª edición en cuadrícula: diagonal = 5 pies; agua poco profunda o trepar 2 = terreno difícil) ----
     g = { w, d, h(i): altura, open(i): se puede pisar, hard(i): terreno difícil }; taken(i): casilla de otra ficha.
     Una ficha grande se mueve si todas sus casillas caben, están libres, no difieren más de 2 alturas entre
     sí y cada una sube o baja como mucho 2 respecto a la casilla que deja; en diagonal no corta esquinas. */
  const DIR8=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  function fits(g,x,z,n,taken){
    if(x<0||z<0||x+n>g.w||z+n>g.d) return false; let lo=Infinity, hi=-Infinity;
    for(let j=0;j<n;j++) for(let k=0;k<n;k++){ const i=(z+j)*g.w+x+k; if(!g.open(i)||(taken&&taken(i))) return false; const h=g.h(i); if(h<lo) lo=h; if(h>hi) hi=h; }
    return hi-lo<=2; }
  function stepOk(g,ax,az,bx,bz,n){ for(let j=0;j<n;j++) for(let k=0;k<n;k++) if(Math.abs(g.h((bz+j)*g.w+bx+k)-g.h((az+j)*g.w+ax+k))>2) return false; return true; }
  function stepCost(g,ax,az,bx,bz,n){ for(let j=0;j<n;j++) for(let k=0;k<n;k++){ const b=(bz+j)*g.w+bx+k; if(g.hard(b)||g.h(b)-g.h((az+j)*g.w+ax+k)>=2) return 2; } return 1; }
  function heap(){ const a=[]; let ord=0; const less=(p,q)=>p[0]<q[0]||(p[0]===q[0]&&p[1]<q[1]);
    return { size:()=>a.length,
      push(h,i){ a.push([h,ord++,i]); let k=a.length-1; while(k>0){ const p=(k-1)>>1; if(!less(a[k],a[p])) break; [a[k],a[p]]=[a[p],a[k]]; k=p; } },
      pop(){ const top=a[0], last=a.pop(); if(a.length){ a[0]=last; let k=0; for(;;){ const l=2*k+1, r=l+1; let m=k;
          if(l<a.length&&less(a[l],a[m])) m=l; if(r<a.length&&less(a[r],a[m])) m=r; if(m===k) break; [a[k],a[m]]=[a[m],a[k]]; k=m; } }
        return top[2]; } }; }
  // coste mínimo desde la esquina (sx,sz) a cada esquina alcanzable (hasta maxCost); se para al llegar a target
  function paths(g,sx,sz,n,maxCost,target,taken){
    const N=g.w*g.d, dist=new Int32Array(N).fill(1e9), prev=new Int32Array(N).fill(-1), s0=sz*g.w+sx, q=heap();
    dist[s0]=0; q.push(0,s0);
    while(q.size()){
      const c=q.pop(), dc=dist[c]; if(c===target) break;
      const cx=c%g.w, cz=(c/g.w)|0;
      for(const [dx,dz] of DIR8){
        const nx=cx+dx, nz=cz+dz; if(nx<0||nz<0||nx>=g.w||nz>=g.d) continue; const ni=nz*g.w+nx;
        if(!fits(g,nx,nz,n,taken)||!stepOk(g,cx,cz,nx,nz,n)) continue;
        if(dx&&dz&&!(fits(g,cx+dx,cz,n,taken)&&fits(g,cx,cz+dz,n,taken)&&stepOk(g,cx,cz,cx+dx,cz,n)&&stepOk(g,cx,cz,cx,cz+dz,n))) continue;   // no cortar esquinas
        const nd=dc+stepCost(g,cx,cz,nx,nz,n); if(nd>maxCost||nd>=dist[ni]) continue;
        dist[ni]=nd; prev[ni]=c; q.push(nd,ni);
      }
    }
    return {dist,prev};
  }
  // camino de esquinas [[x,z]…] con .cost (casillas de movimiento), o null
  function route(g,sx,sz,tx,tz,n,taken){
    if(!fits(g,tx,tz,n,taken)) return null;
    const s0=sz*g.w+sx, t=tz*g.w+tx; if(s0===t){ const p=[[sx,sz]]; p.cost=0; return p; }
    const {dist,prev}=paths(g,sx,sz,n,1e8,t,taken); if(prev[t]===-1) return null;
    const path=[]; let c=t; while(c!==s0){ path.push([c%g.w,(c/g.w)|0]); c=prev[c]; } path.push([sx,sz]);
    path.reverse(); path.cost=dist[t]; return path;
  }

  return {TEXELS,SIZES,SIZE_IDS,spriteWorld,artDims,artSizeOf,sizeOf,cellsOf,setSize,CONDITIONS,CONDITION_IDS,LIGHT_PRESETS,ANIMS,TOKEN_LIGHTS,TOKEN_LIGHT_DEFS,tokenLight,noLight,cleanLight,lightOn,
    norm,sightCells,darkCells,footprint,overlaps,covers,gap,anchorFor,fits,paths,route};
})();
