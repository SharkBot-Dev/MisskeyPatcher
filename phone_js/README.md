# スマートフォン版

`background.js` は拡張機能 API を必要としない単体ユーザースクリプトです。
ユーザースクリプトに対応したスマートフォンのブラウザーへ読み込み、ページの
MAIN world で `document-start` に実行してください（`@grant none`）。
利用するインスタンスだけに実行する場合は `@match` を変更してください。

Misskey の設定メニューから MisskeyTools のプラグイン設定を開き、既存の
`plugins/*.js` を読み込むかコードを貼り付けて保存し、ページを再読み込みします。
各プラグインで `api` をそのまま利用できます。設定・プラグインはインスタンスの
localStorage に保存され、拡張機能版とは共有されません。

ページ内の別のスクリプトからも次のように実行できます。

```js
await window.MisskeyPatcher.runPlugin('自分のプラグイン', async (api) => {
  api.markNotes();
  api.onRouteChange(() => api.markNotes());
  const meta = await api.misskeyApi('meta', {});
  api.toast(meta.name);
});
```

設定項目、サイドバーメニュー、slash command、store、client、Streaming を含む
既存 API とページ bridge を同梱しています。既存 WebSocket の再利用にはページの
読み込み開始時からの実行が必要です。保存したコードの実行には動的関数を使うため、
ページの CSP やブラウザーが動的コード実行を制限している場合は利用できません。

`src/backgraund.js` は存在しないため、移植元は `src/background.js` です。
再生成には `node phone_js/build.mjs`、確認には `node phone_js/test.mjs` を実行します。
生成処理は `src/` を読み取るだけで変更しません。
