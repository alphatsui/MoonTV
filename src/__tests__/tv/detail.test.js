/* eslint-disable */
require('../../../public/tv/js/router.js');
require('../../../public/tv/js/keys.js');
require('../../../public/tv/js/focus.js');
const TVApp = require('../../../public/tv/js/app.js');
require('../../../public/tv/js/views/detail.js');

const tick = () => new Promise((r) => setTimeout(r, 10));

function detailOf(over) {
  return Object.assign(
    {
      source: 'a', source_name: '源A', id: '1', title: '  Movie ', poster: 'p', year: '2020',
      desc: 'desc', episodes: ['u1', 'u2', 'u3', 'u4'],
    },
    over
  );
}

function fakeApi(over) {
  return Object.assign(
    {
      getCreds: () => ({ username: 'u', password: 'p' }),
      detail: jest.fn(() => Promise.resolve(detailOf())),
      search: jest.fn(() => Promise.resolve([])),
      playRecords: jest.fn(() => Promise.resolve({})),
      favorites: jest.fn(() => Promise.resolve({})),
      addFavorite: jest.fn(() => Promise.resolve()),
      removeFavorite: jest.fn(() => Promise.resolve()),
      imageUrl: (u) => '/api/image-proxy?url=' + encodeURIComponent(u),
    },
    over
  );
}

let handle;
async function start(api, hash) {
  document.body.innerHTML = '<div id="app"></div>';
  Element.prototype.scrollIntoView = jest.fn();
  window.location.hash = hash || '#/detail?source=a&id=1&title=Movie';
  await tick();
  handle = TVApp.boot({ api, root: document.getElementById('app') });
  await tick();
  return document.getElementById('app');
}

function btn(app, text) {
  return Array.prototype.find.call(app.querySelectorAll('button, .chip, .ep'), (b) => b.textContent.indexOf(text) >= 0);
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

test('continue button shows 第3集 when record index is 3 and routes to play ep=2 t=play_time', async () => {
  const api = fakeApi({ playRecords: jest.fn(() => Promise.resolve({ 'a+1': { index: 3, play_time: 77 } })) });
  const app = await start(api);
  const b = btn(app, '继续');
  expect(b.textContent).toContain('第3集');
  b.click();
  await tick();
  expect(window.location.hash).toBe('#/play?source=a&id=1&ep=2&t=77&from=detail');
});

test('without a record the play button starts episode 1 from 0', async () => {
  const app = await start(fakeApi());
  btn(app, '播放').click();
  await tick();
  expect(window.location.hash).toBe('#/play?source=a&id=1&ep=0&t=0&from=detail');
});

test('episodes grid has a button per episode and routes to play', async () => {
  const app = await start(fakeApi());
  const eps = app.querySelectorAll('.ep');
  expect(eps.length).toBe(4);
  eps[3].click();
  await tick();
  expect(window.location.hash).toBe('#/play?source=a&id=1&ep=3&t=0&from=detail');
});

test('favorite toggle posts key source+id then label becomes 已收藏', async () => {
  const api = fakeApi();
  const app = await start(api);
  const b = btn(app, '收藏');
  expect(b.textContent).toContain('♥ 收藏');
  b.click();
  await tick();
  expect(api.addFavorite).toHaveBeenCalledTimes(1);
  const [key, fav] = api.addFavorite.mock.calls[0];
  expect(key).toBe('a+1');
  expect(fav).toMatchObject({ title: 'Movie', source_name: '源A', year: '2020', cover: 'p', total_episodes: 4, search_title: 'Movie' });
  expect(typeof fav.save_time).toBe('number');
  expect(b.textContent).toContain('已收藏');
  b.click();
  await tick();
  expect(api.removeFavorite).toHaveBeenCalledWith('a+1');
  expect(b.textContent).not.toContain('已收藏');
});

test('favorite toggle that fails keeps the label and can be retried', async () => {
  let fail = true;
  const api = fakeApi({
    addFavorite: jest.fn(() => (fail ? Promise.reject(Object.assign(new Error('x'), { code: 'NETWORK' })) : Promise.resolve())),
  });
  const app = await start(api);
  const b = btn(app, '收藏');
  b.click();
  await tick();
  expect(b.textContent).not.toContain('已收藏');
  fail = false;
  b.click();
  await tick();
  expect(api.addFavorite).toHaveBeenCalledTimes(2);
  expect(b.textContent).toContain('已收藏');
});

test('favorite that is already saved starts as 已收藏 and failed remove keeps it', async () => {
  const api = fakeApi({
    favorites: jest.fn(() => Promise.resolve({ 'a+1': { title: 'Movie' } })),
    removeFavorite: jest.fn(() => Promise.reject(Object.assign(new Error('x'), { code: 'HTTP', status: 500 }))),
  });
  const app = await start(api);
  const b = btn(app, '收藏');
  expect(b.textContent).toContain('已收藏');
  b.click();
  await tick();
  expect(b.textContent).toContain('已收藏');
});

test('detail failure shows message and focuses 返回', async () => {
  const api = fakeApi({ detail: jest.fn(() => Promise.reject(new Error('boom'))) });
  const app = await start(api);
  expect(app.textContent).toContain('该来源暂无可播放内容');
  const back = btn(app, '返回');
  expect(back).toBeTruthy();
  expect(back.classList.contains('focused')).toBe(true);
});

test('zero episodes shows message, focus on sources row when it has items', async () => {
  const api = fakeApi({
    detail: jest.fn(() => Promise.resolve(detailOf({ episodes: [] }))),
    search: jest.fn(() => Promise.resolve([detailOf({ source: 'b', source_name: '源B', id: '9' })])),
  });
  const app = await start(api);
  expect(app.textContent).toContain('该来源暂无可播放内容');
  const chip = btn(app, '源B');
  expect(chip.classList.contains('focused')).toBe(true);
  expect(btn(app, '返回')).toBeFalsy();
});

test('sources row lists only exact-title matches and marks current', async () => {
  const api = fakeApi({
    search: jest.fn(() =>
      Promise.resolve([
        detailOf(),
        detailOf({ source: 'b', source_name: '源B', id: '2', title: 'Movie' }),
        detailOf({ source: 'c', source_name: '源C', id: '3', title: 'Movie 2' }),
      ])
    ),
  });
  const app = await start(api);
  const chips = app.querySelectorAll('.chip');
  expect(chips.length).toBe(2);
  expect(chips[0].textContent).toBe('✓ 源A');
  expect(chips[1].textContent).toBe('源B');
  chips[1].click();
  await tick();
  expect(window.location.hash).toBe('#/detail?source=b&id=2&title=Movie');
});

test('current source missing from search results is still listed', async () => {
  const api = fakeApi({
    search: jest.fn(() => Promise.resolve([detailOf({ source: 'b', source_name: '源B', id: '2', title: 'Movie' })])),
  });
  const app = await start(api);
  const chips = app.querySelectorAll('.chip');
  expect(chips.length).toBe(2);
  expect(chips[0].textContent).toBe('✓ 源A');
});
