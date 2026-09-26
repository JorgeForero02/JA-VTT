'use strict';
/* Adaptador de la mesa: la interfaz de documentos que usa el motor 3D (`mesa.use('db' | 'room' |
   'user' | 'downloads')`) montada sobre el Net del anfitrión. Lo crea Tablero3D.mount; nada aquí
   es global salvo `Tablero3D.createMesa`.
   - collection('boards' | 'assets' | 'campaigns') → REST /api/t3d/boards/:id/scenes | drawings | campaigns
   - doc('live/<clave>') → mensajes `live` por WebSocket (con `ack`) y `doc` del servidor
   - room → mensajes `emit`, `presence` y `roll` (tiradas que hace el servidor); `peers` llega del servidor
   - board → ajustes del tablero 3D (los de JA-VTT: `state`, mensaje `settings`, REST …/settings) y portales: cruzar y
     reunir al grupo en la mesa en vivo (mensajes `travel`/`gather` con `ack`) o fuera de ella (REST …/travel, …/portals) */
(function(){
  const T=window.Tablero3D=window.Tablero3D||{};
  const COLLECTIONS={boards:'scenes',assets:'drawings',campaigns:'campaigns'};

  T.createMesa=function(net,o){
    const boardId=o.boardId;
    let me=o.user||null,role=o.role||'player',myPeer=null,members=[],online=[],peers=[],docs={},dead=false,settings=null;
    const setCbs=new Set(),setSettings=v=>{settings=v;setCbs.forEach(f=>{try{f(settings)}catch(e){}})};
    let resolveReady=null;const ready=new Promise(r=>{resolveReady=r});
    let reqSeq=0;const pending=new Map();
    const subs=new Map(),handlers={},peerCbs=new Set();
    const snap=(path,d)=>({id:path.split('/').pop(),exists:d!=null,data:()=>d==null?undefined:JSON.parse(JSON.stringify(d))});
    const notify=key=>(subs.get(key)||new Set()).forEach(cb=>{try{cb(snap('live/'+key,docs[key]))}catch(e){}});
    const decorate=p=>Object.freeze(Object.assign({},p,{kind:'viewer',guest:false,isMe:!!me&&p.by===String(me.id),sameTab:p.peer===myPeer}));
    const rejectAll=()=>{for(const p of pending.values())p.reject({code:'unavailable',message:'Sin conexión con el servidor'});pending.clear()};

    function onMessage(m){
      switch(m.t){
        case 'state':
          me=m.me;role=m.role;myPeer=m.peer;members=m.members||[];online=m.online||[];peers=(m.peers||[]).map(decorate);
          docs=m.live||{};for(const k of subs.keys())notify(k);
          if(m.settings)setSettings(m.settings);
          if(o.onRole)o.onRole(role);
          if(resolveReady){resolveReady(true);resolveReady=null}
          peerCbs.forEach(f=>{try{f({})}catch(e){}});return;
        case 'doc':
          if(m.data==null)delete docs[m.key];else docs[m.key]=m.data;notify(m.key);return;
        case 'ack':{
          const p=pending.get(m.req);if(!p)return;pending.delete(m.req);
          if(m.ok)p.resolve(m);else p.reject({code:'invalid_argument',message:m.error||'No permitido'});return;
        }
        case 'msg':
          (handlers[m.topic]||[]).forEach(h=>{try{h({topic:m.topic,data:m.data,peer:m.peer,by:m.by,isMe:!!me&&m.by===String(me.id),sameTab:m.peer===myPeer,kind:'viewer',guest:false})}catch(e){}});return;
        case 'peers':
          peers=(m.peers||[]).map(decorate);online=m.online||online;peerCbs.forEach(f=>{try{f({})}catch(e){}});return;
        case 'members':members=m.members||[];return;
        case 'settings':setSettings(m.settings);return;
      }
    }
    const send=x=>!dead&&net.sendRaw(x);
    function request(x){
      return new Promise((resolve,reject)=>{
        const req=++reqSeq;
        if(!send(Object.assign({req},x)))return reject({code:'unavailable',message:'Sin conexión con el servidor'});
        pending.set(req,{resolve,reject});
      });
    }

    /* ---------- almacenamiento: colecciones del tablero por REST ---------- */
    async function rest(method,url,body){
      const r=await fetch(url,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}).catch(()=>null);
      let d=null;if(r)try{d=await r.json()}catch(e){}
      if(!r||!r.ok){const s=r?r.status:0;throw {code:s===413?'quota_exceeded':s===403||s===400?'invalid_argument':'unavailable',message:(d&&d.error)||(s?`Error ${s}`:'Sin conexión con el servidor')}}
      return d;
    }
    function collection(name){
      const kind=COLLECTIONS[name];
      const base=()=>`/api/t3d/boards/${encodeURIComponent(boardId)}/${kind}`;
      const q={
        orderBy:()=>q,limit:()=>q,where:()=>q,
        async get(){
          if(!kind)return{docs:[],size:0};
          const d=await rest('GET',base());const list=d[kind]||[];
          const docsOut=list.map(x=>snap(name+'/'+(x.id||x.key),x));
          return{docs:docsOut,size:docsOut.length};
        },
        doc:id=>({id,path:name+'/'+id,
          get:async()=>{const l=await q.get();const f=l.docs.find(x=>x.id===id);return f||snap(name+'/'+id,null)},
          set:async d=>{await rest('PUT',`${base()}/${encodeURIComponent(id)}`,d)},
          update:async d=>{await rest('PUT',`${base()}/${encodeURIComponent(id)}`,d)},
          delete:async()=>{await rest('DELETE',`${base()}/${encodeURIComponent(id)}`)}
        })
      };
      return q;
    }
    function doc(path){
      const [coll,key]=path.split('/');
      if(coll!=='live')return collection(coll).doc(key);
      return{id:key,path,
        get:async()=>snap(path,docs[key]),
        set:d=>request({t:'live',key,op:'set',data:d}),
        update:d=>request({t:'live',key,op:'update',data:d}),
        delete:()=>request({t:'live',key,op:'delete'}),
        onSnapshot(cb){
          if(!subs.has(key))subs.set(key,new Set());subs.get(key).add(cb);
          setTimeout(()=>{try{cb(snap(path,docs[key]))}catch(e){}},0);
          return()=>subs.get(key).delete(cb);
        }};
    }

    /* ---------- mesa en vivo: momentos y presencia ---------- */
    const room={
      emit:async(topic,data)=>{send({t:'emit',topic,data})},
      on:(t,h)=>{(handlers[t]=handlers[t]||[]).push(h);return()=>{handlers[t]=handlers[t].filter(x=>x!==h)}},
      presence:async patch=>{send({t:'presence',patch})},
      // tirada con la notación de JA-VTT: la hace el servidor y llega a todos como el momento 'roll' (el ack trae el resultado)
      roll:(formula,label,adv)=>request({t:'roll',formula,label,adv}),
      peers:()=>peers,
      onPeers:f=>{peerCbs.add(f);return()=>peerCbs.delete(f)},
      connected:()=>!dead&&!!net.connected
    };
    const user={
      me:async()=>({id:String(me.id),name:me.name,color:me.color,email:null,avatarUrl:'',isOwner:role==='gm',canEdit:role==='gm'}),
      id:async()=>String(me.id),isOwner:async()=>role==='gm',canEdit:async()=>role==='gm',can:async()=>true,
      profiles:async ids=>{
        const out={};
        for(const id of ids||[]){const m=members.find(x=>String(x.id)===String(id))||online.find(x=>String(x.id)===String(id));out[id]={id,name:m?m.name:'',color:m?m.color:'#8EC5E8',isMe:!!me&&String(me.id)===String(id)}}
        return out;
      }
    };
    /* ---------- tablero: ajustes y portales ---------- */
    const bbase=()=>`/api/t3d/boards/${encodeURIComponent(boardId)}`;
    const board={
      settings:async()=>{if(!settings)setSettings((await rest('GET',bbase()+'/settings')).settings);return settings},
      onSettings:f=>{setCbs.add(f);return()=>setCbs.delete(f)},
      setSettings:async patch=>{const d=await rest('PATCH',bbase()+'/settings',patch);setSettings(d.settings);return settings},
      portals:sid=>rest('GET',`${bbase()}/scenes/${encodeURIComponent(sid)}/portals`),
      travel:x=>request(Object.assign({},x,{t:'travel'})),
      gather:x=>request(Object.assign({},x,{t:'gather'})),
      travelSaved:body=>rest('POST',bbase()+'/travel',body)
    };
    const downloads={save:async({filename,data})=>{
      const blob=data instanceof Blob?data:new Blob([data]);const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),8000);return{status:'saved'};
    }};

    return{
      /* lo que ve el motor */
      api:{use:async n=>{
        if(n==='downloads')return downloads;
        if(!(await ready))return null;
        if(n==='db')return{doc,collection};
        if(n==='room')return room;
        if(n==='user')return user;
        if(n==='board')return board;
        return null;
      }},
      /* lo que le da Tablero3D.mount: mensajes del servidor y avisos de estado del Net */
      feed(kind,data){if(dead)return;if(kind==='msg')onMessage(data);else if(kind==='status'&&data==='closed')rejectAll()},
      destroy(){dead=true;rejectAll();if(resolveReady){resolveReady(false);resolveReady=null}}
    };
  };
})();
