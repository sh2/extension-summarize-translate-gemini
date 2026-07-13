# 個人開発向けテスト導入計画

## 1. 方針

この拡張機能では、テスト件数やカバレッジ率を目的にしない。個人開発で
継続して維持でき、変更時に壊れやすい箇所を素早く検出できる範囲へ絞る。

通常の開発では実 LLM API、外部 Web サイト、固定時間の待機に依存しない。
Gemini と OpenAI 互換 API のリクエスト変換、レスポンス解釈、streaming、
retry/fallback を最優先で保護する。

詳細な将来候補は [`TESTING_PLAN.md`](./TESTING_PLAN.md) を参照する。

## 2. 導入する範囲

### 必須（最初に導入する）

1. **Phase 1: Vitest による高速テスト**
   - 手順: [`TESTING_PHASE_1.md`](./TESTING_PHASE_1.md)
   - `utils.js` の既存 export と、新たに小さく抽出した純粋関数を対象にする。
   - 実行は `npm test`、開発中は watch mode を使う。
   - `jsdom` は DOM test 導入時に追加する。
2. **Phase 2: LLM provider contract test**
   - 手順: [`TESTING_PHASE_2.md`](./TESTING_PHASE_2.md)
   - Gemini / OpenAI 互換 API の request と response を fixture で検証する。
   - streaming はネットワーク chunk の途中分割を必ず検証する。
   - 503 retry と model fallback は fake timer または注入した `sleep` で検証する。
3. **Phase 3: streaming / retry test**
   - 手順: [`TESTING_PHASE_3.md`](./TESTING_PHASE_3.md)
   - OpenAI SSE と Gemini streaming JSON の chunk 境界、`[DONE]`、malformed input を検証する。
   - 503 retry、429/503 による model fallback、成功後の終了を検証する。
4. **Phase 4: Markdown/XSS と静的整合性 test**
   - 手順: [`TESTING_PHASE_4.md`](./TESTING_PHASE_4.md)
   - `convertMarkdownToHtml()` が script、event handler、`javascript:` URL を安全に
     処理することを検証する。
   - Chrome / Firefox manifest の version 一致、参照ファイルの存在、locale key の
     一致を検証する。
5. **Phase 4a: Markdown URL protocol hardening**
   - 手順: [`TESTING_PHASE_4a.md`](./TESTING_PHASE_4a.md)
   - Phase 4 の characterization で確認した Markdown image の `data:` URL を、別変更で安全化する。
   - `a[href]` / `img[src]` の protocol allowlist と safe URL の回帰 test を追加する。
6. **Phase 5: Chromium の最小 E2E**
   - 手順書: 未作成（最小 Chromium E2E の計画作成後に `TESTING_PHASE_5.md` を追加する）。
   - ローカル mock API を使い、要約、結果表示、follow-up を 1 本の主要経路として
     確認する。
7. **リリース前の手動 smoke**
   - Chrome、Edge、Firefox で popup、results、options の基本フローを確認する。
   - Gemini/OpenAI の実 API は必要な場合に限り、この時点で手動確認する。

### 必要になってから導入する

- `chrome.storage` と `runtime` の最小 fake を使う integration test
- conversation 保存・復元、stream 中間表示など、実際に回帰した storage 連携の test
- popup / results / options の個別 DOM component test
- streaming、画像入力、service worker 再起動などの E2E 拡張
- real API smoke の自動化
- Firefox 専用の自動化

### 導入しない（当面）

- 一律の行・分岐カバレッジの合格基準
- `chrome.*` API 全体を再現する大規模 fake
- UI の細かな表示分岐すべての jsdom test
- 実 API を PR ごとに呼ぶ CI
- Edge / Firefox の広範な E2E 自動化

## 3. 最初の実装順序

以下を小さな変更として順番に導入する。各段階で `npm run lint` と、それまでに
追加したテストを通す。

1. **Phase 1: Vitest と最初の Unit test**
   - 手順: [`TESTING_PHASE_1.md`](./TESTING_PHASE_1.md)
   - `test/`、`npm test`、`npm run test:watch` を追加する。
   - 最初は `normalizeBaseUrl()`、`getModelConfigs()`、`getResponseContent()` を対象にする。
   - `jsdom` は DOM test 導入時に追加する。
2. **Phase 2: provider contract test**
   - 手順: [`TESTING_PHASE_2.md`](./TESTING_PHASE_2.md)
   - `fetch` を mock し、Gemini/OpenAI の non-streaming request/response を固定する。
3. **Phase 3: streaming / retry test**
   - 手順: [`TESTING_PHASE_3.md`](./TESTING_PHASE_3.md)
   - OpenAI SSE と Gemini streaming JSON の chunk 境界、`[DONE]`、malformed input を扱う。
   - 503 retry、429/503 による model fallback、成功後の終了を検証する。
4. **Phase 4: XSS と静的整合性**
   - 手順: [`TESTING_PHASE_4.md`](./TESTING_PHASE_4.md)
   - Markdown sanitize の代表 payload、manifest、locale を検証する。
   - 必要ならこの段階で `jsdom` を導入する。
5. **Phase 4a: Markdown URL protocol hardening**
   - 手順: [`TESTING_PHASE_4a.md`](./TESTING_PHASE_4a.md)
   - Phase 4 の characterization で確認した Markdown image の `data:` URL を安全化する。
   - safe URL、`javascript:`、`data:` の link / image 属性を回帰 test で検証する。
6. **Phase 5: 最小 Chromium E2E**
   - 手順書: 未作成（最小 Chromium E2E の計画作成後に `TESTING_PHASE_5.md` を追加する）。
   - unpacked extension とローカル mock server を使う 1 シナリオだけ追加する。

テストの追加に必要な抽出は、純粋関数化または `fetch` / `sleep` の小さな依存注入に
限定する。機能変更とリファクタリングは同じ変更に混在させない。

## 4. 最低限守るテストケース

| 対象 | 最低限のケース |
| --- | --- |
| Gemini | request の model/contents/system instruction、正常・blocked・HTTP error response |
| OpenAI 互換 | Base URL、Bearer request、message 変換、正常・異常 finish reason |
| streaming | 任意の chunk 分割、途中の JSON/SSE、完了、末尾 error |
| retry/fallback | 503 retry、非 503 では retry しない、次 model への移行、成功時停止 |
| Markdown | script、event handler、`javascript:` / `data:` URL、リンクの `rel` 属性、code block |
| static | manifest version、参照先ファイル、英語 locale と各 locale の key |
| E2E | 要約実行、結果表示、follow-up、会話の表示 |

新しいバグを修正したときは、再現可能であれば対応するテストを 1 件追加する。
「変更したから UI test を増やす」ではなく、「壊れた経路を二度と壊さない」ことを
判断基準にする。

## 5. テストデータと安定性の規則

- fixture に API key、Authorization header、個人情報、非公開 URL、実会話を入れない。
- 通常テストは実 API と外部サイトへ接続しない。
- 固定秒数の `sleep` を使わず、fake timer、event、condition、Playwright の自動待機を使う。
- テストごとに DOM、storage、mock、モジュール状態をリセットする。
- LLM の生成文章全体を完全一致で比較しない。mock response の構造と必要な表示だけを検証する。
- flaky な test は無期限 retry で隠さず、fixture、待機条件、ログを改善する。

## 6. CI とリリース運用

### PR または main への変更時

1. `npm run lint`
2. `npm test`

最小 E2E は、安定してから PR 必須にする。それまでは main またはリリース前に実行してもよい。

### リリース前

1. Chromium の最小 E2E
2. Chrome、Edge、Firefox の手動 smoke
3. 必要に応じて Gemini と代表的な OpenAI 互換 API の non-streaming / streaming 実 API 確認

実 API の確認では、空でない結果を得られることと stream が完了することだけを確認する。
文章品質や完全一致を合否にしない。

## 7. 拡張の判断基準

次のいずれかが起きたときだけ、詳細計画から追加する。

- 同種の回帰が 2 回起きた
- 手動確認が毎リリースで負担になった
- provider、streaming、storage の変更が大きくなった
- 対応ブラウザーや contributor が増えた

それまでは、テスト基盤そのものを育てるより、機能の品質と小さな回帰 test に時間を使う。
