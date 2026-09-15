# HTML 書式付きコピー対応（Issue #50）実装計画

- 対象 Issue: <https://github.com/sh2/extension-summarize-translate-gemini/issues/50>
- 前提調査: [`docs/RESEARCH_HTML_CLIPBOARD_COPY.md`](RESEARCH_HTML_CLIPBOARD_COPY.md)
- 作成日: 2026-09-15

## 1. 目的

Copy ボタンでコピーした内容を Gmail / Google Docs / Word などに貼り付けたとき、
太字・見出し・リスト・コードブロックなどの書式を保持する。プレーンなテキスト先
（メモ帳・VSCode など）には従来どおり Markdown 原文が貼り付く。

## 2. スコープ

| 区分 | 内容 |
| --- | --- |
| 実施する | `popup.js` / `results.js` の Copy 処理で `text/html` と `text/plain` を併記 |
| 実施する | `extension/utils.js` に共通ヘルパーを追加 |
| 実施しない | `.md` / `.html` 形式での保存（Issue 後半の提案）。今回は対象外 |
| 実施しない | マニフェストへの権限追加（`clipboardWrite`） |
| 実施しない | 添付画像の HTML への同梱、`results.html` のボタン追加、i18n キーの追加 |

## 3. 追加検証（本計画で新たに確認した事実）

調査ドキュメントの記載に加えて、以下を実測で確認した。

### 3.1 実拡張ページでの権限要件

Xvfb + headed Chromium に実際の MV3 拡張をロードし、
`chrome-extension://<id>/popup.html` 上のクリックハンドラから検証した。

| 条件 | 結果 |
| --- | --- |
| `manifest.permissions` が空配列 | `navigator.clipboard.write([ClipboardItem({ "text/html", "text/plain" })])` が **resolve** |
| 同条件 | `navigator.clipboard.writeText()` も **resolve**（既存実装と同じ挙動） |

→ `clipboardWrite` は不要。既存の `writeText()` と同一の権限経路（ユーザー操作に
よる transient activation）で成立する。権限追加による Chrome の警告増加・更新時の
再承認リスクを避けられる。

### 3.2 HTML 断片の組み立て

jsdom と Chromium 149（実ブラウザ）の両方で確認した。

- `<p id="content">` に `innerHTML` でブロック要素を入れると、子として `H1` / `P` /
  `UL` / `PRE` が保持される。`cloneNode(true)` した子ノードをラッパーへ移せば、
  `<p>` ラッパーを含まない断片になる（貼り付け先で不正な入れ子にならない）。
- 断片は `dir="auto"` の `div` に子ノードとして格納し、`innerHTML` ではなく**要素
  自体**を返す。`container.innerHTML` を返すと `dir` 属性が失われるため（実測で確認）、
  `outerHTML` を `text/html` に渡す。ライブ DOM は変更されないことも確認済み。
- `img[src^="data:"]` は `src` プロパティへの代入でもマッチし、`https:` の画像は
  マッチしないことを確認した。添付プレビューの `img` だけを選択できる（決定 5）。
- 添付プレビューは `<div class="results-image-preview conversation-image-preview">`
  が `<img>` を包む構造（`results.js` の `createImagePreviewElement`）のため、`img`
  だけを除去すると空の `div` が残る。ラッパーごと除去する。
- なお Markdown の `data:` 画像は `removeUnsafeMarkdownUrls` で `src` が削除される
  （`![b](data:...)` → `<img alt="b">`）ため、このセレクタにマッチするのは添付
  プレビューだけである。コードの `else` 側（ラッパーが見つからない場合）は現状
  到達しないが、別経路で data URL 画像が入った場合の防御として残す。
- `dir="auto"` / `dir="rtl"` はクリップボード書き込み時のサニタイズ後も保持される
  ことを確認した（決定 6 の根拠）。
- 相対リンクと非 http(s) リンクは `convertMarkdownToHtml` の `removeUnsafeMarkdownUrls`
  で `href` が削除されるため、貼り付け先へ拡張機能の URL が持ち込まれる心配はない。

### 3.3 自動テストの制約

Playwright の headless Chromium では、権限リクエストが自動 deny されるため
`writeText()` も `write()` も `NotAllowedError` になる。書式保持の検証は E2E に
組み込めない。3.1 と同じく headed + 仮想ディスプレイ（Xvfb）で実行すれば書き込みの
成否までは自動確認できるが、貼り付け先での書式再現は手動確認が必要。

## 4. 設計

### 4.1 追加するヘルパー（`extension/utils.js`）

`UI helpers` セクションの `exportTextToFile` の直後に配置する（内部ヘルパー →
公開 API の順）。

```js
// Collects the rendered fragment so that the copied HTML matches what is displayed.
// Attachment previews (inline data URLs) are dropped so that the copied payload stays
// text only, matching the plain text copy. Images referenced by a URL are kept.
// Returns the wrapper element itself so that the dir attribute is preserved.
const buildClipboardHtml = (...roots) => {
  const container = document.createElement("div");
  container.setAttribute("dir", "auto");

  for (const root of roots) {
    if (!root) {
      continue;
    }

    // Move nodes out of a clone so that the live DOM is left untouched.
    for (const node of Array.from(root.cloneNode(true).childNodes)) {
      container.appendChild(node);
    }
  }

  // Attachment previews are wrapped in a container div. Remove the wrapper as well so
  // that no empty block element is left behind in the copied HTML.
  container.querySelectorAll('img[src^="data:"]').forEach((image) => {
    const previewWrapper = image.closest(".results-image-preview");

    if (previewWrapper) {
      previewWrapper.remove();
    } else {
      image.remove();
    }
  });

  // Return the element itself: container.innerHTML would drop the dir attribute.
  return container;
};

// Writes plain text and rich HTML in one clipboard item. The text is always
// written so that pasting into a plain text editor keeps the current behavior.
export const copyContentToClipboard = async (text, ...roots) => {
  const clipboard = navigator.clipboard;
  const wrapper = buildClipboardHtml(...roots);
  const canWriteHtml = wrapper.innerHTML !== "" && typeof ClipboardItem !== "undefined" && typeof clipboard?.write === "function";

  if (!canWriteHtml) {
    await clipboard.writeText(text);
    return;
  }

  try {
    await clipboard.write([new ClipboardItem({
      "text/html": new Blob([wrapper.outerHTML], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" })
    })]);
  } catch (error) {
    // Expected on browsers without HTML clipboard support: fall back to text.
    console.log("Failed to copy HTML content. Falling back to plain text:", error);
    await clipboard.writeText(text);
  }
};
```

`new ClipboardItem(...)` は `try` の内側で評価するため、コンストラクタ自体が未対応の
環境で例外を投げる場合も `writeText` にフォールバックする。また `ClipboardItem` の
キーと Blob の MIME タイプは一致させる必要がある（Chromium は不一致を
`NotAllowedError: Type ... does not match the blob's type ...` で拒否する）。キーを
変更する場合は、対応する Blob の `type` も合わせて変更すること。

### 4.2 呼び出し側

`popup.js`:

```js
await copyContentToClipboard(clipboardContent, document.getElementById("content"));
```

`results.js`:

```js
await copyContentToClipboard(
  clipboardContent,
  document.getElementById("content"),
  document.getElementById("conversation")
);
```

`clipboardContent`（プレーンテキスト）は現行の組み立てロジックを一切変更しない。

### 4.3 設計上の決定

| # | 決定 | 理由 |
| --- | --- | --- |
| 1 | プレーンテキストは Markdown 原文のまま | Markdown エディタへの貼り付けで書式記法を失わせない。既存挙動の回帰を防ぐ |
| 2 | `text/html` は表示済み DOM から生成 | 表示と一致し、`renderLinks` / CJK emphasis 修正などの描画設定の二重管理を避ける |
| 3 | マニフェストの権限は変更しない | 3.1 のとおり不要。権限警告の増加を避ける |
| 4 | i18n キーを追加しない | 既存の `popup_copied` / `results_copied` をそのまま使う。15 ロケール更新が不要 |
| 5 | `img` は `data:` URL のものだけ除外 | 除外したいのは添付画像のプレビュー（`results.js` の `getImageDataUrl` が生成する data URL）だけで、これがコピー内容を大きく肥大させる。`<img>` だけでなく `.results-image-preview` のラッパー `div` ごと除去し、空要素を貼り付け先に残さない。Markdown 画像記法（`![alt](https://...)`）に由来する画像は表示どおり保持し、UI との不一致を避ける |
| 6 | `dir="auto"` ラッパーで包む | 複数ルートを 1 断片にまとめつつ、RTL 言語（ar）の貼り付け方向を保つ |
| 7 | HTML が空なら `writeText` のみ | 描画完了前に Copy が押され得るため（後述）。空 HTML を書かずに現状挙動へ縮退する |
| 8 | 配置は `UI helpers` セクション | `exportTextToFile` と同じ「ブラウザへ成果物を渡す」ヘルパーのため。調査ドキュメントの「Extension helpers」案から変更（`Pure utilities` は DOM 非依存が条件のため不可） |
| 9 | 失敗時は `writeText` へフォールバック | Firefox 127 未満などで書式は失われるが、コピー自体は必ず成功させる |

補足: 外部 URL の画像が `#content` に入るのは、ユーザーが Markdown 画像記法を含む
テキストを選択して翻訳した場合（翻訳プロンプトが "Maintain the original formatting,
including Markdown syntax" と指示している）と、フォローアップ質問に Markdown 画像を
書いた場合に限られる。ページ抽出は Readability の `textContent` を渡すため、ページ由来
の画像 URL がモデルへ渡ることはない。

### 4.4 描画タイミングに関する注意

- 生成中は Copy が無効化される（`popup.js` は `main()`、`results.js` は
  `beginWaitingForResult()` と `askQuestion()`）ため、ストリーミング途中の内容が
  コピーされることはない。
- `results.js`: ストレージ読み出し直後に Copy が有効化される経路と、再読み込み時に
  HTML 既定の有効状態で開始する経路があり、`#content` の描画前に押される可能性がある。
- `popup.js`: `main()` の `setPopupControlsEnabled(false)` は
  `await chrome.storage.local.get(...)` の後に実行され、ボタンは HTML 既定で有効なため、
  同じく描画前の短い窓が存在する。
- どちらも決定 7 のガード（HTML が空なら `writeText` のみ）により、その場合は
  従来どおりプレーンテキストのみコピーされ、空の HTML は書き込まれない。

## 5. 実装手順

1. `extension/utils.js` の `UI helpers` セクションに `buildClipboardHtml`（内部）と
   `copyContentToClipboard`（export）を追加する。
2. `extension/popup.js` と `extension/results.js` の import に
   `copyContentToClipboard` を追加し、`copyContent` 内の `navigator.clipboard.writeText`
   呼び出しを置き換える（`try/catch` と `console.log` は現行のまま維持）。
3. テストを追加する（第 6 章）。
4. `npm run lint` と `npm test` を実行し、エラー・失敗を解消する。
5. 手動検証（第 7 章）を Chrome と Firefox で実施する。
6. コミットを分割する: `feat(clipboard): keep formatting when copying results`
   （手順 1〜3）、`chore: bump extension version to 1.8.19`（
   `extension/manifest.json` と `firefox/manifest.json` の両方）。
7. 実装完了後、調査ドキュメントと本計画を `docs/archive/` へ移動する。

## 6. テスト計画

### 6.1 新規テスト

`test/dom/clipboard-copy.test.js` を追加する。`test/helpers/dom-markdown.js` の
`createMarkdownTestEnvironment()` を流用して jsdom 環境を用意し、`vi.stubGlobal` で
次の 2 つを差し替える（`afterEach` で `vi.unstubAllGlobals()` と `environment.restore()`）。

- `navigator`: `{ clipboard: { write, writeText } }`。どちらも呼び出し回数と引数を
  記録する `vi.fn()` にする。
- `ClipboardItem`: コンストラクタに渡されたレコードを保持する簡易クラス。保持した
  `text/html` / `text/plain` の Blob は `await blob.text()` で中身を検証する。

`navigator` は Node 24 でも `configurable: true` のため `vi.stubGlobal` で差し替え
可能（確認済み）。未定義ケース（ケース 7・9）は、該当するスタブを外した状態で
検証する。

| # | ケース | 期待 |
| --- | --- | --- |
| 1 | 複数ルート（`#content` 相当 + `#conversation` 相当）を渡す | `write` が 1 回呼ばれ、`text/html` と `text/plain` の両方が含まれる |
| 2 | `text/html` の構造 | `<div dir="auto">` で始まり、`<strong>` / `<h1>` / `<ul>` / `<pre>` を含む |
| 3 | 画像の扱い | 添付プレビューは `.results-image-preview` ラッパーごと除去され（空の `div` が残らない）、`https:` の `img` は残る |
| 4 | ライブ DOM | 呼び出し前後で元の `innerHTML` が変化しない |
| 5 | `text/plain` | 渡した文字列と完全一致（Markdown 原文がそのまま入る） |
| 6 | ルートが `null` / 空、または HTML が空 | `write` を呼ばず `writeText` のみ呼ばれる（`buildClipboardHtml` の返値の `innerHTML` が空文字になることで判定） |
| 7 | `ClipboardItem` 未定義 | `writeText` のみ呼ばれる |
| 8 | `write` が reject | 例外を投げず `writeText` にフォールバックする |
| 9 | `navigator.clipboard` 未定義 | `clipboard.writeText` で `TypeError` が送出され、呼び出し側の `catch` へ伝播する（Node の組み込み `navigator` には `clipboard` が無いため、スタブを外せばそのまま再現できる）。`navigator` を `undefined` にした場合も `TypeError` になり、`ReferenceError` になるのはグローバル自体を削除した場合のみ |

### 6.2 既存テストへの影響

- `test/static/extension-integrity.test.js`: ロケールキーとマニフェストのファイル
  参照のみ検証。権限を変更しないため影響なし。
- `test/dom/markdown.test.js` / `test/unit/utils.test.js`: `utils.js` の追記のみで
  既存関数は変更しないため影響なし。
- `test/dom/popup-content-extraction.test.js`: `popup.js` を正規表現で部分抽出して
  検証しており、`copyContent` は対象外のため影響なし。
- `copyContent` ハンドラ自体（`popup.js` / `results.js`）はページ全体の読み込みが
  必要で単体テストに適さないため、第 7 章の手動検証でカバーする。

## 7. 検証手順（手動）

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 1 | Chrome で結果をコピーし、Gmail の下書きに貼り付け | 太字・見出し・リストが書式として再現される |
| 2 | 同じ内容を Google ドキュメントに貼り付け | 同上 |
| 3 | メモ帳 / VSCode のプレーンファイルに貼り付け | `**` を含む Markdown 原文が貼り付く（現状維持） |
| 4 | 結果ページでフォローアップ質問を追加してコピー | 質問と回答が順に、書式付きで貼り付く |
| 5 | 画像を添付したフォローアップ後にコピー | 添付画像のプレビューは含まれず、テキストのみ貼り付く |
| 6 | Markdown 画像記法（`![alt](https://...)`）を含むテキストを選択して翻訳し、コピーして貼り付け | モデルが画像記法を保持した場合に画像が表示され、太字などの書式も再現される（保持されない場合があるため、主確認は 1〜5 で行う） |
| 7 | Firefox 127 以降で 1〜6 を実施 | 同じ結果 |
| 8 | Firefox 126 以前（ESR 115 など）でコピー | 書式は失われるがコピーは成功し、状態表示が出る |
| 9 | 権限ダイアログが出ないこと・拡張機能詳細の権限が増えていないことを確認 | 変化なし |
| 10 | 長文（数千文字）の結果をコピー | 成功する。失敗時もプレーンテキストでコピーされる |

## 8. リスクと対策

| # | リスク | 影響 | 対策 |
| --- | --- | --- | --- |
| 1 | コードブロックの背景色・枠線が貼り付け先で失われる | 見た目のみ | `<pre>` は既定で等幅・改行保持のため可読性は維持。厳密な再現が必要になればインライン `style` 付与を別途検討 |
| 2 | 質問ブロックのインライン `style`（`padding` / `margin` / `background-color: var(...)`）が貼り付け先に持ち込まれる | 余白が残る可能性 | 実装後に Gmail / Docs で見た目を確認し、必要なら `appendQuestionToUi` でクラスを付与して HTML コピー時のみ `style` を除去する（`<blockquote>` 化も選択肢） |
| 3 | transient activation の失効で `NotAllowedError` になる | 書式が付かない | `await` を挟まずクリックハンドラ内で `write()` まで到達させる。失敗時は `writeText` にフォールバック |
| 4 | Firefox 127 未満では書式が付かない | 対象環境のみ | 決定 9 のフォールバックで現状挙動を維持。`strict_min_version` は今回設定しない |
| 5 | 自動テストで書式保持を検証できない | 回帰検出が手動依存 | 6.1 でペイロード生成を単体テストし、貼り付け結果は第 7 章で手動確認する |
| 6 | 極端に大きい結果でクリップボード書き込みが失敗する | コピー失敗 | `catch` で `writeText` にフォールバックする。`writeText` も失敗した場合は呼び出し側の `catch` でログのみとなり、状態メッセージは表示されない（現状と同じ挙動） |
| 7 | 残した外部 URL の画像を貼り付け先が取得する | 貼り付け先の表示・通信 | 画像 Markdown は限られた経路でしか発生しない（4.3 の補足）。許容できなければ決定 5 を `img` 全除去に切り替える |

## 9. スコープ外・将来の検討

- `.md` / `.html` 形式での保存（保存ボタンの増設と 15 ロケール分のキー追加が必要）。
- `.md` / `.html` 形式での保存（保存ボタンの増設と 15 ロケール分のキー追加が必要）。
- 添付画像を HTML に含める（`data:` URL による肥大のため見送り。決定 5 で `data:`
  URL の画像に限り、`.results-image-preview` のラッパーごと除去している）。
- `document.execCommand("copy")` による Firefox 旧版向けの書式付きフォールバック
  （計算済みスタイルが大量にインライン化されるため見送り）。
- E2E への組み込み（headless では検証不能。headed 実行時のみの任意検証として追加可能）。

## 10. ロールバック

変更は `extension/utils.js` / `extension/popup.js` / `extension/results.js` とテスト
のみで、マニフェスト・ロケール・保存形式に触れない。`git revert` で元の
`writeText()` のみの挙動に戻せる。
