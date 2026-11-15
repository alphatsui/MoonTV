/* eslint-disable */
require('../../../public/tv/js/router.js');
require('../../../public/tv/js/keys.js');
require('../../../public/tv/js/focus.js');
const TVApp = require('../../../public/tv/js/app.js');
require('../../../public/tv/js/views/search.js');

const tick = () => new Promise((r) => setTimeout(r, 10));

function fakeApi(over) {
  return Object.assign(
    {
      getCreds: () => ({ username: 'u', password: 'p' }),
      search: jest.fn(() => Promise.resolve([])),
      searchHistory: jest.fn(() => Promise.resolve([])),
      addSearchHistory: jest.fn(() => Promise.resolve()),
      imageUrl: (u) => '/api/image-proxy?url=' + encodeURIComponent(u),
    },
    over
  );
}

function result(i) {
  return { source: 's', id: String(i), title: 'T' + i, poster: 'p' + i };
}

let handle;
async function start(api, hash) {
  document.body.innerHTML = '<div id="app"></div>';
  Element.prototype.scrollIntoView = jest.fn();
  window.location.hash = hash || '#/search';
  await tick(); // jsdom fires hashchange asynchronously
  handle = TVApp.boot({ api, root: document.getElementById('app') });
  return document.getElementById('app');
}

function press(target, code) {
  const ev = new KeyboardEvent('keydown', { keyCode: code, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
}

beforeEach(async () => {
  window.location.hash = '';
  await tick();
});
afterEach(() => {
  handle && handle.destroy();
  handle = null;
  jest.restoreAllMocks();
});

test('search with no results shows 没有找到结果 and focus stays on input', async () => {
  const app = await start(fakeApi());
  await tick();
  const input = app.querySelector('input');
  input.value = 'zzz';
  press(input, 13);
  await tick();
  expect(app.textContent).toContain('没有找到结果');
  expect(app.querySelector('.focused')).toBe(input);
  expect(document.activeElement).toBe(input);
});

test('OK on the 搜索 button next to the input runs the search with the input value', async () => {
  const api = fakeApi({ search: jest.fn(() => Promise.resolve([result(1)])) });
  const app = await start(api);
  await tick();
  const input = app.querySelector('input');
  input.value = ' 猫 ';
  press(input, 39); // right: from the input to the button
  const b = app.querySelector('.focused');
  expect(b.tagName).toBe('BUTTON');
  expect(b.textContent).toBe('搜索');
  expect(document.activeElement).not.toBe(input);
  press(b, 13);
  await tick();
  expect(api.search).toHaveBeenCalledTimes(1);
  expect(api.search).toHaveBeenCalledWith('猫');
  expect(api.addSearchHistory).toHaveBeenCalledWith('猫');
  expect(app.querySelectorAll('.grid .card').length).toBe(1);
});

test('the 搜索 button with an empty input does nothing', async () => {
  const api = fakeApi();
  const app = await start(api);
  await tick();
  const input = app.querySelector('input');
  input.value = '  ';
  press(input, 39);
  press(app.querySelector('.focused'), 13);
  await tick();
  expect(api.search).not.toHaveBeenCalled();
});

test('the Tizen keyboard Done key (65376) in the input runs the search', async () => {
  const api = fakeApi({ search: jest.fn(() => Promise.resolve([])) });
  const app = await start(api);
  await tick();
  const input = app.querySelector('input');
  input.value = 'abc';
  press(input, 65376);
  await tick();
  expect(api.search).toHaveBeenCalledWith('abc');
});

test('auto search with q runs api.search once', async () => {
  const api = fakeApi({ search: jest.fn(() => Promise.resolve([result(1)])) });
  const app = await start(api, '#/search?q=%E7%94%B5%E5%BD%B1&auto=1');
  await tick();
  expect(api.search).toHaveBeenCalledTimes(1);
  expect(api.search).toHaveBeenCalledWith('电影');
  expect(app.querySelector('input').value).toBe('电影');
  expect(api.addSearchHistory).toHaveBeenCalledWith('电影');
});

test('q without auto only fills the input', async () => {
  const api = fakeApi();
  await start(api, '#/search?q=abc');
  await tick();
  expect(api.search).not.toHaveBeenCalled();
});

test('results cap at 60, grid is 6 columns, result routes to detail', async () => {
  const list = [];
  for (let i = 0; i < 80; i++) list.push(result(i));
  const api = fakeApi({ search: jest.fn(() => Promise.resolve(list)) });
  const app = await start(api);
  await tick();
  const input = app.querySelector('input');
  input.value = 'x';
  press(input, 13);
  await tick();
  expect(app.querySelectorAll('.grid .card').length).toBe(60);
  press(input, 40); // no history chips: down lands on the first result
  const f = app.querySelector('.focused');
  expect(f.classList.contains('card')).toBe(true);
  expect(f.querySelector('.card-title').textContent).toBe('T0');
  press(f, 40); // second grid row, same column
  expect(app.querySelector('.focused').querySelector('.card-title').textContent).toBe('T6');
  const loc = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  app.querySelector('.focused').click();
  expect(window.location.hash).toContain('detail');
  expect(window.location.hash).toContain('source=s');
  expect(window.location.hash).toContain('id=6');
  loc.mockRestore();
});

test('history chips: down from input, chip click searches', async () => {
  const api = fakeApi({
    searchHistory: jest.fn(() => Promise.resolve(['猫', '狗'])),
    search: jest.fn(() => Promise.resolve([result(1)])),
  });
  const app = await start(api);
  await tick();
  const input = app.querySelector('input');
  press(input, 40);
  expect(app.querySelector('.focused').textContent).toBe('猫');
  app.querySelector('.focused').click();
  await tick();
  expect(api.search).toHaveBeenCalledWith('猫');
  expect(input.value).toBe('猫');
});

test('Back still works after moving focus from the input down to a chip or a result', async () => {
  const api = fakeApi({
    searchHistory: jest.fn(() => Promise.resolve(['猫'])),
    search: jest.fn(() => Promise.resolve([result(1)])),
  });
  const app = await start(api);
  await tick();
  const back = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  const input = app.querySelector('input');
  expect(document.activeElement).toBe(input);
  // Backspace while typing is an edit, not Back.
  press(input, 8);
  expect(back).not.toHaveBeenCalled();
  press(input, 40); // to the chip
  expect(document.activeElement).not.toBe(input);
  press(document.activeElement, 8);
  expect(back).toHaveBeenCalledTimes(1);

  input.value = 'x';
  press(input, 13);
  await tick();
  press(input, 40);
  press(input, 40);
  expect(app.querySelector('.focused').classList.contains('card')).toBe(true);
  expect(document.activeElement).not.toBe(input);
  press(document.activeElement, 8);
  expect(back).toHaveBeenCalledTimes(2);
});

test('a stale search response is ignored', async () => {
  const resolvers = [];
  const api = fakeApi({ search: jest.fn(() => new Promise((r) => resolvers.push(r))) });
  const app = await start(api);
  await tick();
  const input = app.querySelector('input');
  input.value = 'a';
  press(input, 13);
  input.value = 'b';
  press(input, 13);
  resolvers[1]([result(2)]);
  await tick();
  resolvers[0]([result(1), result(3)]);
  await tick();
  expect(app.querySelectorAll('.grid .card').length).toBe(1);
});
