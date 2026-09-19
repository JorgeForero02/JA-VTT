/* Demo de WeatherFX: tablero de ejemplo y panel de control. */

/* ===================================================== demo del tablero */

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function paintBoard(cv){
  const w = cv.width, h = cv.height, c = cv.getContext('2d'), R = mulberry32(20260918);
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#31423a'); g.addColorStop(.55, '#1f2d29'); g.addColorStop(1, '#16201f');
  c.fillStyle = g; c.fillRect(0, 0, w, h);

  for (let i = 0; i < 300; i++){
    const x = R() * w, y = R() * h, r = 40 + R() * 190;
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    const tone = R() > .5 ? '66,99,70' : '78,86,58';
    gr.addColorStop(0, `rgba(${tone},${.05 + R() * .10})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
  }

  // losas de piedra: bordes rectos que delatan cualquier deformación
  const s = 118;
  for (let y = 0; y < h + s; y += s){
    for (let x = 0; x < w + s; x += s){
      const ox = (Math.floor(y / s) % 2) * s / 2;
      const t = R();
      c.fillStyle = `rgba(${120 + t * 26 | 0},${124 + t * 22 | 0},${118 + t * 20 | 0},${.05 + t * .05})`;
      c.fillRect(x + ox + 3, y + 3, s - 6, s - 6);
      c.strokeStyle = 'rgba(12,16,16,.30)'; c.lineWidth = 2.5;
      c.strokeRect(x + ox + 3, y + 3, s - 6, s - 6);
    }
  }

  c.strokeStyle = 'rgba(128,108,74,.26)'; c.lineWidth = Math.max(46, w * .045); c.lineCap = 'round';
  c.beginPath(); c.moveTo(-40, h * .78);
  c.bezierCurveTo(w * .28, h * .62, w * .42, h * .86, w * .72, h * .55);
  c.bezierCurveTo(w * .84, h * .4, w * .92, h * .34, w + 40, h * .22);
  c.stroke();

  for (let i = 0; i < 24; i++){
    const x = R() * w, y = R() * h, sz = 10 + R() * 28;
    c.fillStyle = `rgba(${94 + R() * 26 | 0},${100 + R() * 22 | 0},${96 + R() * 20 | 0},.32)`;
    c.beginPath(); c.ellipse(x, y, sz, sz * (.6 + R() * .4), R() * 3, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(0,0,0,.2)';
    c.beginPath(); c.ellipse(x + sz * .2, y + sz * .35, sz * .9, sz * .4, 0, 0, 6.283); c.fill();
  }

  c.strokeStyle = 'rgba(226,236,236,.05)'; c.lineWidth = 1;
  for (let x = 0; x <= w; x += 64){ c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, h); c.stroke(); }
  for (let y = 0; y <= h; y += 64){ c.beginPath(); c.moveTo(0, y + .5); c.lineTo(w, y + .5); c.stroke(); }
}

function makeToken(emoji, name){
  const c = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(0x1b2622, .95).lineStyle(3, 0xe7edea, .72).drawCircle(0, 0, 28).endFill();
  const t = new PIXI.Text(emoji, { fontSize: 28 });
  t.anchor.set(.5);
  const l = new PIXI.Text(name, { fontFamily: 'Archivo, sans-serif', fontSize: 12, fill: 0xe7edea,
    dropShadow: true, dropShadowBlur: 4, dropShadowDistance: 1, dropShadowAlpha: .8 });
  l.anchor.set(.5); l.y = 42;
  c.addChild(g, t, l);
  return c;
}

/* ------------------------------------------------------------ arranque */

const stage = document.getElementById('stage');
const boot = document.getElementById('boot');
const panel = document.getElementById('panel');

try {
  const board = document.createElement('canvas');
  const fx = new WeatherFX({ container: stage, source: board });
  window.fx = fx;

  const tokens = [makeToken('🧙', 'Arwen'), makeToken('🛡️', 'Guardia'), makeToken('🐉', 'Criatura')];
  fx.world.addChild(...tokens);

  function layout(){
    const w = Math.max(320, stage.clientWidth), h = Math.max(320, stage.clientHeight);
    board.width = w; board.height = h;
    paintBoard(board);
    fx.invalidateSource();
    const spots = [[.30, .36], [.58, .58], [.74, .28]];
    tokens.forEach((t, i) => { t.x = w * spots[i][0]; t.y = h * spots[i][1]; });
  }
  layout();
  addEventListener('resize', () => { fx.resize(); layout(); });

  const $ = id => document.getElementById(id);
  const lib = $('library');
  let current = 'rain';

  WeatherFX.list().forEach(def => {
    const b = document.createElement('button');
    b.className = 'eff'; b.type = 'button';
    b.dataset.id = def.id;
    b.innerHTML = `<span class="ic">${def.icon}</span><span>${def.name}</span>`;
    b.addEventListener('click', () => select(def.id));
    lib.appendChild(b);
  });

  const sliders = ['intensity', 'speed', 'wind', 'drops', 'refraction'];
  const fmt = {
    intensity: v => Math.round(v * 100) + '%',
    speed: v => v.toFixed(2) + '×',
    wind: v => (v > 0 ? '→ ' : v < 0 ? '← ' : '') + Math.round(Math.abs(v) * 100) + '%',
    drops: v => Math.round(v * 100) + '%',
    refraction: v => v.toFixed(2) + '×'
  };

  function syncUI(){
    for (const k of sliders){
      $(k).value = Math.round(fx.params[k] * 100);
      $('v-' + k).textContent = fmt[k](fx.params[k]);
    }
    $('c-drops').dataset.off = fx.def.water ? '' : '1';
    $('blurb').textContent = fx.def.blurb;
    [...lib.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === current)));
  }
  function select(id){ current = id; fx.use(id); syncUI(); }

  sliders.forEach(k => {
    $(k).addEventListener('input', () => {
      fx.set({ [k]: Number($(k).value) / 100 });
      $('v-' + k).textContent = fmt[k](fx.params[k]);
    });
  });

  $('pause').addEventListener('click', e => {
    e.currentTarget.textContent = fx.toggle() ? 'Reanudar' : 'Pausar';
  });
  $('strike').addEventListener('click', () => fx.strike());

  stage.addEventListener('pointerdown', e => {
    const r = stage.getBoundingClientRect();
    fx.drop(e.clientX - r.left, e.clientY - r.top, { radius: 34, strength: 2.4 });
  });

  select('rain');

  let frames = 0, acc = 0;
  fx.app.ticker.add(() => {
    frames++; acc += fx.app.ticker.deltaMS;
    if (acc >= 500){
      $('m-fps').textContent = Math.round(frames / (acc / 1000)) + ' fps';
      $('m-parts').textContent = fx.active + ' partículas';
      $('m-grid').textContent = fx.sim.gw + '×' + fx.sim.gh + ' malla';
      frames = 0; acc = 0;
    }
  });

  boot.remove();
  panel.hidden = false;
} catch (err){
  console.error(err);
  boot.textContent = 'No se pudo iniciar WebGL en este navegador. ' + (err && err.message ? err.message : '');
}
