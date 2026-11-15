/* eslint-disable */
const TVAdFilter = require('../../../public/tv/js/adfilter.js');

describe('TVAdFilter.filter', () => {
  test('drops discontinuity lines, keeps the rest in order', () => {
    const src = ['#EXTM3U', 'a.ts', '#EXT-X-DISCONTINUITY', 'b.ts', '#EXT-X-DISCONTINUITY', 'c.ts'].join('\n');
    const out = TVAdFilter.filter(src);
    expect(out).not.toContain('#EXT-X-DISCONTINUITY');
    expect(out.split('\n')).toEqual(['#EXTM3U', 'a.ts', 'b.ts', 'c.ts']);
  });
  test('empty and falsy map to empty string', () => {
    expect(TVAdFilter.filter('')).toBe('');
    expect(TVAdFilter.filter(undefined)).toBe('');
  });
});

describe('TVAdFilter.loaderFor', () => {
  function fakeHls() {
    function Base(config) { this.config = config; }
    Base.prototype.load = function (ctx, cfg, callbacks) {
      callbacks.onSuccess({ data: '#EXT-X-DISCONTINUITY\nseg.ts' }, {}, ctx);
    };
    return { DefaultConfig: { loader: Base } };
  }
  function run(type) {
    const Loader = TVAdFilter.loaderFor(fakeHls());
    const loader = new Loader({ x: 1 });
    let got = null;
    loader.load({ type: type }, {}, { onSuccess: function (r) { got = r.data; } });
    return got;
  }
  test('filters level and manifest', () => {
    expect(run('level')).toBe('seg.ts');
    expect(run('manifest')).toBe('seg.ts');
  });
  test('leaves fragment data unchanged', () => {
    expect(run('fragment')).toBe('#EXT-X-DISCONTINUITY\nseg.ts');
  });
  test('works with a real ES class base loader', () => {
    class Base { constructor(c) { this.c = c; } load(ctx, cfg, cb) { cb.onSuccess({ data: '#EXT-X-DISCONTINUITY\nx' }, {}, ctx); } }
    const Loader = TVAdFilter.loaderFor({ DefaultConfig: { loader: Base } });
    const l = new Loader({ k: 1 });
    expect(l.c).toEqual({ k: 1 });
    let got;
    l.load({ type: 'level' }, {}, { onSuccess: function (r) { got = r.data; } });
    expect(got).toBe('x');
  });
});
