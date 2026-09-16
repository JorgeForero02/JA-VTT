import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3999';
const b = await chromium.launch({ channel: 'msedge', headless: true });
const page = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.stack || e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(BASE + '/');
await page.waitForTimeout(800);
// usamos la pantalla de entrada como lienzo: creamos un contenedor
const res = await page.evaluate(async () => {
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;background:#223'; document.body.appendChild(host);
  const out = [];
  const dice = [{ sides: 4, rolls: [3] }, { sides: 6, rolls: [6] }, { sides: 8, rolls: [8] }, { sides: 10, rolls: [10] }, { sides: 12, rolls: [12] }, { sides: 20, rolls: [20] }, { sides: 100, rolls: [70] }];
  try { window.Dice3D.roll(host, dice, '#F0B35A', 42); out.push('roll ok'); } catch (e) { out.push('roll error: ' + (e.stack || e.message)); }
  await new Promise((r) => setTimeout(r, 4200));
  return out;
});
console.log(res.join('\n'));
await page.screenshot({ path: 'C:/Users/gogam/AppData/Local/Temp/claude/capturas/dice-debug.png' });
console.log('errors:', errs.join('\n---\n') || 'none');
await b.close();
