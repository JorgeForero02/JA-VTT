import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly', document: 'readonly', location: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  fetch: 'readonly', WebSocket: 'readonly', FileReader: 'readonly', Image: 'readonly', requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  console: 'readonly', navigator: 'readonly', performance: 'readonly', URL: 'readonly', Blob: 'readonly', devicePixelRatio: 'readonly',
  getComputedStyle: 'readonly', ResizeObserver: 'readonly', OffscreenCanvas: 'readonly', Path2D: 'readonly', DOMMatrix: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly', crypto: 'readonly', history: 'readonly', CustomEvent: 'readonly',
  KeyboardEvent: 'readonly', MouseEvent: 'readonly', HTMLElement: 'readonly', Node: 'readonly', Event: 'readonly', atob: 'readonly', btoa: 'readonly',
};

const T3D_PUB = 'modules/tablero3d/public/';
// módulos puros del tablero 3D (UMD: node y navegador)
const PURE_T3D = ['base.js', 'luces.js', 'catalogo.js', 'objetos3d.js', 'escena.js', 'mapas.js', 'pixel.js'].map((f) => T3D_PUB + f);
const T3D_RULES = { 'no-empty': ['error', { allowEmptyCatch: true }], 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'max-lines': ['error', { max: 1100 }] };

export default [
  { ignores: ['node_modules/**', 'public/js/vendor/**', 'data/**', 'test/e2e/capturas/**'] },
  {
    files: ['server.js', 'server/**/*.js', 'test/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024, sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly', Buffer: 'readonly', __dirname: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', URL: 'readonly', fetch: 'readonly', WebSocket: 'readonly' },
    },
    rules: { 'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    files: ['public/js/dice3d.js'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: browserGlobals },
    rules: { 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    // El cliente son scripts clásicos que comparten el ámbito global entre archivos: sólo se
    // buscan errores de sintaxis; no-undef se desactiva porque los símbolos vienen de otros archivos.
    files: ['public/js/*.js'],
    ignores: ['public/js/dice3d.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: browserGlobals },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off', 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    // tablero 3D, módulos PUROS (sin DOM, sin THREE): recommended entero y sólo los globales del envoltorio UMD
    // (window sólo porque la cola lee `typeof window`). Un módulo puro que toque el DOM o THREE no pasa el lint.
    files: PURE_T3D,
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { module: 'writable', require: 'readonly', globalThis: 'readonly', window: 'readonly', TextEncoder: 'readonly' } },
    rules: { ...js.configs.recommended.rules, ...T3D_RULES },
  },
  {
    // tablero 3D, módulos de navegador (scripts clásicos): recommended entero; el núcleo va aparte, sin no-undef.
    files: ['modules/tablero3d/public/*.js'],
    // t3d.js (el cargador) también entra aquí: pasa recommended (ICONS, del anfitrión, en el bloque siguiente).
    ignores: ['modules/tablero3d/public/tablero3d.js', ...PURE_T3D,
      // personajes.js: módulo anterior al refactor (1161 líneas, por encima de max-lines; no se toca aquí)
      'modules/tablero3d/public/personajes.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...browserGlobals, ImageData: 'readonly', THREE: 'readonly', module: 'writable', require: 'readonly', globalThis: 'readonly' } },
    rules: { ...js.configs.recommended.rules, ...T3D_RULES },
  },
  {
    // t3d.js (el cargador) lee ICONS, el catálogo de iconos del anfitrión (public/js/icons.js), si existe
    files: ['modules/tablero3d/public/t3d.js'],
    languageOptions: { globals: { ICONS: 'readonly' } },
  },
  {
    files: ['modules/tablero3d/public/tablero3d.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...browserGlobals, ImageData: 'readonly', THREE: 'readonly' } },
    // max-lines es un trinquete: bajar está permitido; subir es decisión explícita en docs/04 (3055 líneas al cerrar el refactor)
    rules: { 'no-func-assign': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'max-lines': ['error', { max: 3100 }] },
  },
];
