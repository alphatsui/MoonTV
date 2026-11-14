/*
 * Ad filter for the TV player. Port of filterAdsFromM3U8 and CustomHlsJsLoader in src/app/play/page.tsx.
 * Plain ES5 (Chromium 94 floor).
 */
(function (root) {
  'use strict';

  // Drop every line that contains #EXT-X-DISCONTINUITY.
  function filter(m3u8) {
    if (!m3u8) return '';
    var lines = String(m3u8).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('#EXT-X-DISCONTINUITY') === -1) out.push(lines[i]);
    }
    return out.join('\n');
  }

  // Build a loader class on Hls.DefaultConfig.loader that filters manifest and level playlists.
  function loaderFor(Hls) {
    var Base = Hls.DefaultConfig.loader;

    function Loader(config) {
      // Reflect.construct also works when the base loader is a native ES class.
      var self = typeof Reflect !== 'undefined' && Reflect.construct
        ? Reflect.construct(Base, [config], Loader)
        : (Base.call(this, config), this);
      var baseLoad = self.load.bind(self);
      self.load = function (context, cfg, callbacks) {
        if (context && (context.type === 'manifest' || context.type === 'level')) {
          var onSuccess = callbacks.onSuccess;
          callbacks.onSuccess = function (response, stats, ctx) {
            if (response && response.data && typeof response.data === 'string') {
              response.data = filter(response.data);
            }
            return onSuccess(response, stats, ctx, null);
          };
        }
        baseLoad(context, cfg, callbacks);
      };
      return self;
    }
    Loader.prototype = Object.create(Base.prototype);
    Loader.prototype.constructor = Loader;
    return Loader;
  }

  var api = { filter: filter, loaderFor: loaderFor };
  root.TVAdFilter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
