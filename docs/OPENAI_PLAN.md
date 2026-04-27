# OpenAI互換API対応 実装計画 (Phase 2〜6)

## 設計判断（確定済み）

- **グローバルプロバイダ選択方式**: `apiProvider` = `"gemini"` | `"openai"`
- **組み込みモデル**: Geminiのみ（OpenAIはユーザー指定モデルのみ）
- **デフォルトベースURL**: `https://api.openai.com/v1`（変更可能、空文字時はこのデフォルトにフォールバック）
- **正規化コンテンツフォーマット**: `parts` ベースの配列。システムプロンプトは `{ role: "system", parts: [{ text: "..." }] }`、ロール名は Gemini 寄り（`"model"` / `"user"`）。変換は統合ラッパー内で行う。
- **Gemini システムインストラクション**: Gemini API の `systemInstruction` フィールドを使用。正規化フォーマットの `role: "system"` メッセージから抽出し、`contents` とは別に送信。

## 新規ストレージキー（Phase 1 で追加済み）

| キー | 型 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `apiProvider` | string | `"gemini"` | `"gemini"` or `"openai"` |
| `openaiApiKey` | string | `""` | OpenAI APIキー |
| `openaiBaseUrl` | string | `"https://api.openai.com/v1"` | カスタムエンドポイント用 |
| `openaiModelId` | string | `"gpt-5.4-nano"` | OpenAIモデルID |

---

## Phase 2: `utils.js` — API抽象化レイヤー ✅ 実装済み

**ファイル**: `extension/utils.js`
**影響度**: 最大（Gemini専用 → provider-aware へ）

### 2.1 プロバイダ別 API 呼び出し関数 ✅

**実装方針**: 統合ラッパー `generateContent()` / `streamGenerateContent()` が唯一の公開エントリポイント。内部でプロバイダを判定し、適切なバックエンド関数にディスパッチする。

```text
generateContent() ─┬─ apiProvider === "openai" → _convertToOpenAI() → generateContentOpenAI()
                    └─ apiProvider === "gemini" → _extractSystemInstruction() → generateContentWithFallback() → generateContentGemini()
```

- `generateContentGemini(apiKey, apiContents, modelConfig, systemInstruction)` — 非公開。Gemini API の `:generateContent` エンドポイントを呼ぶ。`systemInstruction` が `undefined` の場合は `JSON.stringify` がキーごと除去するため後方互換。
- `generateContentOpenAI(apiKey, baseUrl, apiContents, modelConfig)` — 非公開。OpenAI Chat Completions API を呼ぶ。
- `streamGenerateContentGemini(apiKey, apiContents, modelConfig, streamKey, systemInstruction)` — 同上（ストリーミング版）。
- `streamGenerateContentOpenAI(apiKey, baseUrl, apiContents, modelConfig, streamKey)` — 同上（ストリーミング版）。

#### `generateContentOpenAI(apiKey, baseUrl, apiContents, modelConfig)`

- **URL**: `{baseUrl}/chat/completions`
- **Method**: `POST`
- **Headers**: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
- **Request Body**:

  ```json
  {
    "model": "gpt-5.4-nano",
    "messages": [{ "role": "user", "content": "..." }]
  }
  ```

- **Response**: `{ ok, status, body }` 形式に統一（Gemini用ラッパーと同一インターフェース）

#### `streamGenerateContentOpenAI(apiKey, baseUrl, apiContents, modelConfig, streamKey)`

- **URL**: `{baseUrl}/chat/completions`（`stream: true` をbodyに追加）
- **Streaming フォーマット**: Server-Sent Events (SSE)

  ```text
  data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":"Hello"}}]}
  data: {"id":"chatcmpl-xxx","choices":[{"delta":{"content":" world"}}]}
  data: [DONE]
  ```

- Gemini の JSON 配列チャンクパーサーと完全に異なるパーサーが必要
- `response.body.getReader()` で読み取り、`data:` 行をパース
- `chrome.storage.session` へのストリーミング書き込みは Gemini と同じ方式

### 2.2 モデル設定解決の変更 ✅

`getModelConfigs(languageModel, userModelId, apiProvider)` に引数 `apiProvider` を追加。

- OpenAI の場合: `thinkingConfig` は無視（OpenAIにthinking conceptはない）。単一要素配列 `[{ modelId: userModelId, generationConfig: {} }]` を返す。
- `zz`（ユーザー指定モデル）の場合:
  - Gemini: 既存通り `userModelId` をそのまま使用
  - OpenAI: 呼び出し元が `openaiModelId` を `userModelId` として渡す（サービスワーカーが事前解決）
- `modelMappings` 辞書はGemini専用のまま維持

### 2.3 コンテンツ形式変換ユーティリティ ✅

**正規化フォーマット**（プロバイダ非依存）:

```json
[
  { "role": "system", "parts": [{ "text": "..." }] },
  { "role": "user",   "parts": [{ "text": "..." }] },
  { "role": "model",  "parts": [{ "text": "..." }] }
]
```

- システムプロンプトは独立した `role: "system"` メッセージ
- ロール名は Gemini 寄り（`"model"` / `"user"`）
- 画像は `inline_data` 形式

**内部ヘルパー関数**:

- `_extractSystemInstruction(apiContents)` — 非公開。正規化配列から `role: "system"` メッセージを抽出し、`{ systemInstruction: { parts: [...] }, contents: [...] }` を返す。Gemini API 用。
- `_convertToOpenAI(apiContents)` — 非公開。正規化配列を OpenAI 形式に変換。
  - `parts` → `content`
  - `inline_data` → `image_url`（data URL形式）
  - `role: "model"` → `role: "assistant"`
  - `role: "system"` → そのまま（OpenAI の system メッセージとして自然に扱える）

**削除された関数**: `convertContentsForGemini()` — 正規化フォーマットが既に Gemini 寄りであり、逆変換が不要なため削除。

**削除されたエクスポート**: `convertContentsForOpenAI()` — 内部ヘルパー `_convertToOpenAI` に改名し、非公開化。

### 2.4 レスポンス抽出の変更 ✅

`getResponseContent(response, hasApiKey, apiProvider = "gemini")` に `apiProvider` 引数追加。

**OpenAI のレスポンスパース**:

- 成功時: `response.body.choices[0].message.content`
- ブロック時: `response.body.choices[0].finish_reason !== "stop"`
- エラー時: `response.body.error.message`
- APIキー未設定時: `response_no_apikey_openai` メッセージキーを使用

### 2.5 フォールバック関数のシグネチャ変更 ✅

- `generateContentWithFallback(apiKey, apiContents, modelConfigs, systemInstruction)` — `systemInstruction` 引数を追加。複数モデルをループして429エラー時にフォールバック。`systemInstruction` は `generateContentGemini` に透過中継。
- `streamGenerateContentWithFallback(apiKey, apiContents, modelConfigs, streamKey, systemInstruction)` — 同上。

> **注**: 当初の計画では `apiProvider` / `openaiBaseUrl` を渡す想定だったが、実装では統合ラッパー `generateContent()` / `streamGenerateContent()` がプロバイダ分岐を担い、フォールバック関数は純粋に Gemini のマルチモデルフォールバックのみを行う設計に変更された。

---

## Phase 3: `service-worker.js` — バックグラウンド処理 ✅ 実装済み

**ファイル**: `extension/service-worker.js`

### 3.1 プロバイダ設定の読み取り ✅

`chrome.runtime.onMessage` ハンドラ内で `apiKey` に加えて以下を読み取る:

```javascript
const { apiKey, apiProvider, openaiApiKey, openaiBaseUrl, openaiModelId, streaming, userModelId } =
  await chrome.storage.local.get({
    apiKey: "",
    apiProvider: "gemini",
    openaiApiKey: "",
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiModelId: "gpt-5.4-nano",
    streaming: false,
    userModelId: "gemini-2.5-flash"
  });
```

### 3.2 APIキーとモデルIDのプロバイダ別解決 ✅

```javascript
const effectiveApiKey = apiProvider === "openai" ? openaiApiKey : apiKey;
const effectiveModelId = apiProvider === "openai" ? openaiModelId : userModelId;
const baseUrl = openaiBaseUrl || "https://api.openai.com/v1";
```

- `effectiveApiKey`: プロバイダに応じたAPIキー
- `effectiveModelId`: OpenAI 時は `openaiModelId`、Gemini 時は `userModelId`
- `baseUrl`: 空文字の場合はデフォルト `"https://api.openai.com/v1"` にフォールバック（エラーにはしない）

### 3.3 モデル設定のプロバイダ別解決 ✅

```javascript
const modelConfigs = getModelConfigs(languageModel, effectiveModelId, apiProvider);
```

### 3.4 APIコンテンツ構築 ✅ — 正規化フォーマット

正規化フォーマット（プロバイダ非依存）で構築する:

**テキスト**:

```javascript
apiContents = [
  { role: "system", parts: [{ text: systemPrompt }] },
  { role: "user",   parts: [{ text: taskInput }] }
];
```

**画像**:

```javascript
apiContents = [
  { role: "system", parts: [{ text: systemPrompt }] },
  { role: "user",   parts: [{ inline_data: { mime_type: mimeType, data: mediaData } }] }
];
```

プロバイダ別の変換は統合ラッパー `generateContent()` / `streamGenerateContent()` 内で行われる:

- **Gemini**: `_extractSystemInstruction()` が `systemInstruction` を抽出し、`contents` と分離してAPIに送信
- **OpenAI**: `_convertToOpenAI()` が `parts`→`content`、`inline_data`→`image_url`、`model`→`assistant` 変換

### 3.5 API呼び出し ✅ — 統合ラッパー経由

```javascript
if (streaming) {
  response = await streamGenerateContent(effectiveApiKey, apiContents, modelConfigs, streamKey, apiProvider, baseUrl);
} else {
  response = await generateContent(effectiveApiKey, apiContents, modelConfigs, apiProvider, baseUrl);
}
```

> **当初計画からの変更**: `generateContentWithFallback`/`streamGenerateContentWithFallback` を直接呼ぶのではなく、統合ラッパー `generateContent`/`streamGenerateContent` を使用。ラッパーがプロバイダ分岐・フォーマット変換・`systemInstruction` 抽出をすべて行う。

### 3.6 レスポンス抽出 ✅

```javascript
const responseContent = getResponseContent(response, Boolean(effectiveApiKey), apiProvider);
```

### 3.7 結果の保存 ✅ — 正規化フォーマット

```javascript
await chrome.storage.session.set({
  [`result_${resultIndex}`]: {
    requestApiContent: apiContents,  // 正規化配列
    responseContent: responseContent,
    url: url
  }
});
```

`requestApiContent` は正規化フォーマットの配列で保存される。Phase 4（フォローアップ会話）でプロバイダ非依存に再利用可能。

### 3.8 キャッシュキー ✅ — プロバイダを含む

```javascript
const responseCacheKey = JSON.stringify({
  actionType, mediaType, taskInput, languageModel, languageCode, apiProvider
});
```

`apiProvider` をキーに含めることで、Gemini と OpenAI で同じ入力に対する異なる応答を別キャッシュエントリとして管理。

キャッシュに保存する `requestApiContent` も正規化フォーマットの配列。

---

## Phase 4: `results.js` — フォローアップ会話 🔜 未実装

**ファイル**: `extension/results.js`

### 4.1 プロバイダ設定の読み取り

`askQuestion()` 内で `apiProvider`, `openaiApiKey`, `openaiBaseUrl`, `openaiModelId` を読み取る。

### 4.2 APIキーの解決

```javascript
const effectiveApiKey = apiProvider === "openai" ? openaiApiKey : apiKey;
```

### 4.3 会話履歴のフォーマット

Phase 3 で `requestApiContent` は正規化フォーマット（`parts` ベース配列）で保存される。
フォローアップ時はこの配列に `{ role: "model", parts: [{ text: responseContent }] }` を追加して会話履歴を拡張する。

**方針**: 内部では正規化フォーマットのままで会話履歴を管理し、API呼び出しは統合ラッパー `generateContent()` / `streamGenerateContent()` を経由する。ラッパーがプロバイダに応じた変換を自動で行うため、`results.js` 側で変換を意識する必要はない。

> **当初計画からの変更**: `convertContentsForOpenAI` / `convertContentsForGemini` は直接使用しない。統合ラッパーが変換を内部で行う。

### 4.4 モデルドロップダウン制御

`results.js` の `initialize()` でも `popup.js` と同様に、`apiProvider` を読み取り、OpenAI 選択時はモデルドロップダウンに「User-specified」(`zz`) のみを表示する。

**実装方法**:

- `initialize()` で `apiProvider` を `chrome.storage.local.get()` から取得
- OpenAI 時: `languageModel` セレクトボックスの非 `zz` オプションを非表示
- Gemini 時: 全オプションを表示（デフォルト動作）

### 4.5 モデルバージョン表示

OpenAI のレスポンスには `response.body.model` があり、これを modelVersion として表示可能。

---

## Phase 5: `popup.js` — 最小限の変更 🔜 未実装

**ファイル**: `extension/popup.js`

### 5.1 モデルリスト読み込み

現在 `languageModelTemplate` を読み込んでいる。Gemini選択時は全モデルを表示、OpenAI選択時は「User-specified」(`zz`) のみを表示する。

**方針**: popupの初期化時に `apiProvider` を読み取り、OpenAI の場合は UI 側で非 `zz` オプションを非表示にする。`getModelConfigs` 側でも OpenAI 時は非 `zz` を `openaiModelId` にフォールバックする防御的実装を合わせて行う。

### 5.2 APIキー不足時のエラーメッセージ

`getResponseContent()` がprovider-awareになったため、`response_no_apikey_openai` が自動的に対応される。

---

## Phase 6: `templates.html` — 変更不要 🔜

OpenAI選択時はドロップダウンの非 `zz` オプションを JS 側で非表示にするため、`templates.html` のテンプレート自体は変更不要。
既存の `languageModelTemplate` を維持。

---

## 追加 i18n メッセージキー（英語 + 日本語） ✅ 追加済み

Phase 2以降で必要になる追加キー:

| キー | 英語 | 日本語 | 使用状況 |
| --- | --- | --- | --- |
| `response_no_apikey_openai` | `Please set your OpenAI API key on the options page.` | `オプションページでOpenAI APIキーを設定してください。` | `getResponseContent()` で使用 |
| `response_no_base_url` | `Please set the Base URL on the options page.` | `オプションページでベースURLを設定してください。` | **未使用** — 空文字時はデフォルトにフォールバックする設計のため |

---

## 実装ステータス

| Phase | 内容 | ステータス |
| ------- | ------ | ----------- |
| Phase 1 | ストレージキー追加 + options UI | ✅ 完了 |
| Phase 2 | `utils.js` API抽象化レイヤー | ✅ 完了 |
| Phase 3 | `service-worker.js` バックグラウンド処理 | ✅ 完了 |
| Phase 4 | `results.js` フォローアップ会話 | 🔜 未着手 |
| Phase 5 | `popup.js` 最小限の調整 | 🔜 未着手 |
| Phase 6 | `templates.html` 確認 | 🔜 未着手 |
| i18n | メッセージキー追加 | ✅ 完了 |

---

## リスク・注意点

- **ストリーミングパーサーの差異**: Gemini の JSON 配列チャンクパーサーと OpenAI の SSE パーサーは完全に異なる実装になるため、注意深いテストが必要
- **画像入力の形式差異**: Gemini の `inline_data` と OpenAI の `image_url` は互換性がない。変換は `_convertToOpenAI()` が担当。
- **後方互換性**: `apiProvider` 未設定の既存ユーザーはデフォルト `"gemini"` が使われるため影響なし
- **`systemInstruction`**: Gemini API の `systemInstruction` フィールドを使用。`undefined` 時は `JSON.stringify` がキーごと除去するため既存の呼び出し元に影響なし。
- **firefox/manifest.json**: ストレージキーの追加のみで manifest の変更は不要
- **`response_no_base_url` キー**: 全ロケールに存在するが、空文字の `openaiBaseUrl` はデフォルトにフォールバックする設計のため、現状このキーは使用されない。
