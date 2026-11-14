/*
 * App shell for the TV front end. Plain ES5.
 * boot(deps) wires hash routing, remote keys and the view contract:
 *   TVViews.<name> = { mount(el, params, ctx) -> optional unmount function }
 *   ctx = { api, go(name, params), replace(name, params), focus: TVFocus.manager(el), onKey(fn) }
 * deps: { api, root, win, doc, views, router, keys, focus } (all but api default to the browser globals).
 */
(function (root) {
  'use strict';

  var VERSION = '0.1.0';

  function boot(deps) {
    var win = deps.win || window;
    var doc = deps.doc || win.document;
    var mountEl = deps.root || doc.getElementById('app');
    var router = deps.router || win.TVRouter;
    var keys = deps.keys || win.TVKeys;
    var focusLib = deps.focus || win.TVFocus;
    var rawApi = deps.api;
    var views = deps.views || (win.TVViews = win.TVViews || {});

    var current = null; // { name, unmount, keyHandlers, focus }

    function currentName() {
      return router.parse(win.location.hash).name;
    }

    function replace(name, params) {
      win.location.replace(router.format(name, params));
    }

    function go(name, params) {
      win.location.hash = router.format(name, params);
    }

    // A rejected AUTH promise anywhere means: log in again. Never loops from the login view itself.
    function handleAuth(err) {
      if (err && err.code === 'AUTH' && currentName() !== 'login') {
        replace('login', { msg: 'expired' });
      }
    }

    // Wrap api methods so an AUTH rejection reaches the app, and still rejects for the caller.
    var api = {};
    Object.keys(rawApi).forEach(function (k) {
      var fn = rawApi[k];
      if (typeof fn !== 'function') {
        api[k] = fn;
        return;
      }
      api[k] = function () {
        var out = fn.apply(rawApi, arguments);
        if (out && typeof out.then === 'function') {
          return out.then(null, function (err) {
            handleAuth(err);
            throw err;
          });
        }
        return out;
      };
    });

    function unmountCurrent() {
      var c = current;
      current = null;
      if (c && typeof c.unmount === 'function') {
        try { c.unmount(); } catch (e) { /* a broken unmount must not block navigation */ }
      }
    }

    function showError(el, ctx) {
      el.innerHTML = '';
      var box = doc.createElement('div');
      box.className = 'error-box';
      var h = doc.createElement('h1');
      h.textContent = '出错了';
      var btn = doc.createElement('button');
      btn.className = 'btn';
      btn.textContent = '返回';
      btn.onclick = function () { win.history.back(); };
      box.appendChild(h);
      box.appendChild(btn);
      el.appendChild(box);
      ctx.focus.setRows([[btn]]);
    }

    function render() {
      unmountCurrent();
      var route = router.parse(win.location.hash);
      if (route.name !== 'login' && !rawApi.getCreds()) {
        replace('login');
        return;
      }
      mountEl.innerHTML = '';
      var el = doc.createElement('div');
      el.className = 'view view-' + route.name;
      mountEl.appendChild(el);

      var cur = { name: route.name, unmount: null, keyHandlers: [] };
      var ctx = {
        api: api,
        go: go,
        replace: replace,
        focus: focusLib.manager(el),
        onKey: function (fn) { cur.keyHandlers.push(fn); }
      };
      cur.focus = ctx.focus;
      current = cur;
      try {
        var view = views[route.name];
        if (!view || typeof view.mount !== 'function') throw new Error('no view: ' + route.name);
        var un = view.mount(el, route.params, ctx);
        if (typeof un === 'function') cur.unmount = un;
      } catch (e) {
        cur.keyHandlers = [];
        cur.unmount = null;
        showError(el, ctx);
      }
    }

    function onKeyDown(ev) {
      var action = keys.action(ev);
      if (!action || !current) return;
      var i;
      for (i = 0; i < current.keyHandlers.length; i++) {
        if (current.keyHandlers[i](action)) {
          ev.preventDefault();
          return;
        }
      }
      if (current.focus.handle(action)) {
        ev.preventDefault();
        return;
      }
      if (action === 'ok') {
        var el = current.focus.current();
        // OK on a text field opens the TV keyboard natively; leave it alone.
        if (el && el.tagName !== 'INPUT' && el.click) {
          ev.preventDefault();
          el.click();
        }
        return;
      }
      if (action === 'back') {
        ev.preventDefault();
        win.history.back();
      }
    }

    function onRejection(ev) {
      if (ev && ev.reason) handleAuth(ev.reason);
    }

    win.addEventListener('hashchange', render);
    doc.addEventListener('keydown', onKeyDown);
    win.addEventListener('unhandledrejection', onRejection);
    render();

    return {
      render: render,
      destroy: function () {
        unmountCurrent();
        win.removeEventListener('hashchange', render);
        doc.removeEventListener('keydown', onKeyDown);
        win.removeEventListener('unhandledrejection', onRejection);
      }
    };
  }

  var app = { VERSION: VERSION, boot: boot };
  root.TVApp = app;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = app;
  } else if (typeof document !== 'undefined') {
    var start = function () {
      var api = root.TVApi.create({ fetch: root.fetch.bind(root), storage: root.localStorage });
      boot({ api: api });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : this);
