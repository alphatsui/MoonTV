# MoonTV Samsung TV Front End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A remote-only TV front end at `https://iptv.db.hk/tv`. It is served from MoonTV's `public/tv/`, calls MoonTV's existing `/api/*`, and runs on both Samsung Frames (Tizen 7 and Tizen 9).

**Architecture:** Plain ES5 scripts, with no framework and no build step. They are loaded in order by `public/tv/index.html`. Each logic module is a UMD-style IIFE that sets `window.TVxxx` and also `module.exports`, the same pattern as `emulatorjs-cf/clients/shell-web/registry.js`, so Jest can test it in Node. DOM views sit on top of the pure modules. Hash routing (`#/home`, `#/detail?...`, `#/play?...`) gives the Back key browser history for free. MoonTV itself changes in only two places: `src/middleware.ts` and `next.config.js`.

**Tech Stack:** ES5 JavaScript, HTML and CSS. hls.js is vendored from the version in `pnpm-lock.yaml`. Tests use Jest 29 via `next/jest` (already configured, jsdom). A new devDependency, `acorn`, is only for the ES5 syntax test.

**Spec:** `docs/superpowers/specs/2026-11-14-samsung-tv-frontend-design.md`

## Global Constraints

- Every file in `public/tv/js/**` must parse as **ES5**. No `let`, `const`, arrow functions, classes, template literals or `async`. The vendored `public/tv/vendor/hls.min.js` must parse as ES2020 or lower. The target is Chromium 94 (Tizen 7).
- Only same-origin requests to `/api/*`. Images go through `/api/image-proxy?url=<encoded>`.
- MoonTV source changes are limited to:
  - `src/middleware.ts`: `/tv` and `/tv/*` skip auth.
  - `next.config.js`: rewrite `/tv` to `/tv/index.html`.
  - Everything else is new: `public/tv/**`, `src/__tests__/tv/**`, and the `acorn` devDependency.
- The page lives at `/tv` (Next 308-redirects `/tv/` to `/tv`). Every asset URL in `index.html` is absolute, `/tv/...`.
- UI text is in Simplified Chinese, matching MoonTV.
- Layout is designed for 1920×1080. Exactly one element has the visible focus at all times.
- Credentials (`username`, `password`) are stored in `localStorage` key `moontv.tv.auth.v1`. The owner accepted plain-text storage. On a 401, log in again once, then retry the request once.
- Play-record and favorite keys are `${source}+${id}`. `PlayRecord.index` is **1-based**.
- Key codes:

  | Key | Code |
  |---|---|
  | Back | 10009, plus Escape 27; Backspace 8 only when no text input is focused |
  | Enter | 13 |
  | Arrows | 37–40 |
  | PlayPause | 10252 |
  | Play | 415 |
  | Pause | 19 |
  | FastForward | 417 |
  | Rewind | 412 |
  | Stop | 413 |

## Review Focus

1. **Empty or failed rows.** Douban unreachable, no favorites, or no play records: the row is hidden, focus never lands on an empty row, and the home screen still has a focusable `搜索` button. Test in Task 6.
2. **Saved password no longer valid.** Re-login fails: clear the stored credentials and show the login screen with `登录已失效，请重新登录`. Never loop on login. Test in Task 2.
3. **Cookie expires mid-playback.** `savePlayRecord` gets a 401: re-login and retry succeed silently. Test in Task 2.
4. **Stream fails.** An hls fatal error or a 404 manifest: the player shows `播放失败` with focusable `换来源` and `返回` buttons. It never leaves a black screen that ignores Back. Test in Task 8.
5. **Backspace while typing in search.** It deletes a character and does not navigate back. Test in Task 3.

---

## File Structure

```
public/tv/
  index.html            shell page; loads css, vendor, js in order; <div id="app">
  css/tv.css            10-foot styles: .focused ring, rows, cards, player overlay
  vendor/hls.min.js     copied from node_modules/hls.js/dist/hls.min.js (lockfile version)
  js/api.js             TVApi: fetch wrapper, auto re-login, all endpoints
  js/keys.js            TVKeys: keyCode -> action
  js/router.js          TVRouter: parse/format hash routes
  js/focus.js           TVFocus: pure grid navigation + DOM focus manager
  js/adfilter.js        TVAdFilter: filterAdsFromM3U8 + hls loader factory
  js/playback.js        TVPlayback: pure player rules (seek, skip, record, next)
  js/views/login.js     login view
  js/views/home.js      home rows
  js/views/search.js    search input, history, results grid
  js/views/detail.js    detail, sources, episodes, favorite toggle
  js/views/player.js    full-screen player + overlay
  js/views/info.js      version + navigator.userAgent (debug)
  js/app.js             boot, route dispatch, global key handling
src/__tests__/tv/*.test.js   Jest tests (kept out of public/ so they are not served)
```

---

### Task 1: Serve `/tv` without auth, with an ES5 syntax guard

**Files:**
- Modify: `src/middleware.ts` (`shouldSkipAuth`)
- Modify: `next.config.js` (add `async rewrites()`)
- Modify: `package.json` (devDependency `acorn`)
- Create: `public/tv/index.html`, `public/tv/css/tv.css`, `public/tv/js/app.js` (stub that renders `MoonTV` into `#app`), `public/tv/vendor/hls.min.js`
- Test: `src/__tests__/tv/middleware.test.ts`, `src/__tests__/tv/syntax.test.js`

**Interfaces:**
- Produces: `export function isTvPath(pathname: string): boolean` in `src/middleware.ts`. It returns true for `/tv` and anything starting with `/tv/`. `shouldSkipAuth` returns true when `isTvPath` is true.
- Produces: `index.html` script order: `/tv/vendor/hls.min.js`, `/tv/js/keys.js`, `router.js`, `focus.js`, `api.js`, `adfilter.js`, `playback.js`, `views/*.js`, `app.js` last. Later tasks add their file to this list.

- [ ] **Step 1: Write failing tests.**
  - `middleware.test.ts` (with the `/** @jest-environment node */` docblock):
    - `isTvPath('/tv') === true`
    - `isTvPath('/tv/js/app.js') === true`
    - `isTvPath('/tvshow') === false`
    - `isTvPath('/api/playrecords') === false`
    - `isTvPath('/') === false`
  - `syntax.test.js`: for every `public/tv/js/**/*.js`, `acorn.parse(src, {ecmaVersion: 5})` does not throw. For `public/tv/vendor/hls.min.js`, `ecmaVersion: 2020` does not throw.
- [ ] **Step 2: Run the tests and confirm they fail.**
  - `pnpm install && pnpm add -D acorn`
  - `pnpm jest src/__tests__/tv`
  - Expected: FAIL, because `isTvPath` is not exported and the files are missing.
- [ ] **Step 3: Implement.**
  - Add `isTvPath` and the `shouldSkipAuth` hook.
  - Add the rewrite `{ source: '/tv', destination: '/tv/index.html' }`.
  - Copy `node_modules/hls.js/dist/hls.min.js` to `public/tv/vendor/`.
  - Write `index.html` with absolute `/tv/` URLs, and `<meta name="viewport" content="width=1920">`.
  - Write the stub `app.js`.
- [ ] **Step 4: Run the tests and confirm they pass.**
  - `pnpm jest src/__tests__/tv` passes.
  - `pnpm typecheck` passes.
  - `pnpm lint:strict` passes.
- [ ] **Step 5: Check locally.**
  - Run `PASSWORD=x pnpm dev`.
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/tv` gives `200`, and the body contains `<div id="app">`.
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/playrecords` gives `401`, so the APIs are still protected.
- [ ] **Step 6: Commit.** `git commit -m "feat(tv): serve /tv front end shell without auth"`

### Task 2: API client with automatic re-login

**Files:**
- Create: `public/tv/js/api.js`
- Test: `src/__tests__/tv/api.test.js`

**Interfaces:**
- Produces: `TVApi.create({fetch, storage}) -> api`. `fetch` is a `window.fetch`-compatible function and `storage` is a `localStorage`-like object. Every method returns a Promise.
  - `api.getCreds() -> {username, password} | null`
  - `api.login(username, password) -> Promise<void>`: POST `/api/login` with JSON `{username, password}`. On success it saves the credentials. On non-2xx it rejects with `Error(json.error || '登录失败')`.
  - `api.logout()`: clears the stored credentials.
  - `api.serverConfig() -> {SiteName, StorageType}`
  - `api.playRecords() -> Object<key, PlayRecord>`
  - `api.savePlayRecord(key, record)`: POST `{key, record}`
  - `api.deletePlayRecord(key)`: DELETE `?key=`
  - `api.favorites() -> Object<key, Favorite>`
  - `api.addFavorite(key, favorite)`: POST `{key, favorite}`
  - `api.removeFavorite(key)`: DELETE `?key=`
  - `api.search(q) -> SearchResult[]`: unwraps `{results}`
  - `api.detail(source, id) -> SearchResult`
  - `api.doubanHot(kind) -> DoubanItem[]`: `kind` is one of `'movie'`, `'tv'`, `'show'`. It calls `/api/douban/categories` with the same params as `src/app/page.tsx:69-75`, and returns `list` when `code === 200`, otherwise `[]`.
  - `api.searchHistory() -> string[]`
  - `api.addSearchHistory(keyword)`
  - `api.skipConfig(source, id) -> SkipConfig | null`
  - `api.imageUrl(url) -> '/api/image-proxy?url=' + encodeURIComponent(url)`
- Produces: errors. `err.code === 'AUTH'` means the user must log in again: there are no credentials, or the re-login failed. `err.code === 'HTTP'` comes with `err.status`. `err.code === 'NETWORK'` means the fetch itself rejected.

- [ ] **Step 1: Write failing tests** with a fake `fetch` that records calls and an in-memory `storage`.
  - `login stores creds under moontv.tv.auth.v1`
  - `login rejects with server error text`: a fake `{error:'用户名或密码错误'}` with status 401 gives a rejection message equal to that text.
  - `401 then successful relogin retries once`: `playRecords()` gets 401, then `/api/login` returns 200, then a retried GET returns `{"a+1":{...}}`. The result equals that object, there are exactly 3 fetch calls, and the order is GET, POST login, GET.
  - `401 on savePlayRecord mid-playback retries the POST with the same body` (Review Focus 3)
  - `relogin failure clears creds and rejects with code AUTH` (Review Focus 2): GET gets 401 and the login gets 401. `storage.getItem('moontv.tv.auth.v1') === null`, `err.code === 'AUTH'`, and there is no second login attempt.
  - `no creds + 401 rejects AUTH without calling login`
  - `doubanHot returns [] when code !== 200 or fetch rejects`
  - `requests use credentials: 'same-origin'`
- [ ] **Step 2: Run** `pnpm jest src/__tests__/tv/api.test.js`. Expected: FAIL, because `TVApi` is undefined.
- [ ] **Step 3: Implement** `public/tv/js/api.js`.
  - Wrap everything in one internal `request(method, path, body)` that does the 401, re-login, retry-once logic.
  - Use only Promise chains, no `async`/`await`, because the code must stay ES5.
- [ ] **Step 4: Run** the `api` and `syntax` tests. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(tv): API client with automatic re-login"`

### Task 3: Keys, router, and focus navigation

**Files:**
- Create: `public/tv/js/keys.js`, `public/tv/js/router.js`, `public/tv/js/focus.js`
- Test: `src/__tests__/tv/keys.test.js`, `router.test.js`, `focus.test.js`

**Interfaces:**
- Produces: `TVKeys.action(event) -> 'up'|'down'|'left'|'right'|'ok'|'back'|'playpause'|'play'|'pause'|'ff'|'rw'|'stop'|null`. It uses the Global Constraints key table. For Backspace it returns `'back'` only when `event.target` is not an `INPUT` or `TEXTAREA`.
- Produces: `TVRouter.parse(hash) -> {name, params}` and `TVRouter.format(name, params) -> '#/name?k=v'`, with values URI-encoded. Route names are `login`, `home`, `search`, `detail` (params `source`, `id`, optional `title`), `play` (params `source`, `id`, `ep`, 0-based episode index, and optional `t`, a start time in seconds), and `info`. An empty or unknown hash parses to `{name:'home', params:{}}`.
- Produces: `TVFocus.move(rows, pos, dir) -> pos`. `rows` is `number[]`, the item count per row. `pos` is `{row, col}`. Empty rows (count 0) are skipped. Moving up or down keeps `col` clamped to the target row's length. Moving past an edge returns the same `pos`.
- Produces: `TVFocus.manager(container)` with:
  - `.setRows(arrayOfElementArrays)`
  - `.handle(action) -> boolean`: true if consumed
  - `.focusAt(row, col)`
  - `.current() -> Element`

  The manager adds the `focused` class to the current element, calls `scrollIntoView({block:'nearest', inline:'nearest'})`, and calls `el.focus()` when the element is an `INPUT`.

- [ ] **Step 1: Write failing tests.**
  - `keys`:
    - `10009 -> back`
    - `27 -> back`
    - `8 on BODY -> back`
    - `8 on INPUT -> null` (Review Focus 5)
    - `10252 -> playpause`
    - `417 -> ff`
    - `13 -> ok`
  - `router`:
    - A round trip of `format('play',{source:'a b',id:'1',ep:2,t:30})` through `parse` returns equal params, with numbers as strings.
    - `parse('')` gives `home`.
    - `parse('#/nope')` gives `home`.
  - `focus.move`:
    - `move([3,0,2],{row:0,col:2},'down')` gives `{row:2,col:1}`. It skips the empty row and clamps.
    - `move([3],{row:0,col:0},'left')` stays put.
    - `move([3,5],{row:1,col:4},'up')` gives `{row:0,col:2}`.
  - `manager` (jsdom): after `setRows` and `handle('right')`, the second element has class `focused` and the first does not.
- [ ] **Step 2: Run** `pnpm jest src/__tests__/tv`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the three modules and add them to `index.html`.
- [ ] **Step 4: Run** `pnpm jest src/__tests__/tv`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(tv): remote keys, hash router and focus navigation"`

### Task 4: Ad filter and playback rules

**Files:**
- Create: `public/tv/js/adfilter.js`, `public/tv/js/playback.js`
- Test: `src/__tests__/tv/adfilter.test.js`, `playback.test.js`

**Interfaces:**
- Produces: `TVAdFilter.filter(m3u8) -> string`. It behaves exactly like `filterAdsFromM3U8` in `src/app/play/page.tsx:440`: it drops lines containing `#EXT-X-DISCONTINUITY`, and `''` maps to `''`.
- Produces: `TVAdFilter.loaderFor(Hls) -> LoaderClass`. This is an ES5 port of `CustomHlsJsLoader` (`page.tsx:561`). For `context.type` equal to `'manifest'` or `'level'`, it runs `filter` on string `response.data` before calling `onSuccess`. Use `Hls.DefaultConfig.loader` with prototype inheritance, not `class`.
- Produces: `TVPlayback`:
  - `seekStep(heldMs) -> seconds`: 10 below 1000 ms held, 30 below 3000 ms, otherwise 60.
  - `startTime(record, skip, epIndex) -> seconds`: resume at `record.play_time` when `record.index - 1 === epIndex` and `play_time < total_time - 5`. Otherwise use `skip.intro_time` when `skip && skip.enable`. Otherwise 0.
  - `shouldSkipOutro(skip, currentTime, duration) -> boolean`: true when `skip.enable`, `skip.outro_time > 0`, and `currentTime >= duration - skip.outro_time`.
  - `buildRecord(detail, epIndex, currentTime, duration, searchTitle) -> PlayRecord`: `index` is `epIndex + 1`, `total_episodes` is `detail.episodes.length`, and `save_time` is `Date.now()`. The `play_time` and `total_time` values are floored.
  - `nextEpisode(detail, epIndex) -> number | null`
  - `SAVE_INTERVAL_MS = 10000`

- [ ] **Step 1: Write failing tests.**
  - `filter`: an m3u8 with 2 `#EXT-X-DISCONTINUITY` lines has 0 of them afterwards, and every other line is kept in order.
  - `loaderFor`: a fake `Hls` whose base loader calls `callbacks.onSuccess({data:'#EXT-X-DISCONTINUITY\nseg.ts'}, {}, ctx)` delivers `'seg.ts'` for `ctx.type==='level'`, and leaves the data unchanged for `ctx.type==='fragment'`.
  - `startTime`:
    - resume: `{index:3, play_time:120, total_time:2400}` with `epIndex=2` gives 120
    - another episode with `skip{enable:true, intro_time:90}` gives 90
    - near the end, `play_time:2398, total_time:2400`, with no skip gives 0
  - `shouldSkipOutro({enable:true,outro_time:60},2341,2400) === true`, and the same call at 2339 gives false.
  - `nextEpisode({episodes:['a','b']},1) === null`
  - `buildRecord(...).index === epIndex + 1`
- [ ] **Step 2: Run** `pnpm jest src/__tests__/tv`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules and add them to `index.html`.
- [ ] **Step 4: Run** `pnpm jest src/__tests__/tv`. Expected: PASS, including the syntax test.
- [ ] **Step 5: Commit.** `git commit -m "feat(tv): ad filter and playback rules"`

### Task 5: App boot, login view, info view

**Files:**
- Modify: `public/tv/js/app.js` (replace the stub)
- Create: `public/tv/js/views/login.js`, `public/tv/js/views/info.js`
- Modify: `public/tv/css/tv.css`
- Test: `src/__tests__/tv/app.test.js` (jsdom)

**Interfaces:**
- Consumes: `TVApi`, `TVKeys`, `TVRouter`, `TVFocus`.
- Produces: the view contract that every view in Tasks 6–8 follows:
  - `TVViews.<name> = { mount(el, params, ctx) -> optional unmount function }`
  - `ctx = { api, go(name, params), replace(name, params), focus: TVFocus.manager(el), onKey(fn) }`
  - `go` pushes a hash. `replace` uses `location.replace` with the new hash.
  - `ctx.onKey(fn)` lets a view take keys before the focus manager. `fn(action)` returns true when it handled the key.
- Produces: app behaviour.
  - On `hashchange`, unmount the current view and mount the new one.
  - Global key handling: `back` on `home`, or on `login` with no history, calls `history.back()`, which returns to the TV Apps launcher. Otherwise `back` calls `history.back()` unless the view consumed the key.
  - Any rejected promise with `err.code === 'AUTH'` that reaches `ctx` calls `ctx.replace('login', {msg:'expired'})`.
  - On boot with no credentials, `replace('login')`.
- Login view:
  - Shows username and password inputs and a `登录` button.
  - Reads `api.serverConfig()`. If `StorageType === 'localstorage'`, it hides the username field.
  - On success it calls `replace('home')`.
  - With `msg=expired` it shows `登录已失效，请重新登录`.
  - On failure it shows the error text.
- Info view: shows `TVApp.VERSION` (the constant `'0.1.0'` in `app.js`; the repo-root `VERSION.txt` is not served) and `navigator.userAgent`.

- [ ] **Step 1: Write failing tests** with jsdom, a fake `api`, and views registered as stubs.
  - `boot without creds shows login`: `location.hash` becomes `#/login`.
  - `AUTH error from a view routes to login with msg=expired`
  - `login hides username when StorageType is localstorage`
  - `back on home calls history.back`
- [ ] **Step 2: Run** `pnpm jest src/__tests__/tv/app.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** `app.js`, `login.js`, `info.js`, and the base CSS:
  - `.focused`: 6px outline in `#4fc3f7` plus `transform: scale(1.06)`
  - a dark background
  - body font size of at least 28px
- [ ] **Step 4: Run** `pnpm jest src/__tests__/tv`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(tv): app shell, login and info views"`

### Task 6: Home and search views

**Files:**
- Create: `public/tv/js/views/home.js`, `public/tv/js/views/search.js`
- Modify: `public/tv/css/tv.css`
- Test: `src/__tests__/tv/home.test.js`, `search.test.js` (jsdom)

**Interfaces:**
- Consumes: the view contract from Task 5 and `TVApi`.
- Home:
  - Header row: `搜索` (goes to `search`) and `关于` (goes to `info`).
  - Then these rows, in order, each shown only if non-empty:
    - `继续观看`: `playRecords()` sorted by `save_time` descending. Each card shows a progress bar, `play_time / total_time`. OK goes to `play` with `{source, id, ep: index - 1, t: play_time}`.
    - `我的收藏`: `favorites()` sorted by `save_time` descending. OK goes to `detail`.
    - `热门电影`, `热门剧集`, `热门综艺`: `doubanHot('movie'|'tv'|'show')`. OK goes to `search` with `{q: title, auto: 1}`.
  - Render each row as its promise resolves, with at most 30 cards per row. The search results grid shows at most 60 cards. These caps are what the spec's "only render what is visible" means for the 32".
  - Initial focus is the first card of `继续观看` if present, otherwise `搜索`.
  - Images use `api.imageUrl(cover)` with `loading="lazy"`.
- Search:
  - A text `<input>` with OK opening the Tizen IME (native focus). Enter in the input runs the search and calls `addSearchHistory`.
  - Down from the input goes to the history chips (`searchHistory()`), then to the results grid with 6 columns.
  - A result card goes to `detail` with `{source, id, title}`.
  - With `params.q` and `auto`, search runs immediately.
  - If there are no results, it shows `没有找到结果` and the focus stays on the input.

- [ ] **Step 1: Write failing tests.**
  - `home hides empty rows and focuses 搜索` (Review Focus 1): records `{}`, favorites `{}`, and douban `[]` for all three. Only the header row renders, and the `.focused` element's text is `搜索`.
  - `home renders 继续观看 first, sorted by save_time desc, and focuses its first card`
  - `douban rejection leaves other rows working`
  - `continue card routes to play with ep = index - 1 and t = play_time`
  - `search with no results shows 没有找到结果 and focus stays on input`
  - `auto search with q runs api.search once`
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** both views and add them to `index.html`.
- [ ] **Step 4: Run** `pnpm jest src/__tests__/tv`. Expected: PASS.
- [ ] **Step 5: Check locally.**
  - Run `pnpm dev` with real D1, or with `NEXT_PUBLIC_STORAGE_TYPE` pointing at a dev store.
  - Open `localhost:3000/tv` in Chrome and use only the arrow keys, Enter and Escape.
  - Check that the home rows load and that search finds a title.
- [ ] **Step 6: Commit.** `git commit -m "feat(tv): home rows and search"`

### Task 7: Detail view

**Files:**
- Create: `public/tv/js/views/detail.js`
- Modify: `public/tv/css/tv.css`
- Test: `src/__tests__/tv/detail.test.js` (jsdom)

**Interfaces:**
- Consumes: `api.detail`, `api.search`, `api.playRecords`, `api.favorites`, `api.addFavorite`, `api.removeFavorite`.
- Layout follows the spec's detail sketch, one row each:
  1. `▶ 播放` or `▶ 继续 第N集`, plus `♥ 收藏` / `♥ 已收藏`
  2. sources
  3. an episodes grid with 10 columns
- Sources are the `api.search(title)` results whose `title` equals the detail title, after trimming. The current source is marked with ✓. Choosing another source goes to `detail` with that `{source, id, title}`, using `replace`.
- The favorite toggle calls `addFavorite(key, {title, source_name, year, cover: poster, total_episodes, search_title: title, save_time: Date.now()})` or `removeFavorite(key)`.
- If the detail has 0 episodes or fails to load, it shows `该来源暂无可播放内容`. Focus goes to the sources row if it has items, otherwise to a `返回` button.

- [ ] **Step 1: Write failing tests.**
  - `continue button shows 第3集 when record index is 3 and routes to play ep=2 t=play_time`
  - `favorite toggle posts key source+id then label becomes 已收藏`
  - `detail failure shows message and focuses 返回`
  - `sources row lists only exact-title matches and marks current`
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the view and add it to `index.html`.
- [ ] **Step 4: Run** `pnpm jest src/__tests__/tv`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(tv): detail view with sources, episodes and favorites"`

### Task 8: Player view

**Files:**
- Create: `public/tv/js/views/player.js`
- Modify: `public/tv/css/tv.css`
- Test: `src/__tests__/tv/player.test.js` (jsdom, with fake `Hls` and fake `<video>` timing)

**Interfaces:**
- Consumes: `TVPlayback.*`, `TVAdFilter.loaderFor`, `api.detail`, `api.playRecords`, `api.skipConfig`, `api.savePlayRecord`.
- Behaviour:
  - Load the detail, then the URL `episodes[ep]`.
  - If `Hls.isSupported()`, use `new Hls({loader: TVAdFilter.loaderFor(Hls)})`. Otherwise set `video.src` directly.
  - The start time is `params.t` if present, otherwise `TVPlayback.startTime(record, skip, ep)`.
- Keys, while playing with the overlay hidden:
  - `ok`, `playpause`, `play`, `pause`: toggle playback and show the overlay for 4 s.
  - `left` and `right`: seek by `seekStep(heldMs)`, where `heldMs` is measured from the first keydown of a repeat run.
  - `ff` and `rw`: same as `right` and `left`.
  - `up` and `down`: show the overlay with focusable `下一集`, `选集` and `换来源`. `下一集` is hidden when `nextEpisode` is null. `选集` and `换来源` go to `detail`.
- Back: if the overlay is shown, hide it and consume the key. Otherwise save the record and let `history.back()` run.
- Save the record every `SAVE_INTERVAL_MS`, on pause, and on unmount, via `savePlayRecord(source + '+' + id, buildRecord(...))`. Save errors other than `AUTH` are ignored.
- On `timeupdate`, if `shouldSkipOutro` is true, or on `ended`: go to the next episode with `replace('play', {source, id, ep: next})` if one exists, otherwise go back.
- On an hls `ERROR` with `data.fatal`, or a video `error`: show `播放失败` with `换来源` and `返回`, and focus `换来源`.
- On unmount: destroy the hls instance and clear the timers.

- [ ] **Step 1: Write failing tests.**
  - `fatal hls error shows 播放失败 with 换来源 focused` (Review Focus 4)
  - `back with overlay open hides overlay and is consumed`
  - `back without overlay saves record with index ep+1 then allows history.back`
  - `interval save fires after 10000 ms` (jest fake timers)
  - `ended with next episode replaces route to ep+1`
  - `ended on last episode goes back`
  - `uses params.t over stored record`
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement** the view and add it to `index.html`.
- [ ] **Step 4: Run** `pnpm jest src/__tests__/tv && pnpm lint:strict && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Check locally.** In Chrome, play an episode and check that:
  - left and right seek
  - Escape closes the overlay, and then exits
  - continuing playback appears under 继续观看 on home, and on the phone web UI
- [ ] **Step 6: Commit.** `git commit -m "feat(tv): player with ad filter, resume, skip and next episode"`

### Task 9: Deploy and verify on both Frames

**Files:**
- Modify: `README.md` (add a short `## Samsung TV 使用` section after `## AndroidTV 使用`: the URL `https://iptv.db.hk/tv`, how to add it in TV Apps with the Web app preset, and the remote controls)

- [ ] **Step 1: Write the README section and commit.** `git commit -m "docs: Samsung TV usage"`
- [ ] **Step 2: Push and open a PR.**
  - `git push -u origin feat/samsung-tv-frontend` and open a PR against `main`.
  - The owner decides on the merge. The Cloudflare Workers deploy for `iptv.db.hk` runs from that merge; how it is triggered is to be confirmed with the owner.
- [ ] **Step 3: Verify the deploy.** After it is live:
  - `curl -s -o /dev/null -w '%{http_code}' https://iptv.db.hk/tv` gives `200`, and the body contains `<div id="app">`.
  - `curl -s -o /dev/null -w '%{http_code}' https://iptv.db.hk/api/playrecords` gives `401`.
  - If `/tv` is 404 on Workers, replace the rewrite with `src/app/tv/route.ts`, which returns `public/tv/index.html` as `text/html`. Then rerun `/tv` and the Task 1 tests.
- [ ] **Step 4: On each Frame (192.168.8.51 and .52), the owner follows this checklist with the remote:**
  - In TV Apps, use Add app, then Web app, and enter `https://iptv.db.hk/tv`.
  - Log in once with the owner account.
  - The info view shows a user agent; record each Chromium version in the PR.
  - Home rows load, and 继续观看 matches OrionTV on the Sony.
  - Search accepts input from the Tizen keyboard; record whether Chinese works.
  - An episode plays, seeks, resumes after Back and reopen, and auto-advances.
  - Record whether Play, Pause, FF and RW reach the page.
  - Back from home returns to TV Apps.
  - Scrolling and playback on the 32" are smooth.
- [ ] **Step 5: Report the results in the PR.**
  - Any item that fails becomes a follow-up. If the media keys don't reach the page, the follow-up is to register them with `tizen.tvinputdevice.registerKey` in the `emulatorjs-cf` launcher before it navigates.
