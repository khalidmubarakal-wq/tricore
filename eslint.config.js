// ESLint flat config. The compiled bundle in assets/js/vendor is not linted.
const browserGlobals = Object.fromEntries([
  'window', 'document', 'console', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history',
  'fetch', 'atob', 'btoa', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'MutationObserver', 'IntersectionObserver', 'CustomEvent', 'MouseEvent',
  'Node', 'NodeFilter', 'URLSearchParams', 'confirm', 'alert', 'getComputedStyle',
].map((g) => [g, 'readonly']));

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'eqeqeq': ['warn', 'smart'],
};

export default [
  { ignores: ['assets/js/vendor/**', 'node_modules/**'] },
  {
    files: ['assets/js/core/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browserGlobals },
    rules,
  },
  {
    files: ['assets/js/**/*.js'],
    ignores: ['assets/js/core/**'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: browserGlobals },
    rules,
  },
  {
    // Node scripts; tests also contain callbacks evaluated in the browser.
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...browserGlobals, process: 'readonly', Buffer: 'readonly', URL: 'readonly' },
    },
    rules,
  },
];
