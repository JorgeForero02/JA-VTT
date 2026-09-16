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
];
