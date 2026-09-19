import { chromium } from 'playwright';
const BASE = 'http://localhost:3999';
const browser = await chromium.launch({ channel: 'msedge', headless: false });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: +(process.env.DPR || 1) })).newPage();
await page.goto(BASE + '/');
await page.evaluate(async () => { await fetch('/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'fs-'+Date.now().toString(36),password:'secreto1'})}); const b=await fetch('/api/boards',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'FS',mode:'2d'})}).then(r=>r.json()); location.hash='#/tablero/'+b.board.id; location.reload(); });
await page.waitForSelector('#app:not([hidden])'); await page.waitForTimeout(800);
await page.click('[data-tab="scene"]'); await page.click('#envGrid button:nth-child(2)');
await page.evaluate(() => {
  window.__bad = []; window.__renders = 0; window.__log = [];
  const t = setInterval(() => { if (typeof PIXI === 'undefined') return; clearInterval(t);
    const R = PIXI.Renderer.prototype, orig = R.render;
    R.render = function (stage, ...rest) {
      try { const sp = stage.children[0] && stage.children[0].children[0] && stage.children[0].children[0].children[0]; const c = document.getElementById('cScene');
        window.__renders++;
        if (sp && sp.texture && sp.texture.baseTexture) { const sw = this.screen.width, spw = Math.round(sp.width), texw = sp.texture.orig.width, canvasW = c.width, valid = sp.texture.baseTexture.valid;
          if (spw !== sw || texw !== canvasW || sp.x !== 0 || !valid) window.__bad.push({ n: window.__renders, sw, spw, texw, canvasW, x: sp.x, valid }); }
        else window.__log.push('render sin mapSprite #' + window.__renders);
      } catch (e) { window.__log.push(String(e)); }
      return orig.call(this, stage, ...rest);
    };
  }, 5);
});
await page.selectOption('#weatherId', 'storm'); await page.waitForFunction(() => Weather.mounted(), null, { timeout: 20000 }); await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => ({ dpr: devicePixelRatio, renders: window.__renders, malos: window.__bad.length, ejemplos: window.__bad.slice(0, 4), log: window.__log.slice(0, 3) }))));
await browser.close();
