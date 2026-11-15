/*
 * Player view: full-screen <video> via hls.js (ad filter loader) or native HLS, resume, outro skip,
 * next episode, periodic play record saves, bottom overlay with 下一集 / 选集 / 换来源. Plain ES5.
 */
(function (root) {
  'use strict';
  var views = (root.TVViews = root.TVViews || {});
  var INFO_MS = 4000; // overlay after play/pause or seek
  var REPEAT_GAP_MS = 400; // a longer gap between keydowns starts a new seek run
  var OUTRO_MIN_PLAYED = 5; // seconds of progress before an outro skip may fire

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function finitePos(v) {
    return typeof v === 'number' && isFinite(v) && v > 0;
  }

  function clock(s) {
    s = finitePos(s) ? Math.floor(s) : 0;
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var mm = (m < 10 ? '0' : '') + m;
    var ss = (sec < 10 ? '0' : '') + sec;
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  // Resolves { ok, v } and never rejects, so a failed lookup cannot block playback.
  function settle(make) {
    var p;
    try { p = make(); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).then(function (v) { return { ok: true, v: v }; }, function () { return { ok: false }; });
  }

  views.play = {
    mount: function (el0, params, ctx) {
      var gone = false;
      var api = ctx.api;
      params = params || {};
      var source = params.source;
      var id = params.id;
      var key = source + '+' + id;
      var ep = parseInt(params.ep, 10);
      if (!(ep >= 0)) ep = 0;
      var tParam = Number(params.t);

      var detail = null;
      var title = '';
      var skip = null;
      var next = null;
      var hls = null;
      var ready = false; // a source is attached
      var failed = false; // 播放失败 is shown
      var mode = 'hidden'; // 'hidden' | 'info' | 'menu'
      var advanced = false; // next episode / back already triggered for this episode
      var startAt = 0;
      var hideTimer = null;
      var saveTimer = null;
      var run = { action: null, start: 0, last: 0 }; // current seek key repeat run

      var stage = el('div', 'player-stage');
      var video = el('video', 'player-video');
      var msg = el('div', 'player-msg', '加载中…');
      var overlay = el('div', 'player-overlay');
      var oTitle = el('div', 'player-title');
      var oEp = el('span', 'player-ep');
      var bar = el('div', 'player-bar');
      var fill = el('div', 'player-bar-fill');
      var oTime = el('div', 'player-time');
      var btnRow = el('div', 'player-buttons');
      var nextBtn = el('button', 'btn', '下一集');
      var epsBtn = el('button', 'btn', '选集');
      var srcBtn = el('button', 'btn', '换来源');
      var errBox = el('div', 'player-error');

      bar.appendChild(fill);
      overlay.appendChild(oTitle);
      overlay.appendChild(bar);
      overlay.appendChild(oTime);
      overlay.appendChild(btnRow);
      stage.appendChild(video);
      stage.appendChild(msg);
      stage.appendChild(overlay);
      stage.appendChild(errBox);
      el0.appendChild(stage);

      function toDetail() {
        ctx.go('detail', { source: source, id: id, title: title });
      }
      nextBtn.onclick = function () {
        if (next !== null) ctx.replace('play', { source: source, id: id, ep: next });
      };
      epsBtn.onclick = toDetail;
      srcBtn.onclick = toDetail;

      function clearHide() {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = null;
      }

      function hideOverlay() {
        clearHide();
        mode = 'hidden';
        overlay.className = 'player-overlay';
        ctx.focus.setRows([]);
      }

      function updateProgress() {
        var c = video.currentTime;
        var d = video.duration;
        var pct = finitePos(d) && finitePos(c) ? Math.min(100, (c / d) * 100) : 0;
        fill.style.width = pct + '%';
        oTime.textContent = clock(c) + ' / ' + clock(d);
      }

      // Title and progress for INFO_MS, without focusable buttons.
      function showInfo() {
        if (mode === 'menu') return;
        clearHide();
        mode = 'info';
        overlay.className = 'player-overlay shown';
        ctx.focus.setRows([]);
        updateProgress();
        hideTimer = setTimeout(function () {
          hideTimer = null;
          if (!gone && mode === 'info') hideOverlay();
        }, INFO_MS);
      }

      function showMenu() {
        clearHide();
        mode = 'menu';
        overlay.className = 'player-overlay shown menu';
        updateProgress();
        btnRow.innerHTML = '';
        var row = [];
        if (next !== null) row.push(nextBtn);
        row.push(epsBtn, srcBtn);
        for (var i = 0; i < row.length; i++) btnRow.appendChild(row[i]);
        ctx.focus.setRows([row]);
      }

      function showError() {
        if (failed) return;
        failed = true;
        hideOverlay();
        msg.textContent = '';
        errBox.innerHTML = '';
        errBox.appendChild(el('h1', null, '播放失败'));
        var swap = el('button', 'btn', '换来源');
        swap.onclick = toDetail;
        var back = el('button', 'btn', '返回');
        back.onclick = function () { root.history.back(); };
        errBox.appendChild(swap);
        errBox.appendChild(back);
        errBox.className = 'player-error shown';
        ctx.focus.setRows([[swap, back]]);
      }

      function save() {
        if (!detail) return;
        var c = video.currentTime;
        var d = video.duration;
        if (!finitePos(c) || !finitePos(d)) return;
        var p;
        try {
          p = api.savePlayRecord(key, root.TVPlayback.buildRecord(detail, ep, c, d, title));
        } catch (e) {
          return;
        }
        // AUTH is redirected to login by ctx.api; every other save error is ignored.
        if (p && typeof p.then === 'function') p.then(null, function () {});
      }

      function advance() {
        if (advanced) return;
        advanced = true;
        if (next !== null) ctx.replace('play', { source: source, id: id, ep: next });
        else root.history.back();
      }

      function play() {
        var p;
        try { p = video.play(); } catch (e) { return; }
        if (p && typeof p.then === 'function') p.then(null, function () {});
      }

      function toggle() {
        if (video.paused) play();
        else video.pause();
        showInfo();
      }

      function seek(action) {
        var now = Date.now();
        if (run.action !== action || now - run.last > REPEAT_GAP_MS) {
          run.action = action;
          run.start = now;
        }
        run.last = now;
        var step = root.TVPlayback.seekStep(now - run.start);
        var forward = action === 'right' || action === 'ff';
        var c = finitePos(video.currentTime) ? video.currentTime : 0;
        var t = c + (forward ? step : -step);
        var d = video.duration;
        if (finitePos(d) && t > d - 1) t = Math.max(0, d - 1);
        if (t < 0) t = 0;
        video.currentTime = t;
        showInfo();
      }

      function onKeyUp() {
        run.action = null;
      }
      document.addEventListener('keyup', onKeyUp);

      ctx.onKey(function (action) {
        if (gone) return false;
        if (action === 'back') {
          if (mode !== 'hidden') {
            hideOverlay();
            return true;
          }
          save();
          return false;
        }
        if (failed || !ready) return false;
        if (action === 'playpause' || action === 'play' || action === 'pause') {
          toggle();
          return true;
        }
        // In the menu, arrows move focus and OK clicks the focused button.
        if (mode === 'menu') return false;
        if (action === 'ok') {
          toggle();
          return true;
        }
        if (action === 'left' || action === 'right' || action === 'ff' || action === 'rw') {
          seek(action);
          return true;
        }
        if (action === 'up' || action === 'down') {
          showMenu();
          return true;
        }
        return false;
      });

      function on(type, fn) {
        video.addEventListener(type, function () {
          if (!gone) fn();
        });
      }

      on('loadedmetadata', function () {
        if (startAt > 0) {
          var d = video.duration;
          video.currentTime = finitePos(d) && startAt >= d ? 0 : startAt;
        }
        startAt = 0;
      });
      on('timeupdate', function () {
        if (mode !== 'hidden') updateProgress();
        var c = video.currentTime;
        var d = video.duration;
        // shouldSkipOutro is literal; only skip after real progress and when the outro fits the episode.
        if (skip && finitePos(d) && c > OUTRO_MIN_PLAYED && Number(skip.outro_time) < d &&
            root.TVPlayback.shouldSkipOutro(skip, c, d)) {
          advance();
        }
      });
      on('pause', save);
      on('ended', advance);
      on('error', function () {
        if (ready) showError();
      });

      function start(url) {
        var Hls = root.Hls;
        ready = true;
        msg.textContent = '';
        if (Hls && Hls.isSupported && Hls.isSupported()) {
          hls = new Hls({ loader: root.TVAdFilter.loaderFor(Hls) });
          hls.on(Hls.Events.ERROR, function (evt, data) {
            if (!gone && data && data.fatal) showError();
          });
          hls.loadSource(url);
          hls.attachMedia(video);
        } else {
          video.src = url;
        }
        play();
        saveTimer = setInterval(function () {
          if (!gone) save();
        }, root.TVPlayback.SAVE_INTERVAL_MS);
      }

      Promise.all([
        settle(function () { return api.detail(source, id); }),
        settle(function () { return api.playRecords(); }),
        settle(function () { return api.skipConfig(source, id); })
      ]).then(function (a) {
        if (gone) return;
        var d = a[0].ok ? a[0].v : null;
        var eps = d && d.episodes && d.episodes.length ? d.episodes : null;
        if (!eps) {
          showError();
          return;
        }
        detail = d;
        title = String(d.title || '').replace(/^\s+|\s+$/g, '');
        if (ep > eps.length - 1) ep = eps.length - 1;
        next = root.TVPlayback.nextEpisode(d, ep);
        skip = a[2].ok && a[2].v ? a[2].v : null;
        var record = a[1].ok && a[1].v ? a[1].v[key] : null;
        startAt = finitePos(tParam) ? tParam : root.TVPlayback.startTime(record, skip, ep);
        oTitle.textContent = title + ' ';
        oEp.textContent = '第' + (ep + 1) + '集';
        oTitle.appendChild(oEp);
        start(eps[ep]);
      });

      return function () {
        if (gone) return;
        save();
        gone = true;
        clearHide();
        if (saveTimer) clearInterval(saveTimer);
        saveTimer = null;
        document.removeEventListener('keyup', onKeyUp);
        if (hls) {
          try { hls.destroy(); } catch (e) { /* already torn down */ }
          hls = null;
        }
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (e2) { /* media teardown must not block navigation */ }
      };
    }
  };
})(typeof window !== 'undefined' ? window : this);
