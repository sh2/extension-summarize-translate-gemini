# 実装計画: モデルセレクタから Gemini 3.5 Flash / 3.7 Flash を削除

## 背景（事実確認）

Google 公式 Gemini API ドキュメント（`ai.google.dev`、最終更新 2026-10-09 UTC）で以下を確認した。

- リリースノート 2026-10-08: `gemini-3.7-flash` は**サポート終了**となり、`gemini-3.8-flash` に置き換えられた。`gemini-3.7-flash` へのリクエストは自動的に `gemini-3.8-flash` へ転送される。
- リリースノート 2026-10-08: `gemini-3.5-flash` は**非推奨**となり、`gemini-3.6-flash` に置き換えられた。`gemini-3.5-flash` へのリクエストは自動的に `gemini-3.6-flash` へ転送される。
- 非推奨ページ: `gemini-3.7-flash`（移行先 `gemini-3.8-flash`）と `gemini-3.5-flash`（移行先 `gemini-3.6-flash`）はいずれも提供終了日は未発表。
- モデル一覧の現行 Stable に `3.5 Flash` と `3.7 Flash` は載っておらず、`3.8 Flash` / `3.6 Flash` / `3.5 Flash-Lite` / `3.1 Flash-Lite` が有効。

出典: `https://ai.google.dev/gemini-api/docs/changelog`、`https://ai.google.dev/gemini-api/docs/deprecations`、`https://ai.google.dev/gemini-api/docs/models`

## 目的

廃止・非推奨となった Gemini 3.5 Flash と Gemini 3.7 Flash を、モデルセレクタの選択肢と `getModelConfigs` のマッピングから削除し、公式の現行ラインナップと一致させる。

## 現状

| ファイル | 箇所 | 内容 |
| --- | --- | --- |
| `extension/templates.html` | `Stable` optgroup | `3.7-flash` 3件（high/medium/low）と `3.5-flash` 4件（high/medium/low/minimal）＝計7 option |
| `extension/utils.js` | `modelMappings` | `"3.7-flash": "gemini-3.7-flash"` と `"3.5-flash": "gemini-3.5-flash"` |
| `extension/options.js` | `INITIAL_OPTIONS.userModelId` | 既定値が `"gemini-3.7-flash"`（廃止済み。"User-specified" 選択時に使用される） |
| `test/unit/utils.test.js` | `getModelConfigs` describe | `3.5-flash` の2件と `3.7-flash` の1件のテスト |

対象外（確認済み）:

- `3.5 Flash-Lite`（`3.5-flash-lite`）は別モデルで現行 Stable のため存続する。
- `DEFAULT_LANGUAGE_MODEL = "3.5-flash-lite:minimal"` は 3.5 Flash-Lite を使うため存続する。
- Auto-fallback の値 `3.8-flash:low/3.5-flash-lite:minimal/gemma-4-31b-it:minimal` は 3.5 Flash-Lite を使うため存続する。
- `extension/_locales/*/messages.json` はモデル名をキーに持たず、ラベルは `templates.html` にハードコードされているため変更不要。
- `test/static/options-structure.test.js` はテンプレートの存在のみを検証し、option の中身は見ていないため変更不要。

## 設計方針

- **削除のみ**とし、後継モデル（3.8 Flash / 3.6 Flash）への置換は行わない。両モデルはすでにセレクタに存在するため、置換すると重複するだけになる。
- **呼び出し経路**: `getModelConfigs()` の呼び出し元は `extension/service-worker.js:219`（メッセージの `request.languageModel` を使用）と `extension/results.js:644`（セレクタの値を使用）の2箇所のみ。`popup.js` はメッセージの送信元であり、`options.js` は呼び出していない。
- `modelMappings` からも該当エントリを削除する。**現行テンプレートで初期化された通常の UI 経路では**、`popup.js` / `results.js` がセレクタ値を送信し、セレクタ側で旧値が既定へフォールバックするため、保存済みの旧値が `undefined` のまま API に渡ることはない。
- 保存済みの旧値（例: `3.5-flash:low`）は、セレクタに該当 option が無いため `select.value` が空になり、既存のフォールバック処理（`popup.js:709-710`、`results.js:857-858`、`options.js:534-535`、`options.js:682-684`）で `DEFAULT_LANGUAGE_MODEL` に置き換わる。よって通常経路では移行コードは追加しない。
- **ワーカー境界は別の判断事項とする**: `service-worker.js` は `request.languageModel` を正規化せずにそのまま `getModelConfigs()` へ渡す（`extension/utils.js:775` で `modelId` が決まる）。通常 UI 経路では旧値は届かないが、旧値が直接届いた場合はマッピング削除後に `modelId: undefined` となり、サーバー側の自動転送も効かない。本計画では防御を追加せず、必要になった時点で別タスクとして扱う。
- **`userModelId` の変更範囲**: `INITIAL_OPTIONS.userModelId` は「保存値が無いときにオプションフォームへ適用する既定値」である（`options.js:499` の `chrome.storage.local.get(INITIAL_OPTIONS)`）。HTML のプレースホルダーや保存済み値の移行ではない。保存済みの `gemini-3.7-flash` は変更されず、生成時の未保存既定は引き続き `""`（`service-worker.js:194`、`results.js:628`）。`"User-specified"`（`zz`）のモデルIDはマッピングを経由しない（`utils.js:775`）。
- **テスト容易性のための抽出**: フォールバック判定を純関数 `resolveSelectValue` として `utils.js` の `Extension helpers` セクション（`utils.js` は `UI helpers` / `Extension helpers` / `LLM APIs` のライブラリー向け語彙で、`Pure utilities` セクションは無い）に追加し、保存値を適用する3箇所（`popup.js` / `results.js` / `options.js` の `setOptionsToForm`）から使う。これにより「旧値→既定」の**判定ロジック**を DOM に依存せず検証できる。インポート／復元経路の**接続と保存**は自動テストでは保証せず、手動確認で担保する（7c）。
- **インポート時の項目省略を維持**: `applyOptionsToForm` は既存の `if (options.languageModel)` による条件付き代入（`options.js:554`）を維持し、最後のフォールバック判定（`options.js:682-684`）はインポート値ではなく**現在の `select.value`** に対して行う。これにより `languageModel` を省略した JSON では現在の有効な選択が維持される。
- CHANGELOG の `Removed` エントリはリリース時に付与するものとし、本計画のスコープ外とする。

## 実装手順

### 1. `extension/templates.html` — `Stable` optgroup から7 optionを削除

`3.7-flash` の3行（13-15行）と `3.5-flash` の4行（20-23行）を削除する。`3.6-flash`（16-19行）と `3.5-flash-lite`（24-27行）は残す。

削除後の `Stable` optgroup は `3.8 Flash` / `3.6 Flash` / `3.5 Flash-Lite` / `2.5 Pro` / `2.5 Flash` / `2.5 Flash-Lite` となる。

### 2. `extension/utils.js` — `modelMappings` から2エントリを削除

```js
const modelMappings = {
  "3.8-flash": "gemini-3.8-flash",
  "3.6-flash": "gemini-3.6-flash",
  "3.5-flash-lite": "gemini-3.5-flash-lite",
  "2.5-pro": "gemini-2.5-pro",
  "2.5-flash": "gemini-2.5-flash",
  "2.5-flash-lite": "gemini-2.5-flash-lite",
  "3.1-pro-preview": "gemini-3.1-pro-preview",
  "gemma-4-31b-it": "gemma-4-31b-it"
};
```

### 3. `extension/utils.js` — フォールバック判定を純関数として抽出（`Extension helpers` セクション）

`utils.js` は `UI helpers` / `Extension helpers` / `LLM APIs` のライブラリー向け語彙を使い、`Pure utilities` セクションを持たない。DOM にも LLM にも依存しない共有ヘルパーなので `Extension helpers`（`utils.js:344` 付近）に追加する。

```js
export const resolveSelectValue = (value, allowedValues, fallbackValue) => {
  return allowedValues.includes(value) ? value : fallbackValue;
};
```

### 4. 保存値を適用する3箇所を `resolveSelectValue` に置き換え

保存値（`chrome.storage.local` 由来、既定は `DEFAULT_LANGUAGE_MODEL`）をセレクタへ適用する箇所のみ置き換える。

- `extension/popup.js`（`gemini` 分岐、709-710行付近）
- `extension/results.js`（`gemini` 分岐、857-858行付近）
- `extension/options.js` `setOptionsToForm`（534-535行付近）

例（`popup.js`）:

```js
} else {
  const allowedValues = Array.from(languageModelSelect.options, (option) => option.value);

  languageModelSelect.value = resolveSelectValue(languageModel, allowedValues, DEFAULT_LANGUAGE_MODEL);
}
```

`extension/options.js` の `applyOptionsToForm`（インポート／復元経路）は**置き換えない**。既存の条件付き代入（`options.js:554`）を維持し、最後のフォールバック判定（`options.js:682-684`）は現在の `select.value` に適用する。これにより、`languageModel` を省略した JSON では現在の有効な選択が維持される。

### 5. `extension/options.js` — `userModelId` の既定値を更新

保存値が無いときにフォームへ適用される既定値のみを更新する。保存済みのユーザー指定IDは変更しない。

```js
userModelId: "gemini-3.8-flash",
```

### 6. `test/unit/utils.test.js` — テストの削除・修正

- `it("maps a Gemini model with a thinking level")`（3.5-flash を使用、96-100行）を削除する。同等のカバレッジは `3.6-flash` と `3.8-flash` のテストで確保済み。
- `it("maps gemini-3.7-flash with a thinking level")`（117-121行）を削除する。
- `it("preserves the input order for multiple Gemini models")`（146-151行）は入力を `"3.5-flash:minimal/2.5-flash:0"` から `"3.6-flash:minimal/2.5-flash:0"` に変更し、期待値を `gemini-3.6-flash` に更新する。
- `3.5-flash-lite` のテスト（124-127行）と Auto-fallback のテスト（153-161行）は変更しない。

### 7. 回帰テストの追加

#### 7a. `test/unit/utils.test.js` — `resolveSelectValue` のユニットテスト

- `"3.5-flash:low"` → `DEFAULT_LANGUAGE_MODEL`
- `"3.7-flash:high"` → `DEFAULT_LANGUAGE_MODEL`
- 有効値 `"3.6-flash:medium"` → `"3.6-flash:medium"`（そのまま）
- `""`（未保存）→ `DEFAULT_LANGUAGE_MODEL`
- 許可値に `"zz"` が含まれる場合は `"zz"` を維持

#### 7b. `test/static/model-options.test.js`（新規）— テンプレートの option 集合

`extension/templates.html` を JSDOM で読み、`#languageModel` は `<template id="languageModelTemplate">` の内部にあるため、`getElementById("languageModelTemplate").content.querySelector("#languageModel")` から取得する（`test/static/options-structure.test.js` と同じ取得方法）。option 値の集合を期待値と比較して検証する。

- 削除対象が無い: option 値の集合に `3.5-flash:` / `3.7-flash:` で始まる値が含まれない
- 残存確認: `3.8-flash:*` / `3.6-flash:*` / `3.5-flash-lite:*` の期待する option 値が集合に含まれる（接頭辞だけでなく値そのもので検証）
- フォールバック先の保証: `extension/utils.js` の `DEFAULT_LANGUAGE_MODEL` が option 値として存在する

#### 7c. 手動確認 — インポート／復元

`resolveSelectValue` のユニットテスト（7a）が保証するのは**判定ロジック**であり、インポート／復元経路の接続と保存は保証しない。経路は手動で確認する。

- 旧値（`"languageModel": "3.5-flash:low"` など）を含む JSON をインポート／復元すると、フォームと保存後の値が `DEFAULT_LANGUAGE_MODEL` になる
- `languageModel` を省略した JSON をインポート／復元すると、現在の有効な選択が維持される

## 変更対象ファイルと箇所のまとめ

| ファイル | 行付近 | 変更内容 |
| --- | --- | --- |
| `extension/templates.html` | 13-15, 20-23 | `3.7-flash` 3件と `3.5-flash` 4件の option を削除 |
| `extension/utils.js` | 758, 760 | `"3.7-flash"` と `"3.5-flash"` のマッピングを削除 |
| `extension/utils.js` | `Extension helpers`（344付近） | `resolveSelectValue` を追加 |
| `extension/popup.js` | 709-710 | 保存値の適用を `resolveSelectValue` に置換 |
| `extension/results.js` | 857-858 | 保存値の適用を `resolveSelectValue` に置換 |
| `extension/options.js` | 534-535 | 保存値の適用を `resolveSelectValue` に置換 |
| `extension/options.js` | 554, 682-684 | 変更しない（条件付き代入と現在値へのフォールバックを維持） |
| `extension/options.js` | 18 | `userModelId` の既定値を `"gemini-3.8-flash"` に変更 |
| `test/unit/utils.test.js` | 96-100, 117-121 | 3.5-flash と 3.7-flash のテストを削除 |
| `test/unit/utils.test.js` | 146-151 | 入力と期待値を `3.6-flash` に変更 |
| `test/unit/utils.test.js` | 追加 | `resolveSelectValue` のユニットテスト |
| `test/static/model-options.test.js` | 新規 | option 集合とフォールバック先の静的テスト |

## 検証項目

- [ ] `extension/templates.html` の `Stable` optgroup から `3.5 Flash` と `3.7 Flash` の option が消えている
- [ ] `3.5 Flash-Lite`、`3.6 Flash`、`3.8 Flash` の option は残っている
- [ ] `extension/utils.js` の `modelMappings` に `3.5-flash` と `3.7-flash` が無い
- [ ] `extension/options.js` の `userModelId` 既定値が `gemini-3.8-flash` になっている（保存済み値は変更されない）
- [ ] 旧値 `3.5-flash:*` / `3.7-flash:*` が `resolveSelectValue` で `DEFAULT_LANGUAGE_MODEL` になる（ユニットテスト）
- [ ] `test/static/model-options.test.js` が通る（削除・残存・フォールバック先）
- [ ] 手動確認: `languageModel` を省略した設定 JSON のインポート／復元で、現在の有効な選択が維持される
- [ ] `npx vitest run test/unit/utils.test.js` が通る
- [ ] `npm run lint` でエラーが出ない
- [ ] `npm test` が通る
- [ ] 手動確認: ポップアップ・結果ページ・オプションで、保存済みの `3.5-flash:*` / `3.7-flash:*` が既定（`3.5-flash-lite:minimal`）へフォールバックし、エラーにならない
- [ ] 手動確認: 旧値を含む設定 JSON のインポート／復元で既定へフォールバックする
- [ ] 手動確認: 既存結果のフォローアップ質問でも同様にフォールバックする
- [ ] 手動確認: `apiProvider: "gemini"` と `apiProvider: "openai"` の両方で生成が動作する

## スコープ外

- CHANGELOG 更新・バージョン更新・タグ付け・リリース作業。
- ワーカー境界（`service-worker.js`）での旧値防御。通常 UI 経路では旧値が届かないため本計画では追加せず、必要になった時点で別タスクとする。
- 保存済み旧値を後継モデルへ読み替える移行マッピング（通常 UI 経路で既定値へフォールバックするため不要と判断）。
- リポジトリ外（GitHub Issue 本文など）の記述更新。
