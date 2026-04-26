# OpenAI互換API対応 実装計画 (Phase 2〜6)

## 設計判断（確定済み）

- **グローバルプロバイダ選択方式**: `apiProvider` = `"gemini"` | `"openai"`
- **組み込みモデル**: Geminiのみ（OpenAIはユーザー指定モデルのみ）
- **デフォルトベースURL**: `https://api.openai.com/v1`（変更可能）

## 新規ストレージキー（Phase 1 で追加済み）

| キー | 型 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `apiProvider` | string | `"gemini"` | `"gemini"` or `"openai"` |
| `openaiApiKey` | string | `""` | OpenAI APIキー |
| `openaiBaseUrl` | string | `"https://api.openai.com/v1"` | カスタムエンドポイント用 |
| `openaiModelId` | string | `"gpt-5.4-nano"` | OpenAIモデルID |

---

## Phase 2: `utils.js` — API抽象化レイヤー

**ファイル**: `extension/utils.js`
**影響度**: 最大（Gemini専用 → provider-aware へ）

### 2.1 プロバイダ別 API 呼び出し関数

現在 `generateContent()` と `streamGenerateContent()` がGemini専用になっている。
これらを provider-aware に変更し、内部でプロバイダ別の実装にディスパッチする。

**変更方針**:

- 既存の `generateContent()` → `generateContentGemini()` にリネーム
- 新規 `generateContentOpenAI()` を追加
- `generateContent()` をプロバイダ判定＋ディスパッチのラッパーに変更
- 同じく `streamGenerateContent()` / `streamGenerateContentWithFallback()` も対応

#### `generateContentOpenAI(apiKey, baseUrl, apiContents, modelConfig)`

- **URL**: `{baseUrl}/chat/completions`
- **Method**: `POST`
- **Headers**: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
- **Request Body**:

  ```json
  {
    "model": "{modelConfig.modelId}",
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

### 2.2 モデル設定解決の変更

`getModelConfigs(languageModel, userModelId, apiProvider)` に引数 `apiProvider` を追加。

- OpenAI の場合: `thinkingConfig` は無視（OpenAIにthinking conceptはない）
- `zz`（ユーザー指定モデル）の場合:
  - Gemini: 既存通り `userModelId` をそのまま使用
  - OpenAI: `openaiModelId` を使用
- `modelMappings` 辞書はGemini専用のまま維持

### 2.3 コンテンツ形式変換ユーティリティ

Gemini と OpenAI でコンテンツ形式が異なるため、変換関数を追加。

**Gemini 形式**:

```json
{ "role": "user", "parts": [{ "text": "..." }] }
```

**OpenAI 形式**:

```json
{ "role": "user", "content": "..." }
```

**新規ユーティリティ関数**:

- `convertContentsForGemini(apiContents)` → Gemini用parts形式に変換
- `convertContentsForOpenAI(apiContents)` → OpenAI用messages形式に変換
- ロール変換: `"model"` (Gemini) ↔ `"assistant"` (OpenAI)

### 2.4 レスポンス抽出の変更

`getResponseContent(response, hasApiKey, apiProvider)` に `apiProvider` 引数追加。

**OpenAI のレスポンスパース**:

- 成功時: `response.body.choices[0].message.content`
- ブロック時: `response.body.choices[0].finish_reason !== "stop"`
- エラー時: `response.body.error.message`
- APIキー未設定時: `response_no_apikey` の代わりに新規メッセージキー `response_no_apikey_openai` を使用

### 2.5 フォールバック関数のシグネチャ変更

- `generateContentWithFallback(apiKey, apiContents, modelConfigs)` → `(apiKey, apiContents, modelConfigs, apiProvider, openaiBaseUrl)`
- `streamGenerateContentWithFallback(apiKey, apiContents, modelConfigs, streamKey)` → `(apiKey, apiContents, modelConfigs, streamKey, apiProvider, openaiBaseUrl)`

---

## Phase 3: `service-worker.js` — バックグラウンド処理

**ファイル**: `extension/service-worker.js`

### 3.1 プロバイダ設定の読み取り

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

### 3.2 APIキーのプロバイダ別解決

```javascript
const effectiveApiKey = apiProvider === "openai" ? openaiApiKey : apiKey;
```

### 3.3 モデル設定のプロバイダ別解決

```javascript
const modelConfigs = getModelConfigs(languageModel, userModelId, apiProvider);
```

OpenAI の場合は `openaiModelId` をユーザー指定モデルとして使用。

### 3.4 APIコンテンツ構築の分岐

システムプロンプトの扱いが異なる:

- **Gemini**: ユーザーメッセージの `parts[].text` にシステムプロンプトを埋め込む（既存通り）
- **OpenAI**: 独立した `role: "system"` メッセージとして送信

画像入力の形式も異なる:

- **Gemini**: `{ inline_data: { mime_type, data } }`
- **OpenAI**: `{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }`

### 3.5 API呼び出しの分岐

```javascript
if (streaming) {
  response = await streamGenerateContentWithFallback(effectiveApiKey, apiContents, modelConfigs, streamKey, apiProvider, openaiBaseUrl);
} else {
  response = await generateContentWithFallback(effectiveApiKey, apiContents, modelConfigs, apiProvider, openaiBaseUrl);
}
```

### 3.6 レスポンス抽出

```javascript
const responseContent = getResponseContent(response, Boolean(effectiveApiKey), apiProvider);
```

---

## Phase 4: `results.js` — フォローアップ会話

**ファイル**: `extension/results.js`

### 4.1 プロバイダ設定の読み取り

`askQuestion()` 内で `apiProvider`, `openaiApiKey`, `openaiBaseUrl`, `openaiModelId` を読み取る。

### 4.2 APIキーの解決

```javascript
const effectiveApiKey = apiProvider === "openai" ? openaiApiKey : apiKey;
```

### 4.3 会話履歴のフォーマット

現在 `result.requestApiContent` は Gemini 形式 (`role: "user"/"model"`, `parts: [{text}]`) で保存されている。
フォローアップ時はそのままの形式でやり取りするか、もしくはプロバイダに応じて変換する。

**方針**: 内部では Gemini 形式のままで会話履歴を管理し、API呼び出し時にプロバイダに応じた形式に変換する。
`utils.js` の変換ユーティリティ (`convertContentsForOpenAI` / `convertContentsForGemini`) を使用。

### 4.4 モデルドロップダウン制御

`results.js` の `initialize()` でも `popup.js` と同様に、`apiProvider` を読み取り、OpenAI 選択時はモデルドロップダウンに「User-specified」(`zz`) のみを表示する。

**実装方法**:

- `initialize()` で `apiProvider` を `chrome.storage.local.get()` から取得
- OpenAI 時: `languageModel` セレクトボックスの非 `zz` オプションを非表示
- Gemini 時: 全オプションを表示（デフォルト動作）

### 4.5 モデルバージョン表示

OpenAI のレスポンスには `response.body.model` があり、これを modelVersion として表示可能。

---

## Phase 5: `popup.js` — 最小限の変更

**ファイル**: `extension/popup.js`

### 5.1 モデルリスト読み込み

現在 `languageModelTemplate` を読み込んでいる。Gemini選択時は全モデルを表示、OpenAI選択時は「User-specified」(`zz`) のみを表示する。

**方針**: popupの初期化時に `apiProvider` を読み取り、OpenAI の場合は `getModelConfigs` に加えて UI 側でも非 `zz` オプションを非表示にする。これによりユーザーが OpenAI 選択時に Gemini モデルを選べなくなる。また `getModelConfigs` 側でも OpenAI 時は非 `zz` を `openaiModelId` にフォールバックする防御的実装を合わせて行う。

**実装方法**:

- `popup.js` の `initialize()` で `apiProvider` を `chrome.storage.local.get()` から取得
- OpenAI 時: `languageModel` セレクトボックスの全 `<option>` のうち `value !== "zz"` なものを `display: none` または `hidden` に設定
- Gemini 時: 全オプションを表示（デフォルト動作）

### 5.2 APIキー不足時のエラーメッセージ

現在 `response_no_apikey` を使っているが、OpenAI用のメッセージ `response_no_apikey_openai` も必要に応じて表示できるよう、`getResponseContent()` がprovider-awareになったため自動的に対応される。

---

## Phase 6: `templates.html` — 変更不要

OpenAI選択時はドロップダウンの非 `zz` オプションを JS 側で非表示にするため、`templates.html` のテンプレート自体は変更不要。
既存の `languageModelTemplate` を維持。

---

## 追加 i18n メッセージキー（英語 + 日本語）

Phase 2以降で必要になる追加キー:

| キー | 英語 | 日本語 |
| --- | --- | --- |
| `response_no_apikey_openai` | `Please set your OpenAI API key on the options page.` | `オプションページでOpenAI APIキーを設定してください。` |
| `response_no_base_url` | `Please set the Base URL on the options page.` | `オプションページでベースURLを設定してください。` |

---

## 実装順序の推奨

1. **Phase 2** — `utils.js`: 中核的なAPI抽象化（最も重要）
2. **Phase 3** — `service-worker.js`: バックグラウンド処理の分岐
3. **Phase 4** — `results.js`: フォローアップ会話
4. **Phase 5** — `popup.js`: 最小限の調整
5. **Phase 6** — `templates.html`: 確認のみ（変更不要の見込み）
6. i18n メッセージ追加（各Phaseの該当タイミングで）

## リスク・注意点

- **ストリーミングパーサーの差異**: Gemini の JSON 配列チャンクパーサーと OpenAI の SSE パーサーは完全に異なる実装になるため、注意深いテストが必要
- **画像入力の形式差異**: Gemini の `inline_data` と OpenAI の `image_url` は互換性がない
- **後方互換性**: `apiProvider` 未設定の既存ユーザーはデフォルト `"gemini"` が使われるため影響なし
- **firefox/manifest.json**: ストレージキーの追加のみで manifest の変更は不要
