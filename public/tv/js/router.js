/*
 * Hash router for the TV front end. Plain ES5.
 * Routes: login, home, search, detail, play, info. Unknown or empty hash -> home.
 * parse(hash) -> {name, params} (params are strings); format(name, params) -> '#/name?k=v'.
 */
(function (root) {
  'use strict';

  var ROUTES = { login: 1, home: 1, search: 1, detail: 1, play: 1, info: 1 };

  function decode(s) {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' '));
    } catch (e) {
      return s;
    }
  }

  function parse(hash) {
    var h = typeof hash === 'string' ? hash : '';
    if (h.charAt(0) === '#') h = h.slice(1);
    if (h.charAt(0) === '/') h = h.slice(1);
    var qi = h.indexOf('?');
    var name = qi < 0 ? h : h.slice(0, qi);
    var query = qi < 0 ? '' : h.slice(qi + 1);
    if (!Object.prototype.hasOwnProperty.call(ROUTES, name)) {
      return { name: 'home', params: {} };
    }
    var params = {};
    if (query) {
      var parts = query.split('&');
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        var eq = parts[i].indexOf('=');
        var k = decode(eq < 0 ? parts[i] : parts[i].slice(0, eq));
        params[k] = eq < 0 ? '' : decode(parts[i].slice(eq + 1));
      }
    }
    return { name: name, params: params };
  }

  function format(name, params) {
    var out = [];
    if (params) {
      for (var k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k) && params[k] !== undefined && params[k] !== null) {
          out.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
        }
      }
    }
    return '#/' + name + (out.length ? '?' + out.join('&') : '');
  }

  var router = { parse: parse, format: format };
  root.TVRouter = router;
  if (typeof module !== 'undefined' && module.exports) module.exports = router;
})(typeof window !== 'undefined' ? window : this);
