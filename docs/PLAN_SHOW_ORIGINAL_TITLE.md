# 結果ページに元ページタイトルを表示する実装計画

## 背景・目的

現在の結果ページ（`extension/results.html`）には、どのページを要約・翻訳した結果なのかが表示されていません。複数のページを要約した場合、結果タブを切り替えたときに内容を特定するのが困難です。

この計画では、結果ページに元ページのタイトルを表示し、ブラウザのタブタイトル（`document.title`）にも反映させることを目的とします。

## 設計決定の要約

インタビューにより、以下の設計を決定しました。

| # | 項目 | 決定内容 |
|---|---|---|
| 1 | タイトルの取得元 | `chrome.tabs.query` で取得する `tab.title` |
| 2 | ページ内の表示位置 | `#content`（要約本文）の直前、ラベル付き |
| 3 | ラベル形式・i18n | 接頭辞形式 `results_source_page`（`en` / `ja` のみ追加） |
| 4 | リンク化 | しない（既存タブフォーカスには `tabs` 権限が必要なため） |
| 5 | タイトル未取得時のフォールバック | ソース表示ごと非表示 |
| 6 | `document.title` の形式 | `${title} - ${results_title}` |
| 7 | ソース要素の構造 | `#content` 上の独立した `<p id="page-source">` |
| 8 | ソース要素のスタイル | 色を薄く（`var(--nc-tx-2)` + `opacity: 0.85`）、フォントサイズは変更しない |
| 9 | `Copy` への含めるか | 含めない（現状維持） |
| 10 | `Save`（手動保存・自動保存とも）への含めるか | 含める。ファイル先頭に「ラベル+タイトル」「URL」の順で記載 |
| 11 | ストリーミング中の表示 | 本文は現行どおり逐次表示。タイトルは `result` オブジェクト保存後（完了後）に表示 |

## 変更ファイル一覧

1. `extension/popup.js`
2. `extension/service-worker.js`
3. `extension/results.html`
4. `extension/results.js`
5. `extension/_locales/en/messages.json`
6. `extension/_locales/ja/messages.json`

`extension/css/common.css` は変更しません。スタイルは `results.html` 内のインラインスタイルで定義します。

## 詳細な実装手順

### 1. `extension/popup.js`

#### 1.1 `extractTaskInformation` で URL とタイトルを返す

既に `const [tab] = await chrome.tabs.query(...)` でタブ情報を取得しているため、`tab.url` と `tab.title` も返り値に追加します。これにより、`main()` 内で `chrome.tabs.query` を再度呼び出す必要がなくなります。

```js
return { actionType, mediaType, taskInput, url: tab.url, title: tab.title };
```

以降、`main()` 内では `extractTaskInformation()` の返り値から取得した `url` と `title` を一貫して使用します。

```js
const { actionType, mediaType, taskInput, url, title } = await extractTaskInformation(triggerAction);
```

これに伴い、`main()` 内の `const [tab] = await chrome.tabs.query(...)` は削除します。

#### 1.2 キャッシュヒット時の `result` オブジェクトに `title` を追加

```js
await chrome.storage.session.set({
  [`result_${resultIndex}`]: {
    requestApiContent,
    responseContent: cachedResponseContent,
    url: url,
    title: title
  }
});
```

#### 1.3 サービスワーカーへのメッセージに `title` を追加

```js
const responsePromise = chrome.runtime.sendMessage({
  message: "generate",
  actionType: actionType,
  mediaType: mediaType,
  taskInput: taskInput,
  languageModel: languageModel,
  languageCode: languageCode,
  streamKey: streamKey,
  resultIndex: resultIndex,
  url: url,
  title: title
});
```

同様に `console.log("Request:", { ... })` の内容にも `title` を追加します（任意）。

### 2. `extension/service-worker.js`

#### 2.1 メッセージから `title` を受け取る

```js
const { actionType, mediaType, taskInput, languageModel, languageCode, streamKey, resultIndex, url, title } = request;
```

#### 2.2 保存する `result` オブジェクトに `title` を追加

```js
await chrome.storage.session.set({
  [`result_${resultIndex}`]: {
    requestApiContent: apiContents,
    responseContent: responseContent,
    url: url,
    title: title
  }
});
```

### 3. `extension/results.html`

`#content` の直前に、ソース表示用の要素を追加します。初期状態は非表示にしておき、JavaScript でタイトルが存在する場合に表示します。

```html
<p id="page-source" dir="auto" style="display: none; color: var(--nc-tx-2); opacity: 0.85; margin: 0 0 1rem 0;">
  <span id="page-source-label" data-i18n="results_source_page"></span>
  <span id="page-source-title"></span>
</p>

<p id="content" dir="auto"></p>
```

`dir="auto"` により、RTL（右から左）言語のタイトルも適切に表示されます。

### 4. `extension/results.js`

#### 4.1 ページタイトル表示用の変数を追加

既存のモジュールレベル変数の近くに、以下を追加します。

```js
let resultBaseTitle = chrome.i18n.getMessage("results_title");
```

初期値を `results_title`（例：`Results - Summarize and Translate with Gemini`）としておくことで、結果が取得される前の待機状態でも `document.title` が空文字ベースにならず、現行の動作を維持できます。

#### 4.2 `updateDocumentTitle` を修正

`chrome.i18n.getMessage("results_title")` を直接使うのではなく、`resultBaseTitle` を参照するようにします。

```js
const updateDocumentTitle = () => {
  if (resultViewStatus === RESULT_VIEW_STATUS.UNREAD) {
    document.title = `● ${resultBaseTitle}`;
  } else if (resultViewStatus === RESULT_VIEW_STATUS.WAITING) {
    document.title = `… ${resultBaseTitle}`;
  } else {
    document.title = resultBaseTitle;
  }
};
```

#### 4.3 `initialize` 内で `resultBaseTitle` を設定

`result` が読み込まれた後（`if (!result) { ... }` ブロックの後）、`resultBaseTitle` を設定します。

```js
const baseTitle = chrome.i18n.getMessage("results_title");
resultBaseTitle = result.title ? `${result.title} - ${baseTitle}` : baseTitle;
updateDocumentTitle();
```

`resultBaseTitle` は初期値として既に `results_title` が設定されているため、結果が取得される前の待機状態（`… Results - ...`）や未読状態（`● Results - ...`）では現行の動作が維持されます。結果取得後、タイトルが存在すれば「ページタイトル - Results - ...」の形式に更新されます。

#### 4.4 ソース要素の表示制御

`initialize` 内で、`#content` に本文を入れる処理の前後に以下を追加します。

```js
const pageSourceElement = document.getElementById("page-source");
const pageSourceTitleElement = document.getElementById("page-source-title");

if (result.title) {
  pageSourceTitleElement.textContent = result.title;
  pageSourceElement.style.display = "block";
} else {
  pageSourceElement.style.display = "none";
}
```

`textContent` を使用することで、タイトルに含まれる HTML タグがそのまま表示されるのを防ぎます。

#### 4.5 `saveContent` を修正

ファイル保存時に、タイトルと URL を先頭に含めます。

```js
const saveContent = () => {
  try {
    const operationStatus = document.getElementById("operation-status");
    let content = "";

    if (result.title) {
      const label = chrome.i18n.getMessage("results_source_page");
      content += `${label}${result.title}\n`;
    }

    content += `${result.url}\n\n`;
    content += `${result.responseContent.replace(/\n+$/, "")}\n\n`;

    for (const item of conversation) {
      const text = extractTextFromParts(item?.parts);

      if (text) {
        content += `${text.replace(/\n+$/, "")}\n\n`;
      }
    }

    exportTextToFile(content);

    operationStatus.textContent = chrome.i18n.getMessage("results_saved");
    setTimeout(() => operationStatus.textContent = "", 1000);
  } catch (error) {
    console.error("Failed to save content:", error);
  }
};
```

`Copy` は変更しません（現状の `result.responseContent` + 会話履歴のまま）。

なお、`saveContent` は「Save」ボタンの手動保存だけでなく、オプションの自動保存（`autoSave`）からも呼ばれているため、自動保存で出力されるファイルにも同様にタイトルと URL のヘッダが付きます。これは現行の `saveContent` において自動保存でも URL が先頭に付いていることと整合性があります。手動保存のみにタイトル・ URL ヘッダを付けたい場合は、別途 `saveContent` に引数を追加して経路を分ける必要があります。

### 5. `extension/_locales/en/messages.json`

以下のキーを追加します。

```json
"results_source_page": {
    "message": "Source: "
}
```

### 6. `extension/_locales/ja/messages.json`

以下のキーを追加します。

```json
"results_source_page": {
    "message": "元のページ: "
}
```

他の言語については、`en` が default_locale であるため自動的にフォールバックされます。

## スタイル詳細

`#page-source` のスタイルは以下の通りです。

- `display: none`（初期状態、タイトルがあれば JavaScript で `block` に変更）
- `color: var(--nc-tx-2)`（テーマに応じたやや薄いテキスト色）
- `opacity: 0.85`（さらに控えめに）
- `margin: 0 0 1rem 0`（本文との間隔）
- `dir="auto"`（RTL 言語対応）

フォントサイズは変更しません（ユーザー指定）。

## 動作確認項目

実装後、以下を確認します。

1. 通常のウェブページを要約・翻訳したとき、結果ページに「元のページ: タイトル」が表示される。
2. ブラウザのタブタイトルが「ページタイトル - Results - ...」の形式になる。
3. タイトルが取得できない場合（`result.title` が undefined / 空文字）、ソース表示が非表示になり、`document.title` は元のままになる。
4. ストリーミング時は本文が逐次表示され、タイトルは生成完了後に表示される。
5. `Save` ボタンで保存したファイルの先頭に「元のページ: タイトル」と URL が含まれる。
6. `Copy` ボタンの内容は変更前と同じ（タイトル・URL なし）。
7. キャッシュから復元した結果でも、現在のタブのタイトルが表示される（`popup.js` がリクエスト時に上書き保存するため）。
8. `npm run lint` がエラーなく通る。

## 注意事項・エッジケース

### 古いキャッシュ結果

セッションストレージに既存の `result_${index}` オブジェクト（`title` フィールドなし）が残っている場合、`result.title` が falsy となり、ソース表示は非表示になります。これは想定されたフォールバック動作です。

### `chrome://extensions/` などの内部ページ

`tab.title` は取得できますが、コンテンツスクリプトの注入や `captureVisibleTab` が制限されるため、要約・翻訳そのものが失敗する可能性があります。これは本機能とは別の既存の制約です。タイトル表示機能自体には影響しません。

### セキュリティ

`tab.title` は `textContent` を使って DOM に挿入します。これにより、タイトルに悪意のある HTML/JS が含まれていた場合でも、コードとして実行されることを防ぎます。

### 権限

本実装では既存の `activeTab` 権限の範囲内で `chrome.tabs.query` を使用して `tab.title` を取得します。新たな権限は必要ありません。

## 実装後の検証

変更後は必ず以下を実行してください。

```bash
npm run lint
```

`eslint` のエラーが出た場合は、本計画のコード例に従いつつ、既存コードのスタイル（必ずブレース `{}` を使用するなど）に合わせて修正します。
