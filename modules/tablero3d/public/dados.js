'use strict';
/* Dados (Tablero3D.Dados) con la notación y el formato de tirada de Just Another VTT (su server/dice.js): la misma cuenta que
   modules/tablero3d/dice.js del servidor (un test los compara). En la mesa en vivo tira el servidor; fuera de ella, el cliente
   con crypto.getRandomValues. `text(body)` es la línea del registro de la partida. Sin dependencias. */
(window.Tablero3D=window.Tablero3D||{}).Dados=(()=>{
  const SIDES=[4,6,8,10,12,20,100], MAX_TERMS=5, MAX_DICE=20, MAX_MOD=1000;
  function parse(formula){
    const text=String(formula||'').toLowerCase().trim().replace(/\s*([+-])\s*/g,'$1').replace(/\s+/g,'+');
    if(!text||text.length>60) throw new Error('Fórmula vacía o demasiado larga');
    const parts=text.match(/[+-]?[^+-]+/g);
    if(!parts||parts.join('')!==text) throw new Error('Fórmula no válida');
    const terms=[]; let mod=0;
    for(const raw of parts){
      const sign=raw.startsWith('-')?-1:1, body=raw.replace(/^[+-]/,''), dice=/^(\d*)d(\d+)$/.exec(body);
      if(dice){ const n=dice[1]===''?1:Number(dice[1]), sides=Number(dice[2]);
        if(!SIDES.includes(sides)) throw new Error(`No hay dados de ${sides} caras (sí: ${SIDES.join(', ')})`);
        if(n<1||n>MAX_DICE) throw new Error(`Entre 1 y ${MAX_DICE} dados por término`);
        terms.push({n,sides,sign}); continue; }
      if(/^\d+$/.test(body)){ mod+=sign*Number(body); continue; }
      throw new Error(`No entiendo «${raw}»`);
    }
    if(!terms.length) throw new Error('La fórmula necesita al menos un dado');
    if(terms.length>MAX_TERMS) throw new Error(`Como mucho ${MAX_TERMS} grupos de dados`);
    if(Math.abs(mod)>MAX_MOD) throw new Error('Modificador demasiado grande');
    return {terms,mod};
  }
  function describe(terms,mod){ let s=terms.map((t,i)=>`${t.sign<0?'-':i?'+':''}${t.n}d${t.sides}`).join(''); if(mod) s+=(mod>0?'+':'')+mod; return s; }
  function rnd(sides){ const a=new Uint32Array(1); crypto.getRandomValues(a); return 1+a[0]%sides; }
  // opts: adv 1 (ventaja) o -1 (desventaja), sólo con 1d20; rng(sides) → 1..sides
  function roll(formula,opts){
    const o=opts||{}, rng=o.rng||rnd, {terms,mod}=parse(formula), adv=o.adv===1||o.adv===-1?o.adv:0;
    if(adv&&terms.length===1&&terms[0].n===1&&terms[0].sides===20&&terms[0].sign===1){
      const rolls=[rng(20),rng(20)], kept=adv>0?Math.max(...rolls):Math.min(...rolls);
      return {formula:describe([{n:2,sides:20,sign:1}],mod),dice:[{n:2,sides:20,sign:1,rolls}],mod,total:kept+mod,adv};
    }
    let total=mod;
    const dice=terms.map(t=>{ const rolls=Array.from({length:t.n},()=>rng(t.sides)); total+=t.sign*rolls.reduce((a,b)=>a+b,0); return {n:t.n,sides:t.sides,sign:t.sign,rolls}; });
    return {formula:describe(terms,mod),dice,mod,total};
  }
  // «Ataque: 1d20+3: [17] + 3 = 20 (¡crítico!)»; con ventaja, «2d20+3 con ventaja: [17, 4] → 17 + 3 = 20»
  function text(b){
    if(!b||typeof b!=='object'||!Array.isArray(b.dice)) return '';
    const mod=b.mod|0, ms=mod?(mod>0?' + ':' − ')+Math.abs(mod):'';
    const groups=b.dice.map((d,i)=>(d.sign<0?'− ':i?'+ ':'')+'['+(Array.isArray(d.rolls)?d.rolls.join(', '):'')+']').join(' ');
    let t=(b.label?String(b.label).slice(0,60)+': ':'')+String(b.formula||'').slice(0,60);
    const d0=b.dice[0], one20=b.dice.length===1&&d0&&d0.sides===20;
    if(b.adv&&one20){ const kept=b.total-mod; t+=' con '+(b.adv>0?'ventaja':'desventaja')+': '+groups+' → '+kept+ms+' = '+b.total; if(kept===20) t+=' (¡crítico!)'; else if(kept===1) t+=' (pifia)'; return t; }
    t+=': '+groups+ms+' = '+b.total;
    if(one20&&d0.n===1){ if(d0.rolls[0]===20) t+=' (¡crítico!)'; else if(d0.rolls[0]===1) t+=' (pifia)'; }
    return t;
  }
  return {SIDES,MAX_TERMS,MAX_DICE,MAX_MOD,parse,describe,roll,text};
})();
