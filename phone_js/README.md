# スマートフォン版

`background.js` は Android WebView に単体で注入できる JavaScript です。
ユーザースクリプト管理アプリや拡張機能、別ファイルの読み込みは不要です。
Misskey を表示しているページに実行すると、基本パッチ・CSS・設定画面・プラグイン
API が起動し、右下の「MKP」ボタンから基本設定・プラグイン設定・再読み込みを使えます。
無効化中も設定ボタンが残ります。同じページへの重複注入は無視します。

Android アプリではこのファイルを `app/src/main/assets/background.js` にコピーし、
JavaScript と DOM storage を有効にした WebView に注入してください。

```kotlin
val patcherJs = assets.open("background.js").bufferedReader().use { it.readText() }
webView.settings.javaScriptEnabled = true
webView.settings.domStorageEnabled = true
webView.webViewClient = object : WebViewClient() {
    override fun onPageFinished(view: WebView, url: String) {
        super.onPageFinished(view, url)
        view.evaluateJavascript(patcherJs, null)
    }
}
webView.loadUrl("https://YOUR_MISSKEY_INSTANCE/")
```

既存の WebViewClient がある場合は、その `onPageFinished` に注入処理を追加します。
`background.js` 自体を `loadUrl` で開くのではなく、Misskey のページ内で実行します。
ページの再読み込み・インスタンス移動後も注入してください。SPA の画面移動は
スクリプト側で追跡します。ファイル選択によるプラグイン読み込みを使う場合は、
アプリ側の `WebChromeClient.onShowFileChooser` 対応が必要です。
コードの貼り付けはファイル選択の実装なしでも利用できます。

Android の設定と注入 API: [WebSettings](https://developer.android.com/reference/android/webkit/WebSettings)、
[WebView](https://developer.android.com/reference/android/webkit/WebView)。

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
読み込み開始時からの実行が必要です。`onPageFinished` での注入でも基本機能は使えますが、
注入前に開かれた WebSocket は捕捉できず、新規接続にフォールバックします。
基本パッチは動的関数を使いません。保存したプラグインコードの実行には動的関数を使うため、
ページの CSP やブラウザーが動的コード実行を制限している場合は利用できません。

`src/backgraund.js` は存在しないため、移植元は `src/background.js` です。
再生成には `node phone_js/build.mjs`、確認には `node phone_js/test.mjs` を実行します。
生成処理は `src/` を読み取るだけで変更しません。
