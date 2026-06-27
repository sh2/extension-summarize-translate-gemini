# 実装計画: 結果ページへの使用モデル名引き継ぎ・表示とキャッシュヒット時のモデル名表示

## 目的

フォールバック設定時（`languageModel` が `/` 区切り）に、以下の3点を実現する。

1. ポップアップから結果ページを開いた初回表示で、実際に使用されたモデル名をステータスに表示する。
2. フォローアップ質問時のモデル名表示は既存動作を維持する（本計画では変更しない）。
3. キャッシュヒット時にも、キャッシュ作成時に実際に応答したモデル名を表示する。

## 現状の問題

### モデル名の表示条件

モデル名は `languageModel.includes("/")` が `true` の場合（フォールバック設定時）のみ表示される。表示する値は Gemini レスポンスの `response.body?.modelVersion` である。

- ポップアップ: `popup.js:557` で `modelVersion` を取得し、`popup.js:593` で `status` に表示する。
- 結果ページのフォローアップ: `results.js:647-650` で `send-status` に表示する。

### 初回結果の保存内容にモデル名が含まれない

結果ページの初回表示は session storage の `result_${resultIndex}` を読み込むが、そこに保存されているのは `requestApiContent`, `responseContent`, `url`, `title` のみで、モデル名は含まれない。

- サービスワーカー（通常生成）: `service-worker.js:188-192`
- サービスワーカー（エラー時）: `service-worker.js:199-203`
- ポップアップ（キャッシュヒット時）: `popup.js:441-445`
- ポップアップ（sendMessage 拒否時）: `popup.js:510-514`

### 結果ページの初回表示で modelVersion が再表示されない

結果ページの `initialize` は、結果待機経路では待機完了後に `send-status` を空文字でクリアしている（`results.js:818`）。
しかし、その後の初回結果描画時に、保存済み `modelVersion` を `send-status` へ再表示する処理がない。
そのため、初回結果に対応する使用モデル名を結果ページで復元できない。

### キャッシュ値にモデル名が含まれない

キャッシュの保存値（`responseCacheQueue` の各要素の `value`）も `requestApiContent`, `responseContent` のみで、モデル名は含まれない（`service-worker.js:234-235`）。そのためキャッシュヒット時にモデル名を復元できない。

### ポップアップのキャッシュヒット経路で modelVersion が未設定

ポップアップのキャッシュヒット分岐（`popup.js:435-460`）では `modelVersion` 変数を設定しない。`modelVersion` は `popup.js:382` で `""` に初期化されたままなので、`finally` ブロックの `popup.js:593` で空文字が表示される。

## 設計方針

- モデル名の表示条件（`languageModel.includes("/")`）は既存の仕組みを踏襲し、保存時にも同じ条件で `modelVersion` を計算する。
- 保存する値は「実際に応答したモデル名（`response.body?.modelVersion`）」とし、フォールバック設定でない場合は空文字とする。
- キャッシュに保存するモデル名は「キャッシュ作成時に実際に応答したモデル名」である。これは再実行時のモデルとは異なり得るが、キャッシュの性質として許容する。
- 結果ページの初回表示では、保存された `modelVersion` を `send-status` に表示する。フォールバック設定でない場合は空文字が保存されているため、実質的にフォールバック設定時のみ表示される。
- フォローアップ質問時の表示ロジック（`results.js:647-650`）は変更しない。

## データ構造の変更

`result_${resultIndex}` およびキャッシュ値（`responseCacheQueue` の `value`）に `modelVersion` フィールドを追加する。

### result_${resultIndex} のスキーマ（変更後）

```js
{
  requestApiContent: Array,
  responseContent: String,
  url: String,
  title: String,
  modelVersion: String  // 追加: フォールバック設定時は実際のモデル名、それ以外は ""
}
```

### キャッシュ値のスキーマ（変更後）

```js
{
  requestApiContent: Array,
  responseContent: String,
  modelVersion: String  // 追加: フォールバック設定時は実際のモデル名、それ以外は ""
}
```

## 実装手順

### 1. service-worker.js — modelVersion 変数を宣言し result 保存時に追加

#### 1a. 変数宣言（`service-worker.js:113` 付近の既存 `let` 宣言群）

既存の `let apiContents; let response; let responseContent; let apiProvider;` と並べて宣言する。初期値を `""` とすることで、エラー時やキャッシュ保存時も同じ変数をそのまま使える。

```js
let apiContents;
let response;
let responseContent;
let apiProvider;
let modelVersion = "";
```

#### 1b. 通常生成成功時（`service-worker.js:185-193`）

`responseContent` 取得直後に `modelVersion` を計算し、`result_${resultIndex}` に含める。

```js
responseContent = getResponseContent(response, Boolean(effectiveApiKey), apiProvider);
modelVersion = languageModel.includes("/") ? response.body?.modelVersion ?? "" : "";

await chrome.storage.session.set({
  [`result_${resultIndex}`]: {
    requestApiContent: apiContents,
    responseContent: responseContent,
    url: url,
    title: title,
    modelVersion: modelVersion
  }
});
```

#### 1c. エラー時（`service-worker.js:197-204`）

エラー時は `modelVersion` が初期値 `""` のままなので、そのまま `result_${resultIndex}` に含める。

```js
await chrome.storage.session.set({
  [`result_${resultIndex}`]: {
    requestApiContent: apiContents ?? [],
    responseContent: chrome.i18n.getMessage("response_unexpected_response"),
    url: url,
    title: title,
    modelVersion: modelVersion
  }
});
```

### 2. service-worker.js — キャッシュ保存時に modelVersion を追加（`service-worker.js:226-240`）

手順 1a で宣言した `modelVersion` をキャッシュ値に含める。try ブロック外のキャッシュ保存ブロックからも参照できる。

```js
const updatedQueue = responseCacheQueue
  .filter(item => item.key !== responseCacheKey)
  .concat({
    key: responseCacheKey,
    value: {
      requestApiContent: apiContents,
      responseContent: responseContent,
      modelVersion: modelVersion
    }
  })
  .slice(-10);
```

### 3. popup.js — キャッシュヒット時に modelVersion を復元（`popup.js:435-446`）

キャッシュ値から `modelVersion` を取り出し、`result_${resultIndex}` に含める。同時にポップアップ自身の `modelVersion` 変数にも設定し、`finally` ブロックでのステータス表示に反映させる。

```js
const { requestApiContent, responseContent: cachedResponseContent, modelVersion: cachedModelVersion } = responseCache.value;
responseContent = cachedResponseContent;
modelVersion = cachedModelVersion ?? "";

await chrome.storage.session.set({
  [`result_${resultIndex}`]: {
    requestApiContent,
    responseContent: cachedResponseContent,
    url: url,
    title: title,
    modelVersion: cachedModelVersion ?? ""
  }
});
```

### 4. popup.js — sendMessage 拒否時に modelVersion を保存（`popup.js:506-516`）

エラー時と同様に空文字を保存する。

```js
await chrome.storage.session.set({
  [`result_${resultIndex}`]: {
    requestApiContent: [],
    responseContent: chrome.i18n.getMessage("response_unexpected_response"),
    url: url,
    title: title,
    modelVersion: ""
  }
});
```

### 5. results.js — 初回表示時に保存された modelVersion を表示（`results.js:831` の直後）

結果ページの `initialize` には2つの経路があるが、どちらもコンテンツ描画（`results.js:831`）に合流する。

- 経路A（session storage に既に結果がある）: `if (!result)` ブロックをスキップ → コンテンツ描画へ
- 経路B（結果を待機）: `if (!result)` ブロックで待機 → ローディングメッセージをクリア → コンテンツ描画へ

そのため、コンテンツ描画の直後に1箇所追加するだけで両経路をカバーできる。結果待ち完了後の `send-status` クリア（`results.js:818`）は現状維持し、直後の描画後表示で上書きされるため結果に影響しない。

```js
// Convert the content from Markdown to HTML
const { renderLinks } = await chrome.storage.local.get({ renderLinks: false });
document.getElementById("content").innerHTML = convertMarkdownToHtml(result.responseContent, false, renderLinks);
renderAttachedImagePreview();

// Display the model version used for the initial result
document.getElementById("send-status").textContent = result.modelVersion ?? "";
```

## 変更対象ファイルと箇所のまとめ

| ファイル | 行付近 | 変更内容 |
| --- | --- | --- |
| `extension/service-worker.js` | 113 付近 | 既存 `let` 宣言群に `let modelVersion = ""` を追加 |
| `extension/service-worker.js` | 185-193 | `modelVersion` を計算して `result_${resultIndex}` に追加 |
| `extension/service-worker.js` | 197-204 | エラー時の `result_${resultIndex}` に `modelVersion` を追加（初期値 `""` を使用） |
| `extension/service-worker.js` | 226-240 | キャッシュ値に `modelVersion` を追加 |
| `extension/popup.js` | 435-446 | キャッシュヒット時に `modelVersion` を復元し `result_${resultIndex}` と `modelVersion` 変数に設定 |
| `extension/popup.js` | 506-516 | sendMessage 拒否時の `result_${resultIndex}` に `modelVersion: ""` を追加 |
| `extension/results.js` | 831 の直後 | コンテンツ描画後に `send-status` へ `result.modelVersion` を表示（両経路をカバー） |

## 検証項目

- [ ] フォールバック設定時、ポップアップで結果を表示した場合にステータスへモデル名が表示される（既存動作の回帰確認）
- [ ] フォールバック設定時、結果ページを開いた初回表示で `send-status` にモデル名が表示される
- [ ] フォールバック設定時、結果ページのフォローアップ質問で `send-status` にモデル名が表示される（既存動作の回帰確認）
- [ ] フォールバック設定時、キャッシュヒットでポップアップにモデル名が表示される
- [ ] フォールバック設定時、キャッシュヒットで結果ページを開いた初回表示でモデル名が表示される
- [ ] フォールバック未設定時、いずれの経路でもステータスにモデル名が表示されない（空文字）
- [ ] OpenAI 互換 API 使用時、いずれの経路でもステータスにモデル名が表示されない（`languageModel` が `zz` で `/` を含まないため）
- [ ] エラー時・sendMessage 拒否時に結果ページが開け、ステータスは空文字になる
- [ ] 結果ページを再読み込みした場合、保存された `modelVersion` が再表示される
- [ ] `npm run lint` でエラーが出ない

## 注意事項

- キャッシュヒット時に表示されるモデル名は「キャッシュ作成時に実際に応答したモデル」であり、「今再実行したら使われるモデル」とは異なり得る。これはキャッシュの性質として許容する。
- `modelVersion` フィールドが存在しない旧い保存データ（拡張機能更新直後など）を読み込む場合は `?? ""` で空文字にフォールバックするため、後方互換性は保たれる。
- 本計画ではフォローアップ質問時の表示ロジック（`results.js:647-650`）は変更しない。フォローアップ時は毎回レスポンスを直接受け取るため、既存の仕組みでモデル名が表示される。
