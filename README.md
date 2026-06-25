# Misskey Build Page Patcher

Misskey の production build 後ページへ、Chrome 拡張の content script から CSS/JS パッチを注入するための最小構成です。Misskey 本体の `built/_frontend_vite_` やハッシュ付き bundle は変更しません。

## Misskey 側の前提

Misskey `develop` は `packages/frontend/vite.config.ts` で Vite の production 出力先を `built/_frontend_vite_` にしています。バックエンドの HTML テンプレートは `meta name="application-name" content="Misskey"`、`script#misskey_meta`、`/vite/loader/boot.js` などを出すため、この拡張はそれらを見て Misskey ページかどうかを判定します。

## インストール

1. Chrome で `chrome://extensions` を開く。
2. Developer mode を有効にする。
3. Load unpacked でこのディレクトリを選ぶ。
4. 対象の Misskey インスタンスを開き直す。

## 使い方

- ツールバーの popup で、現在開いているインスタンスの有効/無効とバッジ表示を切り替えられます。
- Options でインスタンスを選び、対象ホスト、追加 CSS、追加 JS をインスタンスごとに編集できます。
- 対象ホストが空欄の場合、Misskey と判定できたページすべてに適用します。
- 対象ホストには `misskey.example.com` や `*.example.net` を指定できます。

## 追加 JS で使える API

追加 JS は content script の隔離 world で実行されます。

```js
api.markNotes();
api.onRouteChange(() => api.markNotes());
api.installStyle('[data-mkp-note-root] { outline: 1px solid red; }');
api.rerunSoon(() => api.markNotes(), 300);
```

## 初期パッチの内容

- `<html>` に `data-misskey-patcher-active="true"` を付けます。
- Misskey の note らしい DOM に `data-mkp-note-root="true"` を付けます。
- SPA の `history.pushState` / `replaceState` / `popstate` を見て route change 後に再パッチできます。
- 右下に小さな `patched` バッジを出します。

## 注意

この拡張は DOM/CSS レベルの後付けパッチ用です。Vue の内部 state や Misskey の ESM bundle 自体を書き換える用途には向きません。その場合は Misskey 側の source patch、またはビルド前の Vite plugin として実装してください。
