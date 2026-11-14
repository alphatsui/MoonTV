/* eslint-disable */
/** @jest-environment node */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const root = path.join(__dirname, '..', '..', '..', 'public', 'tv');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return acc.concat(walk(p));
    return /\.js$/.test(e.name) ? acc.concat(p) : acc;
  }, []);
}

describe('TV front end syntax', () => {
  const files = walk(path.join(root, 'js'));

  it('has js files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  files.forEach((f) => {
    it('parses as ES5: ' + path.relative(root, f), () => {
      const src = fs.readFileSync(f, 'utf8');
      expect(() => acorn.parse(src, { ecmaVersion: 5 })).not.toThrow();
    });
  });

  it('parses vendor/hls.min.js as ES2020', () => {
    const src = fs.readFileSync(path.join(root, 'vendor', 'hls.min.js'), 'utf8');
    expect(() => acorn.parse(src, { ecmaVersion: 2020 })).not.toThrow();
  });
});
