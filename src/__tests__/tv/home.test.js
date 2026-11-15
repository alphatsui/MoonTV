/* eslint-disable */
require('../../../public/tv/js/focus.js');
require('../../../public/tv/js/views/home.js');

const tick = () => new Promise((r) => setTimeout(r, 5));

function setup(apiOver) {
  document.body.innerHTML = '<div id="v"></div>';
  Element.prototype.scrollIntoView = jest.fn();
  const el = document.getElementById('v');
  const api = Object.assign(
    {
      playRecords: () => Promise.resolve({}),
      favorites: () => Promise.resolve({}),
      doubanHot: () => Promise.resolve([]),
      imageUrl: (u) => '/api/image-proxy?url=' + encodeURIComponent(u),
    },
    apiOver
  );
  const handlers = [];
  const ctx = {
    api,
    go: jest.fn(),
    replace: jest.fn(),
    focus: window.TVFocus.manager(el),
    onKey: (fn) => handlers.push(fn),
  };
  const un = window.TVViews.home.mount(el, {}, ctx);
  return { el, ctx, un };
}

const focusedText = (el) => {
  const f = el.querySelectorAll('.focused');
  expect(f.length).toBe(1);
  return f[0].textContent;
};

test('home hides empty rows and focuses 搜索', async () => {
  const { el } = setup();
  await tick();
  expect(el.querySelectorAll('.row').length).toBe(0);
  expect(el.querySelectorAll('.card').length).toBe(0);
  expect(focusedText(el)).toBe('搜索');
});

test('home renders 继续观看 first, sorted by save_time desc, and focuses its first card', async () => {
  const { el } = setup({
    doubanHot: (k) => Promise.resolve(k === 'movie' ? [{ title: '热片', poster: 'p' }] : []),
    favorites: () => Promise.resolve({ 'a+1': { title: '收', cover: 'c', save_time: 1 } }),
    playRecords: () =>
      Promise.resolve({
        'a+1': { title: '旧', cover: 'c', index: 1, play_time: 10, total_time: 100, save_time: 1 },
        'b+2': { title: '新', cover: 'c', index: 2, play_time: 50, total_time: 100, save_time: 9 },
      }),
  });
  await tick();
  const titles = Array.prototype.map.call(el.querySelectorAll('.row-title'), (e) => e.textContent);
  expect(titles).toEqual(['继续观看', '我的收藏', '热门电影']);
  const first = el.querySelectorAll('.row')[0].querySelectorAll('.card');
  expect(first[0].querySelector('.card-title').textContent).toBe('新');
  expect(first[0].querySelector('.progress-fill').style.width).toBe('50%');
  expect(first[0].querySelector('img').getAttribute('loading')).toBe('lazy');
  expect(first[0].querySelector('img').getAttribute('src')).toContain('/api/image-proxy');
  expect(focusedText(el)).toBe('新');
});

test('douban rejection leaves other rows working', async () => {
  const { el } = setup({
    doubanHot: () => Promise.reject(new Error('down')),
    favorites: () => Promise.resolve({ 'a+1': { title: '收', cover: 'c', save_time: 1 } }),
  });
  await tick();
  const titles = Array.prototype.map.call(el.querySelectorAll('.row-title'), (e) => e.textContent);
  expect(titles).toEqual(['我的收藏']);
  expect(focusedText(el)).toBe('搜索');
});

test('failed play records and favorites stay hidden, 搜索 stays focusable', async () => {
  const { el, ctx } = setup({
    playRecords: () => Promise.reject(new Error('x')),
    favorites: () => Promise.reject(new Error('y')),
  });
  await tick();
  expect(el.querySelectorAll('.row').length).toBe(0);
  expect(focusedText(el)).toBe('搜索');
  el.querySelector('.focused').click();
  expect(ctx.go).toHaveBeenCalledWith('search');
});

test('continue card routes to play with ep = index - 1 and t = play_time', async () => {
  const { el, ctx } = setup({
    playRecords: () =>
      Promise.resolve({ 'src+id+9': { title: 'T', cover: 'c', index: 3, play_time: 77, total_time: 100, save_time: 1 } }),
  });
  await tick();
  el.querySelector('.row .card').click();
  expect(ctx.go).toHaveBeenCalledWith('play', { source: 'src', id: 'id+9', ep: 2, t: 77 });
});

test('favorite and douban cards route to detail and search', async () => {
  const { el, ctx } = setup({
    favorites: () => Promise.resolve({ 'a+1': { title: '收', cover: 'c', save_time: 1 } }),
    doubanHot: (k) => Promise.resolve(k === 'tv' ? [{ title: '剧', poster: 'p' }] : []),
  });
  await tick();
  const rows = el.querySelectorAll('.row');
  rows[0].querySelector('.card').click();
  expect(ctx.go).toHaveBeenCalledWith('detail', { source: 'a', id: '1', title: '收' });
  rows[1].querySelector('.card').click();
  expect(ctx.go).toHaveBeenCalledWith('search', { q: '剧', auto: 1 });
});

test('rows cap at 30 cards and rows keep order when they arrive late', async () => {
  const many = [];
  for (let i = 0; i < 50; i++) many.push({ title: 't' + i, poster: 'p' });
  let resolveFav;
  const { el } = setup({
    doubanHot: (k) => Promise.resolve(k === 'movie' ? many : []),
    favorites: () => new Promise((r) => (resolveFav = r)),
  });
  await tick();
  expect(el.querySelectorAll('.row')[0].querySelectorAll('.card').length).toBe(30);
  resolveFav({ 'a+1': { title: '收', cover: 'c', save_time: 1 } });
  await tick();
  const titles = Array.prototype.map.call(el.querySelectorAll('.row-title'), (e) => e.textContent);
  expect(titles).toEqual(['我的收藏', '热门电影']);
  expect(focusedText(el)).toBe('搜索');
});

test('late result after unmount does not touch the DOM', async () => {
  let resolveRec;
  const { el, un } = setup({ playRecords: () => new Promise((r) => (resolveRec = r)) });
  un();
  resolveRec({ 'a+1': { title: 'x', cover: 'c', index: 1, play_time: 1, total_time: 2, save_time: 1 } });
  await tick();
  expect(el.querySelectorAll('.row').length).toBe(0);
});
