/* eslint-disable */
const TVFocus = require('../../../public/tv/js/focus.js');

describe('TVFocus.move', () => {
  test('skips empty row and clamps col', () => {
    expect(TVFocus.move([3, 0, 2], { row: 0, col: 2 }, 'down')).toEqual({ row: 2, col: 1 });
  });
  test('edges stay put', () => {
    expect(TVFocus.move([3], { row: 0, col: 0 }, 'left')).toEqual({ row: 0, col: 0 });
    expect(TVFocus.move([3], { row: 0, col: 2 }, 'right')).toEqual({ row: 0, col: 2 });
    expect(TVFocus.move([3], { row: 0, col: 0 }, 'up')).toEqual({ row: 0, col: 0 });
    expect(TVFocus.move([3, 0], { row: 0, col: 0 }, 'down')).toEqual({ row: 0, col: 0 });
  });
  test('up clamps', () => {
    expect(TVFocus.move([3, 5], { row: 1, col: 4 }, 'up')).toEqual({ row: 0, col: 2 });
  });
});

describe('TVFocus.manager', () => {
  function setup() {
    document.body.innerHTML = '<div id="c"><a id="a"></a><a id="b"></a><input id="i"><a id="d"></a></div>';
    const g = (id) => document.getElementById(id);
    Element.prototype.scrollIntoView = jest.fn();
    const m = TVFocus.manager(g('c'));
    m.setRows([[g('a'), g('b')], [g('i')], [g('d')]]);
    return { g, m };
  }
  test('setRows focuses first; right moves focus', () => {
    const { g, m } = setup();
    expect(g('a').classList.contains('focused')).toBe(true);
    expect(m.handle('right')).toBe(true);
    expect(g('b').classList.contains('focused')).toBe(true);
    expect(g('a').classList.contains('focused')).toBe(false);
    expect(m.current()).toBe(g('b'));
    expect(g('b').scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
  test('edge move still consumed; non-nav action not', () => {
    const { g, m } = setup();
    expect(m.handle('left')).toBe(true);
    expect(g('a').classList.contains('focused')).toBe(true);
    expect(m.handle('back')).toBe(false);
    expect(m.handle('ok')).toBe(false);
  });
  test('input gets DOM focus; only one focused', () => {
    const { g, m } = setup();
    m.handle('down');
    expect(document.activeElement).toBe(g('i'));
    expect(document.querySelectorAll('.focused').length).toBe(1);
    m.focusAt(2, 0);
    expect(g('d').classList.contains('focused')).toBe(true);
    expect(document.querySelectorAll('.focused').length).toBe(1);
  });
  test('setRows keeps position when still valid', () => {
    const { g, m } = setup();
    m.focusAt(0, 1);
    m.setRows([[g('a'), g('b')], [g('d')]]);
    expect(m.current()).toBe(g('b'));
  });
});
