'use strict';
/* Arranque: sesión por nombre, panel de tableros y navegación entre vistas */
const App={user:null,boards:[]};
const views={login:$('#loginView'),dash:$('#dashView'),app:$('#app')};
function show(v){
  for(const[k,el]of Object.entries(views))el.hidden=k!==v;
  if(v==='app'){resize();requestAnimationFrame(resize)}
}

/* ---------- sesión ---------- */
function showLogin(){
  show('login');
  $('#loginInvite').hidden=!sessionStorage.getItem('invitar');
  setTimeout(()=>$('#loginName').focus(),50);
}
function setLoginMode(mode){
  const form=$('#loginForm');form.dataset.mode=mode;
  for(const t of form.querySelectorAll('.gateTab'))t.setAttribute('aria-selected',String(t.dataset.mode===mode));
  for(const n of form.querySelectorAll('.gateNote'))n.hidden=n.dataset.for!==mode;
  $('#loginSubmit').textContent={register:'Crear cuenta y entrar',recover:'Cambiar contraseña y entrar'}[mode]||'Entrar';
  $('#loginPassword').autocomplete=mode==='login'?'current-password':'new-password';
  $('#loginPasswordLabel').textContent=mode==='recover'?'Contraseña nueva':'Contraseña';
  $('#loginCodeField').hidden=mode!=='recover';$('#loginCode').required=mode==='recover';
  $('#loginError').textContent='';
}
$('#forgotBtn').onclick=()=>{setLoginMode('recover');$('#loginCode').focus()};
$('#backToLoginBtn').onclick=()=>setLoginMode('login');
for(const t of document.querySelectorAll('#loginForm .gateTab'))t.onclick=()=>setLoginMode(t.dataset.mode);
$('#loginForm').onsubmit=e=>{
  e.preventDefault();
  const form=$('#loginForm');
  withBusy(form,async()=>{
    const name=$('#loginName').value.trim(),password=$('#loginPassword').value;
    const mode=form.dataset.mode;
    $('#loginError').textContent='';
    try{
      const url={register:'/api/register',recover:'/api/recover'}[mode]||'/api/login';
      const payload={name,password};if(mode==='recover')payload.code=$('#loginCode').value.trim();
      const d=await apiJson(url,{method:'POST',body:JSON.stringify(payload)});
      $('#loginPassword').value='';$('#loginCode').value='';
      App.user=d.user;
      if(mode==='recover')toast('Contraseña cambiada',2200);
      await afterLogin();
      if(d.recovery_code)showRecoveryCode(d.recovery_code);
    }catch(err){$('#loginError').textContent=err.message}
  });
};
$('#logoutBtn').onclick=async()=>{
  try{await apiJson('/api/logout',{method:'POST'})}catch(e){}
  App.user=null;leaveBoard(true);location.hash='#/';showLogin();
};
$('#userColor').oninput=e=>{clearTimeout($('#userColor').t);$('#userColor').t=setTimeout(async()=>{try{const d=await apiJson('/api/me',{method:'PATCH',body:JSON.stringify({color:e.target.value})});App.user=d.user}catch(err){toast(err.message)}},300)};
function renderUserChip(){$('#userName').textContent=App.user.name;$('#userColor').value=App.user.color}

/* ---------- perfil: código de recuperación y contraseña ---------- */
async function copyText(text,okMsg){try{await navigator.clipboard.writeText(text);toast(okMsg||'Copiado',1400)}catch(e){toast('No se pudo copiar; selecciónalo a mano',2200)}}
function showRecoveryCode(code){
  const pop=$('#recoveryPop');$('#recoveryCodeNew').textContent=code;pop.hidden=false;
  pop.style.left='50%';pop.style.top='20%';pop.style.transform='translateX(-50%)';
  $('#recoveryCopyNew').onclick=()=>copyText(code,'Código copiado');
  $('#recoveryOk').onclick=()=>{pop.hidden=true};
}
let recoveryCache=null;
async function openProfile(){
  const pop=$('#profilePop');pop.hidden=false;pop.style.left='50%';pop.style.top='12%';pop.style.transform='translateX(-50%)';
  const codeEl=$('#recoveryCode');codeEl.dataset.shown='0';codeEl.textContent='••••-••••-••••';
  try{recoveryCache=(await apiJson('/api/me/recovery')).recovery_code}catch(err){toast(err.message)}
}
$('#profileBtn').onclick=openProfile;
$('#profileClose').onclick=()=>{$('#profilePop').hidden=true};
$('#recoveryShow').onclick=()=>{const el=$('#recoveryCode');const show=el.dataset.shown!=='1';el.dataset.shown=show?'1':'0';el.textContent=show&&recoveryCache?recoveryCache:'••••-••••-••••'};
$('#recoveryCopy').onclick=()=>{if(recoveryCache)copyText(recoveryCache,'Código copiado')};
$('#recoveryNew').onclick=()=>withBusy($('#recoveryNew'),async()=>{
  if(!confirm('El código actual dejará de valer. ¿Generar otro?'))return;
  try{recoveryCache=(await apiJson('/api/me/recovery',{method:'POST'})).recovery_code;$('#recoveryCode').dataset.shown='1';$('#recoveryCode').textContent=recoveryCache;toast('Código nuevo; guárdalo',2200)}catch(err){toast(err.message)}
});
$('#passwordForm').onsubmit=e=>{
  e.preventDefault();
  withBusy($('#passwordForm'),async()=>{
    try{await apiJson('/api/me/password',{method:'POST',body:JSON.stringify({current:$('#pwCurrent').value,password:$('#pwNew').value})});$('#pwCurrent').value='';$('#pwNew').value='';toast('Contraseña cambiada',2000)}
    catch(err){toast(err.message,2600)}
  });
};

async function afterLogin(){
  renderUserChip();
  const inv=sessionStorage.getItem('invitar');
  if(inv){
    sessionStorage.removeItem('invitar');
    try{const d=await apiJson('/api/join',{method:'POST',body:JSON.stringify({code:inv})});toast(`Te uniste a «${d.board.name}»`,2600);location.hash='#/tablero/'+d.board.id;return route()}
    catch(err){toast(err.message,2600)}
  }
  route();
}

/* ---------- navegación ---------- */
function route(){
  if(!App.user)return showLogin();
  const m=location.hash.match(/^#\/tablero\/([\w-]+)/);
  if(m)openBoardView(m[1]);
  else{leaveBoard(true);showDashboard()}
}
window.addEventListener('hashchange',route);

async function showDashboard(){
  show('dash');document.title='Just Another VTT';
  try{const d=await apiJson('/api/boards');App.boards=d.boards;renderDash()}
  catch(err){if(err.status===401){App.user=null;showLogin()}else toast(err.message)}
}
function ago(ts){
  const s=Math.max(0,(Date.now()-ts)/1000);
  if(s<60)return 'ahora mismo';
  if(s<3600)return `hace ${Math.round(s/60)} min`;
  if(s<86400)return `hace ${Math.round(s/3600)} h`;
  const d=Math.round(s/86400);return d===1?'ayer':`hace ${d} días`;
}
function renderDash(){
  const gm=App.boards.filter(b=>b.role==='gm'),pl=App.boards.filter(b=>b.role!=='gm');
  const fill=(el,list,empty)=>{
    el.innerHTML='';
    if(!list.length){el.innerHTML=`<div class="empty">${empty}</div>`;return}
    for(const b of list){
      const card=document.createElement('article');card.className='boardCard';
      const h=document.createElement('h3');h.textContent=b.name;
      const meta=document.createElement('div');meta.className='meta';
      meta.textContent=`${b.members} ${b.members===1?'miembro':'miembros'}, ${b.scenes} ${b.scenes===1?'escena':'escenas'}, actualizado ${ago(b.updated_at)}`+(b.role==='gm'?'':`. Dirige ${b.owner_name}`);
      const row=document.createElement('div');row.className='row';
      const open=document.createElement('a');open.className='btn primary';open.href='#/tablero/'+b.id;open.textContent='Abrir';open.style.textDecoration='none';
      const sp=document.createElement('span');sp.className='grow';
      const del=document.createElement('button');del.className='btn ghost danger';
      del.textContent=b.role==='gm'?'Eliminar':'Salir';
      let armed=false;
      del.onclick=async()=>{
        if(!armed){armed=true;del.textContent=b.role==='gm'?'¿Eliminar para todos?':'¿Salir del tablero?';del.classList.add('on');setTimeout(()=>{armed=false;del.textContent=b.role==='gm'?'Eliminar':'Salir';del.classList.remove('on')},3500);return}
        try{await apiJson('/api/boards/'+b.id,{method:'DELETE'});toast(b.role==='gm'?'Tablero eliminado':'Has salido del tablero');showDashboard()}catch(err){toast(err.message)}
      };
      row.append(open,sp,del);card.append(h,meta,row);el.appendChild(card);
    }
  };
  fill($('#gmBoards'),gm,'Todavía no diriges ningún tablero. Crea uno arriba.');
  fill($('#playerBoards'),pl,'Aún no juegas en ningún tablero. Pide un código de invitación al director.');
}
$('#newBoardForm').onsubmit=e=>{
  e.preventDefault();
  withBusy($('#newBoardForm'),async()=>{
    const name=$('#newBoardName').value.trim();
    try{
      const d=await apiJson('/api/boards',{method:'POST',body:JSON.stringify({name})});
      $('#newBoardName').value='';
      location.hash='#/tablero/'+d.board.id;
    }catch(err){toast(err.message)}
  });
};
$('#joinForm').onsubmit=e=>{
  e.preventDefault();
  withBusy($('#joinForm'),async()=>{
    try{const d=await apiJson('/api/join',{method:'POST',body:JSON.stringify({code:$('#joinCode').value})});$('#joinCode').value='';toast(`Te uniste a «${d.board.name}»`);location.hash='#/tablero/'+d.board.id}
    catch(err){toast(err.message,2600)}
  });
};

/* ---------- tablero ---------- */
let openBoardId=null;
function openBoardView(id){
  show('app');
  if(openBoardId===id)return;
  leaveBoard(true);
  openBoardId=id;
  UI.board={id,name:''};UI.scene=null;UI.scenes=[];UI.selected=[];UI.act=null;UI.viewAs='party';
  loadState(blankState());resetExplored();
  $('#sceneName').value='Conectando…';
  selectTab('scene');
  Store.setBoard(id);
  Net.connect(id);
  renderLive();
}
function onBoardReady(){
  if(UI.realRole!=='gm'&&!S.tokens.some(ownsToken))setTimeout(()=>toast('Crea tu personaje en la pestaña Fichas o espera a que el director te asigne uno.',3600),600);
}
function leaveBoard(silent){
  if(!openBoardId)return;
  openBoardId=null;
  Net.disconnect();Store.setBoard(null);
  UI.board=null;UI.realRole='player';UI.scene=null;UI.scenes=[];UI.where={};closeScenePop();renderScenes();
  closePops();loadState(blankState());
  if(!silent&&location.hash!=='#/')location.hash='#/';
}
$('#backBtn').onclick=()=>{location.hash='#/'};

/* ---------- arranque ---------- */
(async function boot(){
  hydrate();
  new ResizeObserver(resize).observe(stage);
  resize();
  requestAnimationFrame(loop);
  setTool('select');
  const params=new URLSearchParams(location.search);
  const inv=params.get('invitar');
  if(inv){sessionStorage.setItem('invitar',inv.trim().toUpperCase());history.replaceState(null,'',location.pathname+location.hash)}
  try{const d=await apiJson('/api/me');App.user=d.user;await afterLogin()}
  catch(e){showLogin()}
})();
window.JustAnotherVTT={S,UI,Store,Net,los,lightAt,canSee,viewers,visibleToPlayers,setRole,setTool,toWorld,toScreen};
