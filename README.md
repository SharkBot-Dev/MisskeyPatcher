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
- `api.misskeyApi(endpoint, body)`: 同一インスタンスの `/api/*` を呼び出す
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

## 初期パッチの内容

- `<html>` に `data-misskey-patcher-active="true"` を付けます。
- Misskey の note らしい DOM に `data-mkp-note-root="true"` を付けます。
- SPA の `history.pushState` / `replaceState` / `popstate` を見て route change 後に再パッチできます。
- 右下に小さな `patched` バッジを出します。

## 注意

この拡張は DOM/CSS レベルの後付けパッチ用です。Vue の内部 state や Misskey の ESM bundle 自体を書き換える用途には向きません。その場合は Misskey 側の source patch、またはビルド前の Vite plugin として実装してください。
