# Misskey Build Page Patcher

Misskey の production build 後ページへ、Chrome 拡張の content script から CSS/JS パッチを注入するための最小構成です。Misskey 本体の `built/_frontend_vite_` やハッシュ付き bundle は変更しません。

## Misskey 側の前提

Misskey `develop` は `packages/frontend/vite.config.ts` で Vite の production 出力先を `built/_frontend_vite_` にしています。バックエンドの HTML テンプレートは `meta name="application-name" content="Misskey"`、`script#misskey_meta`、`/vite/loader/boot.js` などを出すため、この拡張はそれらを見て Misskey ページかどうかを判定します。

## インストール

1. `npm install` と `npm run build` を実行する。
2. Chrome で `chrome://extensions` を開く。
3. Developer mode を有効にする。
4. Load unpacked で `dist` ディレクトリを選ぶ。
5. 対象の Misskey インスタンスを開き直す。

追加 JS は Chrome 120+ の Manifest V3 `userScripts` API で登録します。Chrome 138 以降では拡張の Details 画面にある Allow User Scripts を有効にしてください。Chrome 137 以前では Developer mode が有効になっている必要があります。

## 使い方

- ツールバーの popup で、現在開いているインスタンスの有効/無効とバッジ表示を切り替えられます。
- Options でインスタンスを選び、対象ホスト、追加 CSS、複数の追加 JS プラグインをインスタンスごとに編集できます。
- 対象ホストが空欄の場合、Misskey と判定できたページすべてに適用します。
- 対象ホストには `misskey.example.com` や `*.example.net` を指定できます。

## 追加 JS プラグインで使える API

追加 JS プラグインは Manifest V3 の User Scripts context で、Misskey ページ判定後に有効なものがまとめて登録・実行されます。保存後、対象ページを再読み込みすると反映されます。

```js
api.markNotes();
api.onRouteChange(() => api.markNotes());
api.installStyle('[data-mkp-note-root] { outline: 1px solid red; }');
api.rerunSoon(() => api.markNotes(), 300);
```

主な API:

- `api.pluginName`: 現在のプラグイン名
- `api.extensionVersion`: 拡張機能のバージョン
- `api.url` / `api.path`: 現在の URL / path
- `api.query(selector)` / `api.queryAll(selector)`: DOM 検索
- `api.waitForElement(selector, { timeout })`: 要素が出るまで待つ
- `api.observe(selector, callback, { existing, once })`: 追加された要素を監視
- `api.on(selector, eventName, handler)`: 委譲イベントを登録
- `api.installStyle(css, id)` / `api.removeStyle(id)`: CSS の追加・削除
- `api.toast(message, { timeout })`: 簡易通知を表示
- `api.registerSettingsItem(definition, callback)` / `api.addSettingsItem(...)`: Misskey の設定メニューに項目を追加
- `api.registerSidebarMoreItem(definition, callback)` / `api.addSidebarMoreItem(...)`: サイドバーの「もっと！」メニューに項目を追加
- `api.registerSlashCommand(definition, callback)` / `api.addSlashCommand(...)`: ノート作成画面で `/` から使える候補を追加
- `api.misskeyApi(endpoint, body)`: 同一インスタンスの `/api/*` を呼び出す
- `api.openWebSocket(path, options)`: 同一インスタンスへ WebSocket 接続
- `api.openMisskeyStream(options)` / `api.stream(options)`: Misskey Streaming API 用 wrapper
- `api.reuseMisskeyStream(options)` / `api.pageStream(options)`: Misskey クライアントが開いた `/streaming` WebSocket を再利用
- `api.listReusableStreams()`: bridge が捕まえた Misskey WebSocket の一覧
- `api.store.get(key)` / `api.store.set(key, value)` / `api.store.remove(key)`: プラグイン名ごとの localStorage 保存

例:

```js
const button = await api.waitForElement('[data-mkp-note-root]');
api.toast(`最初の note を見つけました: ${api.path}`);

api.observe('article', (node) => {
  node.dataset.myPluginSeen = 'true';
});

api.on('article', 'click', (_event, article) => {
  console.log(api.pluginName, article);
});

const meta = await api.misskeyApi('meta', {});
api.store.set('lastMetaName', meta.name);
```

設定メニューへ plugin 独自の項目を追加する例:

```js
const unregister = api.registerSettingsItem({
  id: 'my-settings',
  name: '自分の設定',
  icon: 'ti ti-adjustments ti-fw',
  order: 120,
}, () => {
  api.toast(`${api.pluginName} の設定項目が押されました`);
});

api.onRouteChange(() => {
  if (!api.path.startsWith('/settings')) return;
  // 必要なら route 変更時に状態を更新できます。
});
```

`id` は同じ plugin 内で一意にしてください。同じ `id` で再登録すると表示名や並び順を更新できます。不要になった項目は返り値の `unregister()` で削除できます。`icon` は Misskey が読み込んでいる Tabler Icons の class 名を指定できます。

サイドバーの「もっと！」メニューへ項目を追加する例:

```js
api.registerSidebarMoreItem({
  id: 'quick-action',
  name: 'クイック操作',
  icon: 'ti ti-bolt ti-fw',
  order: 120,
}, () => {
  api.toast('クイック操作を実行しました');
});
```

追加項目は「もっと！」メニューを開いたタイミングで差し込まれます。`id`、`name`、`icon`、`order` の指定方法は `registerSettingsItem()` と同じです。

ノート作成画面へ slash command を追加する例:

```js
api.registerSlashCommand({
  id: 'hello-template',
  command: 'hello',
  name: 'あいさつテンプレート',
  description: '短いあいさつを挿入します',
  icon: 'ti ti-message-circle ti-fw',
  insert: 'こんにちは！',
  order: 10,
}, () => {
  api.toast('/hello を挿入しました');
});
```

投稿欄で `/` を入力すると候補が表示されます。`/he` のように続けて入力すると候補が絞り込まれ、Enter、Tab、クリックで選択できます。`insert` を指定した場合は入力中の `/command` がその文字列に置き換わります。`callback` は選択後に呼ばれます。

Misskey Streaming API の例:

```js
const stream = api.openMisskeyStream();

stream.onOpen(() => {
  const home = stream.channel('homeTimeline', {}, (message) => {
    console.log('homeTimeline', message);
  });

  api.onRouteChange(() => {
    if (api.path !== '/') home.disconnect();
  });
});

stream.onError(() => api.toast('Streaming API に接続できませんでした'));
```

認証が必要なチャンネルでは、発行済みトークンを渡せます。

```js
const stream = api.openMisskeyStream({ token: 'YOUR_TOKEN' });
stream.onOpen(() => {
  const channelId = stream.connect('main');
  stream.onChannelMessage(channelId, (message) => {
    console.log(message);
  });
});
```

Misskey 本体が既に接続している Streaming WebSocket を使い回す例:

```js
const stream = await api.reuseMisskeyStream();

const channel = stream.channel('main', {}, (message) => {
  if (message?.type === 'deleted') {
    api.toast(`ノートが削除されました\n${message.body?.id ?? ''}`);
  }
});

api.onRouteChange(() => {
  if (api.path.startsWith('/settings')) channel.disconnect();
});
```

`reuseMisskeyStream()` はページ本体の WebSocket を `document_start` の bridge で捕まえます。拡張を再読み込みした直後に既に Misskey ページが開いていた場合は、ページを再読み込みしてから使ってください。既存接続が見つからない場合は新規接続へフォールバックします。フォールバックさせたくない場合は `await api.reuseMisskeyStream({ fallbackNew: false })` を使います。

## 初期パッチの内容

- `<html>` に `data-misskey-patcher-active="true"` を付けます。
- Misskey の note らしい DOM に `data-mkp-note-root="true"` を付けます。
- SPA の `history.pushState` / `replaceState` / `popstate` を見て route change 後に再パッチできます。

## 注意

この拡張は DOM/CSS レベルの後付けパッチ用です。Vue の内部 state や Misskey の ESM bundle 自体を書き換える用途には向きません。その場合は Misskey 側の source patch、またはビルド前の Vite plugin として実装してください。
