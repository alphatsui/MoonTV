/* eslint-disable */
require('../../../public/tv/js/router.js');
require('../../../public/tv/js/keys.js');
require('../../../public/tv/js/focus.js');
const TVApp = require('../../../public/tv/js/app.js');
require('../../../public/tv/js/views/login.js');
require('../../../public/tv/js/views/info.js');

const tick = () => new Promise((r) => setTimeout(r, 10));

function fakeApi(over) {
  return Object.assign(
    {
      getCreds: () => ({ username: 'u', password: 'p' }),
      login: jest.fn(() => Promise.resolve()),
      serverConfig: jest.fn(() => Promise.resolve({ StorageType: 'redis' })),
    },
    over
  );
}

let handle;
function start(api, views) {
  document.body.innerHTML = '<div id="app"></div>';
  Element.prototype.scrollIntoView = jest.fn();
  Object.assign(window.TVViews, views || {});
  handle = TVApp.boot({ api, root: document.getElementById('app') });
  return handle;
}

function key(code) {
  const ev = new KeyboardEvent('keydown', { keyCode: code, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  return ev;
}

beforeEach(async () => {
  window.location.hash = '';
  await tick(); // let the stale hashchange fire before a test boots
});
afterEach(() => {
  handle && handle.destroy();
  handle = null;
  jest.restoreAllMocks();
});

test('exports VERSION', () => {
  expect(TVApp.VERSION).toBe('0.1.0');
  expect(window.TVApp.VERSION).toBe('0.1.0');
});

test('boot without creds shows login', async () => {
  start(fakeApi({ getCreds: () => null }));
  await tick();
  expect(window.location.hash).toBe('#/login');
  expect(document.querySelector('button').textContent).toBe('登录');
});

test('AUTH error from a view routes to login with msg=expired', async () => {
  const api = fakeApi({ home: () => Promise.reject(Object.assign(new Error('x'), { code: 'AUTH' })) });
  window.location.hash = '#/home';
  await tick();
  start(api, {
    home: { mount: (el, p, ctx) => { ctx.api.home().catch(() => {}); } },
  });
  await tick();
  expect(window.location.hash).toBe('#/login?msg=expired');
  expect(document.body.textContent).toContain('登录已失效，请重新登录');
});

test('AUTH from a login attempt does not redirect or loop', async () => {
  const api = fakeApi({
    getCreds: () => null,
    login: () => Promise.reject(Object.assign(new Error('用户名或密码错误'), { code: 'AUTH' })),
  });
  start(api);
  await tick();
  document.querySelector('button').click();
  await tick();
  expect(window.location.hash).toBe('#/login');
  expect(document.body.textContent).toContain('用户名或密码错误');
});

test('login hides username when StorageType is localstorage', async () => {
  window.location.hash = '#/login';
  await tick();
  start(fakeApi({ serverConfig: () => Promise.resolve({ StorageType: 'localstorage' }) }));
  await tick();
  expect(document.querySelector('input[name=username]')).toBeNull();
  expect(document.querySelector('input[name=password]')).not.toBeNull();
  expect(document.querySelectorAll('.focused').length).toBe(1);
});

test('login shows username otherwise, and success goes home', async () => {
  window.location.hash = '#/login';
  await tick();
  const api = fakeApi();
  start(api, { home: { mount: (el) => { el.textContent = 'HOME'; } } });
  await tick();
  expect(document.querySelector('input[name=username]')).not.toBeNull();
  document.querySelector('button').click();
  await tick();
  expect(api.login).toHaveBeenCalled();
  expect(window.location.hash).toBe('#/home');
  expect(document.body.textContent).toContain('HOME');
});

test('back on home calls history.back', async () => {
  const back = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  window.location.hash = '#/home';
  await tick();
  start(fakeApi(), { home: { mount: () => {} } });
  await tick();
  key(10009);
  expect(back).toHaveBeenCalledTimes(1);
});

test('view onKey consumes back', async () => {
  const back = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  window.location.hash = '#/home';
  await tick();
  start(fakeApi(), { home: { mount: (el, p, ctx) => { ctx.onKey((a) => a === 'back'); } } });
  await tick();
  key(10009);
  expect(back).not.toHaveBeenCalled();
});

test('view that throws on mount shows 出错了 with a focused 返回 that goes back', async () => {
  const back = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  window.location.hash = '#/home';
  await tick();
  start(fakeApi(), { home: { mount: () => { throw new Error('boom'); } } });
  await tick();
  expect(document.body.textContent).toContain('出错了');
  const btn = document.querySelector('button');
  expect(btn.textContent).toBe('返回');
  expect(btn.classList.contains('focused')).toBe(true);
  key(13);
  expect(back).toHaveBeenCalledTimes(1);
  key(10009);
  expect(back).toHaveBeenCalledTimes(2);
});

test('hashchange unmounts old view and mounts new one', async () => {
  const unmount = jest.fn();
  window.location.hash = '#/home';
  await tick();
  start(fakeApi(), { home: { mount: () => unmount }, search: { mount: (el) => { el.textContent = 'S'; } } });
  await tick();
  window.location.hash = '#/search';
  await tick();
  expect(unmount).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain('S');
});

test('info view shows version and user agent', async () => {
  window.location.hash = '#/info';
  await tick();
  start(fakeApi());
  await tick();
  expect(document.body.textContent).toContain('0.1.0');
  expect(document.body.textContent).toContain(navigator.userAgent);
});
