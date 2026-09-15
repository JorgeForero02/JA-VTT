'use strict';
/* Plantillas de ejemplo que el director puede cargar en un tablero */
/* ---------- Escena de ejemplo: granja al atardecer ---------- */
function seed(){
  loadState(Object.assign(blankState(),{name:'Granja del cruce',cols:36,rows:22,env:'dusk',ambient:ENVS.dusk.ambient,darkColor:ENVS.dusk.dark}));
  S.layers.map.locked=true;
  addObj({id:nid(),type:'asset',kind:'map',name:'Granja del cruce',img:'muestra-tablero',x:900,y:550,w:1800,h:1100,rot:0,opacity:1});
  const W_=(ax,ay,bx,by,k)=>addWall({x:ax,y:ay},{x:bx,y:by},k);
  // casa: dos estancias, ventanas al norte y puertas
  W_(700,200,850,200);W_(850,200,950,200,'window');W_(950,200,1200,200);W_(1200,200,1300,200,'window');W_(1300,200,1400,200);
  W_(1400,200,1400,800);W_(1400,800,700,800);
  W_(700,800,700,550);W_(700,550,700,450,'door');W_(700,450,700,200);
  W_(1050,200,1050,450);W_(1050,450,1050,550,'door');W_(1050,550,1050,800);
  S.walls.find(w=>w.kind==='door'&&w.a.x===1050).locked=true;
  addObj({id:nid(),type:'zone',name:'Casa',x:700,y:200,w:700,h:600});
  // arboledas circulares (velo), un murete curvo y la cerca
  for(const[x,y,r]of[[350,300,75],[230,760,95],[1650,900,110]])polyWalls(ellipsePoints(x,y,r,r,0,segCount(2*Math.PI*r)),true,'veil');
  polyWalls(curvePoints({x:300,y:1000},{x:475,y:930},{x:650,y:1000},10),false,'wall');
  W_(1500,300,1500,650,'barrier');
  // objetos con física: mesa y barriles
  const prop=(img,name,x,y,w)=>{const o=addObj({id:nid(),type:'asset',kind:'prop',name,img,x,y,w,h:w,rot:0,opacity:1});setPhysics(o,'ellipse','barrier');return o};
  prop('muestra-mesa','Mesa redonda',875,400,100);
  prop('muestra-barril','Barril',750,250,45);prop('muestra-barril','Barril',795,250,45);
  // luces
  const L=(x,y,p)=>addObj(newLight({x,y},p));
  L(625,375,'brazier');L(625,625,'brazier');L(975,725,'candle');L(1325,725,'crystal');L(1575,475,'campfire');
  // fichas
  addObj(newToken({x:275,y:475},'player',{name:'Arin',color:'#7FB2E5',img:'muestra-guerrera',light:tokenLightFrom('torch')}));
  addObj(newToken({x:325,y:575},'player',{name:'Lyra',color:'#9ED3A6',darkvision:60,light:tokenLightFrom('none')}));
  addObj(newToken({x:875,y:675},'enemy',{name:'Goblin',hidden:false,img:'muestra-goblin'}));
  addObj(newToken({x:1225,y:325},'enemy',{name:'Cultista',hidden:false,color:'#B084D9'}));
  addObj(newToken({x:425,y:175},'enemy',{name:'Lobo',hidden:false,color:'#A3A08F'}));
  addObj(newToken({x:1675,y:475},'enemy',{name:'Explorador',hidden:false,color:'#C9A26B',light:tokenLightFrom('lantern')}));
  hist.undo.length=0;hist.redo.length=0;
  touchWalls();resetExplored();changed(true);
}

/* ---------- Escena de ejemplo: interior irregular con torre redonda ---------- */
function seedHerbalist(){
  loadState(Object.assign(blankState(),{name:'Herbolario',env:'night',ambient:ENVS.night.ambient,darkColor:ENVS.night.dark}));
  const k=CELL/72,P=(x,y)=>({x:Math.round(x*k*10)/10,y:Math.round(y*k*10)/10});
  S.layers.map.locked=true;
  addObj({id:nid(),type:'asset',kind:'map',name:'Herbolario, planta 1',img:'muestra-herbolario',x:350,y:375,w:700,h:750,rot:0,opacity:1});
  const TC={x:355,y:353},TR=186,at=(deg,r)=>({x:TC.x+Math.cos(deg*Math.PI/180)*(r||TR),y:TC.y+Math.sin(deg*Math.PI/180)*(r||TR)});
  const arcDeg=(a0,a1,r,n)=>{const o=[];for(let i=0;i<=n;i++)o.push(at(a0+(a1-a0)*i/n,r));return o};
  const T0=at(118),T1=at(289.5);T0.x=267;T1.x=417;
  const towerPx=arcDeg(118,289.5,TR,16);towerPx[0]=T0;towerPx[towerPx.length-1]=T1;
  // contorno exterior: muros rectos, la puerta en el chaflán y la torre como arco
  polyWalls([T1,{x:417,y:42},{x:963,y:42},{x:963,y:1036},{x:500,y:1036}].map(q=>P(q.x,q.y)),false,'wall');
  addWall(P(500,1036),P(436,962),'door');
  polyWalls([{x:436,y:962},{x:267,y:962},T0].map(q=>P(q.x,q.y)),false,'wall');
  polyWalls(towerPx.map(q=>P(q.x,q.y)),false,'wall');
  // anillo de jardineras de la torre: se ve por encima pero no se cruza; deja un paso libre
  const ring=arcDeg(-70.5,50,176,10);ring[0]={x:417,y:ring[0].y};
  polyWalls(ring.map(q=>P(q.x,q.y)),false,'barrier');
  polyWalls(arcDeg(95,118,180,3).map(q=>P(q.x,q.y)),false,'barrier');
  // escalera de caracol, mostrador curvo y mesa redonda
  const st=arcPoints(P(500,735),P(415,735),P(585,735));polyWalls([...st,st[0]],false,'barrier');
  polyWalls(curvePoints(P(775,505),P(680,630),P(760,770),8),false,'barrier');
  polyWalls(ellipsePoints(P(615,182).x,P(615,182).y,42*k,42*k,0,10),true,'barrier');
  // zona interior con la forma exacta del edificio
  const zone=[{x:417,y:42},{x:963,y:42},{x:963,y:1036},{x:500,y:1036},{x:436,y:962},{x:267,y:962},...towerPx].map(q=>P(q.x,q.y));
  addZone(zone,'Herbolario');
  // luces pintadas en el mapa
  const L=(x,y,preset,extra)=>addObj(Object.assign(newLight(P(x,y),preset),extra||{}));
  L(290,355,'crystal',{name:'Cristal de la torre',color:'#7EC8FF',bright:10,dim:10});
  L(252,250,'candle',{name:'Velas'});
  L(822,402,'crystal',{name:'Caldero',color:'#5CFF6A',bright:5,dim:15,preset:'custom'});
  L(645,862,'crystal',{name:'Cristal del mostrador',color:'#7EC8FF',bright:10,dim:10});
  L(770,570,'magic',{name:'Vitrina',color:'#8FA8FF',bright:5,dim:10,intensity:.7});
  // fichas
  addObj(newToken({x:375,y:625},'player',{name:'Arin',color:'#7FB2E5',img:'muestra-guerrera',light:tokenLightFrom('torch')}));
  addObj(newToken({x:425,y:575},'player',{name:'Lyra',color:'#9ED3A6',darkvision:30,light:tokenLightFrom('none')}));
  addObj(newToken({x:575,y:325},'enemy',{name:'Herbolaria',hidden:false,color:'#6BBF73'}));
  addObj(newToken({x:225,y:325},'enemy',{name:'Homúnculo',hidden:true,img:'muestra-goblin'}));
  hist.undo.length=0;hist.redo.length=0;
  touchWalls();resetExplored();changed(true);
}

