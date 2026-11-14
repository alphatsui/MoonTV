/* Detail view: play/continue + favorite buttons, sources row, episodes grid (10 columns). Plain ES5. */
(function (root) {
  'use strict';
  var views = (root.TVViews = root.TVViews || {});
  var COLUMNS = 10;
  var EMPTY = '该来源暂无可播放内容';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function trim(s) {
    return String(s === undefined || s === null ? '' : s).replace(/^\s+|\s+$/g, '');
  }

  // Resolves { ok, v } and never rejects, so one failed request cannot blank the page.
  function settle(make) {
    var p;
    try { p = make(); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (v) { return { ok: true, v: v }; }, function () { return { ok: false }; });
  }

  views.detail = {
    mount: function (el0, params, ctx) {
      var gone = false;
      var api = ctx.api;
      params = params || {};
      var source = params.source;
      var id = params.id;
      var key = source + '+' + id;

      var msg = el('p', 'msg');
      var body = el('div', 'detail-body');
      el0.appendChild(msg);
      el0.appendChild(body);
      msg.textContent = '加载中…';

      function render(d, list, record, favored) {
        msg.textContent = '';
        body.innerHTML = '';
        var episodes = d && d.episodes && d.episodes.length ? d.episodes : [];
        var title = trim((d && d.title) || params.title);
        var rows = [];

        var top = el('div', 'detail-top');
        if (d) {
          var poster = el('div', 'poster detail-poster');
          if (d.poster) {
            var img = el('img');
            img.alt = '';
            img.src = api.imageUrl(d.poster);
            poster.appendChild(img);
          }
          top.appendChild(poster);
        }
        var info = el('div', 'detail-info');
        info.appendChild(el('h1', 'detail-title', title));
        var meta = [];
        if (d && d.year) meta.push(d.year);
        if (d && d.source_name) meta.push(d.source_name);
        if (meta.length) info.appendChild(el('div', 'detail-meta', meta.join(' · ')));
        if (d && d.desc) info.appendChild(el('div', 'detail-desc', d.desc));
        top.appendChild(info);
        body.appendChild(top);

        if (!episodes.length) {
          msg.textContent = EMPTY;
        } else {
          var btnRow = el('div', 'detail-buttons');
          var playLabel = '▶ 播放';
          var ep = 0;
          var t = 0;
          if (record && record.index > 0) {
            playLabel = '▶ 继续 第' + record.index + '集';
            ep = record.index - 1;
            t = record.play_time || 0;
          }
          var playBtn = el('button', 'btn', playLabel);
          playBtn.onclick = function () { ctx.go('play', { source: source, id: id, ep: ep, t: t }); };
          var favBtn = el('button', 'btn', favored ? '♥ 已收藏' : '♥ 收藏');
          var busy = false;
          favBtn.onclick = function () {
            if (busy) return;
            busy = true;
            var next = !favored;
            var p;
            try {
              p = next
                ? api.addFavorite(key, {
                    title: title,
                    source_name: d.source_name,
                    year: d.year,
                    cover: d.poster,
                    total_episodes: episodes.length,
                    search_title: title,
                    save_time: Date.now()
                  })
                : api.removeFavorite(key);
            } catch (e) { p = Promise.reject(e); }
            Promise.resolve(p).then(function () {
              busy = false;
              if (gone) return;
              favored = next;
              favBtn.textContent = favored ? '♥ 已收藏' : '♥ 收藏';
            }, function () { busy = false; /* label stays; OK retries */ });
          };
          btnRow.appendChild(playBtn);
          btnRow.appendChild(favBtn);
          body.appendChild(btnRow);
          rows.push([playBtn, favBtn]);
        }

        var chipEls = [];
        var firstOther = -1;
        if (list.length) {
          var srcRow = el('div', 'chips detail-sources');
          list.forEach(function (s) {
            var current = s.source === source && String(s.id) === String(id);
            var c = el('button', 'chip', (current ? '✓ ' : '') + (s.source_name || s.source));
            c.onclick = function () {
              if (current) return;
              ctx.replace('detail', { source: s.source, id: s.id, title: title });
            };
            srcRow.appendChild(c);
            if (!current && firstOther < 0) firstOther = chipEls.length;
            chipEls.push(c);
          });
          body.appendChild(srcRow);
          rows.push(chipEls);
        }

        if (episodes.length) {
          var grid = el('div', 'ep-grid');
          var eps = episodes.map(function (u, i) {
            var e = el('div', 'ep', String(i + 1));
            e.tabIndex = -1;
            e.onclick = function () { ctx.go('play', { source: source, id: id, ep: i, t: 0 }); };
            grid.appendChild(e);
            return e;
          });
          body.appendChild(grid);
          for (var i = 0; i < eps.length; i += COLUMNS) rows.push(eps.slice(i, i + COLUMNS));
        }

        if (!episodes.length && !chipEls.length) {
          var back = el('button', 'btn', '返回');
          back.onclick = function () { root.history.back(); };
          body.appendChild(back);
          rows.push([back]);
        }
        ctx.focus.setRows(rows);
        // Nothing to play here: land on the first other source, not on the current one.
        if (!episodes.length && firstOther >= 0) ctx.focus.focusAt(rows.length - 1, firstOther);
      }

      var dp = settle(function () { return api.detail(source, id); });
      var sp = dp.then(function (r) {
        var title = trim((r.ok && r.v && r.v.title) || params.title);
        if (!title) return { ok: true, v: [] };
        return settle(function () { return api.search(title); });
      });
      var rp = settle(function () { return api.playRecords(); });
      var fp = settle(function () { return api.favorites(); });

      Promise.all([dp, sp, rp, fp]).then(function (a) {
        if (gone) return;
        var d = a[0].ok && a[0].v ? a[0].v : null;
        var title = trim((d && d.title) || params.title);
        var list = [];
        var hasCurrent = false;
        if (a[1].ok && a[1].v) {
          a[1].v.forEach(function (s) {
            if (trim(s.title) !== title) return;
            if (s.source === source && String(s.id) === String(id)) hasCurrent = true;
            list.push(s);
          });
        }
        // The current source leads the row even when search did not return it.
        if (d && !hasCurrent) list.unshift({ source: source, id: id, source_name: d.source_name });
        var record = a[2].ok && a[2].v ? a[2].v[key] : null;
        var favored = !!(a[3].ok && a[3].v && a[3].v[key]);
        render(d, list, record, favored);
      });

      return function () { gone = true; };
    }
  };
})(typeof window !== 'undefined' ? window : this);
