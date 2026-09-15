'use strict';
/* Punto de entrada. Configuración por variables de entorno:
   DATABASE_URL (obligatoria) y PORT (3000 por defecto). */
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`\nJust Another VTT necesita Node.js 22.5 o superior (tienes ${process.versions.node}).`);
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
require('./server/app').start(port).catch((e) => {
  console.error('\n  No se pudo arrancar:', e.message, '\n');
  process.exit(1);
});
