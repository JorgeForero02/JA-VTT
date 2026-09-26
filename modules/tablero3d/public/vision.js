'use strict';
/* Visión y luz sobre la rejilla del tablero (Tablero3D.Vision), sin dependencias: se prueban en test/frontend.test.js.
   g = { w, d, top(i): altura de la superficie de la casilla i, wall(i), door(i): puerta cerrada,
         bk(i, flag): opcional, un muro de JA-VTT en la casilla (muros.js) tapa 'sight', 'light' o 'hide' }.
   Las rectas se recorren casilla a casilla (DDA); dentro de cada casilla la recta va de la altura
   de entrada a la de salida y la tapa cualquier superficie más alta que su punto más bajo. Una puerta cerrada,
   un velo, un portal de pie o la maleza (sólo para 'hide') tapan lo que pasa a menos de 1 de su suelo: desde
   arriba (una ficha que vuela, una torre) se ve por encima. La casilla de origen y la de destino no tapan:
   se ve la cortina y se ve a quien está dentro de la hierba; lo de detrás, no. */
(window.Tablero3D=window.Tablero3D||{}).Vision=(()=>{
  const inb=(g,x,z)=>x>=0&&z>=0&&x<g.w&&z<g.d;
  const low1=(g,i,flag)=>g.door(i)||(!!g.bk&&g.bk(i,flag));
  // ¿ve un ojo en el centro de (x0,z0), a altura eye, la superficie de (x1,z1)? kind: 'sight' (el fondo, por defecto)
  // o 'hide' (las fichas y objetos: además tapa la maleza). No deja mirar por la rendija de dos casillas que tapan y se tocan en diagonal.
  function los(g,x0,z0,x1,z1,eye,kind){
    const flag=kind==='hide'?'hide':'sight';
    if(x0===x1&&z0===z1) return true;
    const ty=g.top(z1*g.w+x1)+0.3, dx=x1-x0, dz=z1-z0, sx=Math.sign(dx), sz=Math.sign(dz);
    const tdx=dx?Math.abs(1/dx):Infinity, tdz=dz?Math.abs(1/dz):Infinity;
    const blk=(cx,cz,ta,tb)=>{ if(!inb(g,cx,cz)||(cx===x1&&cz===z1)) return false;
      const i=cz*g.w+cx, low=Math.min(eye+(ty-eye)*ta,eye+(ty-eye)*tb), top=g.top(i);
      return g.wall(i)||top>low+0.01||(low1(g,i,flag)&&low<top+1.0); };
    let x=x0, z=z0, tmx=dx?0.5*tdx:Infinity, tmz=dz?0.5*tdz:Infinity;
    for(let guard=0;guard<1024;guard++){
      if(x===x1&&z===z1) return true;
      if(Math.abs(tmx-tmz)<1e-9){
        const ta=tmx; if(blk(x+sx,z,ta,ta)&&blk(x,z+sz,ta,ta)) return false;
        x+=sx; z+=sz; tmx+=tdx; tmz+=tdz; if(blk(x,z,ta,Math.min(tmx,tmz,1))) return false;
      } else if(tmx<tmz){ const ta=tmx; x+=sx; tmx+=tdx; if(blk(x,z,ta,Math.min(tmx,tmz,1))) return false; }
      else { const ta=tmz; z+=sz; tmz+=tdz; if(blk(x,z,ta,Math.min(tmx,tmz,1))) return false; }
    }
    return true;
  }
  // ¿llega la luz de un punto (lx,ly,lz) en coordenadas continuas a la superficie (a altura ty) de (tx,tz)?
  function lightReaches(g,lx,ly,lz,tx,tz,ty){
    const sx0=Math.floor(lx), sz0=Math.floor(lz); let x=sx0, z=sz0;
    const dx=tx+.5-lx, dz=tz+.5-lz, stepX=dx>0?1:-1, stepZ=dz>0?1:-1;
    const tdx=dx?Math.abs(1/dx):Infinity, tdz=dz?Math.abs(1/dz):Infinity;
    let tmx=dx?((dx>0?x+1-lx:lx-x)*tdx):Infinity, tmz=dz?((dz>0?z+1-lz:lz-z)*tdz):Infinity, t0=0;
    for(let guard=0;guard<256;guard++){
      if(x===tx&&z===tz) return true;
      const t1=Math.min(tmx,tmz,1);
      if(inb(g,x,z)&&!(x===sx0&&z===sz0)){
        const i=z*g.w+x, low=Math.min(ly+(ty-ly)*t0,ly+(ty-ly)*t1), top=g.top(i);
        if(top>low+0.02) return false;
        if(low1(g,i,'light')&&low<top+1.0) return false;
      }
      if(tmx<tmz){ t0=tmx; tmx+=tdx; x+=stepX; } else { t0=tmz; tmz+=tdz; z+=stepZ; }
    }
    return true;
  }
  return {los,lightReaches};
})();
