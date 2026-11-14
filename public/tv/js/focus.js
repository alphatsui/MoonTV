/*
 * Spatial focus for the TV front end. Plain ES5.
 * move(rows, pos, dir) -> pos: pure grid navigation, rows = item count per row.
 * manager(container): owns the single visible focus (class "focused") over rows of elements.
 */
(function (root) {
  'use strict';

  function move(rows, pos, dir) {
    var row = pos.row;
    var col = pos.col;
    if (dir === 'left') {
      return col > 0 ? { row: row, col: col - 1 } : { row: row, col: col };
    }
    if (dir === 'right') {
      return col < rows[row] - 1 ? { row: row, col: col + 1 } : { row: row, col: col };
    }
    var step = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    if (!step) return { row: row, col: col };
    for (var r = row + step; r >= 0 && r < rows.length; r += step) {
      if (rows[r] > 0) return { row: r, col: Math.min(col, rows[r] - 1) };
    }
    return { row: row, col: col };
  }

  function counts(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) out.push(rows[i].length);
    return out;
  }

  function manager(container) {
    var rows = [];
    var pos = { row: 0, col: 0 };
    var shown = null;

    function current() {
      return rows[pos.row] && rows[pos.row][pos.col] ? rows[pos.row][pos.col] : null;
    }

    function show() {
      var el = current();
      if (shown && shown !== el) shown.classList.remove('focused');
      shown = el;
      if (!el) return;
      el.classList.add('focused');
      if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (el.tagName === 'INPUT' && el.focus) el.focus();
    }

    function focusAt(row, col) {
      if (rows[row] && rows[row][col]) {
        pos = { row: row, col: col };
        show();
      }
    }

    function setRows(arr) {
      rows = arr || [];
      if (shown) shown.classList.remove('focused');
      shown = null;
      if (!(rows[pos.row] && rows[pos.row][pos.col])) {
        pos = { row: 0, col: 0 };
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].length) {
            pos = { row: i, col: 0 };
            break;
          }
        }
      }
      show();
    }

    function handle(action) {
      if (action !== 'up' && action !== 'down' && action !== 'left' && action !== 'right') return false;
      pos = move(counts(rows), pos, action);
      show();
      return true;
    }

    return { setRows: setRows, handle: handle, focusAt: focusAt, current: current, container: container };
  }

  var focus = { move: move, manager: manager };
  root.TVFocus = focus;
  if (typeof module !== 'undefined' && module.exports) module.exports = focus;
})(typeof window !== 'undefined' ? window : this);
