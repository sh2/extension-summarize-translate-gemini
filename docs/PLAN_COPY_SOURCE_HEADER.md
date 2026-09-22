# コピー内容へのタイトル・URL 付与（Issue #50 追加要望）実装計画

- 対象 Issue: <https://github.com/sh2/extension-summarize-translate-gemini/issues/50>
  （2026-09-21 の `doplu` のコメント）
- 前提: [`docs/archive/RESEARCH_HTML_CLIPBOARD_COPY.md`](archive/RESEARCH_HTML_CLIPBOARD_COPY.md)、
  [`docs/archive/PLAN_HTML_CLIPBOARD_COPY.md`](archive/PLAN_HTML_CLIPBOARD_COPY.md)（v1.8.19 で実施済み）
- 作成日: 2026-09-22
- 状態: 計画のみ（実装未着手）

## 1. 目的

Copy ボタンでコピーする内容に、Save ボタンで保存する `.txt` と同じく
「タイトル + URL + 本文」を含める。貼り付け先で要約の出典が失われないようにし、
Copy と Save の出力差をなくす。

## 2. 背景

`doplu` の報告（2026-09-21）:

> Many thanks it is working (bold content is kept). But I have just noticed that the
> title (and the url ?) is not included in the text of the copy button (note: the rest
> of the text summary is correctly included). The txt file content has the title + url +
> summary in full ...

書式付きコピー（v1.8.19）では HTML ペイロードの生成のみを追加し、プレーンテキストの
組み立ては既存実装をそのまま流用したため、Copy と Save の内容差は残ったままだった。
Archive 済みの調査・計画ドキュメントには「タイトルと URL を Copy から除外する」という
決定は記録されておらず、Copy が本文のみだったのは元の実装の経緯によるもの。

## 3. 現状の確認（事実）

### 3.1 Copy と Save の出力差

| 操作 | 実装 | 出力 |
| --- | --- | --- |
| Copy（popup） | `extension/popup.js` の `copyContent`（238 行付近） | 本文のみ |
| Copy（結果ページ） | `extension/results.js` の `copyContent`（500 行付近） | `result.responseContent` + 会話のみ |
| Save（popup） | `extension/popup.js` の `saveContent`（254 行付近） | `pageTitle` + `pageUrl` + 本文 |
| Save（結果ページ） | `extension/results.js` の `saveContent`（526 行付近） | `result.title` + `result.url` + 本文 |

### 3.2 ヘッダ組み立ての重複

「タイトルがあれば追加、URL があれば追加、`\n\n` で本文と連結」という組み立ては
Save の 2 か所（popup / results）に重複して存在し、Copy 側には存在しない。今回の
不一致は、この重複した実装が片方だけに適用されていたことが原因。

### 3.3 参照できる値

- 結果ページ: `result.title` / `result.url` は `extension/popup.js` と
  `extension/service-worker.js` が `result_<index>` に保存済みで、`results.js` の
  `initialize()` が読み出している（`updatePageSource` と `saveContent` で使用中）。
- popup: `pageTitle` / `pageUrl` を `main()` が `extractTaskInformation()` の戻り値から
  設定済み（`saveContent` で使用中）。

### 3.4 描画タイミングと空 HTML ガード

アーカイブ計画 4.3 の決定 7 のとおり、`copyContentToClipboard` は
「HTML が空なら `writeText` のみ書く」というガードを持つ。Copy ボタンは結果が
描画される前に押され得る（同 4.4）ため、このガードは維持する必要がある。

### 3.5 画面表示

結果ページの `#page-source` はタイトルのみを表示し、URL は表示していない
（`extension/results.html` 99〜101 行、`extension/results.js` の `updatePageSource`）。
popup にはヘッダ表示自体が無い。

### 3.6 URL のプロトコル検証（既存の方針）

`extension/utils.js` の `convertMarkdownToHtml` は `removeUnsafeMarkdownUrls` により
http(s) 以外の `href` / `src` を削除する。判定は内部ヘルパー `isAllowedMarkdownUrl` と
`allowedMarkdownUrlProtocols = new Set(["http:", "https:"])` が担い、モデル出力の
Markdown を対象に「貼り付け先へ非 http(s) URL を持ち込まない」方針になっている。

### 3.7 `dir="auto"` ラッパーの方向解決

`copyContentToClipboard` は断片全体を `dir="auto"` の `div` で包む。`dir=auto` は
「ツリー順で最初に現れる強い方向の文字」で解決されるため、**現行は本文の先頭が
入力**だが、ヘッダを先頭に入れると**タイトルの先頭**が入力になる。

HTML Standard 3.2.6.4 の auto directionality は、`dir` 属性が未指定でない要素
（`bdi` / `script` / `style` / `textarea` を含む）の子孫を走査対象から除外する。
つまりヘッダ要素に `dir` を付けると、ラッパーはヘッダを読み飛ばして本文で解決される
（4.4 の決定 14）。

## 4. 設計

### 4.1 追加するヘルパー（`extension/utils.js`）

`UI helpers` セクションの `exportTextToFile` の直後（内部ヘルパー `buildClipboardFragment`
の前）に配置する。プレーンテキストと HTML 断片を同時に返し、両者が構造的にずれない
ようにする。

```js
// Builds the source attribution (page title and URL) that the Copy and Save actions
// share. Returning the plain text and the HTML fragment together keeps the two payloads
// from drifting apart, which is what made the copied text and the saved file differ.
// The text already ends with a blank line, and the fragment is null when there is
// nothing to attribute.
export const buildSourceHeader = (title, url) => {
  const lines = [];

  if (title) {
    lines.push(title);
  }

  if (url) {
    lines.push(url);
  }

  const text = lines.length > 0 ? `${lines.join("\n")}\n\n` : "";

  if (lines.length === 0) {
    return { text, fragment: null };
  }

  // The pasted HTML is rendered where the extension stylesheet does not exist, so the
  // markup carries semantics only: no class, no inline style, and the title is set
  // through textContent so that Markdown or HTML inside a page title stays literal.
  // See docs/archive/RESEARCH_WORD_HTML_PASTE.md.
  const fragment = document.createDocumentFragment();

  if (title) {
    const titleElement = document.createElement("h1");
    titleElement.textContent = title;
    fragment.appendChild(titleElement);
  }

  if (url) {
    const urlElement = document.createElement("p");

    // Only http(s) becomes a link, matching the policy of removeUnsafeMarkdownUrls.
    // Other schemes (file:, view-source:, chrome-extension:) would leave a link that
    // only works on the sender's machine, so the URL stays plain text.
    if (isAllowedUrlProtocol(url)) {
      const anchor = document.createElement("a");
      anchor.setAttribute("href", url);
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      anchor.textContent = url;
      urlElement.appendChild(anchor);
    } else {
      urlElement.textContent = url;
    }

    fragment.appendChild(urlElement);
  }

  return { text, fragment };
};
```

`DocumentFragment` を使うのは、貼り付け先の HTML に余分なラッパー要素を増やさないため。

`isAllowedUrlProtocol` は既存の内部ヘルパー `isAllowedMarkdownUrl` の改名
（`allowedMarkdownUrlProtocols` → `allowedUrlProtocols`、`UI helpers` セクションの
`convertMarkdownToHtml` の前に定義済み）。`removeUnsafeMarkdownUrls` も同じ述語を使う。

ヘッダ要素には `dir` を付けない。付けると 3.7 の理由でラッパーがヘッダを読み飛ばし、
現行どおり本文基準の解決に戻せるが、その効果は実機で確認してから採る
（第 8 章 リスク 10、第 7 章 14・15）。

### 4.2 `copyContentToClipboard` の変更（`extension/utils.js`）

第 2 引数にヘッダ断片を追加する。`dir="auto"` ラッパーの生成は `buildClipboardFragment`
から呼び出し側へ移し、ヘッダと本文を同じ 1 つのラッパーに入れる。

```js
// Collects the rendered fragment so that the copied HTML matches what is displayed.
// Attachment previews (inline data URLs) are dropped so that the copied payload stays
// text only, matching the plain text copy. Images referenced by a URL are kept.
const buildClipboardFragment = (...roots) => {
  const container = document.createElement("div");

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

  return container;
};

// Writes plain text and rich HTML in one clipboard item. The plain text is always written
// so that the copy still succeeds when HTML is unavailable or unsupported. `sourceFragment`
// is the fragment returned by buildSourceHeader() and is dropped when the rendered body is
// empty, so that a copy made before the result is displayed never pastes an
// attribution-only fragment.
export const copyContentToClipboard = async (text, sourceFragment, ...roots) => {
  const clipboard = navigator.clipboard;
  const body = buildClipboardFragment(...roots);
  const canWriteHtml = body.innerHTML !== "" && typeof ClipboardItem !== "undefined" && typeof clipboard?.write === "function";

  if (!canWriteHtml) {
    await clipboard.writeText(text);
    return;
  }

  // A single dir="auto" wrapper keeps the direction of RTL content in the pasted HTML.
  const container = document.createElement("div");
  container.setAttribute("dir", "auto");

  // Clone the fragment: appendChild moves a fragment's children out, and the caller may
  // still hold the fragment after the call.
  if (sourceFragment) {
    container.appendChild(sourceFragment.cloneNode(true));
  }

  for (const node of Array.from(body.childNodes)) {
    container.appendChild(node);
  }

  try {
    await clipboard.write([new ClipboardItem({
      "text/html": new Blob([container.outerHTML], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" })
    })]);
  } catch (error) {
    // Expected on browsers without HTML clipboard support: fall back to text.
    console.log("Failed to copy HTML content. Falling back to plain text:", error);
    await clipboard.writeText(text);
  }
};
```

変更点は次の 5 つ。それ以外（クローンの作成、添付プレビューの除去、`ClipboardItem` の
キーと Blob の MIME タイプの対応、`catch` での `writeText` フォールバック）は現行どおり。

1. 第 2 引数 `sourceFragment` を追加。`null` なら従来と同じ HTML になる。
2. `buildClipboardHtml` → `buildClipboardFragment` に改名し、`dir="auto"` の設定を外す。
3. 本文が空のときはヘッダがあっても `writeText` のみ（既存ガードを維持）。
4. ラッパーへヘッダ → 本文の順に追加する。
5. 冒頭コメントから `keeps the current behavior` を外す。テキスト自体にヘッダが入るため
   「現行挙動の維持」ではなく「HTML が使えない環境でもプレーンテキストでコピーを
   成立させる」という説明に変える。

### 4.3 呼び出し側

`extension/popup.js` の `copyContent`:

```js
const copyContent = async () => {
  try {
    const operationStatus = document.getElementById("operation-status");
    const { text, fragment } = buildSourceHeader(pageTitle, pageUrl);
    const clipboardContent = `${text}${content.replace(/\n+$/, "")}\n\n`;

    // Copy the content to the clipboard
    await copyContentToClipboard(clipboardContent, fragment, document.getElementById("content"));

    // Display a message indicating that the content was copied
    operationStatus.textContent = chrome.i18n.getMessage("popup_copied");
    setTimeout(() => operationStatus.textContent = "", 1000);
  } catch (error) {
    console.log("Failed to copy content:", error);
  }
};
```

`extension/results.js` の `copyContent`:

```js
const copyContent = async () => {
  try {
    const operationStatus = document.getElementById("operation-status");
    const { text, fragment } = buildSourceHeader(result.title, result.url);
    let clipboardContent = `${text}${result.responseContent.replace(/\n+$/, "")}\n\n`;

    for (const item of conversation) {
      const conversationText = extractTextFromParts(item?.parts);

      if (conversationText) {
        clipboardContent += `${conversationText.replace(/\n+$/, "")}\n\n`;
      }
    }

    // Copy the content to the clipboard
    await copyContentToClipboard(
      clipboardContent,
      fragment,
      document.getElementById("content"),
      document.getElementById("conversation")
    );

    // Display a message indicating that the content was copied
    operationStatus.textContent = chrome.i18n.getMessage("results_copied");
    setTimeout(() => operationStatus.textContent = "", 1000);
  } catch (error) {
    console.log("Failed to copy content:", error);
  }
};
```

`extension/results.js` の `saveContent`:

```js
const saveContent = () => {
  const operationStatus = document.getElementById("operation-status");
  const { text } = buildSourceHeader(result.title, result.url);
  let fileContent = text;

  fileContent += `${result.responseContent.replace(/\n+$/, "")}\n\n`;

  for (const item of conversation) {
    const conversationText = extractTextFromParts(item?.parts);

    if (conversationText) {
      fileContent += `${conversationText.replace(/\n+$/, "")}\n\n`;
    }
  }

  // Save the content to a text file
  exportTextToFile(fileContent);
  // ...
};
```

これにより `.txt` の内容は現行と同一（タイトル → URL → 空行 → 本文）になる。

なお、results 側は既存の `conversation` ループで使っている変数名が `text` と衝突するため、
`buildSourceHeader` の戻り値を分解する際は `text` を、ループ内は `conversationText` を
使うなどの調整を行う。

`extension/popup.js` の `saveContent` も同じ形で、差分はヘッダの値だけ（`result.title` /
`result.url` の代わりに `pageTitle` / `pageUrl` を使う）。現行の `headerLines` 宣言と 2 つの
`if`、連結ブロックを `const { text } = buildSourceHeader(pageTitle, pageUrl);` に置き換え、
以降（本文の連結、`exportTextToFile`、状態表示）は変更しない（popup に会話ループは無い）。

### 4.4 設計上の決定

| # | 決定 | 理由 |
| --- | --- | --- |
| 1 | タイトルと URL を Copy にも含める | 貼り付け先で出典が失われない。Save と一致し、「同じ結果を外に出す操作で内容が違う」状態を解消する |
| 2 | 順序はタイトル → URL → 本文（Save と同一） | コピーとファイルの差をなくす |
| 3 | ヘッダは `buildSourceHeader` に一本化し、テキストと HTML 断片を同時に返す | 今回の不一致の原因が Save 2 か所への重複実装だったため、構造的に同期を保証する |
| 4 | `text/html` はタイトルを `h1`、URL を `<a>` を含む段落にする（リンクにするのは http(s) のときだけ。決定 13） | 貼り付け先で見出しとリンクとして意味が立つ。URL は可視テキストとしても残し、プレーンテキストと情報量を揃える |
| 5 | インライン `style` と `class` を付けない | 貼り付け先に拡張機能のスタイルシートが無く、付けたスタイルはペイロードに持ち込まれるだけ（AGENTS.md の方針） |
| 6 | タイトルは `textContent` で設定する | ページタイトルに含まれ得る Markdown 記法や HTML をそのまま表示し、断片を壊さない |
| 7 | リンクに `target="_blank"` / `rel="noopener noreferrer"` を付ける | `convertMarkdownToHtml` が生成する既存リンクと揃える |
| 8 | `copyContentToClipboard` の第 2 引数にヘッダ断片を追加する | 本文が空のときにヘッダだけの HTML を書かないガード（3.4）を維持するため。roots に混ぜると本文の有無を判別できない |
| 9 | 本文が空なら、テキストもヘッダのみになる | 呼び出し側に分岐を増やさない。描画前の短い窓ではタイトルと URL だけがコピーされる（現行は空文字）。壊れた HTML を書かない点は変わらない |
| 10 | i18n キーは追加しない | ヘッダはタイトルと URL のみでラベル文字列を含まないため、15 ロケールの更新が不要 |
| 11 | 画面上の `#page-source` は変更しない | popup にはヘッダ表示自体が無く、画面はタイトルのみ。コピー内容は「文書のヘッダ」であり UI の複製ではない。表示を変える案は第 9 章に分離 |
| 12 | Save の出力内容は変更しない | 既存利用者の `.txt` の中身を変えない。共通化するのはヘッダ組み立てのロジックのみ |
| 13 | URL を `<a>` にするのは http(s) のときだけ（テキストとしては常に残す） | `file:` / `view-source:` / `chrome-extension:` などをリンクにしても受け手には壊れたリンクになるだけ。`tab.url` はブラウザ生成の正規 URL で `javascript:` は混入しないが、`removeUnsafeMarkdownUrls` の既存方針（3.6）と基準を揃える。通常の利用で非 http(s) のページに到達する機会は限られるため、この決定は主に方針の一貫性のための防御で、マークアップは 6.1 ケース 7 で担保する |
| 14 | ヘッダ要素には `dir` を付けない | 付けると 3.7 の仕様どおりラッパーがヘッダを走査せず、現行と同じ本文基準の解決になる。ただし仕様のヒューリスティックに依存するため、まず第 7 章 14・15 で必要性を実測してから採る |
| 15 | `sourceFragment` の型ガードは入れない | 要素が渡された場合に「黙って無視する」動作になり、リスク 7 の静かな劣化が別の形で残るだけで検出能力が増えない。呼び出し側 2 か所を同一変更で更新し、第 7 章の書式確認で検証する |

検討した代替案（不採用）:

- Save だけがヘッダを持ち、Copy は本文のみのままにする
  → Issue の要望に反し、Copy と Save の不一致が残る。
- `copyContentToClipboard(text, ...roots)` のままヘッダを roots の先頭に混ぜる
  → 本文の有無を判別できず、描画前にヘッダだけの HTML が書かれる。
- `#page-source` に URL を表示してその要素をコピー元にする
  → popup にヘッダ要素が無く非対称。結果ページの markup / CSS / `updatePageSource` と
    静的テストへの影響が大きく、URL の折り返しも考慮が必要。今回は見送る。
- 本文側に `dir="auto"` の子 div を挟む
  → `dir=auto` の走査はツリー順で、ヘッダ（`dir` 未指定）が先に読まれるため、
    これだけでは方向は変わらない（3.7）。
- ヘッダ要素に `dir="auto"` を付ける
  → 仕様上は有効（3.7）だが、まず第 7 章 14・15 で必要性を確認する。現時点では付けない。

## 5. 実装手順

1. `extension/utils.js` の `UI helpers` セクションに `buildSourceHeader`（export）を追加し、
   `buildClipboardHtml` を `buildClipboardFragment` へ改名（`dir` 属性の設定を削除）、
   `copyContentToClipboard` に第 2 引数 `sourceFragment` を追加する。あわせて内部ヘルパーを
   `isAllowedMarkdownUrl` → `isAllowedUrlProtocol`、`allowedMarkdownUrlProtocols` →
   `allowedUrlProtocols` へ改名し（Markdown 専用ではなくなるため）、
   `removeUnsafeMarkdownUrls` の呼び出しを更新する。`copyContentToClipboard` の冒頭コメントは
   4.2 の変更点 5 のとおり書き換える。
2. `extension/popup.js` と `extension/results.js` の import に `buildSourceHeader` を追加し、
   `copyContent` と `saveContent` を 4.3 の形に更新する（`try/catch` と `console.log` は現行のまま）。
3. テストを追加・更新する（第 6 章）。
4. `npm run lint` と `npm test` を実行し、エラー・失敗を解消する。
5. 手動検証（第 7 章）を Chrome と Firefox で実施する。
6. バージョン（`extension/manifest.json` と `firefox/manifest.json`）は本計画では更新せず、
   リリース時に別途行う。

## 6. テスト計画

### 6.1 新規テスト `test/dom/source-header.test.js`

`test/helpers/dom-markdown.js` の `createMarkdownTestEnvironment()` で jsdom 環境を
用意し、`buildSourceHeader` が返す `text` と `fragment` の両方を検証する
（`afterEach` で `environment.restore()`）。

| # | ケース | 期待 |
| --- | --- | --- |
| 1 | `title` と `url` の両方 | `text` が `"Title\nhttps://example.com/\n\n"`。`fragment` に `h1` が 1 つ（textContent がタイトル）と `a[href]` が 1 つ（textContent が URL、`target="_blank"`、`rel="noopener noreferrer"`）。順序も固定し、`fragment.childNodes` が `[H1, P]` の 2 つだけであること（決定 2 の検証） |
| 2 | `title` のみ | `text` が `"Title\n\n"`。`h1` のみで `a` は無い |
| 3 | `url` のみ | `text` が `"https://example.com/\n\n"`。`a` のみで `h1` は無い |
| 4 | 両方とも空文字 / `null` / `undefined` | `text` が `""`、`fragment` が `null` |
| 5 | タイトルに HTML 記法（`<b>x</b> & "y"`）を含む | `fragment` をシリアライズしても `<b>` 要素にならず、`h1.textContent` が入力と一致する（`textContent` 設定の検証） |
| 6 | 生成される markup | `[style]` と `[class]` を持つ要素が無い（決定 5 の検証） |
| 7 | `url` が非 http(s)（`file:///home/user/note.txt`） | `text` は URL 行を含む。`p` はあるが `a` は無く、`p.textContent` が URL と一致する（決定 13） |
| 8 | `dir` 属性 | `fragment` 内に `[dir]` を持つ要素が無い（決定 14 の現状を固定） |

`isAllowedUrlProtocol` は内部ヘルパーのため直接テストせず、`buildSourceHeader`（ケース 7）と
`convertMarkdownToHtml` の既存テストを通じて間接的に検証する。

部分文字列で markup を検査する場合は、URL 文字列がたまたま `rem` や `var(` を含むと
`test/dom/clipboard-copy.test.js` の既存アサーションと同じ落とし穴に入るため、
フィクスチャの URL に注意する。

### 6.2 既存テスト `test/dom/clipboard-copy.test.js` の更新

第 2 引数の追加に伴い、既存の全呼び出し（10 か所）に `null` を挿入する。そのうえで
次のケースを追加する。

| # | ケース | 期待 |
| --- | --- | --- |
| 1 | ヘッダ断片 + 本文 root | `text/html` が `<div dir="auto">` で始まり、ヘッダ（`h1` と `a`）が本文より前に現れる。`dir="auto"` のラッパーは 1 つのまま |
| 2 | ヘッダ断片 + 本文が空（`null` の root） | `write` を呼ばず `writeText` のみ呼ばれる（ヘッダだけの HTML を書かない） |
| 3 | ヘッダ無し（`null`）+ 本文あり | 現行と同じ markup（`h1` や `a` が増えない） |
| 4 | ライブ DOM の不変性 | ヘッダを渡した場合も元の root の `innerHTML` が変化しない |
| 5 | ヘッダ断片の非破壊性 | 呼び出し後も `sourceFragment.childNodes` が空にならない（4.2 の `cloneNode(true)` の理由を固定する） |

### 6.3 既存テストへの影響

- `test/static/extension-integrity.test.js`: ロケールキーとファイル参照、両マニフェストの
  バージョン一致を検証。ロケールもバージョンも変更しないため影響なし。
- `test/static/popup-results-structure.test.js`: HTML 構造と「JS から `style` を設定して
  いないこと」を検証。`buildSourceHeader` はインラインスタイルを付けないため影響なし。
- `test/dom/markdown.test.js` / `test/unit/utils.test.js`: `convertMarkdownToHtml` などは
  変更しないため影響なし。
- `test/dom/popup-content-extraction.test.js`: `popup.js` を部分抽出して検証しており、
  `copyContent` / `saveContent` は対象外のため影響なし。
- `e2e/specs/main-flow.spec.js`: `#page-source-title` の表示テキストを検証しており、
  画面を変更しないため影響なし。

### 6.4 単体テストで扱わない範囲

`copyContent` / `saveContent` の本体はページ全体の読み込みが必要で、既存のテスト構成では
対象外。ヘッダの組み立て（`buildSourceHeader`）とクリップボード書き込み
（`copyContentToClipboard`）を自動テストし、それ以外は第 7 章の手動検証でカバーする。

重要な制約として、**テストはヘルパーを直接呼び、`sourceFragment` に `null` を明示するため、
本番の呼び出し側の更新漏れを検出できない**（`e2e` もコピー内容を検証していない）。
リスク 7 のとおり、これを検出できるのは第 7 章の rich text 貼り付け確認だけである。

## 7. 検証手順（手動）

| # | 手順 | 期待結果 |
| --- | --- | --- |
| 1 | 結果ページで要約を Copy し、Gmail の下書きに貼り付け | タイトル（見出し）、URL（リンク）、本文の順に貼り付き、太字などの書式も保持される |
| 2 | 同じ内容を Google ドキュメント / Word に貼り付け | 同上。タイトルが見出しスタイル、URL がリンクとして入る |
| 3 | 同じ内容を VSCode / メモ帳に貼り付け | 1 行目にタイトル、2 行目に URL、空行を挟んで Markdown 原文が貼り付く |
| 4 | 結果ページで Save し、変更前の `.txt` と比較 | 内容が同一（タイトル + URL + 本文） |
| 5 | フォローアップ質問を 1 往復追加してから Copy | ヘッダは先頭に 1 回だけ入り、以降は会話の順に続く |
| 6 | popup で Copy し、popup の Save ファイルと比較 | 内容が一致する（タイトル + URL + 本文）。ただしこの比較だけでは呼び出し側の更新漏れ（リスク 7）を検出できない |
| 7 | 自動保存（results / popup）を有効にして実行し、保存ファイルを確認 | 内容が 4 と同一 |
| 8 | 対象ページを保存できない経路（画像キャプチャなど）で Copy | 本文が無い場合はテキストのみがコピーされ、HTML は書かれない。エラーや例外が出ない |
| 9 | RTL のページ（アラビア語など）で Copy。タイトルも同じ言語のもの | 貼り付け先でも本文の方向が保たれる（現行と同結果になることを確認する基準ケース） |
| 10 | Firefox 127 以降で 1〜3 と 13 を実施 | 同じ結果（書式付きコピーとリンク化が Firefox でも成立する） |
| 11 | Firefox 126 以前（ESR 115 など）で Copy | 書式は失われるが、タイトル + URL + 本文がプレーンテキストでコピーされる |
| 12 | 長いタイトル / 長い URL のページで Copy | 例外なくコピーでき、貼り付け先で折り返される（折り返しの見た目は許容範囲とする） |
| 13 | popup で Copy し、Gmail の下書きに貼り付け | 見出し・リンク・太字が保持される。呼び出し側の更新漏れ（リスク 7）を検出できる確認（テキスト比較の 6 では検出できない） |
| 14 | RTL ページで、タイトルがラテン文字から始まる（例: `Wikipedia - ...`）ページを Copy | ブロックが本文基準で解決される（タイトルを理由に LTR に反転しない）。反転する場合はリスク 10 の対策（ヘッダ要素への `dir="auto"`）を適用する |
| 15 | LTR ページで、タイトルが RTL 文字から始まるページを Copy | 同上（タイトルを理由にブロック全体が RTL に反転しない） |
| 16 | 非 http(s) の URL のページで Copy。Chromium は `chrome://extensions` で「ファイルの URL へのアクセスを許可する」を有効にしてから `file://` のローカルファイルを開く（Firefox も同等の許可が必要） | URL 行はテキストで入り、リンクにはならない（決定 13）。前提を用意できない環境では省略可（マークアップは 6.1 ケース 7 で担保済み） |

## 8. リスクと対策

| # | リスク | 影響 | 対策 |
| --- | --- | --- | --- |
| 1 | `h1` が貼り付け先で大きすぎる | 見た目 | 第 7 章 1〜2 の結果で判断し、重すぎる場合は `h2` か太字段落へ変更する |
| 2 | URL 行が不要な利用者にとって冗長 | 利便性 | 本 Issue の要望であり Save と揃う。設定化は第 9 章で扱う |
| 3 | チャット系へ貼るときに URL が展開される | 見た目 | プレーン貼り付け（3）は従来どおり。文書への貼り付けを主用途とする |
| 4 | タイトルに改行や連続空白があると HTML とプレーンで見え方が異なる | 微小 | 生の値をそのまま使う（`.txt` の内容を変えない）。許容する |
| 5 | 描画前に Copy するとヘッダのみのテキストになる | 微小 | 空 HTML を書かないガードは維持。現行（空文字）からの差異として許容する |
| 6 | `saveContent` が使わない DOM 断片を生成する | 無視できる | 要素 1 個のみ。テキストと HTML の同期保証を優先する |
| 7 | 署名変更（第 2 引数）の更新漏れ | 静かな劣化。popup の旧形式は本文が空扱いになり HTML が書かれず（書式・見出し・リンクが失われ、テキストは同じに見える）、results の旧形式は `#content` がヘッダ枠に入り、ヘッダ（タイトル / URL）を含まない HTML が書かれる | 自動テストでは検出できない（6.4）。2 か所の呼び出しを同一変更で更新し、第 7 章 13（popup の書式確認）と 1・2 で確認する。型ガードは決定 15 のとおり入れない |
| 8 | 画面上（`#page-source`）とコピー内容の不一致 | UI | 決定 11 として明記。要望が出れば URL 表示を別途検討する |
| 9 | `rem` / `var(` を含む URL が既存テストの部分文字列アサーションに抵触する | テストの誤検知 | フィクスチャの URL を選ぶ（6.1 の注意） |
| 10 | `dir="auto"` ラッパーの方向解決の入力が本文からタイトルに変わる（3.7） | RTL ページでも、タイトルがラテン文字から始まる場合はブロック全体が LTR 寄りになる（本文内の bidi ラン自体は保たれる） | 第 7 章 14・15 で確認する。再現したらヘッダ要素（`h1` と URL の `p`）に `dir="auto"` を付け、3.7 の仕様どおり本文基準の解決に戻す。本文側に `dir="auto"` の子 div を足す案は走査順が変わらないため無効 |

## 9. スコープ外・将来の検討

- 結果ページの `#page-source` に URL を表示する（画面とコピー内容の一致。CSS と
  `updatePageSource`、静的テストの更新が必要）。
- タイトル / URL を含めるかどうかの設定化（options UI と 15 ロケール分のキー追加が必要）。
- `.md` / `.html` 形式での保存（アーカイブ計画のスコープ外項目として継続）。
- コピー内容のプレビュー UI。

## 10. ロールバック

変更は `extension/utils.js` / `extension/popup.js` / `extension/results.js` と `test/` に
限られる。マニフェスト・ロケール・保存形式・権限には触れないため、`git revert` で
「Copy が本文のみ」の状態へ戻せる。
