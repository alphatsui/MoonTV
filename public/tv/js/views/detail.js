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

      var page = null; // the rendered page; see render()
      var found = null; // exact-title search results, null until the search settles

      function isCurrent(s) {
        return s.source === source && String(s.id) === String(id);
      }

      function backButton() {
        var b = el('button', 'btn', '返回');
        b.onclick = function () { root.history.back(); };
        return b;
      }

      // Like home.js: setRows keeps the position by index, so re-find the element that had focus.
      function layout(keep) {
        var rows = [];
        if (page.buttons) rows.push(page.buttons);
        if (page.chipEls.length) rows.push(page.chipEls);
        for (var i = 0; i < page.epRows.length; i++) rows.push(page.epRows[i]);
        if (page.back) rows.push([page.back]);
        ctx.focus.setRows(rows);
        for (var r = 0; r < rows.length; r++) {
          var c = rows[r].indexOf(keep);
          if (c >= 0) { ctx.focus.focusAt(r, c); return; }
        }
      }

      // (Re)builds the sources row: on the first render, and again when the search arrives.
      function renderSources() {
        var keep = ctx.focus.current();
        var keepKey = keep && page.chipEls.indexOf(keep) >= 0 ? keep.getAttribute('data-src') : null;
        var list = (found || []).slice();
        // The current source leads the row even when search did not return it.
        if (page.d && !list.some(isCurrent)) list.unshift({ source: source, id: id, source_name: page.d.source_name });

        page.srcBox.innerHTML = '';
        page.chipEls = [];
        page.firstOther = -1;
        list.forEach(function (s) {
          var current = isCurrent(s);
          var c = el('button', 'chip', (current ? '✓ ' : '') + (s.source_name || s.source));
          c.setAttribute('data-src', s.source + '+' + s.id);
          if (current) c.setAttribute('data-current', '1');
          c.onclick = function () {
            if (current) return;
            ctx.replace('detail', { source: s.source, id: s.id, title: page.title });
          };
          page.srcBox.appendChild(c);
          if (!current && page.firstOther < 0) page.firstOther = page.chipEls.length;
          if (keepKey && keepKey === s.source + '+' + s.id) keep = c;
          page.chipEls.push(c);
        });
        page.srcBox.style.display = page.chipEls.length ? '' : 'none';

        if (!page.episodes.length) {
          // Nothing to play here: offer another source, or 返回 when there is none.
          var other = page.firstOther >= 0 ? page.chipEls[page.firstOther] : null;
          if (!other && !page.back) {
            page.back = backButton();
            body.appendChild(page.back);
          } else if (other && page.back) {
            body.removeChild(page.back);
            page.back = null;
          }
          var onOther = keep && page.chipEls.indexOf(keep) >= 0 && !keep.getAttribute('data-current');
          if (!onOther) keep = other || page.back;
        }
        layout(keep);
      }

      function render(d, record, favored) {
        msg.textContent = '';
        body.innerHTML = '';
        var episodes = d && d.episodes && d.episodes.length ? d.episodes : [];
        var title = trim((d && d.title) || params.title);
        page = { d: d, title: title, episodes: episodes, buttons: null, srcBox: null, chipEls: [], firstOther: -1, epRows: [], back: null };

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
          // from=detail tells the player that this detail is the history entry below it.
          playBtn.onclick = function () { ctx.go('play', { source: source, id: id, ep: ep, t: t, from: 'detail' }); };
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
          page.buttons = [playBtn, favBtn];
        }

        page.srcBox = el('div', 'chips detail-sources');
        body.appendChild(page.srcBox);

        if (episodes.length) {
          var grid = el('div', 'ep-grid');
          var eps = episodes.map(function (u, i) {
            var e = el('div', 'ep', String(i + 1));
            e.tabIndex = -1;
            e.onclick = function () { ctx.go('play', { source: source, id: id, ep: i, t: 0, from: 'detail' }); };
            grid.appendChild(e);
            return e;
          });
          body.appendChild(grid);
          for (var i = 0; i < eps.length; i += COLUMNS) page.epRows.push(eps.slice(i, i + COLUMNS));
        }

        renderSources();
      }

      // A throw while rendering must not leave 加载中… with nothing to press.
      function fail() {
        if (gone) return;
        page = null;
        body.innerHTML = '';
        msg.textContent = '加载失败';
        var back = backButton();
        body.appendChild(back);
        ctx.focus.setRows([[back]]);
      }

      var dp = settle(function () { return api.detail(source, id); });
      var rp = settle(function () { return api.playRecords(); });
      var fp = settle(function () { return api.favorites(); });

      // The aggregate search can take seconds per source: render without it, add the sources later.
      Promise.all([dp, rp, fp]).then(function (a) {
        if (gone) return;
        var d = a[0].ok && a[0].v ? a[0].v : null;
        var record = a[1].ok && a[1].v ? a[1].v[key] : null;
        var favored = !!(a[2].ok && a[2].v && a[2].v[key]);
        render(d, record, favored);
      }).then(null, fail);

      dp.then(function (r) {
        var title = trim((r.ok && r.v && r.v.title) || params.title);
        if (!title) return null;
        return settle(function () { return api.search(title); }).then(function (s) {
          if (!s.ok || !s.v) return null;
          return s.v.filter(function (x) { return trim(x.title) === title; });
        });
      }).then(function (list) {
        if (gone || !list) return;
        found = list;
        // Before the first render, render() picks the list up; after a failure there is no page.
        if (page) renderSources();
      }).then(null, fail);

      return function () { gone = true; };
    }
  };
})(typeof window !== 'undefined' ? window : this);
