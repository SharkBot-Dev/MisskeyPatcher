# Misskey frontend の関数をクライアント上で呼び出す

このページでは、[Misskey の `packages/frontend`](https://github.com/misskey-dev/misskey/tree/develop/packages/frontend) のソースで見つけた関数を、実際に開いている Misskey クライアントから使う方法を説明します。MisskeyPatcher のプラグインを例にします。

## 最初に確認すること

ソースコードで関数を見つけても、その名前をブラウザー Console やプラグインに入力するだけでは呼び出せません。Misskey frontend は Vite/ESM の bundle で動作し、関数の多くは module 内部にあります。`export function toast()` のような export は、その module を import するコードに公開されるという意味で、`window.toast` として公開される意味ではありません。

呼び出し可否は、次のように分けて判断します。

| 見つけた関数 | クライアントからの呼び出し方 |
| --- | --- |
| `window.foo` など、実行時に `window` から辿れる関数 | `api.client.call('foo', args)` |
| Misskey が使う機能に対応する MisskeyPatcher API がある | Patcher API を使う。こちらを優先 |
| frontend module 内だけの関数 | 通常のプラグインから直接呼べない。公開 API / Patcher API / DOM 操作 / Misskey API で目的を実現する |

## 1. ソースで定義と呼び出し元を読む

GitHub の `packages/frontend` で機能名や画面ラベルを検索し、定義だけでなく、呼び出し元と引数も確認します。`develop` は更新されるため、実際の対象 instance の version に合う tag / commit のソースで照合してください。

たとえば `os.ts` の `toast()` を見つけたら、定義がどの module に属するか、どの component がどう import して呼ぶかを追います。関数の引数・戻り値・非同期処理・ログイン状態や権限条件も確認します。

ソース上の import/export は module 間の仕組みです。`window` や `globalThis` への代入がない限り、export 名だけを根拠に `api.client.call()` の path を決めないでください。

## 2. 実行中のクライアントで公開状態を調べる

対象の Misskey ページで DevTools Console を開き、ソースで見つけた名前が `window` 上に存在するかを調べます。

```js
typeof window.someFunction
typeof window.someNamespace?.refresh
```

`function` なら、そのページでは `window` から呼べる可能性があります。`undefined` なら、通常のプラグインからその名前を直接呼び出すことはできません。bundle 内部で関数が使われていても、`window` から辿れなければ同じです。

プラグインから確認する場合:

```js
const path = 'someNamespace.refresh';
console.log('available:', await api.client.has(path));
console.log('namespace keys:', await api.client.keys('someNamespace'));
```

path が存在し callable であることを確かめた後に呼びます。

```js
const path = 'someNamespace.refresh';
if (await api.client.has(path)) {
  try {
    const result = await api.client.call(path, [{ force: true }]);
    console.log('result:', result);
  } catch (error) {
    console.error('Misskey function failed:', error);
  }
}
```

引数配列はソースの呼び出し元に合わせます。`call()` は Promise を待って結果を返しますが、返却値は bridge を通して JSON 化されます。DOM node、Vue の instance、関数などはそのまま返せません。関数実行による副作用はページ上で起きるため、検証用アカウントで確認してください。

## 3. 内部関数なら目的に対応する公開手段を選ぶ

Misskey frontend の内部関数をプラグインから汎用的に呼び出す機能はありません。Patcher の page bridge は `window` を起点に property を辿る設計です。ES module の lexical scope、Vite の module registry、Vue component の内部状態を探索して内部関数を呼ぶものではありません。

よくある目的は、次の公開 API で実現できます。

### Misskey の toast を表示する

frontend source の `os.toast()` は module 内部の関数なので、`api.client.call('os.toast', ...)` で呼べるとは限りません。プラグインでは Patcher の通知 API を使います。

```js
api.toast('処理が完了しました');
```

### instance meta を取得する

frontend の `fetchInstance()` / `instance` を直接参照せず、同一インスタンスの API を呼びます。

```js
const meta = await api.misskeyApi('meta', {});
console.log(meta.name, meta.version);
```

### Misskey の Streaming 接続を使う

frontend の `useStream()` は module 内部にあります。Patcher の Streaming wrapper を使って、Misskey クライアントが開いた接続を再利用します。

```js
const stream = await api.reuseMisskeyStream();
stream.channel('localTimeline', {}, message => {
  console.log(message);
});
```

### 画面上の操作を行う

内部関数がボタンやメニューから呼ばれる場合は、まず `api.observe()` / `api.on()` で対象 DOM とイベントを調べ、同等の操作を DOM イベントや Patcher の登録 API で実現できるか確認します。内部 component の private state や Vue の非公開 property に依存する方法は、更新で壊れやすいため避けます。

## 4. 内部関数をどうしても直接使う必要がある場合

一般利用者向けの plugin から直接呼ぶことはできません。Misskey 本体の frontend を変更できる開発環境なら、関数を明示的に `window` へ公開する変更を加え、その instance をビルドして検証する方法があります。ただし公開名・引数・戻り値を自分で保守する必要があり、標準クライアントのアップデートで差分を追従させます。

DevTools の debugger でその関数の実行箇所に breakpoint を置き、停止中に Scope から見える関数を調査する方法は、一時的なデバッグ用途に限られます。プラグインから後で呼ぶための安定した参照や公開 API にはなりません。

## 5. 別 instance / fork で確認する

別の instance で使うときは、その instance のクライアント自体を調べます。ソース上の同じファイル・関数名があっても、version、fork の変更、build 設定により公開状態や挙動が異なります。

1. `/api/meta` などで instance と version を確認し、対応する source revision を特定する。
2. 関数定義と呼び出し元を照合し、必要な引数・権限・前提状態を記録する。
3. 対象 instance の Console で `typeof window...` を調べ、プラグイン側でも `api.client.has()` を使って機能検出する。
4. 公開されていなければ、Patcher API、Misskey API、Streaming、DOM 操作のいずれかで同じ目的を実現する。
5. 対応しない instance では安全に何もしない fallback を用意し、開発用アカウントで動作を確かめる。

ホストごとに実装が異なる場合は Options の対象ホストを限定するか、検出した機能に応じた adapter を使います。`localStorage` の内部 key や module の minify 済み識別子に依存する方法は、最後の手段にしてください。

## MisskeyPatcher API の参照

Patcher が提供する `api.client.get/has/keys/call`、`api.misskeyApi()`、`api.reuseMisskeyStream()` などの一覧と詳細は、[README の追加 JS プラグイン API](../README.md#追加-js-プラグインで使える-api) を参照してください。標準変数・DOM・storage の補足は [Misskey クライアント標準変数・関数メモ](misskey-client-standard-globals.md) にあります。
