# Misskey クライアント標準変数・関数メモ

この文書は、Misskey のビルド済み frontend client に標準で含まれる変数・関数のうち、MisskeyPatcher のプラグインから参照候補になりやすいものをまとめたものです。

対象は Misskey 本体の標準クライアントです。Misskey の AiScript プラグイン、MisskeyPatcher の `api`、各種ユーザースクリプトが追加した値は含めません。

## 前提

Misskey の frontend は Vite/ESM bundle として動きます。そのため、多くの変数・関数は `window.foo` のようなグローバル変数ではなく、bundle 内部の module-local export です。

MisskeyPatcher の `api.client.get(path)` で直接読めるのは、基本的に `window` から辿れる値だけです。`$i`、`instance`、`store`、`mainRouter`、`os.toast()` などは Misskey source 上では export されていますが、production build では通常 `window.$i` のようには露出しません。

## 直接アクセスしやすい値

### HTML / DOM

| path / selector | 種類 | 内容 | 備考 |
| --- | --- | --- | --- |
| `document.documentElement.lang` | string | 現在のクライアント言語 | boot 時に `lang` が設定されます。 |
| `document.documentElement.dataset.colorScheme` | string | `dark` / `light` | テーマ状態の反映先です。 |
| `#misskey_meta` | script element | サーバー生成の instance meta JSON | `textContent` を JSON parse して使います。 |
| `#misskey_app` | element | Vue app の mount root | `common()` 内で作成・mount されます。 |
| `#splash` | element | 初期 splash | mount 後に消されます。存在は一時的です。 |
| `meta[property="instance_url"]` | meta element | instance URL | `@@/js/config.ts` の `host` / `url` 算出元です。 |
| `meta[property="og:site_name"]` | meta element | instance 表示名 | `instanceName` 算出元です。 |

例:

```js
const metaEl = document.getElementById('misskey_meta');
const providedMeta = metaEl?.textContent ? JSON.parse(metaEl.textContent) : null;
const colorScheme = document.documentElement.dataset.colorScheme;
```

### localStorage

| key | 種類 | 内容 | 備考 |
| --- | --- | --- | --- |
| `account` | JSON | 現在ログイン中のアカウント情報 + token | `i.ts` の `$i` の元データです。token を含むので取り扱い注意。 |
| `instance` | JSON | instance meta のキャッシュ | `instance.ts` の `instance` 初期値です。 |
| `instanceCachedAt` | number string | `instance` のキャッシュ時刻 | 1 時間以内なら再取得を省略します。 |
| `lastVersion` | string | 前回起動時の client version | client 更新判定に使われます。 |
| `v` | string | instance version | instance meta 取得後に保存されます。 |
| `lang` | string | UI 言語 | 未設定時は `en-US`。 |
| `ui` | string \| null | UI mode | `zen` / `deck` / `visitor` など。 |
| `debug` | boolean string | debug flag | `true` のとき debug 扱い。 |
| `isSafeMode` | boolean string | safe mode flag | safe mode 起動判定に使われます。 |
| `miux:*` | JSON | Misskey の状態 store | `store.ts` の Pizzax 永続化領域です。key はバージョンで変わり得ます。 |

例:

```js
const account = JSON.parse(localStorage.getItem('account') ?? 'null');
const instance = JSON.parse(localStorage.getItem('instance') ?? 'null');
```

### 一時的な window 値

| path | 種類 | 内容 | 備考 |
| --- | --- | --- | --- |
| `window.__misskey_input_ref__` | `HTMLInputElement \| null` | ファイル選択用 input の一時参照 | `chooseFileFromPc()` 実行中だけ使われます。安定 API ではありません。 |

## bundle 内部の主要 module exports

以下は Misskey source 上の標準 export です。production build では通常 `window` から直接取得できません。実際に使う場合は、DOM、localStorage、Misskey API、Streaming API、または MisskeyPatcher 側の bridge で公開済みの値を利用してください。

### `@@/js/config.ts`

| export | 種類 | 内容 |
| --- | --- | --- |
| `host` | string | instance host |
| `hostname` | string | instance hostname |
| `url` | string | instance origin |
| `port` | string | instance port |
| `apiUrl` | string | `location.origin + '/api'` |
| `wsOrigin` | string | WebSocket origin |
| `lang` | string | `localStorage.lang` または `en-US` |
| `langs` | array | build 時に注入される `_LANGS_` |
| `version` | string | build 時に注入される `_VERSION_` |
| `instanceName` | string | meta / host 由来の表示名 |
| `ui` | string \| null | `localStorage.ui` |
| `debug` | boolean | `localStorage.debug === 'true'` |
| `isSafeMode` | boolean | `localStorage.isSafeMode === 'true'` |
| `prefersReducedMotion` | boolean | media query 由来 |

### `@/i.ts`

| export | 種類 | 内容 |
| --- | --- | --- |
| `$i` | reactive object \| null | ログイン中アカウント。`localStorage.account` 由来。 |
| `iAmModerator` | boolean | admin または moderator か |
| `iAmAdmin` | boolean | admin か |
| `ensureSignin()` | function | 未ログイン時に例外を投げる guard |
| `notesCount` | number | 起動時の自分の投稿数 |
| `incNotesCount()` | function | `notesCount` を増やす |

### `@/instance.ts`

| export | 種類 | 内容 |
| --- | --- | --- |
| `instance` | reactive object | instance meta。`#misskey_meta` / `localStorage.instance` / `/api/meta` 由来。 |
| `fetchInstance(force = false)` | function | `/api/meta` から instance meta を取得し、`instance` と cache を更新。 |

### `@/store.ts`

| export | 種類 | 内容 |
| --- | --- | --- |
| `store` | Pizzax store | クライアント状態。`store.s.*` で現在値、`store.set()` で更新。 |

代表的な `store.s`:

| key | 内容 |
| --- | --- |
| `accountSetupWizard` | 初期設定 wizard 状態 |
| `tips` | tips 既読状態 |
| `memo` | ユーザーメモ |
| `reactionAcceptance` | リアクション受け入れ設定 |
| `mutedAds` | mute 済み広告 |
| `visibility` | 投稿 visibility 初期値 |
| `localOnly` | local only 初期値 |
| `showPreview` | 投稿 preview 表示 |
| `tl` | timeline source / filter |
| `darkMode` | dark mode |
| `realtimeMode` | streaming を使うか |
| `recentlyUsedEmojis` | 最近使った emoji |
| `recentlyUsedUsers` | 最近使った user |
| `menuDisplay` | menu 表示 mode |
| `postFormWithHashtags` | 投稿欄 hashtag 付与 |
| `postFormHashtags` | 投稿欄 hashtag 文字列 |
| `pluginTokens` | Misskey 標準 plugin token 保存先 |
| `accountTokens` | account token 保存先 |
| `accountInfos` | account 情報 cache |

### `@/stream.ts`

| export | 種類 | 内容 |
| --- | --- | --- |
| `useStream()` | function | Misskey Streaming client singleton を返す。 |

内部的には document visibility や heartbeat を見ながら WebSocket を管理します。MisskeyPatcher では `api.reuseMisskeyStream()` がこの WebSocket を bridge できます。

### `@/router.ts`

| export | 種類 | 内容 |
| --- | --- | --- |
| `createRouter(fullPath)` | function | Nirax router を作成。 |
| `mainRouter` | router object | 現在の SPA router。 |
| `useRouter()` | function | Vue inject から router を取得、なければ `mainRouter`。 |

`mainRouter` は `popstate`、`push`、`replace`、`forcePush`、`forceReplace`、`change` listener を持ち、履歴と analytics を更新します。

### `@/os.ts`

| export | 種類 | 内容 |
| --- | --- | --- |
| `openingWindowsCount` | ref | 開いている window 数 |
| `apiWithDialog` | function | Misskey API 呼び出し + dialog |
| `promiseDialog()` | function | Promise 状態を dialog 表示 |
| `popups` | ref array | popup 管理 state |
| `claimZIndex()` | function | z-index を採番 |
| `popup()` | function | Vue component popup を開く |
| `pageWindow()` | function | page window を開く |
| `toast()` | function | Misskey 標準 toast |
| `alert()` | function | alert dialog |
| `confirm()` | function | confirm dialog |
| `actions()` | function | action button dialog |
| `inputText()` | function | text input dialog |
| `inputNumber()` | function | number input dialog |
| `inputDatetime()` | function | datetime input dialog |
| `authenticateDialog()` | function | password/token 認証 dialog |
| `select()` | function | select dialog |
| `success()` | function | success dialog |
| `waiting()` | function | waiting dialog |
| `form()` | function | form dialog |
| `popupMenu()` | function | popup menu |
| `contextMenu()` | function | context menu |
| `chooseFileFromPc()` | function | file picker |
| `pageFolderTeleportCount` | ref | page folder teleport 用 counter |

## boot 時に登録される標準イベント / hook

| 対象 | 内容 |
| --- | --- |
| `window.addEventListener('popstate', ...)` | SPA router の path 更新。 |
| `document.addEventListener('keydown', makeHotkey(...))` | 標準 shortcut。 |
| `document.addEventListener('touchend', ...)` | touch device で `:hover` を機能させるための no-op listener。 |
| `window.matchMedia('(prefers-color-scheme: dark)').change` | device dark mode 同期。 |
| `document.visibilitychange` | heartbeat / achievement / visibility dependent 処理。 |
| `BroadcastChannel` / reload channel | 他 tab と一斉 reload。 |

代表的な標準 shortcut:

| key | 動作 |
| --- | --- |
| `p` / `n` | 投稿 dialog を開く。ログイン時のみ。 |
| `d` | dark mode 切り替え。 |
| `s` | `/search` へ移動。 |
| `m` 5 回 | safe mode flag を立てて reload。 |

## MisskeyPatcher からの確認例

`window` に露出している値:

```js
const rootKeys = await api.client.keys('window');
const hasInputRef = await api.client.has('__misskey_input_ref__');
const colorScheme = document.documentElement.dataset.colorScheme;
```

DOM / storage から標準 state を読む:

```js
const account = JSON.parse(localStorage.getItem('account') ?? 'null');
const cachedInstance = JSON.parse(localStorage.getItem('instance') ?? 'null');
const providedMetaEl = document.getElementById('misskey_meta');
const providedInstance = providedMetaEl?.textContent ? JSON.parse(providedMetaEl.textContent) : null;
```

Misskey 標準 Streaming に近い情報を取る:

```js
const stream = await api.reuseMisskeyStream();
stream.channel('main', {}, message => {
  console.log(message);
});
```

## 注意点

- production build では symbol 名が minify / bundle されるため、source 上の export 名がそのまま `window` に存在するとは限りません。
- `localStorage.account` は token を含みます。ログ出力や外部送信は避けてください。
- `#misskey_meta`、`localStorage.instance`、`/api/meta` の instance meta は取得元と鮮度が異なります。正確性が必要な場合は `/api/meta` を使ってください。
- Misskey の内部 module export は安定 API ではありません。バージョン更新で名前・構造・保存 key が変わることがあります。

## 参照した Misskey source

- `packages/frontend-shared/js/config.ts`
- `packages/frontend/src/boot/common.ts`
- `packages/frontend/src/boot/main-boot.ts`
- `packages/frontend/src/i.ts`
- `packages/frontend/src/instance.ts`
- `packages/frontend/src/store.ts`
- `packages/frontend/src/stream.ts`
- `packages/frontend/src/router.ts`
- `packages/frontend/src/os.ts`

参照先は `https://github.com/misskey-dev/misskey/tree/develop` です。
