'use strict';
/* Clima 2D: único puente con WeatherFX (PixiJS). Las dos librerías (~480 KB) se cargan sólo cuando
   una escena tiene clima; la capa Pixi refracta cScene y va entre la escena y el brillo, así que la
   oscuridad y la niebla siguen encima sin deformarse. En 2.5D no hay clima: se destruye. */
const Weather=(()=>{
  const SCRIPTS=['js/vendor/pixi.min.js','js/vendor/weather-fx.js'];
  let fx=null,loading=null,pending=false,failed=false,key='';
  function loadScript(src){return new Promise((ok,ko)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>ko(new Error('no se pudo cargar '+src));document.head.appendChild(s)})}
  function load(){if(!loading)loading=SCRIPTS.reduce((p,src)=>p.then(()=>loadScript(src)),Promise.resolve());return loading}
  /* El clima que toca mostrar ahora, o null */
  function wanted(){const w=S.weather;return!is25()&&!failed&&w&&w.id&&w.id!=='none'&&WEATHERS[w.id]?w:null}
  function mount(){
    try{fx=new WeatherFX({container:stage,source:cv.scene})}
    catch(err){failed=true;fx=null;console.error(err);toast('Este navegador no puede mostrar el clima (sin WebGL)',4000);return}
    fx.app.resizeTo=null;   // el tamaño lo llevamos nosotros en invalidate(): el ResizePlugin renderizaría a medias
    const view=fx.app.view;view.id='cWeather';stage.insertBefore(view,cv.glow);fit();
    key='';apply();maskZones(wanted());requestRender();
  }
  /* Ajusta efecto y parámetros sólo si algo cambió (se llama en cada frame completo) */
  function apply(){
    const w=wanted();if(!w||!fx)return;
    const k=JSON.stringify([w.id,w.intensity,w.wind,S.animate,PERF.scale]);if(k===key)return;key=k;
    if(!fx.def||fx.def.id!==w.id)fx.use(w.id);
    // con calidad reducida se quita la refracción (el shader caro); las partículas siguen
    fx.set({intensity:w.intensity,wind:w.wind,refraction:PERF.scale<1?0:(fx.def.base&&fx.def.base.refraction!=null?fx.def.base.refraction:1)});
    fx.pause(!S.animate);
  }
  /* La librería pinta el mapa con 16 px de sobremedida por lado (_fitMap) para que el rayo y la refracción
     no enseñen el borde; aquí eso escalaría la copia refractada y desalinearía muros, luz y controles,
     que van encima sin refractar. Ajuste exacto: el borde desplazado se ve transparente un instante. */
  function fit(){fx.mapSprite.position.set(0,0);fx.mapSprite.width=fx.w;fx.mapSprite.height=fx.h}
  /* Zonas interiores: bajo techo no hay clima salvo que el director marque el tipo en weather.indoor.
     Máscara = pantalla entera menos cada zona (rect o polígono) en píxeles de pantalla, con la cámara del
     2D (misma transformación que setWorld). Dentro la capa es transparente y se ve cScene intacto. */
  function indoors(w){return !!(w.indoor&&w.indoor[w.id])}
  let maskG=null;
  function maskZones(w){
    if(indoors(w)||!S.zones.length){if(fx.scene.mask){fx.scene.mask=null;maskG.clear()}return}
    if(!maskG){maskG=new PIXI.Graphics();fx.app.stage.addChild(maskG)}
    const g=maskG;const sx=x=>W/2+(x-UI.cam.x)*UI.cam.zoom,sy=y=>H/2+(y-UI.cam.y)*UI.cam.zoom;
    // el rectángulo exterior sobresale de la pantalla y cada zona se recorta a ella: un agujero que no esté
    // contenido en la figura rompe la triangulación de Pixi (cuñas al desplazar el tablero)
    g.clear();g.beginFill(0xffffff);g.drawRect(-64,-64,fx.w+128,fx.h+128);
    for(const z of S.zones){
      const pts=z.pts&&z.pts.length>2?z.pts.map(p=>({x:sx(p.x),y:sy(p.y)})):[{x:sx(z.x),y:sy(z.y)},{x:sx(z.x+z.w),y:sy(z.y)},{x:sx(z.x+z.w),y:sy(z.y+z.h)},{x:sx(z.x),y:sy(z.y+z.h)}];
      const poly=clipPolyRect(pts,0,0,fx.w,fx.h);if(poly.length<3)continue;
      g.beginHole();g.drawPolygon(poly.flatMap(p=>[p.x,p.y]));g.endHole();
    }
    g.endFill();
    fx.scene.mask=g;
  }
  /* Recorte de un polígono a un rectángulo (Sutherland–Hodgman): un lado cada vez */
  function clipPolyRect(pts,x0,y0,x1,y1){
    let out=pts;
    for(const[inside,cut]of[[p=>p.x>=x0,(a,b)=>{const t=(x0-a.x)/(b.x-a.x);return{x:x0,y:a.y+(b.y-a.y)*t}}],[p=>p.x<=x1,(a,b)=>{const t=(x1-a.x)/(b.x-a.x);return{x:x1,y:a.y+(b.y-a.y)*t}}],[p=>p.y>=y0,(a,b)=>{const t=(y0-a.y)/(b.y-a.y);return{x:a.x+(b.x-a.x)*t,y:y0}}],[p=>p.y<=y1,(a,b)=>{const t=(y1-a.y)/(b.y-a.y);return{x:a.x+(b.x-a.x)*t,y:y1}}]]){
      const src=out;out=[];if(!src.length)break;
      for(let i=0;i<src.length;i++){const a=src[i],b=src[(i+1)%src.length],ia=inside(a),ib=inside(b);
        if(ia)out.push(a);
        if(ia!==ib)out.push(cut(a,b));}
    }
    return out;
  }
  function unmount(){if(!fx)return;fx.destroy();fx=null;maskG=null;key='';const v=$('#cWeather');if(v)v.remove()}
  function sync(){
    const w=wanted();
    if(!w){unmount();return}
    if(fx){apply();maskZones(w);return}
    if(pending)return;pending=true;
    load().then(()=>{pending=false;if(!fx&&wanted())mount()}).catch(err=>{pending=false;failed=true;console.error(err);toast('No se pudo cargar el clima: '+err.message,4000)});
  }
  /* cScene cambia de tamaño con la ventana, los paneles y la calidad (dpr). Todo el reajuste va aquí, justo
     después de drawScene (canvas ya pintado) y sin renderizar: `renderer.resize` (no `app.resize`, que
     renderiza en el acto con textura, sprite y uniformes viejos → un frame estirado con la aberración
     cromática disparada). Orden: renderer → filtros/malla (fx.resize) → textura (`resource.update` relee
     el tamaño del canvas; `baseTexture.update()` no lo haría y Pixi subiría un canvas mayor que la textura:
     GL_INVALID_VALUE) → sprite (`width=` usa el tamaño de textura del momento y no escucha cambios). */
  function invalidate(){
    if(!fx||!fx.sourceTexture)return;
    const resized=fx.app.screen.width!==W||fx.app.screen.height!==H;
    if(resized){fx.app.renderer.resize(W,H);fx.resize()}
    fx.sourceTexture.baseTexture.resource.update();
    if(resized||fx.mapSprite.x!==0)fit();   // fx.resize() de la librería (resize de ventana) vuelve a la sobremedida
  }
  function resize(){requestRender()}   // el reajuste real ocurre en invalidate(), tras drawScene
  const mounted=()=>!!fx;
  return{sync,invalidate,resize,mounted,clipPolyRect};
})();
