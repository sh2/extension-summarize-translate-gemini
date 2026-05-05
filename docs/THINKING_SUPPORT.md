# OpenAI 互換 API の thinking 対応 実装計画

## 背景

OpenAI 互換 API (Chat Completions) で reasoning（思考）モードを制御するため、以下の 2 つのパラメーターを導入する。

- `reasoning_effort` : OpenAI Chat Completions API の公式パラメーター。`none` | `low` | `medium` | `high` | `xhigh` をサポート（モデル依存）。
- `thinking.type` : DeepSeek 発の非公式拡張で、Kimi、GLM、豆包が追随。`enabled` | `disabled`。

ユーザーが使用するプロバイダーに応じて手動で適切な値を設定する前提とする。

## 設計決定

| # | 項目 | 決定 |
| --- | ------ | ------ |
| 1 | 保存場所 | `chrome.storage.local` に独立キー `openaiReasoningEffort`, `openaiThinkingType` |
| 2 | デフォルト値 | 両方とも `""` (空文字 = 未指定)。API リクエスト時にパラメーターを追加しない |
| 3 | データ伝搬 | `getModelConfigs()` の `generationConfig` に `reasoningEffort`, `thinkingType` を含める。`apiProvider === "openai"` のときのみ値を渡す |
| 4 | パラメーター相互関係 | UI 上で排他制御は行わない（ユーザー責任） |
| 5 | UI 配置 | `options.html` の OpenAI セクション内、Model ID の下に `<select>` を 2 つ追加 |
| 6 | ドロップダウン並び順 | `""` (Unspecified) のあとに値の大きい順: `xhigh` → `high` → `medium` → `low` → `none` |
| 7 | 未指定の視覚的分離 | `<optgroup label="Specified">` でグループ化 |
| 8 | i18n | 英語 (`en`) のみ実装。他ロケールは英語にフォールバック |
| 9 | export/import | 特別扱い不要。既存フローに自然に乗る |
| 10 | リクエストボディ構築 | 値が空文字でない場合のみ `reasoning_effort` / `thinking` を JSON に追加 |

## Phase 1: ストレージ定義 + オプション UI

**目標**: 設定画面で reasoning_effort と thinking_type を選択・保存できるようにする。
**状態**: API 呼び出しには未反映。

### 1-1. `extension/options.html`

`openaiSection` 内、Model ID (`openaiModelId`) の `<input>` の直後に追加する。

```html
<br>
<span data-i18n="options_reasoning_effort">Reasoning effort (reasoning_effort)</span>
<br>
<select id="openaiReasoningEffort">
  <option value="">Unspecified</option>
  <optgroup label="Specified">
    <option value="xhigh">xhigh</option>
    <option value="high">high</option>
    <option value="medium">medium</option>
    <option value="low">low</option>
    <option value="none">none</option>
  </optgroup>
</select>
<br>
<span data-i18n="options_thinking_type">Thinking type (thinking.type)</span>
<br>
<select id="openaiThinkingType">
  <option value="">Unspecified</option>
  <optgroup label="Specified">
    <option value="enabled">enabled</option>
    <option value="disabled">disabled</option>
  </optgroup>
</select>
```

### 1-2. `extension/options.js`

#### `INITIAL_OPTIONS` に追加

```js
openaiReasoningEffort: "",
openaiThinkingType: "",
```

#### `getOptionsFromForm()` に追加

```js
openaiReasoningEffort: document.getElementById("openaiReasoningEffort").value,
openaiThinkingType: document.getElementById("openaiThinkingType").value,
```

#### `setOptionsToForm()` に追加

```js
document.getElementById("openaiReasoningEffort").value = options.openaiReasoningEffort;
document.getElementById("openaiThinkingType").value = options.openaiThinkingType;
```

#### `applyOptionsToForm()` に追加

```js
// openaiReasoningEffort は空文字を許容する
if (options.openaiReasoningEffort !== undefined) {
  document.getElementById("openaiReasoningEffort").value = options.openaiReasoningEffort;
}
// openaiThinkingType は空文字を許容する
if (options.openaiThinkingType !== undefined) {
  document.getElementById("openaiThinkingType").value = options.openaiThinkingType;
}
```

### 1-3. `extension/_locales/en/messages.json`

```json
"options_reasoning_effort": {
    "message": "Reasoning effort (reasoning_effort)"
},
"options_thinking_type": {
    "message": "Thinking type (thinking.type)"
}
```

## Phase 2: API リクエストへの反映

**目標**: 設定された reasoning_effort / thinking_type が実際の API リクエストに含まれるようにする。

### 2-1. `extension/utils.js` — `getModelConfigs()`

シグネチャ変更:

```js
// Before
export const getModelConfigs = (languageModel, userModelId, apiProvider = "gemini") => { ... }

// After
export const getModelConfigs = (languageModel, userModelId, apiProvider = "gemini", extraConfig = {}) => { ... }
```

OpenAI ブランチで `generationConfig` に追加パラメーターを含める:

```js
if (apiProvider === "openai") {
  return [{
    modelId: userModelId,
    generationConfig: {
      reasoningEffort: extraConfig.reasoningEffort || "",
      thinkingType: extraConfig.thinkingType || ""
    }
  }];
}
```

### 2-2. `extension/utils.js` — `generateContentOpenAI()`

```js
const { modelId, generationConfig } = modelConfig;

const body = { model: modelId, messages: apiContents };

if (generationConfig?.reasoningEffort) {
  body.reasoning_effort = generationConfig.reasoningEffort;
}
if (generationConfig?.thinkingType) {
  body.thinking = { type: generationConfig.thinkingType };
}

const response = await fetch(buildOpenAIApiUrl(baseUrl, "/chat/completions"), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  },
  body: JSON.stringify(body)
});
```

### 2-3. `extension/utils.js` — `streamGenerateContentOpenAI()`

`generateContentOpenAI()` と同一のロジックで、`stream: true` を含めたボディを構築する。

### 2-4. `extension/service-worker.js`

`chrome.storage.local.get()` に新キーを追加:

```js
const {
  apiKey, apiProvider, openaiApiKey, openaiBaseUrl, openaiModelId,
  streaming, userModelId,
  openaiReasoningEffort,   // 追加
  openaiThinkingType        // 追加
} = await chrome.storage.local.get({
  // ...既存のデフォルト...
  openaiReasoningEffort: "",  // 追加
  openaiThinkingType: ""      // 追加
});
```

`getModelConfigs()` 呼び出しを変更（`apiProvider === "openai"` のときのみ extraConfig を渡す）:

```js
// Before
const modelConfigs = getModelConfigs(languageModel, effectiveModelId, apiProvider);

// After
const extraConfig = apiProvider === "openai"
  ? { reasoningEffort: openaiReasoningEffort, thinkingType: openaiThinkingType }
  : {};

const modelConfigs = getModelConfigs(languageModel, effectiveModelId, apiProvider, extraConfig);
```

### 2-5. `extension/results.js`

`service-worker.js` と同様に、`chrome.storage.local.get()` と `getModelConfigs()` 呼び出しを更新する。

```js
const { apiKey, apiProvider, openaiApiKey, openaiBaseUrl, openaiModelId,
  streaming, userModelId, renderLinks, autoSave,
  openaiReasoningEffort,   // 追加
  openaiThinkingType        // 追加
} = await chrome.storage.local.get({
  // ...既存のデフォルト...
  openaiReasoningEffort: "",  // 追加
  openaiThinkingType: ""      // 追加
});

// ...

const extraConfig = apiProvider === "openai"
  ? { reasoningEffort: openaiReasoningEffort, thinkingType: openaiThinkingType }
  : {};

const modelConfigs = getModelConfigs(languageModel, effectiveModelId, apiProvider, extraConfig);
```

## Phase 3: i18n 展開 + 検証

**目標**: 全言語ロケールに新しいメッセージキーを追加し、lint を通過させる。

### 3-1. `extension/_locales/*/messages.json`

各言語ファイルに以下 2 キーを追加。ラベルにはパラメーター名を併記する。全ロケールで翻訳を用意する（英語コピーは不要）。

翻訳にあたっては以下を基準とする：

- 各国語で自然な表現であること
- 既存のメッセージファイルと一貫性を保つこと（語彙、文体、ラベル長）
- ツールの UI として簡潔な表現を保つこと（1〜4 語程度）
- API パラメーター名 `reasoning_effort`、`thinking.type` は全ロケールで併記する

翻訳一覧：

| ロケール | `options_reasoning_effort` | `options_thinking_type` |
| ---------- | --------------------------- | ------------------------- |
| ar | جهد الاستدلال (reasoning_effort) | نوع التفكير (thinking.type) |
| bn | যুক্তি প্রচেষ্টা (reasoning_effort) | চিন্তার ধরন (thinking.type) |
| de | Reasoning-Aufwand (reasoning_effort) | Thinking-Typ (thinking.type) |
| en | Reasoning effort (reasoning_effort) | Thinking type (thinking.type) |
| es | Esfuerzo de razonamiento (reasoning_effort) | Tipo de pensamiento (thinking.type) |
| fr | Effort de raisonnement (reasoning_effort) | Type de réflexion (thinking.type) |
| hi | तर्क प्रयास (reasoning_effort) | सोच का प्रकार (thinking.type) |
| it | Sforzo di ragionamento (reasoning_effort) | Tipo di pensiero (thinking.type) |
| ja | 推論エフォート (reasoning_effort) | 思考タイプ (thinking.type) |
| ko | 추론 노력 (reasoning_effort) | 사고 유형 (thinking.type) |
| pt_BR | Esforço de raciocínio (reasoning_effort) | Tipo de pensamento (thinking.type) |
| ru | Уровень рассуждения (reasoning_effort) | Тип мышления (thinking.type) |
| vi | Nỗ lực suy luận (reasoning_effort) | Kiểu suy nghĩ (thinking.type) |
| zh_CN | 推理深度 (reasoning_effort) | 思考类型 (thinking.type) |
| zh_TW | 推理程度 (reasoning_effort) | 思考類型 (thinking.type) |

### 3-2. lint 実行

```bash
npm run lint
```

エラーがあれば修正する。

## 影響範囲一覧

| ファイル | Phase 1 | Phase 2 | Phase 3 |
| ---------- | --------- | --------- | --------- |
| `extension/options.html` | 追記 | — | — |
| `extension/options.js` | INITIAL_OPTIONS, getOptionsFromForm, setOptionsToForm, applyOptionsToForm | — | — |
| `extension/utils.js` | — | getModelConfigs, generateContentOpenAI, streamGenerateContentOpenAI | — |
| `extension/service-worker.js` | — | chrome.storage.local.get + getModelConfigs 呼び出し | — |
| `extension/results.js` | — | chrome.storage.local.get + getModelConfigs 呼び出し | — |
| `extension/_locales/en/messages.json` | 2 キー追加 | — | — |
| `extension/_locales/*/messages.json` (他 14 言語) | — | — | 各 2 キー追加 |

## リクエストボディ例

### 両方指定 (DeepSeek)

```json
{
  "model": "deepseek-v4-pro",
  "messages": [...],
  "reasoning_effort": "high",
  "thinking": { "type": "enabled" }
}
```

### reasoning_effort のみ指定 (OpenAI)

```json
{
  "model": "gpt-5.5",
  "messages": [...],
  "reasoning_effort": "medium"
}
```

### thinking.type のみ指定 (Kimi / GLM / 豆包)

```json
{
  "model": "kimi-k2.6",
  "messages": [...],
  "thinking": { "type": "enabled" }
}
```

### 両方未指定 (既存互換)

```json
{
  "model": "gpt-5.4-nano",
  "messages": [...]
}
```
