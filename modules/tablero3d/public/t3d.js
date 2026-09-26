'use strict';
/* Tablero3D: punto de entrada del cliente del módulo tablero 3D (servido en /t3d/).
   El anfitrión (este repo o Just Another VTT) carga sólo este archivo; el resto (estilos,
   marcado, three.js, visión, adaptador de la mesa y motor) se carga al montar.
   Globales que añade el módulo: `Tablero3D` y, al montar, `THREE` (three.js r128). Nada más. */
(function(){
  const T=window.Tablero3D=window.Tablero3D||{};
  const script=document.currentScript;
  const BASE=script&&script.src?new URL('.',script.src).href:'/t3d/';
  /* sub-sección del motor → pestaña y sección plegable que la contiene ('live' = la pestaña del anfitrión con el hueco «live») */
  const REVEAL={tool:['t3d-scene','t3d-herramienta'],sheet:['t3d-tokens','t3d-ficha'],turns:['t3d-game','t3d-turnos'],dice:['t3d-game','t3d-dados'],
    measure:['t3d-game','t3d-medir'],game:['t3d-game',null],camp:['t3d-camp','t3d-campana'],table:['live','t3d-mesa']};
  let assets=null;

  function loadScript(src){return new Promise((ok,bad)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>bad(new Error('No se pudo cargar '+src));document.head.appendChild(s)})}
  function loadCss(href){
    if([...document.querySelectorAll('link[rel=stylesheet]')].some(l=>l.href===href))return Promise.resolve();
    return new Promise((ok,bad)=>{const l=document.createElement('link');l.rel='stylesheet';l.href=href;l.onload=ok;l.onerror=()=>bad(new Error('No se pudo cargar '+href));document.head.appendChild(l)});
  }
  /* estilos + marcado en paralelo; los scripts en orden (el motor necesita THREE, la visión y el adaptador) */
  function loadAssets(){
    if(assets)return assets;
    assets=Promise.all([loadCss(BASE+'t3d.css'),fetch(BASE+'t3d.html').then(r=>{if(!r.ok)throw new Error('No se pudo cargar '+BASE+'t3d.html');return r.text()})])
      .then(async([,html])=>{
        if(typeof THREE==='undefined')await loadScript(BASE+'vendor/three.min.js');
        if(!T.Vision)await loadScript(BASE+'vision.js');
        if(!T.Fichas)await loadScript(BASE+'fichas.js');
        if(!T.Catalogo)await loadScript(BASE+'catalogo.js');
        if(!T.Muros)await loadScript(BASE+'muros.js');
        if(!T.Ambiente)await loadScript(BASE+'ambiente.js');
        if(!T.Ajustes)await loadScript(BASE+'ajustes.js');
        if(!T.Dados)await loadScript(BASE+'dados.js');
        if(!T.Personajes)await loadScript(BASE+'personajes.js');
        if(!T.createMesa)await loadScript(BASE+'mesa.js');
        if(!T.icons)await loadScript(BASE+'icons-t3d.js');
        addIcons();
        if(!T._engine)await loadScript(BASE+'tablero3d.js');
        return html;
      });
    assets.catch(()=>{assets=null});
    return assets;
  }

  /* Iconos: los del módulo que el catálogo del anfitrión (ICONS de JA-VTT) no trae se añaden a él sin
     pisar ninguno; si el anfitrión no tiene ICONS, el módulo los pinta con el mismo marcado que svgIcon. */
  const svg=p=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const hostIcons=()=>{try{return typeof ICONS==='object'&&ICONS?ICONS:null}catch(e){return null}};
  function addIcons(){const H=hostIcons();if(H)for(const k of Object.keys(T.icons||{}))if(!(k in H))H[k]=T.icons[k]}

  /* Conexión propia (/t3d/ws) cuando el anfitrión no da un `net` que reparta mensajes a módulos (JA-VTT):
     el mismo contrato que usa el adaptador de la mesa, con reconexión como la del Net del anfitrión. */
  function ownNet(boardId){
    const msgs=new Set(),changes=new Set();let ws=null,closed=false,retry=0,timer=0;
    // contadores y «Probar conexión»: el servidor contesta { t:'pong', at } al { t:'ping', at } de este cliente
    const stats={sent:0,recv:0},pings=new Map();
    const url=()=>{const u=new URL('ws',BASE);u.protocol=u.protocol==='https:'?'wss:':'ws:';u.searchParams.set('board',boardId);return u.href};
    function open(){
      const s=new WebSocket(url());ws=s;
      s.onopen=()=>{retry=0};
      s.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}stats.recv++;
        if(m&&m.t==='pong'){const p=pings.get(m.at);if(p){pings.delete(m.at);p(Date.now()-m.at)}return}
        msgs.forEach(f=>{try{f(m)}catch(x){}})};
      s.onclose=e=>{
        if(ws!==s)return;ws=null;changes.forEach(f=>{try{f('status','closed')}catch(x){}});
        if(!closed&&e.code!==4403&&e.code!==4404)timer=setTimeout(open,Math.min(8000,800*2**retry++));
      };
    }
    open();
    return{onMessage(f){msgs.add(f);return()=>msgs.delete(f)},onChange(f){changes.add(f);return()=>changes.delete(f)},
      sendRaw(o){if(ws&&ws.readyState===1){ws.send(JSON.stringify(o));stats.sent++;return true}return false},
      get connected(){return !!ws&&ws.readyState===1},
      get stats(){return{...stats}},
      /* ida y vuelta al servidor en ms; falla sin conexión o si no contesta en 5 s */
      ping(){return new Promise((ok,bad)=>{
        if(!ws||ws.readyState!==1)return bad(new Error('Sin conexión con el tablero 3D'));
        let at=Date.now();while(pings.has(at))at++;
        pings.set(at,ok);ws.send(JSON.stringify({t:'ping',at}));stats.sent++;
        setTimeout(()=>{if(pings.delete(at))bad(new Error('El tablero 3D no respondió'))},5000);
      })},
      close(){closed=true;clearTimeout(timer);if(ws){const s=ws;ws=null;s.close()}}};
  }

  /**
   * Monta el tablero 3D de un tablero en `root`.
   *
   * @param {HTMLElement} root  Contenedor de la vista del tablero del anfitrión. Recibe la clase
   *   `t3d-root` (todos los estilos del módulo cuelgan de ella) y, mientras el rol sea jugador,
   *   `t3d-player` (oculta lo que lleva `t3d-gm`).
   * @param {object} opts
   * @param {string}  opts.boardId  Id del tablero (el de `public.boards`).
   * @param {object}  [opts.net]    Opcional. Sin él (JA-VTT), el módulo abre su propia conexión a
   *   `/t3d/ws?board=<id>` (servidor: `t3d.socket`) al montar y la cierra al desmontar.
   *   Con él, el `Net` del anfitrión reparte la mesa por su WebSocket (este repo; servidor:
   *   `t3d.join/ws/leave`). Contrato: `onMessage(fn) → quitar` (cada mensaje del servidor, ya
   *   parseado), `onChange(fn) → quitar` (avisos `('status','closed')` al caerse la conexión),
   *   `sendRaw(obj) → boolean`, `connected`. Montar ANTES de `net.connect(boardId)`: el adaptador
   *   guarda los mensajes que llegan mientras se descargan los scripts y los reproduce en orden;
   *   necesita el `state` que el servidor manda al entrar, así que para volver a montar hay que
   *   reconectar (`disconnect`, `mount`, `connect`).
   * @param {object}  [opts.user]   Usuario actual `{id,name,color}` (hasta que llegue el `state`).
   * @param {string}  [opts.role]   'gm' | 'player' inicial; manda el `state` del servidor.
   * @param {function(string):string} [opts.icon]  Nombre Lucide → SVG. Por defecto `window.svgIcon`
   *   del anfitrión. Los iconos que el módulo usa y el catálogo de JA-VTT no trae viajan con el
   *   módulo (`icons-t3d.js`) y se añaden al `ICONS` del anfitrión sin pisar ninguno.
   * @param {function(string,boolean)} [opts.showTab]  Gancho de pestañas del anfitrión: muestra la
   *   pestaña `name` del panel lateral; `reveal` pide abrir el panel si está plegado (móvil).
   * @param {function(HTMLElement)} [opts.onDom]  Se llama cuando el marcado del módulo ya está en
   *   su sitio y antes de arrancar el motor: el anfitrión aplica ahí sus convenciones (recordar
   *   secciones plegadas, elegir la pestaña guardada).
   *
   * Pestañas: el módulo NO tiene marco de pestañas propio. El anfitrión marca huecos con
   * `data-t3d-slot="<nombre>"` (idealmente con `display:contents`) y el módulo los rellena con
   * su marcado (t3d.html): `scene-button` y `actions` (cabecera), `stage` (raíl + lienzo),
   * `tabs` (botones `role=tab` con `data-tab="t3d-scene|t3d-tokens|t3d-game|t3d-camp"`, dentro de
   * la barra `.tabs` del anfitrión), `panes` (secciones `.tabpane` con `data-pane` igual al
   * `data-tab`), `live` y `live-end` (secciones dentro de la pestaña de participantes del
   * anfitrión) y `overlays` (ventanas y editor de dibujo). Un hueco que falte se añade al final de
   * `root`. El anfitrión cambia de pestaña al pulsar cualquier `[data-tab]` y el módulo le pide
   * mostrar una con `opts.showTab(name, reveal)`; la pestaña del hueco `live` es el `data-pane` de su
   * sección o, si no lo tiene, su id sin `tab-` (JA-VTT: `#tab-live` → 'live').
   *
   * @returns {{ready: Promise<void>, unmount: function(): void, status: function, ping: function, probe: function}} `ready`
   *   se cumple con el motor en marcha (o falla si no cargó). `status()` da `{ connected, sent, recv, render: { fps, ms,
   *   calls, triangles } }` (conexión del 3D y rendimiento del motor, para la pestaña Mesa → Conexión del anfitrión);
   *   `ping()` → Promise con la ida y vuelta en ms por la conexión propia `/t3d/ws`. `probe(consulta, ...)` es de sólo lectura y sólo para pruebas
   *   (`'tokens'`: las fichas con su tamaño; `'route', id, x, z`: coste del camino o null). `unmount()` para el motor (bucle, escuchas de ventana, WebGL),
   *   quita el marcado y suelta el `Net`; el anfitrión de este repo, aun así, recarga la página al
   *   cambiar de tablero, porque three.js y el motor dejan temporizadores sueltos y cachés que no se liberan del todo.
   */
  T.mount=function(root,opts){
    if(!root)throw new Error('Tablero3D.mount necesita un elemento');
    if(root.t3dMounted)throw new Error('Ya hay un tablero 3D montado en este elemento');
    const o=Object.assign({},opts);
    root.t3dMounted=true;root.classList.add('t3d-root');
    let dead=false,engine=null,mesa=null;const nodes=[],offs=[];
    const icon=n=>{const own=T.icons&&T.icons[n],H=hostIcons(),host=o.icon||window.svgIcon;return (!own||(H&&H[n]))&&host?host(n):svg(own||'')};
    /* los mensajes que llegan mientras se descargan los scripts se guardan y se reproducen */
    const queue=[];let sink=e=>queue.push(e);
    const net=o.net||ownNet(o.boardId);
    offs.push(net.onMessage(m=>sink(['msg',m])));
    offs.push(net.onChange((k,d)=>{if(k==='status')sink(['status',d])}));
    if(!o.net)offs.push(()=>net.close());
    const setRole=r=>root.classList.toggle('t3d-player',r!=='gm');
    setRole(o.role||'player');
    function hydrate(el){el.querySelectorAll('[data-ic]').forEach(b=>{if(b.dataset.icDone)return;b.insertAdjacentHTML('afterbegin',icon(b.dataset.ic));b.dataset.icDone='1'})}
    function fill(html){
      const box=document.createElement('div');box.innerHTML=html;
      for(const t of box.querySelectorAll('template[data-slot]')){
        const slot=root.querySelector(`[data-t3d-slot="${t.dataset.slot}"]`)||root;
        const frag=t.content.cloneNode(true);nodes.push(...frag.childNodes);slot.appendChild(frag);
      }
      hydrate(root);
    }
    const liveTab=()=>{const s=root.querySelector('[data-t3d-slot="live"]');const p=s&&s.closest('[data-pane],.tabpane');return p?p.dataset.pane||p.id.replace(/^tab-/,''):null};
    function reveal(sub){
      const r=REVEAL[sub]||REVEAL.game;const tab=r[0]==='live'?liveTab():r[0];
      if(tab&&o.showTab)o.showTab(tab,true);
      const fold=r[1]?root.querySelector(`details[data-fold="${r[1]}"]`):null;
      if(fold&&!fold.hidden){fold.open=true;if(sub!=='tool')fold.scrollIntoView({block:'nearest'})}
    }
    const ready=loadAssets().then(html=>{
      if(dead)return;
      fill(html);
      if(o.onDom)o.onDom(root);
      mesa=T.createMesa(net,{boardId:o.boardId,user:o.user,role:o.role,onRole:setRole});
      const pending=queue.splice(0);sink=e=>mesa.feed(e[0],e[1]);pending.forEach(e=>mesa.feed(e[0],e[1]));
      engine=T._engine({root,mesa:mesa.api,icon,reveal,$:id=>document.getElementById('t3d-'+id)});
    });
    /* Mesa → Conexión del anfitrión: estado de la conexión del 3D y del render; ping() sólo con la conexión propia */
    const status=()=>Object.assign({connected:!!net.connected},net.stats||{},engine&&engine.stats?{render:engine.stats()}:{});
    const ping=()=>net.ping?net.ping():Promise.reject(new Error('Este anfitrión no mide la conexión del tablero 3D'));
    return{ready,status,ping,probe:(...a)=>engine&&engine.probe?engine.probe(...a):null,unmount(){
      if(dead)return;dead=true;
      offs.forEach(f=>{try{f()}catch(e){}});
      if(engine&&engine.destroy)engine.destroy();
      if(mesa)mesa.destroy();
      nodes.forEach(n=>n.remove());
      root.classList.remove('t3d-root','t3d-player');delete root.t3dMounted;
    }};
  };
})();
