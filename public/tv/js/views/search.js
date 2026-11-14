/* Search view: input, history chips, results grid (6 columns). Plain ES5. */
(function (root) {
  'use strict';
  var views = (root.TVViews = root.TVViews || {});
  var MAX_RESULTS = 60;
  var COLUMNS = 6;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  views.search = {
    mount: function (el0, params, ctx) {
      var gone = false;
      var seq = 0;
      var api = ctx.api;
      var history = [];
      var chips = [];
      var cards = [];

      var input = el('input', 'field');
      input.type = 'text';
      input.placeholder = '搜索影视';
      input.autocomplete = 'off';
      var msg = el('p', 'msg');
      var chipBox = el('div', 'chips');
      var grid = el('div', 'grid');
      el0.appendChild(input);
      el0.appendChild(msg);
      el0.appendChild(chipBox);
      el0.appendChild(grid);

      // Moving focus off the input blurs it (the focus manager does that), so Backspace means Back again.
      function layout() {
        var rows = [[input], chips];
        for (var i = 0; i < cards.length; i += COLUMNS) rows.push(cards.slice(i, i + COLUMNS));
        ctx.focus.setRows(rows);
      }

      function renderChips() {
        chipBox.innerHTML = '';
        chips = history.slice(0, 10).map(function (kw) {
          var c = el('button', 'chip', kw);
          c.onclick = function () { input.value = kw; run(kw); };
          chipBox.appendChild(c);
          return c;
        });
        layout();
      }

      function renderResults(list) {
        grid.innerHTML = '';
        cards = list.slice(0, MAX_RESULTS).map(function (r) {
          var c = el('div', 'card');
          c.tabIndex = -1;
          var poster = el('div', 'poster');
          if (r.poster) {
            var img = el('img');
            img.setAttribute('loading', 'lazy');
            img.alt = '';
            img.src = api.imageUrl(r.poster);
            poster.appendChild(img);
          }
          c.appendChild(poster);
          c.appendChild(el('div', 'card-title', r.title || ''));
          c.onclick = function () { ctx.go('detail', { source: r.source, id: r.id, title: r.title }); };
          grid.appendChild(c);
          return c;
        });
        layout();
      }

      function run(text) {
        text = (text || '').replace(/^\s+|\s+$/g, '');
        if (!text) return;
        var mine = ++seq;
        msg.textContent = '搜索中…';
        renderResults([]);
        api.search(text).then(function (list) {
          if (gone || mine !== seq) return;
          list = list || [];
          msg.textContent = list.length ? '' : '没有找到结果';
          renderResults(list);
          api.addSearchHistory(text).then(function () {
            return api.searchHistory();
          }).then(function (h) {
            if (gone || !h || !h.length) return;
            history = h;
            renderChips();
          }, function () { /* history is a convenience */ });
        }, function (err) {
          if (gone || mine !== seq) return;
          msg.textContent = (err && err.message) || '搜索失败';
        });
      }

      input.addEventListener('keydown', function (ev) {
        if (ev.keyCode === 13) run(input.value);
      });

      layout();
      api.searchHistory().then(function (h) {
        if (gone) return;
        history = h && h.length ? h : [];
        renderChips();
      }, function () { /* no history chips */ });

      if (params && params.q) {
        input.value = params.q;
        if (params.auto) run(params.q);
      }

      return function () { gone = true; };
    }
  };
})(typeof window !== 'undefined' ? window : this);
