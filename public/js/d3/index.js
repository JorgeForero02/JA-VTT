/* Puente entre los scripts clásicos de JA-VTT y el motor 2.5D (módulo ES). */
import { createEngine } from './engine.js';
let eng = null;
export async function mount(stage, opts) {
  if (eng) return;
  eng = createEngine(stage, opts || {});
  try { await eng.start(); } catch (e) { eng.stop(); eng = null; throw e; }
}
export function unmount() { if (!eng) return; eng.stop(); eng = null; }
export function resize() { if (eng) eng.resize(); }
export function rotate(dir) { if (eng) eng.rotate(dir); }
export function setEnv(env, ambient) { if (eng) eng.setEnv(env, ambient); }
export function isMounted() { return !!eng; }
window.D3={mount,unmount,resize,rotate,setEnv,isMounted};
