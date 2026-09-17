/* Estado compartido del motor 2.5D. Se importa desde todos los módulos d3/;
   nada de THREE aquí para evitar dependencias circulares. */
const C0=22*22;
export const G={
  N:22, CELLS:484, OFF:0, autoGrow:true, cellPx:50,
  H:new Uint8Array(C0), M:new Uint8Array(C0), W:new Float32Array(C0), chan:new Uint8Array(C0),
  springs:[], sinks:[], evap:.0012, edgeDrain:true, cutOn:false, cutH:3,
  objs:new Map(), tufts:[], lights:[], chars:[], mounts:new Map(),
  selected:null, sceneKey:'valle', lightId:1,
  visData:new Uint8Array(C0*4), lightData:new Uint8Array(C0*4), visTex:null, lightTex:null,
  FLX:new Float32Array(C0*4), Wprev:new Float32Array(C0), Wr:new Float32Array(C0),
  VX:new Float32Array(C0), VZ:new Float32Array(C0), FOAM:new Float32Array(C0), foamT:new Float32Array(C0),
  WB:[0,0,0,0],
  illum:new Float32Array(C0), darkMask:new Uint8Array(C0), lightAcc:new Float32Array(C0*3),
  lightsDirty:true, visionDirty:true, lightTick:0,
  tVis:new Float32Array(C0), tMem:new Float32Array(C0), tDv:new Float32Array(C0),
  cVis:new Float32Array(C0), cMem:new Float32Array(C0), cDv:new Float32Array(C0),
  strongView:new Uint8Array(C0), pcVis:new Map(), explored:new Map(),
  boomLevel:'media', shake:0, terrainVersion:0,
  tool:'mover', waterMode:'verter', paintMat:1, objKind:'arbol', lightPreset:'torch'
};
export const S={
  env:'day', amb:1, dark:null, fogAlpha:.3, mist:.12, view:'gm',
  fogMemory:true, shared:true, animLights:true, grid:false, focus:true
};
export const R={
  renderer:null, scene:null, cam:null, sun:null, hemi:null,
  canvas:null, stage:null, toast:()=>{}
};
export const U={
  uVis:{value:null}, uLight:{value:null}, uHalf:{value:11},
  uGain:{value:.6}, uFloor:{value:0}, uFogOn:{value:0},
  uDark:{value:null}, uGrid:{value:0}, uFogAlpha:{value:.35},
  uShadow:{value:.62}, uAmbFlat:{value:.6}, uMist:{value:0},
  uMistCol:{value:null}, uMistBase:{value:.6}, uMistTop:{value:1.5}, uMistT:{value:0}
};
export const MAXH=9, MAXN=118, BASE_N=22;
export const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
export const I=(x,z)=>z*G.N+x;
export const cxOf=(i)=>i%G.N;
export const czOf=(i)=>Math.floor(i/G.N);
export const wx=(x)=>x-G.N/2+.5;
export const wz=(z)=>z-G.N/2+.5;
export const inb=(x,z)=>x>=0&&z>=0&&x<G.N&&z<G.N;
