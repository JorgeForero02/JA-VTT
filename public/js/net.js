'use strict';
/* Conexión en tiempo real con el servidor local. Cada cambio se detecta
   comparando el estado con la última copia enviada y viaja como operación;
   el servidor valida permisos, guarda en SQLite y reparte a los demás. */
const COLL_KEYS=Object.values(COLL);
const SCENE_KEYS=['env','ambient','darkColor','fog','grid','snap','animate','plansReleased','layers','sharedVision','playersDoors','chatEnabled','diceEnabled','initiativeShown'];
const Net=(()=>{
  let ws=null,boardId=null,closedByUs=true,retry=0,synced=false,retryTimer=0;
  const shadow=new Map();let shadowScene='';
  const N={online:[],members:[],cursors:new Map(),stats:{sent:0,recv:0,last:0},showCursors:true,connected:false,lastCur:0,curTimer:0};
  function send(o){if(ws&&ws.readyState===1){ws.send(JSON.stringify(o));N.stats.sent++;return true}return false}
  function open(){
    const proto=location.protocol==='https:'?'wss':'ws';
    ws=new WebSocket(`${proto}://${location.host}/ws?board=${encodeURIComponent(boardId)}`);
    ws.onopen=()=>{N.connected=true;retry=0;renderLiveSoon()};
    ws.onmessage=e=>{let d;try{d=JSON.parse(e.data)}catch(err){return}N.stats.recv++;N.stats.last=Date.now();try{handle(d)}catch(err){console.error(err)}};
    ws.onclose=ev=>{
      N.connected=false;synced=false;renderLiveSoon();
      if(closedByUs)return;
      if(ev.code===4403){onKicked(false);return}
      clearTimeout(retryTimer);retryTimer=setTimeout(open,Math.min(8000,600*2**retry++));
      toast('Se perdió la conexión con el servidor. Reintentando…',2400);
    };
  }
  function handle(d){
    switch(d.t){
      case 'state':applyState(d);break;
      case 'ops':applyOps(d);break;
      case 'scenes':
        UI.scenes=d.scenes||[];UI.where=d.where||{};UI.activeScene=d.active;
        if(d.online){N.online=d.online;for(const id of[...N.cursors.keys()])if(!N.online.some(u=>u.id===id&&u.scene===(UI.scene&&UI.scene.id)))N.cursors.delete(id)}
        if(UI.scene){const me=UI.scenes.find(x=>x.id===UI.scene.id);if(me)UI.scene.name=me.name}
        renderLiveSoon();renderScenes();requestRender();break;
      case 'fogreset':if(UI.scene&&d.scene===UI.scene.id){resetExplored();requestRender();toast('El director reinició la exploración de esta escena')}break;
      case 'members':N.members=d.members||[];renderLiveSoon();refreshPanels();break;
      case 'chat':Chat.receive(d.msg);break;
      case 'initiative':UI.initiative=d.initiative||null;renderInitiative();break;
      case 'cursor':if(d.x==null)N.cursors.delete(d.uid);else{const prev=N.cursors.get(d.uid);N.cursors.set(d.uid,{x:d.x,y:d.y,s:prev&&prev.s?prev.s:{x:d.x,y:d.y,last:performance.now()}})}requestRender();break;
      case 'board':if(UI.board){UI.board.name=d.name;syncBoardName()}break;
      case 'images':Store.refresh();break;
      case 'pong':toast(`El servidor respondió en ${Date.now()-d.at} ms`);break;
      case 'kicked':onKicked(!!d.deleted);break;
      case 'terrain':if(!UI.scene||d.scene!==UI.scene.id||!window.D3)break;if(d.full)window.D3.loadTerrain(d.full);else if(d.op&&!window.D3.applyRemoteOp(d.op,d.version))Net.sendRaw({t:'terrain',scene:UI.scene.id,want:'full'});if(d.fix)toast('No puedes editar el terreno de esta escena');break;
      case 'error':toast(d.error||'Error del servidor',2600);break;
    }
  }
  function sceneMeta(){const o={};for(const k of SCENE_KEYS)o[k]=S[k];return JSON.parse(JSON.stringify(o))}
  function baseline(){shadow.clear();for(const k of COLL_KEYS)for(const o of S[k])shadow.set(o.id,JSON.stringify(o));shadowScene=JSON.stringify(sceneMeta())}
  function applyState(d){
    const newScene=!UI.scene||UI.scene.id!==d.scene.id;
    const first=!synced||newScene;
    if(synced&&newScene)flushFog();
    UI.me=d.me;UI.realRole=d.role;UI.board=d.board;N.members=d.members||[];N.online=d.online||[];
    if(Array.isArray(d.chat))Chat.load(d.chat);UI.initiative=d.initiative||null;renderInitiative();
    const prevSceneName=UI.scene&&UI.scene.name;
    UI.scene=d.scene;UI.scenes=d.scenes||[];UI.where=d.where||{};UI.activeScene=d.active;
    const st=Object.assign(blankState(),d.settings||{},{name:d.board.name});
    for(const k of COLL_KEYS)st[k]=[];
    for(const o of d.objects||[])if(COLL[o.type])st[COLL[o.type]].push(o);
    const keepHist=!first;if(newScene){hist.undo.length=0;hist.redo.length=0}const prevUndo=hist.undo.slice(),prevRedo=hist.redo.slice();
    loadState(st);syncStageMode(d.terrain);
    function sync25(retries){
      if(!is25()||!window.D3)return;
      if(window.D3.isMounted()){window.D3.syncObjects();return;}
      if(retries>0)setTimeout(()=>sync25(retries-1),150);
    }
    sync25(20);
    if(typeof view25==='function')view25();
    if(newScene){N.cursors.clear();UI.act=null;UI.chain=null;UI.curve=null;UI.arc=null;UI.zpoly=null;closePops()}
    if(first)loadFog(d.fog);
    if(keepHist&&UI.realRole==='gm'){hist.undo.push(...prevUndo);hist.redo.push(...prevRedo);syncUndo()}
    baseline();synced=true;
    if(first){
      if(!synced||!prevSceneName)setRole(d.role);else setRole(UI.role);
      if(UI.tool!=='select')setTool('select');
      const mine=S.tokens.find(ownsToken);
      if(mine&&UI.realRole!=='gm'){centerView();UI.cam.x=mine.x;UI.cam.y=mine.y;UI.cam.zoom=Math.max(UI.cam.zoom,.8)}else centerView();
      if(!prevSceneName&&typeof onBoardReady==='function')onBoardReady();
      else if(newScene)toast(`Escena: ${d.scene.name}`,1800);
    }else setRole(UI.role==='player'&&UI.realRole==='gm'?'player':d.role);
    refreshAll();syncBoardName();
    if(d.replaced)toast('El director cargó una escena nueva',2400);
  }
  function diff(){
    if(!synced||!N.connected)return;
    const gm=UI.realRole==='gm';
    const ups=[],seen=new Set();
    for(const k of COLL_KEYS)for(const o of S[k]){
      seen.add(o.id);const j=JSON.stringify(o);
      if(shadow.get(o.id)===j)continue;
      if(!gm&&!(ownsToken(o)||ownsPlan(o)||(o.type==='wall'&&o.kind==='door'))){
        // un jugador no puede cambiar esto: se deshace en su pantalla
        const prev=shadow.get(o.id);if(prev){const c=JSON.parse(prev);for(const k of Object.keys(o))delete o[k];Object.assign(o,c);if(o.type==='wall')touchWalls();requestRender()}
        continue;
      }
      shadow.set(o.id,j);ups.push(o);
    }
    const dels=[];
    for(const[id,j]of shadow)if(!seen.has(id)&&(gm||/"type":"plan"/.test(j)&&JSON.parse(j).owner===myId()))dels.push(id);
    for(const id of dels)shadow.delete(id);
    let settings;
    if(gm){const sj=JSON.stringify(sceneMeta());if(sj!==shadowScene){shadowScene=sj;settings=JSON.parse(sj)}}
    if(!ups.length&&!dels.length&&!settings)return;
    for(let i=0;i<Math.max(ups.length,1);i+=400)send({t:'ops',scene:UI.scene&&UI.scene.id,up:ups.slice(i,i+400),del:i===0?dels:[],settings:i===0?settings:undefined});
  }
  function applyOps(d){
    let walls=false,any=false,scene=false;
    if(d.settings){for(const k of SCENE_KEYS)if(k in d.settings)S[k]=d.settings[k];shadowScene=JSON.stringify(sceneMeta());any=true;scene=true;walls=true}
    const who=d.by!=null?N.members.find(m=>m.id===d.by):null;
    for(const c of d.up||[]){
      if(!c||!COLL[c.type])continue;
      const coll=S[COLL[c.type]];const old=coll.find(x=>x.id===c.id);
      // una corrección sobre lo que estoy arrastrando llega tarde: me quedo con lo mío y lo reenvío
      const held=old&&UI.act&&(UI.act.o===old||(UI.act.items&&UI.act.items.some(it=>it.o===old)));
      if(d.fix&&held){shadow.set(c.id,JSON.stringify(c));any=true;continue}
      // fichas y luces que mueve otro se deslizan hasta su posición nueva en vez de saltar
      if(old&&(c.type==='token'||c.type==='light')&&(old.x!==c.x||old.y!==c.y)){
        const busy=UI.act&&UI.act.kind==='move'&&UI.act.items.some(it=>it.o===old);
        if(!busy){const cur=displayPos(old);const st=smoothMoves.get(c.id)||{};st.x=cur.x;st.y=cur.y;st.last=performance.now();smoothMoves.set(c.id,st)}
        if(who&&c.type==='token')remoteMarks.set(c.id,{name:who.name,color:who.color,until:performance.now()+1600});
      }
      if(old){for(const k of Object.keys(old))delete old[k];Object.assign(old,c)}else coll.push(c);
      shadow.set(c.id,JSON.stringify(old||c));
      if(c.type==='wall')walls=true;any=true;
    }
    if(d.del&&d.del.length){
      const ids=new Set(d.del);
      for(const k of COLL_KEYS){const before=S[k].length;S[k]=S[k].filter(o=>{if(!ids.has(o.id))return true;if(o.type==='wall')walls=true;return false});if(S[k].length!==before)any=true}
      for(const id of ids)shadow.delete(id);
      UI.selected=UI.selected.filter(id=>!ids.has(id));
    }
    if(d.fix&&UI.realRole!=='gm'&&(d.up||[]).some(o=>!ownsToken(o)&&!ownsPlan(o)))toast('Eso solo lo puede cambiar el director');
    if(!any)return;
    if(walls)touchWalls();
    remoteChanged(scene);
    if(is25()&&window.D3&&window.D3.isMounted())window.D3.syncObjects();
    if(typeof view25==='function')view25();
  }
  function onKicked(deleted){
    closedByUs=true;synced=false;
    toast(deleted?'El director eliminó este tablero':'Ya no tienes acceso a este tablero',3200);
    if(typeof leaveBoard==='function')leaveBoard();
  }
  const api={
    connect(id){api.disconnect();boardId=id;closedByUs=false;synced=false;retry=0;open()},
    disconnect(){closedByUs=true;clearTimeout(retryTimer);if(ws)try{ws.close()}catch(e){}ws=null;synced=false;N.connected=false;N.cursors.clear();N.online=[];N.members=[]},
    tick:diff,baseline,
    get synced(){return synced},
    get connected(){return N.connected},
    get stats(){return N.stats},
    get online(){return N.online},
    get members(){return N.members},
    get live(){return synced},
    get showCursors(){return N.showCursors},set showCursors(v){N.showCursors=v;requestRender()},
    get peers(){return N.online.filter(u=>!UI.me||u.id!==UI.me.id).map(u=>({pid:u.id,name:u.name,color:u.color,role:u.role,live:true,cur:N.cursors.get(u.id)||null}))},
    cursorMoved(){
      if(!synced)return;
      const now=performance.now();
      const go=()=>{N.lastCur=performance.now();send(UI.hover?{t:'cursor',x:Math.round(UI.hover.x),y:Math.round(UI.hover.y)}:{t:'cursor',x:null,y:null})};
      clearTimeout(N.curTimer);
      if(now-N.lastCur>33)go();else N.curTimer=setTimeout(go,35);
    },
    roleChanged(){},
    chat(text){return send({t:'chat',text})},
    roll(formula,label,secret){return send({t:'roll',formula,label,secret:!!secret})},
    setInitiative(initiative){return send({t:'initiative',initiative})},
    replaceAll(name){if(!synced)return;send({t:'replace',scene:UI.scene.id,name,settings:sceneMeta(),objects:COLL_KEYS.flatMap(k=>S[k])});baseline()},
    scene(op,extra){if(UI.realRole!=='gm')return;send(Object.assign({t:'scene',op},extra||{}))},
    travel(portal,all){flushFog();send({t:'travel',portal,all:!!all})},
    flushFog,
    rename(name){send({t:'rename',name})},
    ping(){if(!send({t:'ping',at:Date.now()}))toast('No hay conexión con el servidor')},
    terrain(op){if(!UI.scene||!window.D3)return;send({t:'terrain',scene:UI.scene.id,op:Object.assign({},op,{version:op.version!=null?op.version:window.D3.version()})})},
    requestImage(){},
    sendRaw:send
  };
  return api;
})();
function flushFog(){
  if(UI.realRole==='gm'||!UI.scene||!Net.synced)return;
  for(const f of takeDirtyFog())Net.sendRaw({t:'fog',scene:UI.scene.id,cx:f.cx,cy:f.cy,data:f.data});
}
setInterval(flushFog,3000);
window.addEventListener('pagehide',flushFog);
function remoteChanged(scene){
  requestRender();
  clearTimeout(panelTimer);panelTimer=setTimeout(()=>{refreshPanels();if(scene){renderEnv();syncSceneInputs();if(is25()&&window.D3&&window.D3.isMounted())window.D3.setEnv(S.env,S.ambient)}},60);
}
let liveTimer=0;function renderLiveSoon(){clearTimeout(liveTimer);liveTimer=setTimeout(()=>{if(typeof renderLive==='function')renderLive()},60)}

/* Movimiento remoto suave y aviso de quién movió cada ficha */
const smoothMoves=new Map(),remoteMarks=new Map();
/* Suavizado continuo: lo que llega de otros (fichas, luces, cursores) no salta a su posición
   nueva ni se detiene entre paquetes; persigue el objetivo con un retardo de ~SMOOTH_TAU ms.
   Cuanto más lejos está, más rápido va, así que nunca se queda atrás de forma visible. */
const SMOOTH_TAU=70;
function chase(state,tx,ty){
  const now=performance.now();
  if(state.last==null){state.x=tx;state.y=ty;state.last=now;return false}
  const dt=Math.min(100,now-state.last);state.last=now;
  const k=1-Math.exp(-dt/SMOOTH_TAU);
  state.x+=(tx-state.x)*k;state.y+=(ty-state.y)*k;
  if(Math.hypot(tx-state.x,ty-state.y)<.35){state.x=tx;state.y=ty;return false}
  requestRender();return true;
}
function cursorPos(cur){
  if(cur.x==null)return cur;
  if(!cur.s)cur.s={};
  chase(cur.s,cur.x,cur.y);
  return{x:cur.s.x,y:cur.s.y};
}
function displayPos(t){
  const m=smoothMoves.get(t.id);if(!m)return t;
  if(!chase(m,t.x,t.y)){smoothMoves.delete(t.id);return t}
  return{x:m.x,y:m.y};
}
function drawRemoteMarks(c,player){
  const now=performance.now();
  for(const[id,m]of remoteMarks){
    if(now>m.until){remoteMarks.delete(id);continue}
    const t=S.tokens.find(x=>x.id===id);if(!t||(player&&!visibleToPlayers(t)))continue;
    const P=displayPos(t),r=tokenRadius(t)+px(7),a=Math.min(1,(m.until-now)/500);
    c.save();c.globalAlpha=a;c.strokeStyle=m.color;c.lineWidth=px(3);c.beginPath();c.arc(P.x,P.y,r,0,Math.PI*2);c.stroke();
    c.font=`600 ${px(11)}px "Alegreya Sans", system-ui, sans-serif`;const w=c.measureText(m.name).width;
    c.fillStyle=m.color;roundRect(c,P.x-w/2-px(6),P.y-r-px(20),w+px(12),px(17),px(5));c.fill();
    c.fillStyle='#1C2226';c.textAlign='center';c.textBaseline='middle';c.fillText(m.name,P.x,P.y-r-px(11.5));c.restore();
    requestRender();
  }
}
function drawPeers(c){
  if(!Net.showCursors)return;
  for(const p of Net.peers){
    if(!p.cur)continue;
    if(!isGM()&&p.role==='gm')continue; // el cursor del director no delata lo que mira
    const P=cursorPos(p.cur),x=P.x,y=P.y,s=px(1);
    c.save();c.translate(x,y);c.scale(s,s);
    c.beginPath();c.moveTo(0,0);c.lineTo(0,18);c.lineTo(5,13.5);c.lineTo(9,21);c.lineTo(12,19.5);c.lineTo(8.5,12.5);c.lineTo(14,12.5);c.closePath();
    c.fillStyle=p.color;c.fill();c.strokeStyle='#1C2226';c.lineWidth=1.5;c.stroke();
    c.font='600 12px "Alegreya Sans", system-ui, sans-serif';const w=c.measureText(p.name).width;
    c.fillStyle=p.color;roundRect(c,14,18,w+12,19,6);c.fill();c.fillStyle='#1C2226';c.textBaseline='middle';c.fillText(p.name,20,28);
    c.restore();
  }
}
