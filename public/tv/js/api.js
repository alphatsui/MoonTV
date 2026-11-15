/*
 * API client for the TV front end. Same-origin /api/* only.
 * Credentials live in localStorage (plain text, accepted by the owner); on 401 the client logs in
 * again once and retries the request once. Plain ES5 (Chromium 94 floor), Promise chains only.
 *
 * Errors: err.code === 'AUTH'    log in again (no credentials, or re-login failed)
 *         err.code === 'HTTP'    err.status holds the HTTP status
 *         err.code === 'NETWORK' fetch itself rejected
 */
(function (root) {
  'use strict';

  var KEY = 'moontv.tv.auth.v1';
  var LOGIN_FAILED = '登录失败';

  function makeError(code, message, status) {
    var err = new Error(message);
    err.code = code;
    if (status !== undefined) err.status = status;
    return err;
  }

  function q(params) {
    var out = [];
    for (var i = 0; i < params.length; i++) {
      out.push(params[i][0] + '=' + encodeURIComponent(params[i][1]));
    }
    return out.join('&');
  }

  var DOUBAN = {
    movie: { kind: 'movie', category: '热门', type: '全部' },
    tv: { kind: 'tv', category: 'tv', type: 'tv' },
    show: { kind: 'tv', category: 'show', type: 'show' }
  };

  function create(deps) {
    var doFetch = deps.fetch;
    var storage = deps.storage || null;
    var relogin = null; // in-flight re-login, shared by concurrent 401s

    function getCreds() {
      try {
        var raw = storage ? storage.getItem(KEY) : null;
        if (!raw) return null;
        var c = JSON.parse(raw);
        return c && typeof c.username === 'string' && typeof c.password === 'string' ? c : null;
      } catch (e) {
        return null;
      }
    }

    function clearCreds() {
      try { if (storage) storage.removeItem(KEY); } catch (e) { /* blocked storage */ }
    }

    // One fetch. Resolves {status, ok, data}; rejects NETWORK.
    function send(method, path, body) {
      var opts = { method: method, credentials: 'same-origin' };
      if (body !== undefined) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
      return Promise.resolve()
        .then(function () { return doFetch(path, opts); })
        .then(
          function (res) {
            return Promise.resolve()
              .then(function () { return res.json(); })
              .then(null, function () { return null; })
              .then(function (data) { return { status: res.status, ok: res.ok, data: data }; });
          },
          function (e) {
            throw makeError('NETWORK', (e && e.message) || 'Network error');
          }
        );
    }

    function loginError(r) {
      var msg = (r.data && r.data.error) || LOGIN_FAILED;
      return makeError('HTTP', msg, r.status);
    }

    function login(username, password) {
      return send('POST', '/api/login', { username: username, password: password }).then(function (r) {
        if (!r.ok) throw loginError(r);
        try { if (storage) storage.setItem(KEY, JSON.stringify({ username: username, password: password })); } catch (e) { /* blocked storage */ }
      });
    }

    // Log in with the stored credentials. Only a credential rejection (400 or 401, the statuses
    // /api/login uses for that) clears them and rejects AUTH. Every other status (an edge 403 or 429,
    // a 5xx) and network errors keep them so a later try can succeed.
    function reloginOnce() {
      if (relogin) return relogin;
      var c = getCreds();
      if (!c) return Promise.reject(makeError('AUTH', 'Not logged in'));
      relogin = send('POST', '/api/login', { username: c.username, password: c.password })
        .then(function (r) {
          relogin = null;
          if (r.ok) return;
          if (r.status === 400 || r.status === 401) {
            clearCreds();
            throw makeError('AUTH', (r.data && r.data.error) || LOGIN_FAILED, r.status);
          }
          throw loginError(r);
        }, function (e) {
          relogin = null;
          throw e;
        });
      return relogin;
    }

    function request(method, path, body) {
      return send(method, path, body).then(function (r) {
        if (r.status === 401) {
          return reloginOnce().then(function () {
            return send(method, path, body);
          }).then(function (r2) {
            if (r2.status === 401) throw makeError('AUTH', 'Not logged in', 401);
            return r2;
          });
        }
        return r;
      }).then(function (r) {
        if (!r.ok) {
          throw makeError('HTTP', (r.data && r.data.error) || ('HTTP ' + r.status), r.status);
        }
        return r.data;
      });
    }

    return {
      getCreds: getCreds,
      login: login,
      logout: clearCreds,

      serverConfig: function () { return request('GET', '/api/server-config'); },

      playRecords: function () { return request('GET', '/api/playrecords'); },
      savePlayRecord: function (key, record) { return request('POST', '/api/playrecords', { key: key, record: record }); },
      deletePlayRecord: function (key) { return request('DELETE', '/api/playrecords?' + q([['key', key]])); },

      favorites: function () { return request('GET', '/api/favorites'); },
      addFavorite: function (key, favorite) { return request('POST', '/api/favorites', { key: key, favorite: favorite }); },
      removeFavorite: function (key) { return request('DELETE', '/api/favorites?' + q([['key', key]])); },

      search: function (text) {
        return request('GET', '/api/search?' + q([['q', text]])).then(function (d) {
          return (d && d.results) || [];
        });
      },
      detail: function (source, id) {
        return request('GET', '/api/detail?' + q([['source', source], ['id', id]]));
      },

      // Home rails never fail: anything but code 200 gives [].
      doubanHot: function (kind) {
        var p = DOUBAN[kind];
        if (!p) return Promise.resolve([]);
        return request('GET', '/api/douban/categories?' + q([['kind', p.kind], ['category', p.category], ['type', p.type]]))
          .then(function (d) { return d && d.code === 200 && d.list ? d.list : []; })
          .then(null, function () { return []; });
      },

      searchHistory: function () { return request('GET', '/api/searchhistory'); },
      addSearchHistory: function (keyword) { return request('POST', '/api/searchhistory', { keyword: keyword }); },

      skipConfig: function (source, id) {
        return request('GET', '/api/skipconfigs?' + q([['source', source], ['id', id]]));
      },

      imageUrl: function (url) { return '/api/image-proxy?url=' + encodeURIComponent(url); }
    };
  }

  var api = { create: create, KEY: KEY };
  root.TVApi = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
