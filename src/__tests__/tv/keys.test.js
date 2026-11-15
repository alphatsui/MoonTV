/* eslint-disable */
const TVKeys = require('../../../public/tv/js/keys.js');

const ev = (keyCode, tag) => ({ keyCode, target: { tagName: tag || 'BODY' } });

describe('TVKeys.action', () => {
  test('back keys', () => {
    expect(TVKeys.action(ev(10009))).toBe('back');
    expect(TVKeys.action(ev(27))).toBe('back');
    expect(TVKeys.action(ev(8, 'BODY'))).toBe('back');
  });
  test('backspace in text inputs is not back', () => {
    expect(TVKeys.action(ev(8, 'INPUT'))).toBeNull();
    expect(TVKeys.action(ev(8, 'TEXTAREA'))).toBeNull();
  });
  test('media and nav keys', () => {
    expect(TVKeys.action(ev(10252))).toBe('playpause');
    expect(TVKeys.action(ev(415))).toBe('play');
    expect(TVKeys.action(ev(19))).toBe('pause');
    expect(TVKeys.action(ev(417))).toBe('ff');
    expect(TVKeys.action(ev(412))).toBe('rw');
    expect(TVKeys.action(ev(413))).toBe('stop');
    expect(TVKeys.action(ev(13))).toBe('ok');
    expect(TVKeys.action(ev(37))).toBe('left');
    expect(TVKeys.action(ev(38))).toBe('up');
    expect(TVKeys.action(ev(39))).toBe('right');
    expect(TVKeys.action(ev(40))).toBe('down');
  });
  test('unknown key and missing target', () => {
    expect(TVKeys.action(ev(65))).toBeNull();
    expect(TVKeys.action({ keyCode: 8 })).toBe('back');
  });
});
