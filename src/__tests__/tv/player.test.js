/* eslint-disable */
require('../../../public/tv/js/router.js');
require('../../../public/tv/js/keys.js');
const TVFocus = require('../../../public/tv/js/focus.js');
require('../../../public/tv/js/adfilter.js');
const TVPlayback = require('../../../public/tv/js/playback.js');
const TVApp = require('../../../public/tv/js/app.js');
require('../../../public/tv/js/views/player.js');

// Promise chains resolve in microtasks, so this works with fake timers too.
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

class FakeHls {
  constructor(config) {
    this.config = config;
    this.handlers = {};
    this.destroy = jest.fn();
    this.loadSource = jest.fn();
    this.attachMedia = jest.fn();
    this.startLoad = jest.fn();
    this.recoverMediaError = jest.fn();
    FakeHls.last = this;
  }
  on(ev, fn) {
    (this.handlers[ev] = this.handlers[ev] || []).push(fn);
  }
  emit(ev, data) {
    (this.handlers[ev] || []).forEach((fn) => fn(ev, data));
  }
}
FakeHls.isSupported = () => true;
FakeHls.Events = { ERROR: 'hlsError' };
FakeHls.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError', OTHER_ERROR: 'otherError' };
FakeHls.DefaultConfig = { loader: function Base() {} };

// jsdom does not implement media playback: back the media properties with plain fields.
const proto = window.HTMLMediaElement.prototype;
Object.defineProperty(proto, 'paused', { configurable: true, get() { return this._paused !== false; } });
Object.defineProperty(proto, 'currentTime', {
  configurable: true,
  get() { return this._ct || 0; },
  set(v) { this._ct = v; },
});
Object.defineProperty(proto, 'duration', {
  configurable: true,
  get() { return this._dur === undefined ? NaN : this._dur; },
});
proto.play = function () { this._paused = false; return Promise.resolve(); };
proto.pause = function () { this._paused = true; };
proto.load = function () {};

function detailOf(over) {
  return Object.assign(
    { source: 'a', source_name: '源A', id: '1', title: 'Movie', poster: 'p', year: '2020', episodes: ['u1', 'u2', 'u3'] },
    over
  );
}

function fakeApi(over) {
  return Object.assign(
    {
      getCreds: () => ({ username: 'u', password: 'p' }),
      detail: jest.fn(() => Promise.resolve(detailOf())),
      playRecords: jest.fn(() => Promise.resolve({})),
      skipConfig: jest.fn(() => Promise.resolve(null)),
      savePlayRecord: jest.fn(() => Promise.resolve()),
    },
    over
  );
}

let current;
// Mounts the view with a dispatcher that mirrors app.js: view handlers, focus, ok click, back.
async function mount(api, params) {
  document.body.innerHTML = '';
  Element.prototype.scrollIntoView = jest.fn();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const handlers = [];
  const ctx = { api, go: jest.fn(), replace: jest.fn(), focus: TVFocus.manager(el), onKey: (fn) => handlers.push(fn) };
  const unmount = window.TVViews.play.mount(el, params || { source: 'a', id: '1', ep: '0' }, ctx);
  function press(action) {
    for (let i = 0; i < handlers.length; i++) if (handlers[i](action)) return 'view';
    if (ctx.focus.handle(action)) return 'focus';
    if (action === 'ok') {
      const f = ctx.focus.current();
      if (f) f.click();
      return 'ok';
    }
    if (action === 'back') {
      window.history.back();
      return 'back';
    }
    return null;
  }
  await flush();
  const video = el.querySelector('video');
  function timing(ct, dur) {
    video._ct = ct;
    video._dur = dur;
  }
  current = { el, ctx, press, unmount, video, timing };
  return current;
}

function fire(target, type) {
  target.dispatchEvent(new window.Event(type));
}

function button(el, text) {
  return Array.prototype.find.call(el.querySelectorAll('button'), (b) => b.textContent === text && b.offsetParent !== undefined);
}

let backSpy;
beforeEach(() => {
  window.Hls = FakeHls;
  FakeHls.last = null;
  FakeHls.isSupported = () => true;
  backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
});
afterEach(() => {
  if (current && current.unmount) current.unmount();
  current = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete window.Hls;
});

test('loads episodes[ep] through hls.js with the ad filter loader', async () => {
  const api = fakeApi();
  const p = await mount(api, { source: 'a', id: '1', ep: '1' });
  expect(api.detail).toHaveBeenCalledWith('a', '1');
  expect(FakeHls.last.loadSource).toHaveBeenCalledWith('u2');
  expect(FakeHls.last.attachMedia).toHaveBeenCalledWith(p.video);
  expect(typeof FakeHls.last.config.loader).toBe('function');
});

test('without hls.js support the video src is set directly', async () => {
  FakeHls.isSupported = () => false;
  const p = await mount(fakeApi());
  expect(FakeHls.last).toBe(null);
  expect(p.video.getAttribute('src')).toBe('u1');
});

test('fatal hls error shows 播放失败 with 换来源 focused', async () => {
  const p = await mount(fakeApi());
  FakeHls.last.emit('hlsError', { fatal: false });
  expect(p.el.textContent).not.toContain('播放失败');
  FakeHls.last.emit('hlsError', { fatal: true });
  expect(p.el.textContent).toContain('播放失败');
  const focused = p.el.querySelectorAll('.focused');
  expect(focused.length).toBe(1);
  expect(focused[0].textContent).toBe('换来源');
  // The buttons are stacked (display:block), so Down moves to 返回.
  p.press('down');
  expect(p.ctx.focus.current().textContent).toBe('返回');
  p.press('ok');
  expect(backSpy).toHaveBeenCalledTimes(1);
});

test('video error without hls.js shows 播放失败 and 换来源 replaces the player with detail', async () => {
  FakeHls.isSupported = () => false;
  const p = await mount(fakeApi());
  fire(p.video, 'error');
  expect(p.el.textContent).toContain('播放失败');
  p.press('ok');
  expect(p.ctx.replace).toHaveBeenCalledWith('detail', expect.objectContaining({ source: 'a', id: '1' }));
  expect(p.ctx.go).not.toHaveBeenCalled();
});

test('on the hls.js path a video error event does not pre-empt recovery', async () => {
  const p = await mount(fakeApi());
  fire(p.video, 'error');
  expect(p.el.textContent).not.toContain('播放失败');
});

test('first fatal network error calls startLoad; the second shows 播放失败', async () => {
  const p = await mount(fakeApi());
  const hls = FakeHls.last;
  hls.emit('hlsError', { fatal: true, type: 'networkError' });
  expect(hls.startLoad).toHaveBeenCalledTimes(1);
  expect(p.el.textContent).not.toContain('播放失败');
  hls.emit('hlsError', { fatal: true, type: 'networkError' });
  expect(hls.startLoad).toHaveBeenCalledTimes(1);
  expect(p.el.textContent).toContain('播放失败');
});

test('first fatal media error calls recoverMediaError; the second shows 播放失败', async () => {
  const p = await mount(fakeApi());
  const hls = FakeHls.last;
  hls.emit('hlsError', { fatal: true, type: 'mediaError' });
  expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
  expect(p.el.textContent).not.toContain('播放失败');
  // A network error still gets its own attempt.
  hls.emit('hlsError', { fatal: true, type: 'networkError' });
  expect(hls.startLoad).toHaveBeenCalledTimes(1);
  expect(p.el.textContent).not.toContain('播放失败');
  hls.emit('hlsError', { fatal: true, type: 'mediaError' });
  expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
  expect(p.el.textContent).toContain('播放失败');
});

test('a fatal error of another type shows 播放失败 at once', async () => {
  const p = await mount(fakeApi());
  FakeHls.last.emit('hlsError', { fatal: true, type: 'otherError' });
  expect(p.el.textContent).toContain('播放失败');
});

test('a throw from Hls construction shows 播放失败', async () => {
  function Broken() { throw new Error('no MSE'); }
  Broken.isSupported = () => true;
  Broken.Events = FakeHls.Events;
  window.Hls = Broken;
  const p = await mount(fakeApi());
  expect(p.el.textContent).toContain('播放失败');
  expect(p.ctx.focus.current().textContent).toBe('换来源');
});

test('an empty episode URL that makes loadSource throw shows 播放失败', async () => {
  const api = fakeApi({ detail: jest.fn(() => Promise.resolve(detailOf({ episodes: [''] }))) });
  window.Hls = class extends FakeHls {
    constructor(c) {
      super(c);
      this.loadSource = jest.fn((u) => { if (!u) throw new Error('empty url'); });
    }
  };
  window.Hls.isSupported = () => true;
  window.Hls.Events = FakeHls.Events;
  window.Hls.ErrorTypes = FakeHls.ErrorTypes;
  const p = await mount(api);
  expect(p.el.textContent).toContain('播放失败');
});

test('换来源 on a player opened from detail goes back instead of stacking a new detail', async () => {
  const p = await mount(fakeApi(), { source: 'a', id: '1', ep: '0', from: 'detail' });
  p.press('up');
  p.press('right'); // 下一集 -> 选集
  p.press('right'); // -> 换来源
  expect(p.ctx.focus.current().textContent).toBe('换来源');
  p.press('ok');
  expect(backSpy).toHaveBeenCalledTimes(1);
  expect(p.ctx.go).not.toHaveBeenCalled();
  expect(p.ctx.replace).not.toHaveBeenCalled();
});

test('下一集 keeps from=detail so the next player still returns to detail', async () => {
  const p = await mount(fakeApi(), { source: 'a', id: '1', ep: '0', from: 'detail' });
  fire(p.video, 'ended');
  expect(p.ctx.replace).toHaveBeenCalledWith('play', { source: 'a', id: '1', ep: 1, from: 'detail' });
});

test('failed detail load shows 播放失败 and Back still falls through', async () => {
  const p = await mount(fakeApi({ detail: jest.fn(() => Promise.reject(new Error('x'))) }));
  expect(p.el.textContent).toContain('播放失败');
  expect(p.press('back')).toBe('back');
  expect(backSpy).toHaveBeenCalledTimes(1);
});

test('stream failure in the running app: Back reaches history.back', async () => {
  document.body.innerHTML = '<div id="app"></div>';
  Element.prototype.scrollIntoView = jest.fn();
  window.location.hash = '#/play?source=a&id=1&ep=0';
  await new Promise((r) => setTimeout(r, 10));
  const handle = TVApp.boot({ api: fakeApi(), root: document.getElementById('app') });
  await flush();
  FakeHls.last.emit('hlsError', { fatal: true });
  expect(document.getElementById('app').textContent).toContain('播放失败');
  document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27, bubbles: true, cancelable: true }));
  expect(backSpy).toHaveBeenCalledTimes(1);
  handle.destroy();
  window.location.hash = '';
});

test('back with overlay open hides overlay and is consumed', async () => {
  const p = await mount(fakeApi());
  p.timing(100, 1000);
  p.press('down');
  const overlay = p.el.querySelector('.player-overlay');
  expect(overlay.classList.contains('shown')).toBe(true);
  const focused = p.el.querySelectorAll('.focused');
  expect(focused.length).toBe(1);
  expect(focused[0].textContent).toBe('下一集');
  expect(p.press('back')).toBe('view');
  expect(overlay.classList.contains('shown')).toBe(false);
  expect(p.el.querySelectorAll('.focused').length).toBe(0);
  expect(backSpy).not.toHaveBeenCalled();
  expect(p.ctx.api.savePlayRecord).not.toHaveBeenCalled();
});

test('overlay hides 下一集 on the last episode; 选集 replaces the player with detail', async () => {
  const p = await mount(fakeApi(), { source: 'a', id: '1', ep: '2' });
  p.press('up');
  expect(p.ctx.focus.current().textContent).toBe('选集');
  expect(button(p.el, '下一集')).toBe(undefined);
  p.press('ok');
  // replace, not go: a stale player entry under detail would replay the old episode on Back.
  expect(p.ctx.replace).toHaveBeenCalledWith('detail', expect.objectContaining({ source: 'a', id: '1' }));
  expect(p.ctx.go).not.toHaveBeenCalled();
  expect(backSpy).not.toHaveBeenCalled();
});

test('ok toggles playback and shows the overlay for 4 s', async () => {
  jest.useFakeTimers();
  const p = await mount(fakeApi());
  expect(p.video.paused).toBe(false);
  expect(p.press('ok')).toBe('view');
  expect(p.video.paused).toBe(true);
  const overlay = p.el.querySelector('.player-overlay');
  expect(overlay.classList.contains('shown')).toBe(true);
  expect(p.el.querySelectorAll('.focused').length).toBe(0);
  jest.advanceTimersByTime(4000);
  expect(overlay.classList.contains('shown')).toBe(false);
  p.press('playpause');
  expect(p.video.paused).toBe(false);
});

test('left and right seek by seekStep of the held time', async () => {
  const p = await mount(fakeApi());
  p.timing(500, 1000);
  let now = 1000000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  p.press('right');
  expect(p.video.currentTime).toBe(510);
  // Held key: keydown repeats every 100 ms for 1.5 s.
  for (let t = 100; t <= 1500; t += 100) {
    now += 100;
    p.timing(500, 1000);
    p.press('right');
  }
  expect(p.video.currentTime).toBe(500 + TVPlayback.seekStep(1500));
  document.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 39 }));
  now += 100;
  p.timing(500, 1000);
  p.press('rw');
  expect(p.video.currentTime).toBe(490);
  p.timing(5, 1000);
  now += 1000;
  p.press('left');
  expect(p.video.currentTime).toBe(0);
});

test('back without overlay saves record with index ep+1 then allows history.back', async () => {
  const p = await mount(fakeApi(), { source: 'a', id: '1', ep: '1' });
  p.timing(100.7, 1000.2);
  expect(p.press('back')).toBe('back');
  expect(backSpy).toHaveBeenCalledTimes(1);
  expect(p.ctx.api.savePlayRecord).toHaveBeenCalledWith(
    'a+1',
    expect.objectContaining({ index: 2, play_time: 100, total_time: 1000, total_episodes: 3, title: 'Movie' })
  );
});

test('never saves NaN or Infinity times', async () => {
  const p = await mount(fakeApi());
  p.timing(100, NaN);
  p.press('back');
  p.timing(100, Infinity);
  p.press('back');
  p.timing(NaN, 1000);
  p.press('back');
  p.timing(0, 1000);
  fire(p.video, 'pause');
  expect(p.ctx.api.savePlayRecord).not.toHaveBeenCalled();
});

test('interval save fires after 10000 ms', async () => {
  jest.useFakeTimers();
  const p = await mount(fakeApi());
  p.timing(50, 1000);
  jest.advanceTimersByTime(TVPlayback.SAVE_INTERVAL_MS - 1);
  expect(p.ctx.api.savePlayRecord).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(p.ctx.api.savePlayRecord).toHaveBeenCalledTimes(1);
  expect(TVPlayback.SAVE_INTERVAL_MS).toBe(10000);
});

test('pause saves; save errors are ignored', async () => {
  const api = fakeApi({ savePlayRecord: jest.fn(() => Promise.reject(new Error('net'))) });
  const p = await mount(api);
  p.timing(50, 1000);
  fire(p.video, 'pause');
  await flush();
  expect(api.savePlayRecord).toHaveBeenCalledTimes(1);
});

test('ended with next episode replaces route to ep+1', async () => {
  const p = await mount(fakeApi(), { source: 'a', id: '1', ep: '0' });
  fire(p.video, 'ended');
  fire(p.video, 'ended');
  expect(p.ctx.replace).toHaveBeenCalledTimes(1);
  expect(p.ctx.replace).toHaveBeenCalledWith('play', { source: 'a', id: '1', ep: 1 });
});

test('ended on last episode goes back', async () => {
  const p = await mount(fakeApi(), { source: 'a', id: '1', ep: '2' });
  fire(p.video, 'ended');
  expect(p.ctx.replace).not.toHaveBeenCalled();
  expect(backSpy).toHaveBeenCalledTimes(1);
});

test('outro skip only after progress, never for positive outro_time, and only once', async () => {
  const skip = { enable: true, intro_time: 0, outro_time: 60 };
  const p = await mount(fakeApi({ skipConfig: jest.fn(() => Promise.resolve(skip)) }));
  p.timing(990, 1000);
  fire(p.video, 'timeupdate');
  expect(p.ctx.replace).not.toHaveBeenCalled();
  skip.outro_time = -60;
  p.timing(950, 1000);
  fire(p.video, 'timeupdate');
  fire(p.video, 'timeupdate');
  fire(p.video, 'ended');
  expect(p.ctx.replace).toHaveBeenCalledTimes(1);
  expect(p.ctx.replace).toHaveBeenCalledWith('play', { source: 'a', id: '1', ep: 1 });
});

test('outro -60 on a 100 s clip does not fire at 0 or 5 s but fires at 41 s', async () => {
  const skip = { enable: true, intro_time: 0, outro_time: -60 };
  const p = await mount(fakeApi({ skipConfig: jest.fn(() => Promise.resolve(skip)) }));
  p.timing(0, 100);
  fire(p.video, 'timeupdate');
  p.timing(5, 100);
  fire(p.video, 'timeupdate');
  expect(p.ctx.replace).not.toHaveBeenCalled();
  p.timing(41, 100);
  fire(p.video, 'timeupdate');
  expect(p.ctx.replace).toHaveBeenCalledWith('play', { source: 'a', id: '1', ep: 1 });
});

test('t within 5 s of the end starts at 0 and does not auto-advance', async () => {
  const p = await mount(fakeApi(), { source: 'a', id: '1', ep: '0', t: '997' });
  p.timing(0, 1000);
  fire(p.video, 'loadedmetadata');
  expect(p.video.currentTime).toBe(0);
  fire(p.video, 'timeupdate');
  expect(p.ctx.replace).not.toHaveBeenCalled();
  expect(backSpy).not.toHaveBeenCalled();
});

test('t more than 5 s before the end is used', async () => {
  const p = await mount(fakeApi(), { source: 'a', id: '1', ep: '0', t: '994' });
  p.timing(0, 1000);
  fire(p.video, 'loadedmetadata');
  expect(p.video.currentTime).toBe(994);
});

test('uses params.t over stored record', async () => {
  const api = fakeApi({ playRecords: jest.fn(() => Promise.resolve({ 'a+1': { index: 1, play_time: 300, total_time: 1000 } })) });
  const p = await mount(api, { source: 'a', id: '1', ep: '0', t: '42' });
  fire(p.video, 'loadedmetadata');
  expect(p.video.currentTime).toBe(42);
});

test('without t the start time comes from the record, and lookups failing do not block playback', async () => {
  const api = fakeApi({ playRecords: jest.fn(() => Promise.resolve({ 'a+1': { index: 1, play_time: 300, total_time: 1000 } })) });
  const p = await mount(api, { source: 'a', id: '1', ep: '0' });
  fire(p.video, 'loadedmetadata');
  expect(p.video.currentTime).toBe(300);
  p.unmount();
  const api2 = fakeApi({
    playRecords: jest.fn(() => Promise.reject(new Error('x'))),
    skipConfig: jest.fn(() => Promise.reject(new Error('y'))),
  });
  const p2 = await mount(api2, { source: 'a', id: '1', ep: '0', t: 'NaN' });
  expect(FakeHls.last.loadSource).toHaveBeenCalledWith('u1');
  fire(p2.video, 'loadedmetadata');
  expect(p2.video.currentTime).toBe(0);
});

test('out-of-range ep is clamped to the last episode', async () => {
  await mount(fakeApi(), { source: 'a', id: '1', ep: '9', t: '-5' });
  expect(FakeHls.last.loadSource).toHaveBeenCalledWith('u3');
});

test('unmount saves, destroys hls, clears timers and the video', async () => {
  jest.useFakeTimers();
  const api = fakeApi();
  const p = await mount(api);
  p.timing(50, 1000);
  const hls = FakeHls.last;
  p.unmount();
  p.unmount = null;
  expect(api.savePlayRecord).toHaveBeenCalledTimes(1);
  expect(hls.destroy).toHaveBeenCalled();
  expect(p.video.paused).toBe(true);
  expect(p.video.hasAttribute('src')).toBe(false);
  fire(p.video, 'pause');
  fire(p.video, 'ended');
  jest.advanceTimersByTime(60000);
  expect(api.savePlayRecord).toHaveBeenCalledTimes(1);
  expect(p.ctx.replace).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
