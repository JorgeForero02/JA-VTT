'use strict';
/* Ambiente de la escena e interiores (Tablero3D.Ambiente), sin dependencias: se prueban en test/frontend.test.js.
   ENVS son los de Just Another VTT (ENVS de su public/js/core.js; fijo test/fixtures/ja-vtt/envs.json): mismos ids,
   nombres, iconos, descripciones, luz ambiental (`ambient`, 0–1) y color de la oscuridad (`dark`). La escena guarda
   `env`, `ambient` y `darkColor` con los nombres de JA-VTT; `norm` lee igual que `cleanEnv` del servidor (las de antes,
   `night: true` → noche; si no, día).
   Lo propio del 3D (LOOK): el tinte de la luz ambiental y el cielo de cada momento. El motor no cambia: la luz sigue
   siendo por casilla; el ambiente es un color que el sombreador multiplica por cuánto ambiente llega a cada casilla.
   Zonas interiores (`zone` de JA-VTT) por casilla: cada techo crea la suya y el director pinta o borra casillas
   (`zoneCells`: '0' automática, '1' interior, '2' exterior aunque haya techo). Dentro no llega el ambiente; las
   ventanas (y las puertas abiertas) que dan fuera lo dejan entrar en un cono hacia dentro, con las sombras del motor. */
(window.Tablero3D=window.Tablero3D||{}).Ambiente=(()=>{
  const ENVS={
    interior:{name:'Interior',icon:'brick-wall',desc:'Oscuro. Solo ven las luces y la visión en la oscuridad.',ambient:0,dark:'#0B0E11'},
    day:{name:'Exterior de día',icon:'sun',desc:'Todo lo que esté a la vista se ve.',ambient:1,dark:'#0E1316'},
    dusk:{name:'Atardecer',icon:'sunset',desc:'Se ve a la vista, en penumbra.',ambient:.55,dark:'#1A1220'},
    night:{name:'Noche',icon:'moon',desc:'Luna tenue: se intuye el terreno; las criaturas, solo con luz.',ambient:.18,dark:'#081026'}
  };
  const ENV_IDS=Object.keys(ENVS);
  /* tinte de la luz ambiental a pleno (ambient 1) y cielo [arriba, horizonte, fondo]; sin cielo, el de la oscuridad */
  const LOOK={
    interior:{tint:[0.95,0.86,0.72],sky:null},
    day:{tint:[1,1,1],sky:['#6fa7c9','#d8e6c4','#7fa8b8']},
    dusk:{tint:[1.08,0.76,0.62],sky:['#2b2150','#e0876a','#6e4a66']},
    night:{tint:[0.58,0.64,0.92],sky:['#07051a','#241a44','#0d0a1c']}
  };
  // umbral de JA-VTT (canSee): con más luz que esto, se ve sin visión en la oscuridad
  const SEE=0.25;
  const DARK_GAIN=2.2, CURVE=0.7;
  const HEX=/^#[0-9a-f]{6}$/i;
  const rgb=h=>[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];
  const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const clamp01=v=>Math.max(0,Math.min(1,v));

  /* {env, ambient, darkColor} de una escena de ahora o de antes */
  function norm(o){
    o=o&&typeof o==='object'?o:{};
    const env=ENVS[o.env]&&ENV_IDS.includes(o.env)?o.env:(o.night?'night':'day'), E=ENVS[env];
    const ambient=typeof o.ambient==='number'&&Number.isFinite(o.ambient)?clamp01(o.ambient):E.ambient;
    const darkColor=typeof o.darkColor==='string'&&HEX.test(o.darkColor)?o.darkColor.toUpperCase():E.dark;
    return {env,ambient,darkColor};
  }
  /* lo que pinta el motor: color del ambiente a pleno (amb), de la oscuridad (dark), nivel (level = ambient),
     opacidad de los halos y cielo; todo en RGB 0–1 para interpolar al cambiar de momento */
  function look(s){
    const n=norm(s), L=LOOK[n.env], E=ENVS[n.env], dc=rgb(n.darkColor), dark=dc.map(v=>v*DARK_GAIN), f=Math.pow(n.ambient,CURVE);
    const amb=lerp(dark,L.tint,f);
    const darkSky=[dc.map(v=>v*0.55),dc.map(v=>Math.min(1,v*2.4)),dc];
    const k=L.sky&&E.ambient>0?Math.min(1,n.ambient/E.ambient):0;
    const sky=darkSky.map((d,i)=>L.sky?lerp(d,rgb(L.sky[i]),k):d);
    return {amb,dark,level:n.ambient,glow:1-0.7*n.ambient,sky};
  }
  function mix(a,b,t){ if(t>=1) return b; if(t<=0) return a; return {amb:lerp(a.amb,b.amb,t),dark:lerp(a.dark,b.dark,t),level:a.level+(b.level-a.level)*t,glow:a.glow+(b.glow-a.glow)*t,sky:a.sky.map((c,i)=>lerp(c,b.sky[i],t))}; }
  /* cuánto pesan las fuentes de luz según el ambiente que llega (de día poco, a oscuras mucho): el mismo cálculo en el
     sombreador (lightFor) y en los sprites */
  const torchK=lv=>1.15-0.8*Math.pow(clamp01(lv),1.5);

  /* zonas interiores: 1 = interior. Cada techo {x,z,w,d} crea la suya; zoneCells ('0'/'1'/'2' por casilla) la pinta o la borra */
  const ZONE_CELLS=/^[012]+$/;
  const cleanCells=(s,n)=>typeof s==='string'&&s.length===n&&ZONE_CELLS.test(s)&&/[12]/.test(s)?s:'';
  function interiorMask(w,d,roofs,cells){
    const n=w*d, m=new Uint8Array(n);
    for(const r of roofs||[]) for(let z=Math.max(0,r.z);z<Math.min(d,r.z+r.d);z++) for(let x=Math.max(0,r.x);x<Math.min(w,r.x+r.w);x++) m[z*w+x]=1;
    const c=cleanCells(cells,n); if(c) for(let i=0;i<n;i++){ if(c[i]==='1') m[i]=1; else if(c[i]==='2') m[i]=0; }
    return m;
  }
  /* luz de fuera que entra por ventanas y puertas abiertas: cada una que tenga interior a un lado y exterior (sin muro) al
     otro alumbra hacia dentro como una fuente del motor: cono de 120°, radio R, sombras con reach(lx,ly,lz,tx,tz,ty)
     (Vision.lightReaches sobre la rejilla sin techos abiertos). Devuelve, por casilla interior, cuánto ambiente llega (0–1). */
  const DIR4=[[1,0],[-1,0],[0,1],[0,-1]];
  const WIN={r:5,k:0.95,angle:120,soft:12,h:1};
  function windowLight(g,mask,openings,reach,opt){
    const o=Object.assign({},WIN,opt||{}), n=g.w*g.d, F=new Float32Array(n), inb=(x,z)=>x>=0&&z>=0&&x<g.w&&z<g.d;
    const floor=(x,z)=>inb(x,z)&&!g.wall(z*g.w+x);
    for(const p of openings||[]){
      if(!inb(p.x,p.z)) continue;
      const dir=DIR4.find(([dx,dz])=>floor(p.x+dx,p.z+dz)&&mask[(p.z+dz)*g.w+p.x+dx]&&(!inb(p.x-dx,p.z-dz)||(floor(p.x-dx,p.z-dz)&&!mask[(p.z-dz)*g.w+p.x-dx])));
      if(!dir) continue;
      const [dx,dz]=dir, lx=p.x+.5+dx*0.45, lz=p.z+.5+dz*0.45, ly=g.top(p.z*g.w+p.x)+o.h, rr=o.r+1, half=o.angle/2;
      const i0=p.z*g.w+p.x; if(mask[i0]) F[i0]=Math.max(F[i0],o.k);
      for(let z=Math.max(0,Math.floor(lz-rr));z<=Math.min(g.d-1,Math.floor(lz+rr));z++) for(let x=Math.max(0,Math.floor(lx-rr));x<=Math.min(g.w-1,Math.floor(lx+rr));x++){
        const i=z*g.w+x; if(!mask[i]||g.wall(i)||i===i0) continue;
        const ex=x+.5-lx, ez=z+.5-lz, dist=Math.hypot(ex,ez); if(dist>rr) continue;
        const ang=Math.acos(Math.max(-1,Math.min(1,(ex*dx+ez*dz)/dist)))*180/Math.PI;
        const cone=ang<=half?1:ang>=half+o.soft?0:1-(ang-half)/o.soft; let f=(1-dist/rr)*cone; if(f<=0.01) continue;
        if(reach&&!reach(lx,ly,lz,x,z,g.top(i))) continue;
        F[i]=Math.min(1,F[i]+f*o.k);
      }
    }
    return F;
  }
  /* cuánto ambiente llega a cada casilla: fuera, todo; dentro, lo que entra por las ventanas */
  function field(mask,win){ const A=new Float32Array(mask.length); for(let i=0;i<mask.length;i++) A[i]=mask[i]?(win?win[i]:0):1; return A; }
  /* ¿se ve la casilla sin luz propia ni visión en la oscuridad? (JA-VTT: ambiente fuera de zonas > 0,25) */
  const ambientLit=(level,a)=>level*a>SEE;
  return {ENVS,ENV_IDS,LOOK,SEE,norm,look,mix,torchK,cleanCells,interiorMask,windowLight,field,ambientLit,rgb};
})();
