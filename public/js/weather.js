'use strict';
/* Clima 2D: único puente con WeatherFX (PixiJS). Las dos librerías (~480 KB) se cargan sólo cuando
   una escena tiene clima; la capa Pixi refracta cScene y va entre la escena y el brillo, así que la
   oscuridad y la niebla siguen encima sin deformarse. */
const Weather=(()=>{
  const SCRIPTS=['js/vendor/pixi.min.js','js/vendor/weather-fx.js'];
  let fx=null,loading=null,pending=false,failed=false,key='';
  function loadScript(src){return new Promise((ok,ko)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>ko(new Error('no se pudo cargar '+src));document.head.appendChild(s)})}
  function load(){if(!loading)loading=SCRIPTS.reduce((p,src)=>p.then(()=>loadScript(src)),Promise.resolve());return loading}
  /* El clima que toca mostrar ahora, o null */
  function wanted(){const w=S.weather;return!failed&&w&&w.id&&w.id!=='none'&&WEATHERS[w.id]?w:null}
  function mount(){
    try{fx=new WeatherFX({container:stage,source:cv.scene})}
    catch(err){failed=true;fx=null;console.error(err);toast('Este navegador no puede mostrar el clima (sin WebGL)',4000);return}
    const view=fx.app.view;view.id='cWeather';stage.insertBefore(view,cv.glow);
    key='';apply();requestRender();
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
  function unmount(){if(!fx)return;fx.destroy();fx=null;key='';const v=$('#cWeather');if(v)v.remove()}
  function sync(){
    const w=wanted();
    if(!w){unmount();return}
    if(fx){apply();return}
    if(pending)return;pending=true;
    load().then(()=>{pending=false;if(!fx&&wanted())mount()}).catch(err=>{pending=false;failed=true;console.error(err);toast('No se pudo cargar el clima: '+err.message,4000)});
  }
  function invalidate(){if(fx)fx.invalidateSource()}
  function resize(){if(fx){fx.app.resize();fx.resize();fx.invalidateSource()}}
  const mounted=()=>!!fx;
  return{sync,invalidate,resize,mounted};
})();
