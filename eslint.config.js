const nextJs = require('eslint-config-next');

module.exports = [
  ...nextJs({ dirs: ['src'] }),
  {
    ignores: ['.husky/**', 'public/sw.js', 'public/workbox-*.js'],
  },
];
