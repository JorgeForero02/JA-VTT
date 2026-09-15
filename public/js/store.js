'use strict';
/* Biblioteca de imágenes del tablero. Los archivos viven en SQLite en el
   servidor; aquí se listan, se suben con progreso real y se sirven por URL. */
const CATS={
  board:{name:'Tableros',one:'Tablero',icon:'map'},
  prop:{name:'Objetos',one:'Objeto',icon:'armchair'},
  pc:{name:'Personajes',one:'Personaje',icon:'circle-user-round'},
  npc:{name:'Enemigos',one:'Enemigo',icon:'skull'}
};
async function apiJson(url,opt){
  const r=await fetch(url,Object.assign({credentials:'same-origin',headers:{'Content-Type':'application/json'}},opt||{}));
  let d=null;try{d=await r.json()}catch(e){}
  if(!r.ok){const err=new Error((d&&d.error)||`Error ${r.status}`);err.status=r.status;throw err}
  return d;
}
const Store=(()=>{
  let boardId=null,metas=new Map(),usage={count:0,bytes:0,quota:0},ready=Promise.resolve();
  const listeners=new Set();
  const emit=(kind,id)=>listeners.forEach(fn=>{try{fn(kind,id)}catch(e){}});
  const toMeta=m=>({id:m.id,name:m.name,category:m.category,type:m.mime,size:m.size,width:m.width,height:m.height,ppc:m.ppc||0,
    cellsW:m.ppc?Math.round(m.width/m.ppc*100)/100:0,cellsH:m.ppc?Math.round(m.height/m.ppc*100)/100:0,
    thumb:`/api/images/${m.id}/thumb`,createdAt:m.created_at,origin:m.origin,sample:!m.board_id,owner:m.owner_id});
  async function refresh(){
    if(!boardId)return;
    const id=boardId;const d=await apiJson(`/api/boards/${id}/images`);
    if(id!==boardId)return;
    metas=new Map(d.images.map(m=>[m.id,toMeta(m)]));usage=d.usage;emit('load');
  }
  async function decode(blob){
    if(window.createImageBitmap){try{return await createImageBitmap(blob)}catch(e){}}
    return await new Promise((res,rej)=>{const u=URL.createObjectURL(blob);const im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=()=>rej(new Error('No se pudo leer la imagen'));im.src=u});
  }
  function thumbOf(bmp){const k=Math.min(1,168/Math.max(bmp.width,bmp.height));const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(bmp.width*k));cv.height=Math.max(1,Math.round(bmp.height*k));cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);return cv.toDataURL('image/webp',.8)}
  const readAsDataUrl=blob=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(fr.error);fr.readAsDataURL(blob)});
  function postWithProgress(url,body,onProgress){
    return new Promise((res,rej)=>{
      const x=new XMLHttpRequest();x.open('POST',url);x.setRequestHeader('Content-Type','application/json');x.withCredentials=true;
      x.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(.1+.85*e.loaded/e.total)};
      x.onload=()=>{let d=null;try{d=JSON.parse(x.responseText)}catch(e){}if(x.status>=200&&x.status<300)res(d);else rej(new Error((d&&d.error)||`Error ${x.status}`))};
      x.onerror=()=>rej(new Error('No se pudo conectar con el servidor'));
      x.send(body);
    });
  }
  const api={
    get ready(){return ready},
    setBoard(id){boardId=id;metas=new Map();usage={count:0,bytes:0,quota:0};ready=id?refresh().catch(()=>{}):Promise.resolve();emit('load');return ready},
    refresh:()=>refresh().catch(()=>{}),
    get persistent(){return true},
    list(cat){return[...metas.values()].filter(m=>!cat||cat==='all'||m.category===cat).sort((a,b)=>(a.sample-b.sample)||(b.createdAt-a.createdAt))},
    meta:id=>metas.get(id)||null,
    has:id=>metas.has(id),
    publicUrl:id=>`${location.origin}/api/images/${id}`,
    usage:()=>Object.assign({},usage),
    onChange(fn){listeners.add(fn);return()=>listeners.delete(fn)},
    async upload(file,{category,name,onProgress}={}){
      if(!boardId)throw new Error('Abre un tablero primero');
      if(!file||!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw new Error('Solo PNG, JPG, WebP o GIF');
      if(file.size>15*1024*1024)throw new Error('La imagen supera 15 MB');
      onProgress&&onProgress(.03);
      const bmp=await decode(file);
      const g=gridFromName(file.name||'',bmp.width,bmp.height);
      const body=JSON.stringify({
        name:(name||file.name||'imagen').replace(/\.[^.]+$/,'').replace(/_+/g,' ').slice(0,40),
        category:category||'prop',width:bmp.width,height:bmp.height,ppc:g.ppc||0,
        thumb:thumbOf(bmp),data:await readAsDataUrl(file)
      });
      const d=await postWithProgress(`/api/boards/${boardId}/images`,body,onProgress);
      await refresh();onProgress&&onProgress(1);
      return metas.get(d.image.id)||toMeta(d.image);
    },
    async uploadDataUrl(dataUrl,meta){
      const blob=await(await fetch(dataUrl)).blob();
      const file=new File([blob],(meta&&meta.name)||'imagen',{type:blob.type});
      return api.upload(file,{category:meta&&meta.category,name:meta&&meta.name});
    },
    async objectUrl(id){return `/api/images/${id}`},
    async dataUrl(id){const r=await fetch(`/api/images/${id}`,{credentials:'same-origin'});if(!r.ok)return null;return readAsDataUrl(await r.blob())},
    async update(id,patch){await apiJson(`/api/images/${id}`,{method:'PATCH',body:JSON.stringify(patch)});await refresh();emit('update',id)},
    async remove(id){await apiJson(`/api/images/${id}`,{method:'DELETE'});await refresh();emit('remove',id)}
  };
  return api;
})();

/* Imágenes listas para dibujar, cargadas bajo demanda desde el servidor */
const imgWaiting=new Map(),imgMissing=new Set();
function imgPending(id){return !!id&&imgWaiting.has(id)}
function getImg(id){
  if(!id)return null;
  let im=IMG.get(id);
  if(im)return im.complete&&im.naturalWidth?im:null;
  im=new Image();IMG.set(id,im);imgWaiting.set(id,Date.now());
  im.onload=()=>{imgWaiting.delete(id);imgMissing.delete(id);requestRender()};
  im.onerror=()=>{imgWaiting.delete(id);imgMissing.add(id);requestRender()};
  im.src=`/api/images/${encodeURIComponent(id)}`;
  return null;
}
Store.onChange((kind,id)=>{
  if(kind==='load')for(const m of imgMissing)if(Store.has(m)){IMG.delete(m);imgMissing.delete(m)}
  if(kind==='remove'&&id)IMG.delete(id);
  requestRender();
  if(typeof renderLibraryGrid==='function')renderLibraryGrid();
});
const fmtBytes=b=>b<1024?b+' B':b<1048576?(b/1024).toFixed(0)+' KB':(b/1048576).toFixed(1)+' MB';
function imageUses(id){return[...S.assets,...S.tokens].filter(o=>o.img===id).length}

/* Lee la escala del nombre del archivo, como hacen los mapas comerciales:
   "Mapa - 14x15 - 72 DPI.png" -> 14 × 15 casillas, 72 px por casilla */
function gridFromName(name,w,h){
  const n=name.replace(/\.[^.]+$/,'');
  const cm=n.match(/(\d{1,3})\s*[x×]\s*(\d{1,3})(?!\d)/i);
  const dm=n.match(/(\d{2,4})\s*(?:dpi|ppi|px)/i);
  let ppc=0,cellsW=0,cellsH=0;
  if(cm){cellsW=+cm[1];cellsH=+cm[2];ppc=w/cellsW;if(Math.abs(h/cellsH-ppc)>ppc*.08){const alt=w/cellsH;if(Math.abs(h/cellsW-alt)<alt*.08){ppc=alt;[cellsW,cellsH]=[cellsH,cellsW]}}}
  if(dm&&!cm)ppc=+dm[1];
  if(ppc&&!cellsW){cellsW=Math.round(w/ppc*100)/100;cellsH=Math.round(h/ppc*100)/100}
  return{ppc:Math.round(ppc*100)/100,cellsW,cellsH};
}
