'use strict';
/* Punto de entrada. Usa el SQLite integrado en Node (node:sqlite).
   Si tu versión de Node lo tiene detrás de una opción, se reinicia sola con ella. */
const { spawn } = require('node:child_process');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`\nJust Another VTT necesita Node.js 22.5 o superior (tienes ${process.versions.node}).`);
  console.error('Descárgalo desde https://nodejs.org (versión LTS) y vuelve a intentarlo.\n');
  process.exit(1);
}

let sqliteOk = true;
try { require('node:sqlite'); } catch { sqliteOk = false; }

if (!sqliteOk) {
  if (process.execArgv.includes('--experimental-sqlite')) {
    console.error('No se pudo cargar node:sqlite. Actualiza Node.js a la última versión LTS.');
    process.exit(1);
  }
  const child = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => child.kill('SIGINT'));
} else {
  process.removeAllListeners('warning');
  process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });
  const args = process.argv.slice(2);
  const port = Number(process.env.PORT) || Number(args.find((a) => /^\d+$/.test(a))) || 3000;
  require('./server/app').start(port, 10, args.includes('--abrir'));
}
