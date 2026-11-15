/* eslint-disable */
/** @jest-environment node */
const TVApi = require('../../../public/tv/js/api.js');

const KEY = 'moontv.tv.auth.v1';

function mem(initial) {
  const m = Object.assign({}, initial || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
}

// responses: array of {status, body} or Error; consumed in order.
function fakeFetch(responses) {
  const calls = [];
  const fn = function (url, opts) {
    calls.push({ url, opts: opts || {} });
    const r = responses.shift();
    if (!r) return Promise.reject(new Error('no response queued for ' + url));
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: () => Promise.resolve(r.body),
    });
  };
  fn.calls = calls;
  return fn;
}

const creds = JSON.stringify({ username: 'u', password: 'p' });

function make(responses, stored) {
  const fetch = fakeFetch(responses);
  const storage = mem(stored);
  return { fetch, storage, api: TVApi.create({ fetch, storage }) };
}

function catchErr(p) {
  return p.then(
    () => { throw new Error('expected rejection'); },
    (e) => e
  );
}

function sig(c) {
  return (c.opts.method || 'GET') + ' ' + c.url;
}

describe('TVApi', () => {
  test('login stores creds under moontv.tv.auth.v1', async () => {
    const { api, storage, fetch } = make([{ status: 200, body: { ok: true } }]);
    await api.login('u', 'p');
    expect(JSON.parse(storage.getItem(KEY))).toEqual({ username: 'u', password: 'p' });
    expect(api.getCreds()).toEqual({ username: 'u', password: 'p' });
    expect(sig(fetch.calls[0])).toBe('POST /api/login');
    expect(JSON.parse(fetch.calls[0].opts.body)).toEqual({ username: 'u', password: 'p' });
  });

  test('login rejects with server error text', async () => {
    const { api, storage } = make([{ status: 401, body: { error: '用户名或密码错误' } }]);
    const err = await catchErr(api.login('u', 'bad'));
    expect(err.message).toBe('用户名或密码错误');
    expect(storage.getItem(KEY)).toBeNull();
  });

  test('login falls back to the default message', async () => {
    const { api } = make([{ status: 500, body: null }]);
    const err = await catchErr(api.login('u', 'p'));
    expect(err.message).toBe('登录失败');
  });

  test('logout clears creds', () => {
    const { api } = make([], { [KEY]: creds });
    api.logout();
    expect(api.getCreds()).toBeNull();
  });

  test('401 then successful relogin retries once', async () => {
    const { api, fetch } = make(
      [
        { status: 401, body: { error: 'Unauthorized' } },
        { status: 200, body: { ok: true } },
        { status: 200, body: { 'a+1': { title: 'x' } } },
      ],
      { [KEY]: creds }
    );
    const res = await api.playRecords();
    expect(res).toEqual({ 'a+1': { title: 'x' } });
    expect(fetch.calls.map(sig)).toEqual([
      'GET /api/playrecords',
      'POST /api/login',
      'GET /api/playrecords',
    ]);
  });

  test('401 on savePlayRecord mid-playback retries the POST with the same body', async () => {
    const { api, fetch } = make(
      [
        { status: 401, body: {} },
        { status: 200, body: { ok: true } },
        { status: 200, body: { success: true } },
      ],
      { [KEY]: creds }
    );
    const rec = { title: 'T', index: 2, play_time: 10 };
    await api.savePlayRecord('s+1', rec);
    expect(fetch.calls).toHaveLength(3);
    expect(sig(fetch.calls[2])).toBe('POST /api/playrecords');
    expect(fetch.calls[2].opts.body).toBe(fetch.calls[0].opts.body);
    expect(JSON.parse(fetch.calls[2].opts.body)).toEqual({ key: 's+1', record: rec });
  });

  test('relogin failure clears creds and rejects with code AUTH', async () => {
    const { api, fetch, storage } = make(
      [{ status: 401, body: {} }, { status: 401, body: { error: '用户名或密码错误' } }],
      { [KEY]: creds }
    );
    const err = await catchErr(api.playRecords());
    expect(err.code).toBe('AUTH');
    expect(storage.getItem(KEY)).toBeNull();
    expect(fetch.calls).toHaveLength(2);
  });

  test('relogin answered 400 clears creds and rejects AUTH', async () => {
    const { api, storage } = make([{ status: 401, body: {} }, { status: 400, body: {} }], { [KEY]: creds });
    const err = await catchErr(api.playRecords());
    expect(err.code).toBe('AUTH');
    expect(storage.getItem(KEY)).toBeNull();
  });

  test.each([403, 429, 500, 503])('relogin answered %i keeps creds and rejects HTTP with the status', async (status) => {
    const { api, storage, fetch } = make([{ status: 401, body: {} }, { status, body: {} }], { [KEY]: creds });
    const err = await catchErr(api.playRecords());
    expect(err.code).toBe('HTTP');
    expect(err.status).toBe(status);
    expect(storage.getItem(KEY)).toBe(creds);
    expect(fetch.calls).toHaveLength(2);
  });

  test('relogin network error keeps creds and rejects NETWORK', async () => {
    const { api, storage } = make([{ status: 401, body: {} }, new TypeError('Failed to fetch')], { [KEY]: creds });
    const err = await catchErr(api.playRecords());
    expect(err.code).toBe('NETWORK');
    expect(storage.getItem(KEY)).toBe(creds);
  });

  test('401 after a successful relogin rejects AUTH without a second login', async () => {
    const { api, fetch } = make(
      [{ status: 401, body: {} }, { status: 200, body: {} }, { status: 401, body: {} }],
      { [KEY]: creds }
    );
    const err = await catchErr(api.favorites());
    expect(err.code).toBe('AUTH');
    expect(fetch.calls).toHaveLength(3);
  });

  test('no creds + 401 rejects AUTH without calling login', async () => {
    const { api, fetch } = make([{ status: 401, body: {} }]);
    const err = await catchErr(api.playRecords());
    expect(err.code).toBe('AUTH');
    expect(fetch.calls).toHaveLength(1);
  });

  test('non-401 failure rejects HTTP with status; fetch rejection is NETWORK', async () => {
    const a = make([{ status: 500, body: { error: 'boom' } }]);
    const e1 = await catchErr(a.api.favorites());
    expect(e1.code).toBe('HTTP');
    expect(e1.status).toBe(500);
    const b = make([new TypeError('Failed to fetch')]);
    const e2 = await catchErr(b.api.favorites());
    expect(e2.code).toBe('NETWORK');
  });

  test('doubanHot returns [] when code !== 200 or fetch rejects', async () => {
    const ok = make([{ status: 200, body: { code: 200, list: [{ id: '1' }] } }]);
    expect(await ok.api.doubanHot('movie')).toEqual([{ id: '1' }]);
    expect(ok.fetch.calls[0].url).toBe(
      '/api/douban/categories?kind=movie&category=' + encodeURIComponent('热门') + '&type=' + encodeURIComponent('全部')
    );
    const bad = make([{ status: 200, body: { code: 500, list: [{ id: '1' }] } }]);
    expect(await bad.api.doubanHot('tv')).toEqual([]);
    expect(bad.fetch.calls[0].url).toBe('/api/douban/categories?kind=tv&category=tv&type=tv');
    const rej = make([new Error('down')]);
    expect(await rej.api.doubanHot('show')).toEqual([]);
    expect(rej.fetch.calls[0].url).toBe('/api/douban/categories?kind=tv&category=show&type=show');
  });

  test("requests use credentials: 'same-origin'", async () => {
    const { api, fetch } = make([
      { status: 200, body: {} },
      { status: 200, body: {} },
      { status: 200, body: {} },
    ]);
    await api.login('u', 'p');
    await api.favorites();
    await api.addFavorite('s+1', { title: 't' });
    expect(fetch.calls).toHaveLength(3);
    fetch.calls.forEach((c) => expect(c.opts.credentials).toBe('same-origin'));
  });

  test('method URLs, bodies and unwrapping', async () => {
    const { api, fetch } = make([
      { status: 200, body: { SiteName: 'M', StorageType: 'redis' } },
      { status: 200, body: { success: true } },
      { status: 200, body: { success: true } },
      { status: 200, body: { results: [{ id: '1' }] } },
      { status: 200, body: { id: '9' } },
      { status: 200, body: ['a'] },
      { status: 200, body: ['b', 'a'] },
      { status: 200, body: null },
    ]);
    expect((await api.serverConfig()).SiteName).toBe('M');
    await api.deletePlayRecord('a b+1');
    await api.removeFavorite('s+1');
    expect(await api.search('x y')).toEqual([{ id: '1' }]);
    expect(await api.detail('src', '9')).toEqual({ id: '9' });
    expect(await api.searchHistory()).toEqual(['a']);
    expect(await api.addSearchHistory('b')).toEqual(['b', 'a']);
    expect(await api.skipConfig('s', '1')).toBeNull();
    expect(fetch.calls.map(sig)).toEqual([
      'GET /api/server-config',
      'DELETE /api/playrecords?key=' + encodeURIComponent('a b+1'),
      'DELETE /api/favorites?key=' + encodeURIComponent('s+1'),
      'GET /api/search?q=' + encodeURIComponent('x y'),
      'GET /api/detail?source=src&id=9',
      'GET /api/searchhistory',
      'POST /api/searchhistory',
      'GET /api/skipconfigs?source=s&id=1',
    ]);
    expect(JSON.parse(fetch.calls[6].opts.body)).toEqual({ keyword: 'b' });
  });

  test('imageUrl', () => {
    const { api } = make([]);
    expect(api.imageUrl('http://a/b?c=d')).toBe('/api/image-proxy?url=' + encodeURIComponent('http://a/b?c=d'));
  });
});
