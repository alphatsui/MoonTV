/* eslint-disable */
const TVRouter = require('../../../public/tv/js/router.js');

describe('TVRouter', () => {
  test('play round trip keeps params as strings', () => {
    const h = TVRouter.format('play', { source: 'a b', id: '1', ep: 2, t: 30 });
    expect(h.indexOf('#/play?')).toBe(0);
    expect(TVRouter.parse(h)).toEqual({
      name: 'play',
      params: { source: 'a b', id: '1', ep: '2', t: '30' },
    });
  });
  test('format without params', () => {
    expect(TVRouter.format('home')).toBe('#/home');
    expect(TVRouter.parse('#/info')).toEqual({ name: 'info', params: {} });
  });
  test('empty and unknown hashes go home', () => {
    expect(TVRouter.parse('')).toEqual({ name: 'home', params: {} });
    expect(TVRouter.parse('#/nope')).toEqual({ name: 'home', params: {} });
    expect(TVRouter.parse(undefined)).toEqual({ name: 'home', params: {} });
  });
  test('encodes special characters', () => {
    const h = TVRouter.format('detail', { source: 's', id: 'x&y=z', title: '你好 #1' });
    expect(TVRouter.parse(h).params).toEqual({ source: 's', id: 'x&y=z', title: '你好 #1' });
  });
});
