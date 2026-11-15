/* Home view: header buttons plus rows that appear as their data arrives. Plain ES5. */
(function (root) {
  'use strict';
  var views = (root.TVViews = root.TVViews || {});
  var MAX_CARDS = 30;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function card(api, title, image, onOk, progress) {
    var c = el('div', 'card');
    c.tabIndex = -1;
    var poster = el('div', 'poster');
    if (image) {
      var img = el('img');
      img.setAttribute('loading', 'lazy');
      img.alt = '';
      img.src = api.imageUrl(image);
      poster.appendChild(img);
    }
    if (progress !== undefined) {
      var bar = el('div', 'progress');
      var fill = el('div', 'progress-fill');
      fill.style.width = Math.round(progress * 100) + '%';
      bar.appendChild(fill);
      poster.appendChild(bar);
    }
    c.appendChild(poster);
    c.appendChild(el('div', 'card-title', title || ''));
    c.onclick = onOk;
    return c;
  }

  // Records and favorites are objects keyed "source+id".
  function entries(map) {
    var out = [];
    if (!map || typeof map !== 'object') return out;
    Object.keys(map).forEach(function (key) {
      var i = key.indexOf('+');
      var v = map[key];
      if (i < 0 || !v) return;
      out.push({ source: key.slice(0, i), id: key.slice(i + 1), v: v });
    });
    out.sort(function (a, b) { return (b.v.save_time || 0) - (a.v.save_time || 0); });
    return out.slice(0, MAX_CARDS);
  }

  function ratio(v) {
    var p = v.total_time > 0 ? v.play_time / v.total_time : 0;
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  views.home = {
    mount: function (el0, params, ctx) {
      var gone = false;
      var userMoved = false;
      var api = ctx.api;

      var header = el('div', 'header');
      var searchBtn = el('button', 'btn', '搜索');
      var infoBtn = el('button', 'btn', '关于');
      searchBtn.onclick = function () { ctx.go('search'); };
      infoBtn.onclick = function () { ctx.go('info'); };
      header.appendChild(searchBtn);
      header.appendChild(infoBtn);
      el0.appendChild(header);

      var defs = [
        { title: '继续观看', load: function () { return api.playRecords().then(entries); }, make: function (e) {
          return card(api, e.v.title, e.v.cover, function () {
            ctx.go('play', { source: e.source, id: e.id, ep: (e.v.index || 1) - 1, t: e.v.play_time || 0 });
          }, ratio(e.v));
        } },
        { title: '我的收藏', load: function () { return api.favorites().then(entries); }, make: function (e) {
          return card(api, e.v.title, e.v.cover, function () {
            ctx.go('detail', { source: e.source, id: e.id, title: e.v.title });
          });
        } }
      ];
      [['热门电影', 'movie'], ['热门剧集', 'tv'], ['热门综艺', 'show']].forEach(function (d) {
        defs.push({ title: d[0], load: function () {
          return api.doubanHot(d[1]).then(function (l) { return (l || []).slice(0, MAX_CARDS); });
        }, make: function (it) {
          return card(api, it.title, it.poster, function () { ctx.go('search', { q: it.title, auto: 1 }); });
        } });
      });

      var slots = defs.map(function () { return null; }); // filled: { section, cards }

      function layout() {
        var keep = ctx.focus.current();
        var rows = [[searchBtn, infoBtn]];
        slots.forEach(function (s) { if (s && s.cards.length) rows.push(s.cards); });
        ctx.focus.setRows(rows);
        // setRows keeps the position by index; a row inserted above must not steal the focus.
        for (var r = 0; r < rows.length; r++) {
          var c = rows[r].indexOf(keep);
          if (c >= 0) { ctx.focus.focusAt(r, c); return; }
        }
      }

      ctx.onKey(function () { userMoved = true; return false; });
      layout();

      defs.forEach(function (def, i) {
        var p;
        try { p = def.load(); } catch (e) { p = Promise.reject(e); }
        p.then(function (items) {
          if (gone || !items || !items.length) return;
          var section = el('div', 'row');
          section.appendChild(el('h2', 'row-title', def.title));
          var strip = el('div', 'strip');
          var cards = items.map(def.make);
          cards.forEach(function (c) { strip.appendChild(c); });
          section.appendChild(strip);
          slots[i] = { section: section, cards: cards };
          // Keep DOM order equal to definition order.
          var next = null;
          for (var j = i + 1; j < slots.length && !next; j++) if (slots[j]) next = slots[j].section;
          el0.insertBefore(section, next);
          layout();
          if (i === 0 && !userMoved) ctx.focus.focusAt(1, 0);
        }, function () { /* a failed row stays hidden */ });
      });

      return function () { gone = true; };
    }
  };
})(typeof window !== 'undefined' ? window : this);
