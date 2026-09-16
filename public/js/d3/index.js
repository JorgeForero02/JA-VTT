/* Puente entre los scripts clásicos de JA-VTT y el motor 2.5D (módulo ES). */
import { createEngine } from './engine.js';
let eng = null, starting = null;
export async function mount(stage, opts) {
  if (eng) return starting || undefined; // ya montado o montándose: misma promesa
  const me = createEngine(stage, opts || {});
  eng = me;
  const p = (async () => {
    try { await me.start(); } catch (e) { if (eng === me) { me.stop(); eng = null; } throw e; } finally { if (starting === p) starting = null; }
  })();
  starting = p;
  return p;
}
// Si llega mientras start() aún carga el arte, stop() marca el motor como parado y start() no monta nada.
export function unmount() { if (!eng) return; eng.stop(); eng = null; starting = null; }
export function resize() { if (eng) eng.resize(); }
export function rotate(dir) { if (eng) eng.rotate(dir); }
export function setEnv(env, ambient) { if (eng) eng.setEnv(env, ambient); }
export function isMounted() { return !!eng; }
window.D3={mount,unmount,resize,rotate,setEnv,isMounted};
