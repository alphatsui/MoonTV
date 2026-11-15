# MoonTV 電視版（Samsung Frame）設計

日期：2026-11-14
狀態：待屋主核准

## 意圖

讓 MoonTV 成為家裡**主要的看片方式**。家人只用遙控器操作，包括方向鍵、OK、Back，有的話再加播放鍵。
Sony Bravia 已經用 [OrionTV](https://github.com/orion-lib/OrionTV) 連到這個 MoonTV，這份設計只處理兩台 Samsung The Frame：

| 電視 | IP | 系統 | 瀏覽器核心（預計，需實測） |
|---|---|---|---|
| Frame 55" | 192.168.8.51 | Tizen 9 | Chromium 約 M120 |
| Frame 32" | 192.168.8.52 | Tizen 7 | Chromium 約 M94 |

兩台都已裝好「TV Apps」啟動器（`alphatsui/emulatorjs-cf` 的 `clients/tizen`）。啟動器的「Web app」preset 可以打開任何 https 網址。

**現況（已確認）**
- MoonTV 部署在 Cloudflare Workers，網域 `https://iptv.db.hk`。https 憑證有效。
- 儲存方式是 **D1**：2026-11-14 查詢 `/api/server-config`，回傳 `{"StorageType":"d1"}`。
- OrionTV（Sony）用**站長帳號**登入，電視也用**同一個帳號**，這樣播放記錄和收藏才會同步。
- Next 會把 `/tv/` 308 轉到 `/tv`（沒有開 trailingSlash），所以電視版的網址是 `https://iptv.db.hk/tv`。

## 做法比較（屋主選了 B）

- **A. 把 MoonTV 的 Next.js 網頁改成電視版。** 不採用。原因一：Next 16 + React 19 預設只支援 Chrome 111 以上，32" 跑不起來。原因二：Frame 的硬體跑 React 頁面偏慢。原因三：以後合併上游更新容易衝突。
- **B. 獨立的輕量電視前端，放在 MoonTV 的 `public/tv/`，呼叫 MoonTV 現有的 API（跟 OrionTV 一樣）。** 採用。它跟 MoonTV 同網域，不會有 CORS 問題，登入 cookie 直接可用，兩台都跑得動，原本的網頁也完全不動。
- **B'. 同一個前端打包進 emulatorjs-cf 的 `.wgt`。** 不採用。它要處理跨網域呼叫和 token，每次改版都得重新打包、重新安裝。
- 移植 OrionTV（React Native tvOS / Expo）到網頁：不採用，等於重寫。

## 目標

1. 在 TV Apps 裡新增一個「Web app」，網址是 `https://iptv.db.hk/tv`，打開後全程用遙控器就能看片。
2. 首頁直接是「繼續觀看」，選了就從上次的位置續播。
3. 播放記錄和收藏跟 Sony 上的 OrionTV、手機和電腦網頁**同一個帳號、互相同步**。做法是使用 `/api/playrecords` 和 `/api/favorites`。
4. 兩台 Frame 都要流暢。在 32" 上，翻頁和進出頁面不能有明顯卡頓。
5. 登入一次就好，家人不需要知道密碼。

## 非目標

- 管理後台（`/admin`）、註冊、改密碼、使用者管理：這些仍在手機或電腦上做。
- 直播、豆瓣完整的分類瀏覽和篩選（之後可以再加）。
- Sony 或其他電視：Sony 繼續用 OrionTV。
- 改動 MoonTV 現有的網頁和 React 頁面。

## 反目標（技術上能動，但等於失敗）

- 家人迷路：看不出焦點在哪、按 Back 跳出 app，或卡在某個沒有焦點的畫面。
- 每週要重新輸入密碼。MoonTV 的 `auth` cookie 只有 7 天效期。
- 手機和電腦版被弄壞，或者以後合併上游 MoonTV 變得很痛苦。
- 在 32" 上白屏或很卡，導致實際上只有一台能用。

## 限制

- **語法和 API 上限：Chromium 94。** 跟啟動器的 `clients/shell-web` 同一種寫法：ES5、不需要建置步驟，用 `<script>` 依序載入，不用框架。理由是 32" 的瀏覽器較舊、硬體也弱。
- **同網域。** 前端由 MoonTV 的部署直接提供，所有資料都從同網域的 `/api/*` 取得，不呼叫外部服務。圖片走 `/api/image-proxy`。
- **對 MoonTV 本體的改動要最小，而且只加不改：**
  - `src/middleware.ts`：把 `/tv/` 的靜態檔加進 `shouldSkipAuth`，未登入時才能顯示電視版自己的登入畫面，而不是被導到網頁版的 `/login`。`/api/*` 保持原本的驗證。
  - `next.config.js`：加 rewrite，把 `/tv` 指向 `/tv/index.html`（Next 不會自動提供資料夾的 index）。
  - 除此之外只新增 `public/tv/**`。
  - 頁面網址是 `/tv`，不是 `/tv/`。所以 `index.html` 裡所有的 JS、CSS 和圖片都必須用絕對路徑 `/tv/...`，不能用相對路徑，否則會載到 `/app.js`。
  - 部署在 Cloudflare Workers 上，rewrite 和 middleware skip 在 Workers 的建置結果裡要實際測過。可以用分支的 preview 部署，或部署後 `curl https://iptv.db.hk/tv` 確認回 200 並拿到 HTML。如果 rewrite 在 Workers 上不生效，改用其他方式提供 `/tv`，例如一個小的 route handler 回傳 `index.html`。
- **播放器：** 用 hls.js（vendored，放在 `public/tv/vendor/`，挑一個能在 Chromium 94 跑的 1.x 版本）。不使用 ArtPlayer，控制列自己做成遙控器友善的版本。
- 程式碼和介面文字使用簡體中文，跟 MoonTV 一致。

## 畫面與操作

全部畫面都以 1920×1080 為基準，並且**任何時候都有一個看得見的焦點**，例如粗框加放大。方向鍵用簡單的格子、列表導航在元素間移動；OK 鍵是確認；Back 鍵（keyCode 10009，另外也接受 Escape 和 Backspace 方便在電腦上測試）回上一層。

```
首頁                                      詳情
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ MoonTV          [搜索]           │     │ [海报]  片名 (年份)               │
│ 继续观看  ▸ [卡][卡][卡][卡] ...  │     │         简介…                     │
│ 我的收藏  ▸ [卡][卡][卡] ...      │     │  [▶ 播放/继续]  [♥ 收藏]          │
│ 热门电影  ▸ [卡][卡][卡][卡] ...  │     │  来源: [源A✓][源B][源C]           │
│ 热门剧集  ▸ [卡][卡][卡][卡] ...  │     │  选集: [1][2][3][4][5]...         │
│ 热门综艺  ▸ [卡][卡][卡][卡] ...  │     └──────────────────────────────────┘
└──────────────────────────────────┘
```

1. **登入**：只在沒有有效登入時出現。D1 模式下要輸入帳號和密碼（站長帳號），然後呼叫 `/api/login`。實作還是要讀 `/api/server-config`，萬一以後改成 localstorage 模式，就只問密碼。
2. **首頁**：一排一排橫向捲動。上下鍵切換排，左右鍵在排內移動。
   - 「继续观看」來自 `/api/playrecords`，卡片顯示進度條，選了直接續播。
   - 「我的收藏」來自 `/api/favorites`。
   - 「热门电影」「热门剧集」「热门综艺」來自 `/api/douban`。
   - 選了豆瓣卡片，會用片名做搜尋，再進入詳情。
3. **搜尋**：一個 `<input>`，聚焦後叫出 Tizen 系統的螢幕鍵盤。下方顯示搜尋歷史（`/api/searchhistory`），結果用卡片格子顯示（`/api/search`）。
4. **詳情**：`/api/detail`。包括播放或續播、收藏切換、來源列表、選集格子。
5. **播放**：全螢幕。
   - OK 鍵：暫停或播放，同時顯示控制列。
   - 左右鍵：快退快進，按住會加速。
   - 上下鍵：叫出控制列，可選「下一集」「選集」「換來源」。
   - Back 鍵：先收起控制列，沒有控制列時退出播放。
   - 每隔一段時間和退出時寫回 `/api/playrecords`。
   - 播完自動播下一集。
   - 套用跟網頁版一樣的**去廣告**（移植 `src/app/play/page.tsx` 裡的 `filterAdsFromM3U8` 和 `CustomHlsJsLoader` 邏輯），以及 **片頭片尾跳過**（`/api/skipconfigs`）。
   - 某個來源載入失敗時，提示換下一個來源。

Back 鍵的層級：播放 → 詳情 → 首頁或搜尋。在首頁按 Back，用 `history.back()` 回到 TV Apps 啟動器（跟 emulatorjs-cf 的 `js/tizen-back.js` 一樣）。

## 已定的決策

- **長期登入（屋主已同意）：** 第一次登入時，電視在 `localStorage` 存下帳號和密碼。之後收到 401 或 cookie 過期時，自動重新呼叫 `/api/login`，然後重試原本的請求，所以家人永遠不用再輸入。
  - 屋主知道密碼是明文存放，也接受這個風險。
  - 存的是站長帳號，跟 OrionTV 一樣。
  - 不需要為電視另開帳號，也不需要改 MoonTV 的登入 API。
- 路由用 hash（`#/home`、`#/detail?...`、`#/play?...`），每換一頁推一筆 history。這樣 Back 鍵天然可用，也不用伺服器端路由。
- 所有清單一次只渲染看得到的部分加一點緩衝（或簡單的分頁），確保 32" 不卡。

## 交給實作者決定

- 焦點導航的具體實作：自寫的格子導航，或小型 spatial-nav 函式庫，只要符合 ES5 和 Chromium 94。
- 視覺風格細節、控制列的樣式、卡片的大小，以「坐在沙發上看得清楚」為準。
- 播放記錄寫回的間隔、快進的步長和加速規則。
- 測試方式：純邏輯（API 包裝、路由、去廣告過濾、焦點計算）用 Jest，MoonTV 已經有 Jest。畫面在電腦瀏覽器用鍵盤模擬遙控器測試，最後在兩台 Frame 上實測。

## 要實測才知道的事（實作中確認）

1. 兩台 Frame 實際的 Chromium 版本，由前端在 debug 畫面顯示 `navigator.userAgent`。
2. **播放鍵**（Play/Pause/FF/RW）會不會傳到被啟動器打開的網頁。Tizen 要先呼叫 `tizen.tvinputdevice.registerKey` 才會傳這些鍵，而遠端網頁上可能沒有 `tizen` 物件。
   - 如果沒傳到：在 emulatorjs-cf 的啟動器開啟 app 前先註冊這些鍵（另外做一個小改動）。
   - 在那之前，方向鍵和 OK 鍵就能完成所有操作。
3. Tizen 系統螢幕鍵盤能不能輸入中文。不能的話，就靠豆瓣熱門、搜尋歷史和首頁的各排來降低打字需求，之後再考慮拼音搜尋。
4. hls.js 在 32" 上的播放效能和記憶體用量。
