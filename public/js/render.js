'use strict';
/* Dibujo por capas: escena, brillo, oscuridad y controles */

/* ---------- Lienzos ---------- */
const stage=$('#stage');
const cv={scene:$('#cScene'),glow:$('#cGlow'),dark:$('#cDark'),over:$('#cOver')};
const cx={scene:cv.scene.getContext('2d'),glow:cv.glow.getContext('2d'),dark:cv.dark.getContext('2d'),over:cv.over.getContext('2d')};
const maskC=document.createElement('canvas'),losC=document.createElement('canvas'),expC=document.createElement('canvas');
const mctx=maskC.getContext('2d'),lctx=losC.getContext('2d'),ectx=expC.getContext('2d');
/* Memoria de exploración por bloques: el mundo no tiene bordes */
const EXP={scale:.2,size:2000,chunks:new Map(),max:160,boost:3,blur:2.5}; // boost: la luz tenue vista cuenta como explorada
function expChunk(cx,cy,create){
  const k=cx+','+cy;let ch=EXP.chunks.get(k);
  if(!ch&&create){
    if(EXP.chunks.size>=EXP.max){const first=EXP.chunks.keys().next().value;EXP.chunks.delete(first)}
    const c=document.createElement('canvas');c.width=c.height=Math.round(EXP.size*EXP.scale);ch={c,x:c.getContext('2d')};EXP.chunks.set(k,ch);
  }
  return ch;
}
function viewRect(){const z=UI.cam.zoom;return{x0:UI.cam.x-W/(2*z),y0:UI.cam.y-H/(2*z),x1:UI.cam.x+W/(2*z),y1:UI.cam.y+H/(2*z)}}
let W=800,H=600,dpr=1,ldpr=1;
/* Las capas de luz (máscara, visión, exploración, brillo, oscuridad) son degradados: se dibujan a
   escala 1 aunque la pantalla sea 2x. Cuatro veces menos píxeles por fotograma animado. */
const LIGHT_LAYERS=()=>[maskC,losC,expC,cv.glow,cv.dark];
const scaleOf=ctx=>ctx.canvas.__s||dpr;
function resize(){
  const r=stage.getBoundingClientRect();W=Math.max(1,r.width);H=Math.max(1,r.height);dpr=Math.min(2,window.devicePixelRatio||1);
  ldpr=Math.min(dpr,1);
  const light=new Set(LIGHT_LAYERS());
  for(const c of[...Object.values(cv),maskC,losC,expC]){const d=light.has(c)?ldpr:dpr;c.__s=d;c.width=Math.round(W*d);c.height=Math.round(H*d)}
  requestRender();
}
function resetExplored(){EXP.chunks.clear()}
/* Niebla guardada: se carga al entrar en una escena y se sube por bloques */
function loadFog(list){
  for(const f of list||[]){
    const ch=expChunk(f.cx,f.cy,true);const im=new Image();
    im.onload=()=>{ch.x.setTransform(1,0,0,1,0,0);ch.x.globalCompositeOperation='source-over';ch.x.imageSmoothingEnabled=true;ch.x.drawImage(im,0,0,ch.c.width,ch.c.height);requestRender()}; // se escala: la niebla guardada puede venir de otra resolución
    im.src=f.data;
  }
}
function takeDirtyFog(){const out=[];for(const[k,ch]of EXP.chunks)if(ch.dirty){ch.dirty=false;const[cx,cy]=k.split(',').map(Number);out.push({cx,cy,data:ch.c.toDataURL('image/png')})}return out}
const toWorld=sp=>({x:(sp.x-W/2)/UI.cam.zoom+UI.cam.x,y:(sp.y-H/2)/UI.cam.zoom+UI.cam.y});
const toScreen=p=>({x:(p.x-UI.cam.x)*UI.cam.zoom+W/2,y:(p.y-UI.cam.y)*UI.cam.zoom+H/2});
function setWorld(ctx){const z=UI.cam.zoom,d=scaleOf(ctx);ctx.setTransform(d*z,0,0,d*z,d*(W/2-UI.cam.x*z),d*(H/2-UI.cam.y*z))}
function setScreen(ctx){const d=scaleOf(ctx);ctx.setTransform(d,0,0,d,0,0)}
function setRaw(ctx){ctx.setTransform(1,0,0,1,0,0)}
const px=n=>n/UI.cam.zoom; // tamaño constante en pantalla

let dirty=true,lastAnim=0,lastNet=0;
function requestRender(){dirty=true}
function loop(ts){
  let anim=false;try{anim=hasAnimated()}catch(e){}
  requestAnimationFrame(loop);
  try{
    if(dirty){lastAnim=ts;frame={};dirty=false;drawAll(ts/1000,false)}
    else if(anim&&ts-lastAnim>16){lastAnim=ts;frame.sources=null;drawAll(ts/1000,true)}
    if(ts-lastNet>40){lastNet=ts;Net.tick()}
  }catch(err){console.error(err)}
}

function hexA(hex,a){let h=(hex||'#ffffff').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16)||0;return`rgba(${n>>16&255},${n>>8&255},${n&255},${clamp(a,0,1)})`}

/* lightsOnly: fotograma de animación de luces; el mapa, la visión y los controles no han cambiado */
function drawAll(t,lightsOnly){
  const player=!isGM();
  const vs=player?viewers():[];
  if(!lightsOnly){drawScene(player);if(player)buildLosMask(vs)}
  buildLightMask(t,player,vs);
  drawGlow(t,player);
  drawDarkness(player,vs,lightsOnly);
  if(lightsOnly)return;
  drawOverlay(player);
  $('#blindNote').style.display=player&&!vs.length?'grid':'none';
  $('#status').textContent=`Zoom ${Math.round(UI.cam.zoom*100)} %`+(UI.hover?`, cursor en ${Math.round(pxFt(UI.hover.x))}, ${Math.round(pxFt(UI.hover.y))} ft`:'');
}

/* Suelo, mapa, cuadrícula y fichas */
function drawScene(player){
  const c=cx.scene;setRaw(c);c.clearRect(0,0,cv.scene.width,cv.scene.height);
  setWorld(c);
  setScreen(c);c.fillStyle='#262E32';c.fillRect(0,0,W,H);setWorld(c);
  if(S.layers.map.visible)for(const a of S.assets)if(a.kind!=='prop')drawAsset(c,a);
  if(S.grid){
    const v=viewRect();let step=CELL;while(step*UI.cam.zoom<9)step*=5;
    const gx0=Math.floor(v.x0/step)*step,gy0=Math.floor(v.y0/step)*step;
    c.beginPath();
    for(let x=gx0;x<=v.x1;x+=step){c.moveTo(x,v.y0);c.lineTo(x,v.y1)}
    for(let y=gy0;y<=v.y1;y+=step){c.moveTo(v.x0,y);c.lineTo(v.x1,y)}
    c.strokeStyle='rgba(233,227,213,.09)';c.lineWidth=px(1);c.stroke();
    if(UI.cam.zoom>.3){const big=CELL*10;c.beginPath();for(let x=Math.floor(v.x0/big)*big;x<=v.x1;x+=big){c.moveTo(x,v.y0);c.lineTo(x,v.y1)}for(let y=Math.floor(v.y0/big)*big;y<=v.y1;y+=big){c.moveTo(v.x0,y);c.lineTo(v.x1,y)}c.strokeStyle='rgba(233,227,213,.05)';c.lineWidth=px(2);c.stroke()}
  }
  if(S.layers.props.visible)for(const a of S.assets)if(a.kind==='prop'&&(!player||propVisibleToPlayers(a)))drawAsset(c,a);
  if(!S.layers.tokens.visible)return;
  const list=[...S.tokens].sort((a,b)=>(a.kind==='player')-(b.kind==='player'));
  for(const t of list){
    if(player&&!visibleToPlayers(t))continue;
    drawToken(c,t,player);
  }
}
function drawToken(c,t,player){
  const P=displayPos(t);
  const r=tokenRadius(t);
  c.save();
  if(!player&&t.hidden)c.globalAlpha=.45;
  c.beginPath();c.arc(P.x,P.y+px(2),r,0,Math.PI*2);c.fillStyle='rgba(0,0,0,.35)';c.fill();
  const im=getImg(t.img);
  c.save();c.beginPath();c.arc(P.x,P.y,r,0,Math.PI*2);c.clip();
  if(im){const s=Math.max(r*2/im.width,r*2/im.height);c.drawImage(im,P.x-im.width*s/2,P.y-im.height*s/2,im.width*s,im.height*s)}
  else{const g=c.createRadialGradient(P.x-r*.3,P.y-r*.4,r*.1,P.x,P.y,r);g.addColorStop(0,hexA(t.color,1));g.addColorStop(1,shade(t.color,-.35));c.fillStyle=g;c.fillRect(P.x-r,P.y-r,r*2,r*2);
    c.fillStyle='rgba(20,18,14,.85)';c.font=`700 ${r*.9}px Alegreya, Georgia, serif`;c.textAlign='center';c.textBaseline='middle';c.fillText((t.name||'?').trim().charAt(0).toUpperCase(),P.x,P.y+r*.05)}
  c.restore();
  c.beginPath();c.arc(P.x,P.y,r,0,Math.PI*2);c.lineWidth=Math.max(px(2),r*.09);c.strokeStyle=t.kind==='enemy'?'#D9705F':'#E9E3D5';c.stroke();
  if(t.name&&UI.cam.zoom>.45){
    const fs=px(12);c.font=`500 ${fs}px "Alegreya Sans", system-ui, sans-serif`;c.textAlign='center';c.textBaseline='top';
    const w=c.measureText(t.name).width;const y=P.y+r+px(4);
    c.fillStyle='rgba(18,22,25,.78)';roundRect(c,P.x-w/2-px(5),y-px(1),w+px(10),fs+px(4),px(4));c.fill();
    c.fillStyle='#E9E3D5';c.fillText(t.name,P.x,y+px(1));
  }
  if(!player&&t.hidden){const ic=iconImage('eye-off','#E9E3D5');const s=px(16);c.globalAlpha=1;c.fillStyle='#232B30';c.beginPath();c.arc(P.x+r*.75,P.y-r*.75,s*.75,0,Math.PI*2);c.fill();if(ic.complete)c.drawImage(ic,P.x+r*.75-s/2,P.y-r*.75-s/2,s,s)}
  c.restore();
}
function drawAsset(c,a){
  const im=getImg(a.img);
  c.save();c.translate(a.x,a.y);if(a.rot)c.rotate(a.rot*Math.PI/180);
  if(a.opacity!=null&&a.opacity<1)c.globalAlpha=a.opacity;
  if(im)c.drawImage(im,-a.w/2,-a.h/2,a.w,a.h);
  else{
    c.fillStyle='#303a3f';c.fillRect(-a.w/2,-a.h/2,a.w,a.h);
    c.strokeStyle='rgba(233,227,213,.25)';c.lineWidth=px(1);c.setLineDash([px(4),px(4)]);c.strokeRect(-a.w/2,-a.h/2,a.w,a.h);c.setLineDash([]);
    const ic=iconImage(imgPending(a.img)?'loader-circle':'image','#9CA7A7'),s=Math.min(px(28),a.w*.5,a.h*.5);if(ic.complete)c.drawImage(ic,-s/2,-s/2,s,s);
  }
  c.restore();
}
function shade(hex,k){let h=(hex||'#888').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);const f=v=>clamp(Math.round(v*(1+k)),0,255);return`rgb(${f(n>>16&255)},${f(n>>8&255)},${f(n&255)})`}
function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}

/* Máscara de lo que ven los personajes (unión de sus líneas de visión) */
function buildLosMask(vs){
  const c=lctx;setRaw(c);c.clearRect(0,0,losC.width,losC.height);
  setWorld(c);c.fillStyle='#fff';
  for(const v of vs){
    const poly=los(v,'sight');if(poly.length<3)continue;
    c.save();tracePoly(c,poly);c.fill();c.restore();
  }
}
function lightShape(c,src,t,mode){
  const poly=los(src,'light');if(poly.length<3)return;
  const f=animFactor(src,t);
  const rD=ftPx(src.bright+src.dim)*f.r,rB=ftPx(src.bright)*f.r;if(rD<=0)return;
  const I=clamp(src.intensity*f.i,0,1.2);
  c.save();setWorld(c);
  tracePoly(c,poly);c.clip();
  if(src.angle<360){const a0=((src.rot||0)-src.angle/2)*Math.PI/180,a1=((src.rot||0)+src.angle/2)*Math.PI/180;c.beginPath();c.moveTo(src.x,src.y);c.arc(src.x,src.y,rD*1.05,a0,a1);c.closePath();c.clip()}
  const g=c.createRadialGradient(src.x,src.y,0,src.x,src.y,rD);
  const b=clamp(rB/rD,0,.96);
  if(mode==='mask'){
    const top=clamp(I,0,1);
    if(src.darkness){g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.85,'rgba(0,0,0,1)');g.addColorStop(1,'rgba(0,0,0,0)')}
    // brillante → tenue con una transición ancha: un borde duro se ve saltar cuando la luz pulsa o se mueve
    else if(b>0){g.addColorStop(0,`rgba(255,255,255,${top})`);g.addColorStop(Math.max(0,b-.1),`rgba(255,255,255,${top})`);g.addColorStop(Math.min(.97,b+.14),`rgba(255,255,255,${top*.5})`);g.addColorStop(.88,`rgba(255,255,255,${top*.38})`);g.addColorStop(1,'rgba(255,255,255,0)')}
    else{g.addColorStop(0,`rgba(255,255,255,${top*.52})`);g.addColorStop(.86,`rgba(255,255,255,${top*.4})`);g.addColorStop(1,'rgba(255,255,255,0)')}
  }else{
    g.addColorStop(0,hexA(src.color,.62*I));g.addColorStop(Math.max(.05,b*.9),hexA(src.color,.34*I));g.addColorStop(Math.min(.99,b+.12),hexA(src.color,.16*I));g.addColorStop(1,hexA(src.color,0));
  }
  c.fillStyle=g;c.beginPath();c.arc(src.x,src.y,rD,0,Math.PI*2);c.fill();
  c.restore();
}
/* Máscara de iluminación: ambiente - zonas + luces + visión en la oscuridad - oscuridad mágica */
function buildLightMask(t,player,vs){
  const c=mctx;setRaw(c);c.globalCompositeOperation='source-over';c.clearRect(0,0,maskC.width,maskC.height);
  if(S.ambient>0){
    c.fillStyle=`rgba(255,255,255,${S.ambient})`;c.fillRect(0,0,maskC.width,maskC.height);
    if(S.zones.length){c.globalCompositeOperation='destination-out';setWorld(c);c.fillStyle='#000';for(const z of S.zones){traceZone(c,z);c.fill()}setRaw(c)}
  }
  c.globalCompositeOperation='lighter';
  const src=lightSources();
  for(const s of src)if(!s.darkness)lightShape(c,s,t,'mask');
  if(player){
    for(const v of vs){
      if(!(v.darkvision>0))continue;
      const poly=los(v,'sight');if(poly.length<3)continue;
      const r=ftPx(v.darkvision);
      c.save();setWorld(c);tracePoly(c,poly);c.clip();
      // dentro del radio se ve todo; las luces sólo aportan lo que queda más allá
      const g=c.createRadialGradient(v.x,v.y,0,v.x,v.y,r);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.92,'rgba(255,255,255,1)');g.addColorStop(1,'rgba(255,255,255,0)');
      c.fillStyle=g;c.beginPath();c.arc(v.x,v.y,r,0,Math.PI*2);c.fill();c.restore();
    }
  }
  c.globalCompositeOperation='destination-out';
  for(const s of src)if(s.darkness)lightShape(c,s,t,'mask');
  if(player){c.globalCompositeOperation='destination-in';setRaw(c);c.drawImage(losC,0,0)}
  c.globalCompositeOperation='source-over';
}
function drawGlow(t,player){
  const c=cx.glow;setRaw(c);c.globalCompositeOperation='source-over';c.clearRect(0,0,cv.glow.width,cv.glow.height);
  if(!player&&!UI.preview)return;
  for(const s of lightSources())if(!s.darkness)lightShape(c,s,t,'glow');
  if(player){c.globalCompositeOperation='destination-in';setRaw(c);c.drawImage(losC,0,0);c.globalCompositeOperation='source-over'}
  if(S.zones.length&&S.ambient>0){/* sin tinte extra */}
}
/* Memoria de exploración en pantalla (espacio de píxeles), ya desenfocada */
function composeExplored(){
  const c=ectx;setRaw(c);c.globalCompositeOperation='source-over';c.clearRect(0,0,expC.width,expC.height);
  const d=scaleOf(c),z=UI.cam.zoom,s=EXP.scale,v=viewRect(),k=s/(d*z),S2=EXP.size;
  const cx0=Math.floor(v.x0/S2),cx1=Math.floor(v.x1/S2),cy0=Math.floor(v.y0/S2),cy1=Math.floor(v.y1/S2);
  const few=(cx1-cx0+1)*(cy1-cy0+1)<=48;
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  // la memoria es de baja resolución: un desenfoque leve en pantalla disimula los escalones al ampliarla
  if('filter' in c)c.filter=`blur(${EXP.blur*d}px)`;
  for(let cx=cx0;cx<=cx1;cx++)for(let cy=cy0;cy<=cy1;cy++){
    const ch=expChunk(cx,cy,few);if(!ch)continue;
    if(few){ch.x.setTransform(k,0,0,k,s*(v.x0-cx*S2),s*(v.y0-cy*S2));ch.x.imageSmoothingEnabled=true;ch.x.globalCompositeOperation='lighter';for(let n=0;n<EXP.boost;n++)ch.x.drawImage(maskC,0,0);ch.x.globalCompositeOperation='source-over';ch.dirty=true}
    c.setTransform(d*z/s,0,0,d*z/s,d*(W/2+(cx*S2-UI.cam.x)*z),d*(H/2+(cy*S2-UI.cam.y)*z));
    c.drawImage(ch.c,0,0);
  }
  if('filter' in c)c.filter='none';
  setRaw(c);
}
function drawDarkness(player,vs,lightsOnly){
  const c=cx.dark;setRaw(c);c.globalCompositeOperation='source-over';c.globalAlpha=1;c.clearRect(0,0,cv.dark.width,cv.dark.height);
  if(!player){
    if(!UI.preview)return;
    c.fillStyle=hexA(S.darkColor,.74);c.fillRect(0,0,cv.dark.width,cv.dark.height);
    c.globalCompositeOperation='destination-out';c.drawImage(maskC,0,0);c.globalCompositeOperation='source-over';
    return;
  }
  c.fillStyle=S.darkColor;c.fillRect(0,0,cv.dark.width,cv.dark.height);
  if(S.fog&&vs.length){
    // en los fotogramas de animación de luz la memoria explorada no cambia: se reutiliza la
    // composición desenfocada (el desenfoque por CPU en cada frame era lo que daba tirones)
    if(!lightsOnly)composeExplored();
    c.globalCompositeOperation='destination-out';c.globalAlpha=.42;c.drawImage(expC,0,0);c.globalAlpha=1;
  }
  c.globalCompositeOperation='destination-out';
  c.drawImage(maskC,0,0);
  // las fichas propias siempre se distinguen
  setWorld(c);c.globalAlpha=.7;
  for(const v of S.tokens){if(v.kind!=='player'||v.hidden)continue;c.beginPath();c.arc(v.x,v.y,tokenRadius(v)*1.05,0,Math.PI*2);c.fill()}
  c.globalAlpha=1;c.globalCompositeOperation='source-over';
}

/* Controles: muros, puertas, iconos de luz, planos, selección */
function drawOverlay(player){
  const c=cx.over;setRaw(c);c.clearRect(0,0,cv.over.width,cv.over.height);setWorld(c);
  const gm=!player,tiny=UI.cam.zoom<.25;
  if(gm&&S.layers.zones.visible){
    for(const z of S.zones){
      c.save();traceZone(c,z);c.fillStyle='rgba(183,155,216,.07)';c.fill();
      c.setLineDash([px(8),px(6)]);c.strokeStyle=isSel(z)?'#F0B35A':'rgba(183,155,216,.75)';c.lineWidth=px(isSel(z)?2.5:1.5);c.stroke();c.setLineDash([]);
      if(isSel(z)&&z.pts)for(const q of z.pts){c.fillStyle='#F0B35A';c.beginPath();c.arc(q.x,q.y,px(4.5),0,Math.PI*2);c.fill()}
      if(tiny){c.restore();continue}
      const lx=z.pts?z.pts[0].x:z.x,ly=z.pts?z.pts[0].y:z.y;const ic=iconImage('house','#B79BD8'),s=px(15);if(ic.complete)c.drawImage(ic,lx+px(6),ly+px(6),s,s);
      c.font=`500 ${px(12)}px "Alegreya Sans", sans-serif`;c.fillStyle='#CDB8E6';c.textBaseline='top';c.fillText(z.name||'Interior',lx+px(25),ly+px(7));
      c.restore();
    }
  }
  if(gm&&S.layers.walls.visible){
    for(const w of S.walls){
      const T=WALL_TYPES[w.kind]||WALL_TYPES.wall;
      c.save();c.lineCap='round';
      if(isSel(w)){c.strokeStyle='rgba(240,179,90,.45)';c.lineWidth=px(10);c.beginPath();c.moveTo(w.a.x,w.a.y);c.lineTo(w.b.x,w.b.y);c.stroke()}
      c.strokeStyle=T.door&&w.open?'rgba(240,179,90,.55)':T.color;c.lineWidth=px(T.door?5:3.5);
      if(T.dash)c.setLineDash(T.dash.map(px));else if(T.door&&w.open)c.setLineDash([px(4),px(5)]);
      c.beginPath();c.moveTo(w.a.x,w.a.y);c.lineTo(w.b.x,w.b.y);c.stroke();c.setLineDash([]);
      const big=isSel(w)||UI.tool==='wall';c.fillStyle=T.color;for(const q of[w.a,w.b]){c.beginPath();c.arc(q.x,q.y,px(big?5:2.5),0,Math.PI*2);c.fill()}
      c.restore();
    }
  }
  // puertas: siempre para el director, solo las visibles para jugadores
  for(const w of S.walls){
    if(w.kind!=='door'&&w.kind!=='portal')continue;
    if(gm&&!S.layers.walls.visible)continue;
    if(player&&!doorVisibleToPlayers(w))continue;
    if(tiny)continue;
    const m={x:(w.a.x+w.b.x)/2,y:(w.a.y+w.b.y)/2},r=px(13);
    c.beginPath();c.arc(m.x,m.y,r,0,Math.PI*2);c.fillStyle='rgba(28,34,38,.92)';c.fill();
    c.lineWidth=px(1.5);c.strokeStyle=w.open?'#6FB8A8':'#F0B35A';c.stroke();
    if(w.kind==='portal'){
      c.strokeStyle='#E8A0BF';c.lineWidth=px(2);c.beginPath();c.arc(m.x,m.y,r,0,Math.PI*2);c.stroke();
      const ic=iconImage('log-in','#E8A0BF'),s=px(16);if(ic.complete)c.drawImage(ic,m.x-s/2,m.y-s/2,s,s);
      const dest=w.target&&UI.scenes.find(x=>x.id===w.target.scene);
      if(UI.cam.zoom>.35)label(c,{x:m.x,y:m.y+r+px(12)},dest?`${w.name?w.name+': ':''}a ${dest.name}`:(gm?'Sin destino':(w.name||'Portal')));
      continue;
    }
    const ic=iconImage(w.locked?'door-closed-locked':w.open?'door-open':'door-closed',w.open?'#6FB8A8':'#F0B35A');const s=px(16);
    if(ic.complete)c.drawImage(ic,m.x-s/2,m.y-s/2,s,s);
  }
  // cono de luz de una ficha seleccionada: línea de dirección y tirador para girarla
  for(const t of S.tokens){
    if(!isSel(t)||!canControl(t))continue;
    const L=tokenLight(t);if(!L||L.angle>=360)continue;
    const a=(L.rot||0)*Math.PI/180,rr=ftPx(L.bright+L.dim);
    c.save();c.setLineDash([px(5),px(5)]);c.lineWidth=px(1.5);c.strokeStyle='rgba(240,179,90,.9)';
    c.beginPath();c.moveTo(t.x,t.y);c.lineTo(t.x+Math.cos(a)*rr,t.y+Math.sin(a)*rr);c.stroke();c.setLineDash([]);
    c.fillStyle='#F0B35A';c.strokeStyle='#1C2226';c.lineWidth=px(2);
    for(const h of tokenAimHandles(t)){c.beginPath();c.arc(h.x,h.y,px(7),0,Math.PI*2);c.fill();c.stroke()}
    c.restore();
  }
  if(gm&&S.layers.lights.visible){
    for(const l of S.lights){
      const P=LIGHT_PRESETS[l.preset]||{icon:'lightbulb'};
      if(isSel(l)){
        c.save();c.setLineDash([px(5),px(5)]);c.lineWidth=px(1.5);
        c.strokeStyle='rgba(240,179,90,.9)';c.beginPath();c.arc(l.x,l.y,ftPx(l.bright+l.dim),0,Math.PI*2);c.stroke();
        if(l.dim>0&&l.bright>0){c.strokeStyle='rgba(240,179,90,.5)';c.beginPath();c.arc(l.x,l.y,ftPx(l.bright),0,Math.PI*2);c.stroke()}
        c.setLineDash([]);
        const h=lightHandlePos(l);c.beginPath();c.arc(h.x,h.y,px(7),0,Math.PI*2);c.fillStyle='#F0B35A';c.fill();c.strokeStyle='#1C2226';c.lineWidth=px(2);c.stroke();
        if(l.angle<360){const a=(l.rot||0)*Math.PI/180,rr=ftPx(l.bright+l.dim);c.beginPath();c.moveTo(l.x,l.y);c.lineTo(l.x+Math.cos(a)*rr,l.y+Math.sin(a)*rr);c.stroke()}
        c.restore();
      }
      if(tiny){c.fillStyle=l.on?(l.darkness?'#9CA7A7':l.color):'#5B666A';c.beginPath();c.arc(l.x,l.y,px(3),0,Math.PI*2);c.fill();continue}
      const r=px(15);
      c.save();
      if(l.on&&!l.darkness){const g=c.createRadialGradient(l.x,l.y,r*.6,l.x,l.y,r*2.1);g.addColorStop(0,hexA(l.color,.55));g.addColorStop(1,hexA(l.color,0));c.fillStyle=g;c.beginPath();c.arc(l.x,l.y,r*2.1,0,Math.PI*2);c.fill()}
      c.beginPath();c.arc(l.x,l.y,r,0,Math.PI*2);c.fillStyle=l.darkness?'#0A0C0E':'#232B30';c.fill();
      c.lineWidth=px(isSel(l)?3:2);c.strokeStyle=isSel(l)?'#F0B35A':(l.on?(l.darkness?'#9CA7A7':l.color):'#5B666A');c.stroke();
      const ic=iconImage(P.icon,l.on?'#F4EEE2':'#77838A'),s=px(18);if(ic.complete)c.drawImage(ic,l.x-s/2,l.y-s/2,s,s);
      if(!l.on){c.strokeStyle='#77838A';c.lineWidth=px(2);c.beginPath();c.moveTo(l.x-r*.7,l.y+r*.7);c.lineTo(l.x+r*.7,l.y-r*.7);c.stroke()}
      c.restore();
    }
  }
  if(S.layers.plans.visible){for(const p of S.plans)if(gm||S.plansReleased||p.owner!=null)drawPlan(c,p,isSel(p)?'#F0B35A':(p.color||'#8EC5E8'),false)}
  const A=UI.act;
  if(A&&A.kind==='plan')drawPlan(c,{shape:UI.planShape,a:A.a,b:A.b},'#F4EEE2',true);
  if(A&&(A.kind==='room'||A.kind==='zone')){const r=normRect(A.a,A.b);c.save();c.setLineDash([px(6),px(5)]);c.strokeStyle=A.kind==='zone'?'#B79BD8':WALL_TYPES[wallKindForShape()].color;c.lineWidth=px(2);c.strokeRect(r.x,r.y,r.w,r.h);c.restore();label(c,{x:r.x+r.w/2,y:r.y+r.h/2},`${Math.round(pxFt(r.w))} × ${Math.round(pxFt(r.h))} ft`)}
  if(A&&A.kind==='wcircle'){const r=dist(A.a,A.b),T=WALL_TYPES[wallKindForShape()];c.save();c.strokeStyle=T.color;c.lineWidth=px(3);c.setLineDash([px(6),px(5)]);tracePoly(c,ellipsePoints(A.a.x,A.a.y,r,r,0,segCount(2*Math.PI*r)));c.stroke();c.restore();label(c,A.a,`radio ${Math.round(pxFt(r))} ft`)}
  if(A&&A.kind==='zcircle'){const r=dist(A.a,A.b);c.save();c.strokeStyle='#B79BD8';c.lineWidth=px(2);c.setLineDash([px(6),px(5)]);c.beginPath();c.arc(A.a.x,A.a.y,r,0,Math.PI*2);c.stroke();c.restore();label(c,A.a,`radio ${Math.round(pxFt(r))} ft`)}
  if(UI.zpoly&&UI.hover){const pts=[...UI.zpoly,snapZonePoint(UI.hover,UI.lastEvent)];c.save();c.strokeStyle='#B79BD8';c.fillStyle='rgba(183,155,216,.1)';c.lineWidth=px(2);c.setLineDash([px(6),px(5)]);tracePoly(c,pts);c.fill();c.stroke();c.setLineDash([]);c.fillStyle='#B79BD8';pts.forEach((q,i)=>{c.beginPath();c.arc(q.x,q.y,px(i===0?7:4),0,Math.PI*2);c.fill()});c.restore()}
  if(UI.arc&&UI.hover){
    const T=WALL_TYPES[wallKindForShape()],R=UI.arc,q=UI.hover;
    c.save();c.strokeStyle=T.color;c.lineWidth=px(3);c.setLineDash([px(6),px(5)]);c.beginPath();
    if(!R.p1){c.moveTo(R.c.x,R.c.y);c.lineTo(q.x,q.y);c.stroke();label(c,q,`radio ${Math.round(pxFt(dist(R.c,q)))} ft`)}
    else{const pts=arcPoints(R.c,R.p1,q);c.moveTo(pts[0].x,pts[0].y);for(const k of pts)c.lineTo(k.x,k.y);c.stroke();c.setLineDash([]);c.lineWidth=px(1);c.strokeStyle='rgba(240,179,90,.6)';c.beginPath();c.moveTo(R.p1.x,R.p1.y);c.lineTo(R.c.x,R.c.y);c.lineTo(q.x,q.y);c.stroke()}
    c.restore();c.fillStyle=T.color;c.beginPath();c.arc(R.c.x,R.c.y,px(4),0,Math.PI*2);c.fill();
  }
  if(UI.curve&&UI.hover){
    const T=WALL_TYPES[wallKindForShape()],q=snapWallPoint(UI.hover,UI.lastEvent),C=UI.curve;
    c.save();c.strokeStyle=T.color;c.lineWidth=px(3);c.setLineDash([px(6),px(5)]);c.beginPath();
    if(!C.b){c.moveTo(C.a.x,C.a.y);c.lineTo(q.x,q.y);c.stroke()}
    else{const ctl=UI.hover;const pts=curvePoints(C.a,ctl,C.b,24);c.moveTo(pts[0].x,pts[0].y);for(const k of pts)c.lineTo(k.x,k.y);c.stroke();c.setLineDash([]);c.lineWidth=px(1);c.strokeStyle='rgba(240,179,90,.6)';c.beginPath();c.moveTo(C.a.x,C.a.y);c.lineTo(ctl.x,ctl.y);c.lineTo(C.b.x,C.b.y);c.stroke()}
    c.restore();
    c.fillStyle=T.color;for(const k of[C.a,C.b].filter(Boolean)){c.beginPath();c.arc(k.x,k.y,px(5),0,Math.PI*2);c.fill()}
  }
  if(UI.chain&&UI.hover){
    const pts=UI.chain.pts,last=pts[pts.length-1],T=WALL_TYPES[UI.wallType];
    const q=snapWallPoint(UI.hover,UI.lastEvent);
    c.save();c.strokeStyle=T.color;c.lineWidth=px(3);c.setLineDash([px(6),px(5)]);c.beginPath();c.moveTo(last.x,last.y);c.lineTo(q.x,q.y);c.stroke();c.restore();
    label(c,{x:(last.x+q.x)/2,y:(last.y+q.y)/2},`${Math.round(pxFt(dist(last,q)))} ft`);
  }
  if(gm&&UI.tool==='wall'&&UI.hover&&!UI.act){const q=snapWallPoint(UI.hover,UI.lastEvent);c.beginPath();c.arc(q.x,q.y,px(5),0,Math.PI*2);c.fillStyle=WALL_TYPES[wallKindForShape()].color;c.fill()}
  if(A&&A.kind==='ruler'){
    const d=Math.max(Math.abs(A.b.x-A.a.x),Math.abs(A.b.y-A.a.y))/CELL*FT;
    c.save();c.strokeStyle='#F0B35A';c.lineWidth=px(3);c.setLineDash([px(8),px(6)]);c.beginPath();c.moveTo(A.a.x,A.a.y);c.lineTo(A.b.x,A.b.y);c.stroke();c.setLineDash([]);
    c.fillStyle='#F0B35A';for(const q of[A.a,A.b]){c.beginPath();c.arc(q.x,q.y,px(5),0,Math.PI*2);c.fill()}c.restore();
    label(c,{x:A.b.x+px(12),y:A.b.y-px(16)},`${Math.round(d)} ft (${Math.round(pxFt(dist(A.a,A.b)))} en línea recta)`,'left');
  }
  // selección de fichas y mapas
  for(const o of selObjs()){
    if(o.type==='token'){const r=tokenRadius(o)+px(5);c.save();c.strokeStyle='#F0B35A';c.lineWidth=px(2.5);c.setLineDash([px(6),px(4)]);c.beginPath();c.arc(o.x,o.y,r,0,Math.PI*2);c.stroke();c.restore()}
    if(o.type==='asset'&&gm){
      const cs=assetCorners(o);c.save();c.strokeStyle='#F0B35A';c.lineWidth=px(2);tracePoly(c,cs);c.stroke();
      for(const h of cs){c.fillStyle='#F0B35A';c.fillRect(h.x-px(5),h.y-px(5),px(10),px(10))}
      if(o.kind==='prop'){const top=rotPt({x:o.x,y:o.y-o.h/2},o,o.rot||0),rh=rotHandle(o);c.beginPath();c.moveTo(top.x,top.y);c.lineTo(rh.x,rh.y);c.stroke();c.beginPath();c.arc(rh.x,rh.y,px(7),0,Math.PI*2);c.fillStyle='#1C2226';c.fill();c.stroke();const ic=iconImage('rotate-cw','#F0B35A'),s=px(10);if(ic.complete)c.drawImage(ic,rh.x-s/2,rh.y-s/2,s,s)}
      c.restore();
    }
    if(o.type==='zone'&&gm&&!o.pts){for(const h of cornerHandles({x:o.x+o.w/2,y:o.y+o.h/2,w:o.w,h:o.h})){c.fillStyle='#F0B35A';c.fillRect(h.x-px(5),h.y-px(5),px(10),px(10))}}
  }
  if(A&&A.kind==='box'){const r=normRect(A.a,A.b);c.fillStyle='rgba(240,179,90,.08)';c.fillRect(r.x,r.y,r.w,r.h);c.strokeStyle='rgba(240,179,90,.8)';c.lineWidth=px(1);c.strokeRect(r.x,r.y,r.w,r.h)}
  drawPeers(c);
  drawRemoteMarks(c,player);
}
function label(c,p,text,align){
  c.save();const fs=px(13);c.font=`500 ${fs}px "Alegreya Sans", system-ui, sans-serif`;
  const w=c.measureText(text).width,x=align==='left'?p.x:p.x-w/2-px(6);
  c.fillStyle='rgba(18,22,25,.88)';roundRect(c,x,p.y-fs/2-px(4),w+px(12),fs+px(8),px(5));c.fill();
  c.fillStyle='#F4EEE2';c.textBaseline='middle';c.textAlign='left';c.fillText(text,x+px(6),p.y+px(.5));c.restore();
}
function drawPlan(c,p,color,draft){
  c.save();c.strokeStyle=color;c.fillStyle=hexA(color.startsWith('#')?color:'#8EC5E8',.1);c.lineWidth=px(2.5);c.setLineDash([px(8),px(5)]);
  const a=p.a,b=p.b,d=dist(a,b);
  if(p.shape==='line'){c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();label(c,{x:(a.x+b.x)/2,y:(a.y+b.y)/2-px(14)},`${Math.round(pxFt(d))} ft`)}
  else if(p.shape==='circle'){c.beginPath();c.arc(a.x,a.y,d,0,Math.PI*2);c.fill();c.stroke();label(c,{x:a.x,y:a.y},`radio ${Math.round(pxFt(d))} ft`)}
  else if(p.shape==='rect'){const r=normRect(a,b);c.fillRect(r.x,r.y,r.w,r.h);c.strokeRect(r.x,r.y,r.w,r.h);label(c,{x:r.x+r.w/2,y:r.y+r.h/2},`${Math.round(pxFt(r.w))} × ${Math.round(pxFt(r.h))} ft`)}
  else if(p.shape==='cone'){const ang=Math.atan2(b.y-a.y,b.x-a.x),half=Math.atan(.5);c.beginPath();c.moveTo(a.x,a.y);c.arc(a.x,a.y,d,ang-half,ang+half);c.closePath();c.fill();c.stroke();label(c,{x:a.x+Math.cos(ang)*d*.55,y:a.y+Math.sin(ang)*d*.55},`cono ${Math.round(pxFt(d))} ft`)}
  if(!draft&&p.owner!=null&&UI.cam.zoom>.3){
    const who=Net.members.find(m=>m.id===p.owner);
    if(who){c.setLineDash([]);const fs=px(11);c.font=`600 ${fs}px "Alegreya Sans", system-ui, sans-serif`;const w=c.measureText(who.name).width;c.fillStyle=p.color||who.color;roundRect(c,a.x-w/2-px(5),a.y-px(24),w+px(10),fs+px(6),px(4));c.fill();c.fillStyle='#1C2226';c.textAlign='center';c.textBaseline='middle';c.fillText(who.name,a.x,a.y-px(24)+(fs+px(6))/2)}
  }
  c.restore();
}
function cornerHandles(o){return[{k:'nw',x:o.x-o.w/2,y:o.y-o.h/2},{k:'ne',x:o.x+o.w/2,y:o.y-o.h/2},{k:'se',x:o.x+o.w/2,y:o.y+o.h/2},{k:'sw',x:o.x-o.w/2,y:o.y+o.h/2}]}
function lightHandlePos(l){const a=l.angle<360?(l.rot||0)*Math.PI/180:0;const r=ftPx(l.bright+l.dim);return{x:l.x+Math.cos(a)*r,y:l.y+Math.sin(a)*r}}
