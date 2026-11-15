/*
 * Remote key mapping for the TV front end (Samsung Tizen codes). Plain ES5.
 * action(event) -> 'up'|'down'|'left'|'right'|'ok'|'back'|'playpause'|'play'|'pause'|'ff'|'rw'|'stop'|null
 */
(function (root) {
  'use strict';

  var MAP = {
    10009: 'back',
    27: 'back',
    13: 'ok',
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down',
    10252: 'playpause',
    415: 'play',
    19: 'pause',
    417: 'ff',
    412: 'rw',
    413: 'stop'
  };

  function action(event) {
    var code = event.keyCode;
    if (code === 8) {
      // Backspace edits text while typing, so it only means Back elsewhere.
      var tag = event.target && event.target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' ? null : 'back';
    }
    return Object.prototype.hasOwnProperty.call(MAP, code) ? MAP[code] : null;
  }

  var keys = { action: action };
  root.TVKeys = keys;
  if (typeof module !== 'undefined' && module.exports) module.exports = keys;
})(typeof window !== 'undefined' ? window : this);
