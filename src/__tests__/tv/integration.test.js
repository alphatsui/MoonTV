/* eslint-disable */
// The real TVApp with every real view and the real TVApi, over a fake fetch and an in-memory
// history. Catches what view-level tests with stubbed ctx cannot: the history stack across views.
const TVRouter = require('../../../public/tv/js/router.js');
const TVKeys = require('../../../public/tv/js/keys.js');
const TVFocus = require('../../../public/tv/js/focus.js');
const TVApi = require('../../../public/tv/js/api.js');
require('../../../public/tv/js/adfilter.js');
require('../../../public/tv/js/playback.js');
require('../../../public/tv/js/views/login.js');
require('../../../public/tv/js/views/info.js');
require('../../../public/tv/js/views/home.js');
require('../../../public/tv/js/views/search.js');
require('../../../public/tv/js/views/detail.js');
require('../../../public/tv/js/views/player.js');
const TVApp = require('../../../public/tv/js/app.js');

const KEY = 'moontv.tv.auth.v1';
const CREDS = JSON.stringify({ username: 'u', password: 'p' });
const K = { ok: 13, back: 27, left: 37, up: 38, right: 39, down: 40 };

async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

// jsdom does not implement media playback: back the media properties with plain fields.
const proto = window.HTMLMediaElement.prototype;
Object.defineProperty(proto, 'paused', { configurable: true, get() { return this._paused !== false; } });
Object.defineProperty(proto, 'currentTime', { configurable: true, get() { return this._ct || 0; }, set(v) { this._ct = v; } });
Object.defineProperty(proto, 'duration', { configurable: true, get() { return this._dur === undefined ? NaN : this._dur; } });
proto.play = function () { this._paused = false; return Promise.resolve(); };
proto.pause = function () { this._paused = true; };
proto.load = function () {};

class FakeHls {
  constructor(config) {
    this.config = config;
    this.loadSource = jest.fn();
    this.attachMedia = jest.fn();
    this.destroy = jest.fn();
    this.startLoad = jest.fn();
    this.recoverMediaError = jest.fn();
    FakeHls.all.push(this);
  }
  on() {}
}
FakeHls.isSupported = () => true;
FakeHls.Events = { ERROR: 'hlsError' };
FakeHls.ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
FakeHls.DefaultConfig = { loader: function Base() {} };
FakeHls.all = [];

// In-memory history: push on hash set, replace on location.replace, hashchange in a microtask.
function makeWin() {
  const listeners = {};
  const stack = [''];
  let idx = 0;
  const log = [];
  function norm(h) { return h.charAt(0) === '#' ? h : '#' + h; }
  function fire() {
    Promise.resolve().then(() => (listeners.hashchange || []).slice().forEach((fn) => fn()));
  }
  const win = {
    console: { error: jest.fn() },
    location: {
      get hash() { return stack[idx]; },
      set hash(h) {
        h = norm(h);
        if (h === stack[idx]) return; // the browser fires no hashchange for the same hash
        stack.splice(idx + 1);
        stack.push(h);
        idx++;
        log.push('push ' + h);
        fire();
      },
      replace(h) {
        h = norm(h);
        const same = h === stack[idx];
        stack[idx] = h;
        log.push('replace ' + h);
        if (!same) fire();
      },
    },
    history: {
      back() {
        if (idx === 0) { log.push('back at start'); return; }
        idx--;
        log.push('back');
        fire();
      },
    },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
  };
  win.stack = () => stack.slice(0, idx + 1);
  win.log = log;
  return win;
}

function mem(initial) {
  const m = Object.assign({}, initial || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
}

function detailOf(over) {
  return Object.assign(
    { source: 'a', source_name: '源A', id: '1', title: 'Movie', poster: 'p', year: '2020',
      episodes: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'] },
    over
  );
}

const RECORDS = {
  'a+1': { title: 'Movie', source_name: '源A', cover: 'c', year: '2020', index: 3, total_episodes: 6,
    play_time: 120, total_time: 1000, save_time: 5, search_title: 'Movie' },
};

const FAVORITES = { 'b+2': { title: 'Fav', source_name: '源B', cover: 'f', year: '2021', total_episodes: 1, save_time: 3 } };

// route(method, path) -> { status, body } | Error; every call is recorded.
function fakeFetch(route) {
  const calls = [];
  const fn = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    calls.push(method + ' ' + url);
    const r = route(method, url.split('?')[0], url);
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => Promise.resolve(r.body) });
  };
  fn.calls = calls;
  return fn;
}

function defaultRoute(method, path) {
  if (path === '/api/login') return { status: 200, body: { ok: true } };
  if (path === '/api/server-config') return { status: 200, body: { SiteName: 'M', StorageType: 'redis' } };
  if (path === '/api/playrecords') return method === 'GET' ? { status: 200, body: RECORDS } : { status: 200, body: { success: true } };
  if (path === '/api/favorites') return { status: 200, body: FAVORITES };
  if (path === '/api/douban/categories') return { status: 200, body: { code: 200, list: [{ id: 'd1', title: 'Hot', poster: 'h' }] } };
  if (path === '/api/detail') return { status: 200, body: detailOf() };
  if (path === '/api/search') return { status: 200, body: { results: [detailOf()] } };
  if (path === '/api/skipconfigs') return { status: 200, body: null };
  if (path === '/api/searchhistory') return { status: 200, body: [] };
  return { status: 404, body: null };
}

let handle;
let win;
async function boot(route, stored, hash) {
  document.body.innerHTML = '<div id="app"></div>';
  Element.prototype.scrollIntoView = jest.fn();
  win = makeWin();
  if (hash) win.location.replace(hash);
  jest.spyOn(window.history, 'back').mockImplementation(() => win.history.back());
  const fetch = fakeFetch(route || defaultRoute);
  const storage = mem(stored);
  const api = TVApi.create({ fetch, storage });
  handle = TVApp.boot({
    api, win, doc: document, root: document.getElementById('app'),
    router: TVRouter, keys: TVKeys, focus: TVFocus, views: window.TVViews,
  });
  await settle();
  return { fetch, storage, app: document.getElementById('app') };
}

function press(code) {
  const target = document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code, bubbles: true, cancelable: true }));
}

function focused() {
  const f = document.querySelectorAll('#app .focused');
  expect(f.length).toBe(1);
  return f[0];
}

beforeEach(() => {
  window.Hls = FakeHls;
  FakeHls.all = [];
});
afterEach(() => {
  if (handle) handle.destroy();
  handle = null;
  jest.restoreAllMocks();
  delete window.Hls;
});

test('login, 继续观看, 选集, an episode, then Back Back Back walks the real stack', async () => {
  const { fetch, storage, app } = await boot();

  // No credentials: the app replaces the start entry with login.
  expect(win.stack()).toEqual(['#/login']);
  const user = app.querySelector('input[name=username]');
  expect(focused()).toBe(user);
  user.value = 'u';
  app.querySelector('input[name=password]').value = 'p';
  press(K.down);
  press(K.down);
  expect(focused().textContent).toBe('登录');
  press(K.ok);
  await settle();
  expect(JSON.parse(storage.getItem(KEY))).toEqual({ username: 'u', password: 'p' });
  expect(win.stack()).toEqual(['#/home']);

  // Home: focus lands on the 继续观看 card.
  expect(app.textContent).toContain('继续观看');
  expect(focused().querySelector('.card-title').textContent).toBe('Movie');
  press(K.ok);
  await settle();
  expect(win.stack()).toEqual(['#/home', '#/play?source=a&id=1&ep=2&t=120']);
  expect(FakeHls.all[0].loadSource).toHaveBeenCalledWith('u3');
  const video = app.querySelector('video');
  video._dur = 1000;
  video.dispatchEvent(new window.Event('loadedmetadata'));
  expect(video.currentTime).toBe(120);

  // Overlay -> 选集: the player entry is replaced by detail.
  press(K.up);
  expect(focused().textContent).toBe('下一集');
  press(K.right);
  expect(focused().textContent).toBe('选集');
  press(K.ok);
  await settle();
  expect(win.stack()).toEqual(['#/home', '#/detail?source=a&id=1&title=Movie']);
  expect(focused().textContent).toBe('▶ 继续 第3集');

  // An episode from detail: the player goes on top of detail.
  press(K.down); // sources row
  expect(focused().classList.contains('chip')).toBe(true);
  press(K.down); // first episode row
  for (let i = 0; i < 4; i++) press(K.right);
  expect(focused().textContent).toBe('5');
  press(K.ok);
  await settle();
  expect(win.stack()).toEqual([
    '#/home',
    '#/detail?source=a&id=1&title=Movie',
    '#/play?source=a&id=1&ep=4&t=0&from=detail',
  ]);
  expect(FakeHls.all[FakeHls.all.length - 1].loadSource).toHaveBeenCalledWith('u5');

  // Back, Back, Back: detail, home, then nothing older (the old player never comes back).
  const v2 = app.querySelector('video');
  v2._ct = 30;
  v2._dur = 1000;
  press(K.back);
  await settle();
  expect(win.stack()).toEqual(['#/home', '#/detail?source=a&id=1&title=Movie']);
  expect(focused().textContent).toBe('▶ 继续 第3集');
  expect(fetch.calls).toContain('POST /api/playrecords');
  press(K.back);
  await settle();
  expect(win.stack()).toEqual(['#/home']);
  expect(focused().querySelector('.card-title').textContent).toBe('Movie');
  press(K.back);
  await settle();
  expect(win.stack()).toEqual(['#/home']);
  expect(win.log[win.log.length - 1]).toBe('back at start');
  expect(app.querySelector('video')).toBe(null);
});

test('换来源 on a player opened from detail returns to that detail, with no duplicate', async () => {
  await boot(null, { [KEY]: CREDS }, '#/detail?source=a&id=1&title=Movie');
  press(K.ok); // 继续 第3集
  await settle();
  expect(win.stack()).toEqual(['#/detail?source=a&id=1&title=Movie', '#/play?source=a&id=1&ep=2&t=120&from=detail']);
  press(K.up);
  press(K.right);
  press(K.right);
  expect(focused().textContent).toBe('换来源');
  press(K.ok);
  await settle();
  expect(win.stack()).toEqual(['#/detail?source=a&id=1&title=Movie']);
  expect(focused().textContent).toBe('▶ 继续 第3集');
});

test('a 401 on all five home requests logs in exactly once, then the rows render', async () => {
  const seen = {};
  const route = (method, path, url) => {
    if (path !== '/api/login' && !seen[url]) {
      seen[url] = true;
      return { status: 401, body: { error: 'Unauthorized' } };
    }
    return defaultRoute(method, path);
  };
  const { fetch, app, storage } = await boot(route, { [KEY]: CREDS }, '#/home');
  expect(fetch.calls.filter((c) => c === 'POST /api/login')).toHaveLength(1);
  expect(app.querySelectorAll('.row').length).toBe(5);
  expect(win.stack()).toEqual(['#/home']);
  expect(storage.getItem(KEY)).toBe(CREDS);
  expect(focused().querySelector('.card-title').textContent).toBe('Movie');
});

test('a 429 on re-login keeps the credentials and does not open login', async () => {
  const route = (method, path) => {
    if (path === '/api/playrecords') return { status: 401, body: {} };
    if (path === '/api/login') return { status: 429, body: { error: 'Too Many Requests' } };
    return defaultRoute(method, path);
  };
  const { fetch, app, storage } = await boot(route, { [KEY]: CREDS }, '#/home');
  expect(fetch.calls.filter((c) => c === 'POST /api/login')).toHaveLength(1);
  expect(storage.getItem(KEY)).toBe(CREDS);
  expect(win.stack()).toEqual(['#/home']);
  // 继续观看 stays hidden; the other rows render.
  expect(app.textContent).not.toContain('继续观看');
  expect(app.querySelectorAll('.row').length).toBe(4);
  expect(app.textContent).toContain('我的收藏');
});
