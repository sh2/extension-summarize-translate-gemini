# Phase 1: Vitest と最初の Unit test の導入手順

## 1. 目的と完了範囲

この手順は [`TESTING_PLAN_PERSONAL.md`](./TESTING_PLAN_PERSONAL.md) の最初の実装段階を実施するためのものです。

この段階で実現すること:

- `npm test` で高速な Unit test を一括実行できる。
- `npm run test:watch` をローカル開発用コマンドとして利用できる。
- `extension/utils.js` の純粋な export を 3 つ検証する。
- テスト用の globals を ESLint が正しく認識する。
- 本番コードの振る舞いを変えない。

この段階で実現しないこと:

- `fetch`、実 API、streaming、retry/fallback のテスト
- `chrome.storage` や runtime message の fake
- popup、results、options の DOM test
- `jsdom` の導入
- Playwright E2E、カバレッジの合格基準
- 本番コードの抽出・リファクタリング

最初の 3 テストは DOM を必要としない。Vitest の実行環境は Node.js のままにする。`jsdom` は DOM test を導入する段階で追加する。

## 2. 実装前の確認

作業開始前に、リポジトリのルートで次を確認する。

1. `npm run lint` が成功する。
2. `package.json` には現時点で `lint` だけが定義されている。
3. `extension/utils.js` の以下の export が現在のテスト対象である。
   - `normalizeBaseUrl()`
   - `getModelConfigs()`
   - `getResponseContent()`
4. `getResponseContent()` は `chrome.i18n.getMessage()` を使用するため、テストでは最小限の `chrome` stub が必要である。

既存の未コミット変更を意図せず混ぜない。動作の変更や不具合修正を見つけても、この Phase では修正しない。現在の挙動を期待値として固定し、修正は別変更にする。

## 3. 変更するファイル

| ファイル | 変更内容 |
| --- | --- |
| `package.json` | `vitest` の開発依存、テスト scripts を追加する。必要なら `"type": "module"` も追加する |
| `package-lock.json` | npm install により更新する |
| `eslint.config.mjs` | `test/**/*.js` 用に Node.js と Vitest の globals を追加する |
| `test/unit/utils.test.js` | 最初の Unit test を追加する |

この Phase では、最初から `vitest.config.js` を作らない。Vitest の標準的なファイル検出と Node.js 環境で足りる想定である。test の種類や環境が増えたときに設定ファイルを導入する。

### 3.1 ESM import で詰まったときのフォールバック

現状の `package.json` には `"type": "module"` がない。`extension/utils.js` は `export` を使う ESM のため、`npm test` で import エラーが出る場合がある。

その場合だけ、影響の小さい手段から順に対処する。本番コードは変更しない。

1. まず Vitest 側の最小設定で解決できないか確認する
2. それでも import が解決しない場合だけ、`package.json` への `"type": "module"` 追加を検討する

どちらも「import が失敗したとき」の救済策であり、最初から必須ではない。

## 4. 依存関係と scripts の追加

### 4.1 開発依存

リポジトリのルートで、開発依存として `vitest` を追加する。

`npm install --save-dev` を使い、`package.json` と lockfile を npm に更新させる。バージョンを手で固定・編集しない。

`jsdom` はこの Phase では追加しない。DOM を使う test を導入する段階で入れる。

### 4.2 package scripts

`package.json` の `scripts` に次を追加する。

| script | 内容 | 用途 |
| --- | --- | --- |
| `test` | `vitest run` | ローカル確認・CI の一回実行 |
| `test:watch` | `vitest` | 開発中の watch 実行 |

`lint` は既存の `eslint .` を変更しない。coverage と E2E script は後続 Phase まで追加しない。

## 5. ESLint の調整

`eslint.config.mjs` に、`test/**/*.js` だけを対象にする設定を追加する。

この設定では次の globals を有効化する。

- `globals.node`
- Vitest の `describe`、`it`、`expect`、`beforeEach`、`afterEach` など

Vitest globals は `globals` パッケージが提供する `globals.vitest` を使用する。現在の設定がすでに `globals` を import しているため、追加の ESLint plugin は不要である。

拡張機能本体には Vitest globals を広げない。対象を test ファイルに限定し、本番コードでテスト API を誤用した場合に lint が検出できる状態を保つ。

## 6. テストファイルの作成

`test/unit/utils.test.js` を作成する。テストは `extension/utils.js` から対象の 3 関数だけを named import する。

### 6.1 chrome.i18n stub

Phase 1 では、`test/unit/utils.test.js` のファイル先頭で固定の最小 stub を一度だけ用意する。`beforeEach` / `afterEach` でのリセットは不要である。後続で storage fake などを追加する段階で、必要なら掃除を導入する。

用意するもの:

- `globalThis.chrome`
- `chrome.i18n.getMessage(key)`

`getMessage()` は、期待値を明確にするため、たとえば `message:<key>` のように key を含む決定論的な文字列を返す。翻訳文を fixture に複製しない。

この Phase の対象関数は `chrome.i18n` 以外の Chrome API を実行しない。storage や runtime の fake を追加しない。

### 6.2 テストの記述規則

- `describe()` は export 関数ごとに分ける。
- 1 つの `it()` は 1 つの挙動だけを説明する。
- API key、Authorization header、実 URL、実 API response を含めない。
- 実時間待機、実ネットワーク、乱数へ依存しない。
- 期待値は現在の実装を読んで確認し、理想化した仕様を混ぜない。

## 7. 追加するテストケース

### 7.1 `normalizeBaseUrl()`

| ケース | 入力 | 期待結果 |
| --- | --- | --- |
| origin の正規化 | ` https://example.com/ ` | `https://example.com` |
| path の維持 | `https://example.com/api/v1/` | `https://example.com/api/v1` |
| query/hash の除去 | `https://example.com/api/?q=x#section` | `https://example.com/api` |
| http と port の維持 | `http://localhost:8080/v1/` | `http://localhost:8080/v1` |
| root path の正規化 | `https://example.com////` | `https://example.com` |
| 不正 URL | `not a URL` | `URL` 由来の例外を送出する |

`normalizeBaseUrl()` は protocol を補完しない。`example.com` のような scheme のない値について期待を決めるテストは、この Phase では不要である。必要になったときに実挙動を確認して追加する。

### 7.2 `getModelConfigs()`

| ケース | 入力 | 期待結果 |
| --- | --- | --- |
| Gemini thinking level | `languageModel="3.5-flash:minimal"` | `modelId` が `gemini-3.5-flash`、`thinkingLevel` が `"minimal"` |
| Gemini thinking budget 0 | `languageModel="3.1-flash-lite:0"` | `thinkingBudget` が `0` |
| Gemini thinking budget -1 | `languageModel="3.1-flash-lite:-1"` | `thinkingBudget` が `-1` |
| 複数 Gemini model | `languageModel="3.5-flash:minimal/3.1-flash-lite:0"` | 入力順の 2 config |
| user model placeholder | `languageModel="zz"` と `userModelId="my-custom-model:high"` | `modelId` が `my-custom-model`、`thinkingLevel` が `"high"` |
| OpenAI | 下記の OpenAI 入力 | 下記の OpenAI 期待結果 |

OpenAI ケースの具体値:

- 入力: `languageModel` は任意、`userModelId="gpt-test"`、`apiProvider="openai"`、`extraConfig={reasoningEffort:"low",thinkingType:"enabled"}`
- 期待結果: 1 件の config。`modelId` は `"gpt-test"`、`generationConfig.reasoningEffort` は `"low"`、`generationConfig.thinkingType` は `"enabled"`

未知の Gemini model が `undefined` の `modelId` になる現在の挙動は、Phase 1 の対象外とする。入力 validation の仕様を決める変更になるためである。

### 7.3 `getResponseContent()`

Gemini と OpenAI について、成功・blocked・想定外・エラーを最小限検証する。

| provider | ケース | response の要点 | 期待する内容 |
| --- | --- | --- | --- |
| Gemini | 正常 | `candidates[0].content.parts[0].text` | 本文を返す |
| Gemini | thought を含む正常 | thought part の次の text part | 本文だけを返す |
| Gemini | prompt block | `promptFeedback.blockReason` | stub の `response_prompt_blocked` と理由を含む |
| Gemini | response block | `finishReason: "SAFETY"` | stub の `response_response_blocked` と理由を含む |
| Gemini | 想定外 body | candidate/content なし | stub の `response_unexpected_response` |
| OpenAI | 正常 | `choices[0].message.content`、`finish_reason: "stop"` | 本文を返す |
| OpenAI | response block | `finish_reason: "length"` | 現在実装どおり、stub の blocked message と理由を含む |
| OpenAI | 想定外 body | choice/message なし | stub の unexpected message |
| OpenAI | Base URL 未設定 | `ok: false`、status `1002`、API key なし | error、stub の `response_no_base_url`、`response_no_apikey_openai` を含む |
| Gemini | HTTP error | `ok: false`、error message、API key なし | status、error message、stub の `response_no_apikey` を含む |

custom error code `1003`、null body、その他の finish reason は、provider contract test の実装時に追加する。Phase 1 では分岐の土台を固定することを優先する。

## 8. 実装と確認の順序

1. `npm run lint` を実行し、ベースラインを確認する。
2. `vitest` を開発依存に追加する。
3. `package.json` に `test` と `test:watch` を追加する。
4. ESLint に test 専用 globals を追加する。
5. `test/unit/utils.test.js` を作り、`normalizeBaseUrl()` の最初の 1 ケースだけ入れて `npm test` を実行する。
6. import エラーが出た場合だけ、3.1 の ESM フォールバックを適用してから再実行する。
7. `normalizeBaseUrl()` の残りのケースを追加して `npm test` を実行する。
8. `getModelConfigs()` のテストを追加して `npm test` を実行する。
9. ファイル先頭の chrome.i18n stub と `getResponseContent()` のテストを追加して `npm test` を実行する。
10. `npm run lint` を実行する。
11. `npm test` と `npm run lint` を続けて実行する。
12. 任意で、ローカルから `npm run test:watch` を一度起動し、変更検出を確認する。

空の test ファイルは作らない。Vitest の検出確認は、最初から意味のある 1 ケースで行う。

途中で production code のテストしにくさを見つけても、Phase 1 では export 済みの関数だけを対象にする。依存注入や純粋関数の抽出は Phase 2 以降で、小さな別変更として行う。

## 9. 完了条件

次をすべて満たしたら Phase 1 は完了とする。

- `npm test` が成功する。
- `npm run lint` が成功する。
- 7.1、7.2、7.3 の必須ケースを実装している。
- 通常テストがネットワーク、実 API、実ブラウザー、固定 sleep を使用していない。
- `extension/` の本番挙動を変更していない。
- fixture、エラー出力、スナップショットに secret を含めていない。

`npm run test:watch` はローカル開発用の任意確認とする。CI や完了判定の必須条件にはしない。

## 10. 次の段階

Phase 1 完了後に、実装結果を確認してから次の手順書を作成する。次は Gemini/OpenAI の non-streaming contract test である。

その際は、`generateContent()` を対象にし、`fetch` の mock、Gemini/OpenAI request body、正常・HTTP error response、system instruction の分離、OpenAI multimodal 変換を扱う。retry、streaming、Chrome storage fake は次々段階へ分ける。
