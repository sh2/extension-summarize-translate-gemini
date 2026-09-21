# HTML 書式付きコピー（Issue #50）調査結果

- 対象 Issue: <https://github.com/sh2/extension-summarize-translate-gemini/issues/50>
- 調査日: 2026-09-14
- 状態: 調査のみ（実装未着手）

## 結論

実現可能。`navigator.clipboard.writeText()` を `navigator.clipboard.write()` +
`ClipboardItem` に置き換え、`text/html` と `text/plain` を**同時に**書き込めば、
Gmail / Google Docs / Word では太字・見出し・リストが保持され、メモ帳などの
プレーン先には従来どおりテキストが貼り付く。

```js
await navigator.clipboard.write([new ClipboardItem({
  "text/html": new Blob([html], { type: "text/html" }),
  "text/plain": new Blob([text], { type: "text/plain" })
})]);
```

マニフェストへの権限追加（`clipboardWrite`）は**不要**。現在の Copy ボタンが
権限なしで動作している実績があり、`write()` も同じ権限経路を通るため。

## 1. 現状の実装

| 箇所 | 内容 |
| --- | --- |
| `extension/popup.js` `copyContent`（237行付近） | `navigator.clipboard.writeText()` のみ |
| `extension/results.js` `copyContent`（498行付近） | 同上。`responseContent` と会話のテキストを `\n\n` で連結 |
| `extension/utils.js` `convertMarkdownToHtml`（147行付近） | 表示用 HTML は marked + DOMPurify で生成済み |
| `extension/utils.js` `exportTextToFile`（187行付近） | `.txt` / `text/plain` 固定 |

太字が `**` のまま貼り付くのは、描画済み HTML ではなく Markdown 原文を
テキストとして渡しているため。書式情報は既に DOM 側に存在している。

## 2. 実現方法

### 2.1 案A: `ClipboardItem` に `text/html` と `text/plain` を同時書き込み（推奨）

- 貼り付け先がリッチテキスト対応なら `text/html`、非対応なら `text/plain` が使われる。
- コピー用ボタンは 1 つのままでよく、新しい i18n キーも不要。
- クリックハンドラ内で完結させること（transient activation は数秒で失効するため、
  `write()` の前に長い `await` を挟まない）。

### 2.2 案B: `document.execCommand("copy")` フォールバック

Firefox 127 未満向けの保険。選択範囲を DOM から作ってコピーするため、
HTML とプレーンの両方がクリップボードに入る。実測では動作したが、計算済み
スタイルが大量にインライン化されてマークアップが肥大する。非推奨 API でもある。

### 2.3 既存の回避策

表示中の本文を範囲選択して Ctrl+C（Cmd+C）すると書式は保持される。
現状でもこの方法で回避可能。

## 3. 検証結果（Chromium 149 での実測）

一時的な Playwright スクリプトで検証（リポジトリには未コミット）。

- `ClipboardItem.supports("text/html")` → `true`
- 書き込み後、クリップボードに `text/plain` と `text/html` の**両方**が共存する
- `class` / `id` / インライン `style` は削除されず、`<strong>` `<em>` `<code>`
  `<ul>` `<pre>` `<table>` もそのまま保持される
- write 側で DOMParser を通すため、相対 URL の絶対化や `<tbody>` の補完程度の
  正規化のみが行われる

### ヘッドレス環境での注意

Playwright の headless Chromium では、権限リクエストが自動的に deny されるため
`writeText()` も `write()` も `NotAllowedError` になる。これは実ブラウザの挙動とは
無関係で、実機では既存の Copy ボタンが動作している事実から `write()` も
同条件で動作する。E2E で検証する場合は
`context.grantPermissions(["clipboard-read", "clipboard-write"])` の付与が必要。

## 4. 権限の扱い

Chromium のソース確認により、`writeText()` と（カスタム形式を含まない）
`write()` は同じ権限経路を通る。

- `ClipboardPromise::HandleWrite()`:
  `will_be_sanitized = write_custom_format_types_.empty()` → 標準形式のみなら
  `writeText()` と同一の sanitized write 扱い。
- 拡張機能が `clipboardWrite` 権限を持つ場合は権限サービスを介さず自動許可。
  持たない場合は transient user activation（クリック操作）で許可される。

したがって `clipboardWrite` を追加すると、Chrome では権限警告が増え、更新時に
再承認が必要になる可能性がある。**追加しない方針が安全**。

## 5. ブラウザ対応

| API | Chrome / Edge | Firefox | Safari |
| --- | --- | --- | --- |
| `Clipboard.write()` | 76 / 79 | 127 (2024-06) | 13.1 |
| `text/html` 形式 | 86 / 86 | 127 | 13.1 |
| `ClipboardItem.supports()` | 121 / 121 | 127 | 18.4 |

`firefox/manifest.json` に `strict_min_version` の指定がないため、Firefox 127
未満もインストール対象になり得る。フォールバックを入れるかは要判断。

## 6. Issue 後半（`.md` / `.html` 保存）について

どちらも実装可能。

- `.md`: `result.responseContent` がそのまま Markdown 原文なので、`exportTextToFile`
  に拡張子と MIME タイプを渡せるようにするだけで対応できる。
- `.html`: 最小の HTML 文書で包み `text/html` の Blob として保存する。

保存ボタンは現状 1 つなので、ボタン追加またはメニュー化が必要。その場合は
15 ロケール分の i18n キー追加と `extension-integrity.test.js` のキー一致確認が
必要になる。コピー側を「HTML 併記」方式にすればコピー機能の i18n 変更は不要。

## 7. 実装する場合の変更箇所

- `extension/utils.js` の Extension helpers に共通ヘルパーを追加（Clipboard API は
  副作用を伴うため Pure utilities には置かない）。
- `extension/popup.js` / `extension/results.js` の `copyContent` から呼び出す。
- HTML は `#content`（results では `#conversation` も）の `innerHTML` を使えば表示と
  一致し、CJK emphasis 修正済みの内容をそのまま利用できる。
- `exportTextToFile` を拡張子・MIME 指定可能に拡張（`.md` / `.html` 対応）。
- テストは `test/` にクリップボードのモックが未整備のため、
  `navigator.clipboard.write` のスタブを追加する。

## 8. 注意点・リスク

- `<pre><code>` の等幅・背景色は `css/new.min.css` のクラス依存のため、貼り付け先
  では失われる。厳密に再現するならインライン `style` の付与が必要。
- 添付画像（conversation の image parts）は現状テキストのみコピー対象。HTML に
  含めると data URL 化で肥大するため、除外が妥当。
- `target="_blank"` / `rel="noopener noreferrer"` は貼り付け先では無害。
- ストリーミング中は既存の `setResultControlsEnabled()` によりコピー不可のまま。
- コピー処理はクリックハンドラ内で同期的に HTML を組み立て、`write()` を
  呼ぶこと（activation 失効による `NotAllowedError` を避ける）。
