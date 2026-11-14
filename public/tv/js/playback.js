/*
 * Playback rules for the TV player: seek steps, resume/intro start time, outro skip, play records.
 * Episode indexes are 0-based here; PlayRecord.index is 1-based. Every returned time is finite.
 * Plain ES5 (Chromium 94 floor).
 */
(function (root) {
  'use strict';

  var SAVE_INTERVAL_MS = 10000;

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  // Positive finite duration, else 0 (covers 0, NaN, Infinity from live or unloaded media).
  function dur(v) {
    var n = num(v);
    return n > 0 ? n : 0;
  }

  function seekStep(heldMs) {
    if (heldMs < 1000) return 10;
    if (heldMs < 3000) return 30;
    return 60;
  }

  function startTime(record, skip, epIndex) {
    if (record && record.index - 1 === epIndex) {
      var played = num(record.play_time);
      if (played > 0 && played < num(record.total_time) - 5) return played;
    }
    if (skip && skip.enable) {
      var intro = num(skip.intro_time);
      if (intro > 0) return intro;
    }
    return 0;
  }

  function shouldSkipOutro(skip, currentTime, duration) {
    if (!skip || !skip.enable) return false;
    var outro = num(skip.outro_time);
    var d = dur(duration);
    if (outro <= 0 || d <= 0) return false;
    if (typeof currentTime !== 'number' || !isFinite(currentTime)) return false;
    return currentTime >= d - outro;
  }

  function buildRecord(detail, epIndex, currentTime, duration, searchTitle) {
    var d = detail || {};
    return {
      title: d.title || '',
      source_name: d.source_name || '',
      year: d.year || '',
      cover: d.poster || '',
      index: epIndex + 1,
      total_episodes: d.episodes && d.episodes.length ? d.episodes.length : 1,
      play_time: Math.floor(Math.max(0, num(currentTime))),
      total_time: Math.floor(dur(duration)),
      save_time: Date.now(),
      search_title: searchTitle || ''
    };
  }

  function nextEpisode(detail, epIndex) {
    var n = detail && detail.episodes ? detail.episodes.length : 0;
    return epIndex + 1 < n ? epIndex + 1 : null;
  }

  var api = {
    SAVE_INTERVAL_MS: SAVE_INTERVAL_MS,
    seekStep: seekStep,
    startTime: startTime,
    shouldSkipOutro: shouldSkipOutro,
    buildRecord: buildRecord,
    nextEpisode: nextEpisode
  };
  root.TVPlayback = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
