# 実装計画：カスタムプロンプトでの出力言語指定 `{{languageName}}` プレースホルダ（第6版）

対象リポジトリ：[sh2/extension-summarize-translate-gemini](https://github.com/sh2/extension-summarize-translate-gemini)

- 起点：Chrome Web Store レビュー（Nhật Phương Nguyễn 氏、2026-10-15）の機能改善リクエスト2件目
- 作成日：2026-10-24
- 第2版：同日、セルフレビュー指摘を反映
- 第3版：同日、再レビュー指摘（`translate.js` の用途の訂正、文案の微修正）を反映
- 第4版：2026-10-25、レビュー指摘（空・不正な言語設定、言語の取得元、テスト範囲）を反映
- 第5版：2026-10-25、再レビュー指摘（worker テストのモック方式と完了待ち、`summarize` 非展開テストの検出力）を反映
- 第6版：2026-10-31、実装後のレビュー指摘で `options_language_notes` の文案を短文化した
- ステータス：T1・T2・T4、§5 の自動テスト、§11.3 の Wiki 更新、手動 QA（Chrome ＋ OpenAI 互換 API、ja / en / de）を完了（2026-10-31）。未確認は zz と空欄ケース、Gemini 経路、Firefox（§5 の表を参照）。残作業は §8 のリリース手順（バージョン更新、提出、タグ後の CHANGELOG、レビュー返信）

注：本ドキュメントはプロジェクト公式の計画文書である。AGENTS.md の規約に従い `docs/` 直下に置き、完了後に `docs/archive/` へ移すこと。

## 改訂履歴（レビュー反映）

第1版からの改訂点：

- R1：ロケールは「en/ja 先行＋フォールバック」を廃止し、**全15ロケール同時更新を必須** とした（整合性テストと、古い注記が残る問題のため）
- R2：CHANGELOG への追記を実装タスクから外し、**リリース時にタグ区間の diff から作成** する手順へ移した
- R3：コードスケッチ内のコメントを英語に統一した（本番コードのコメントは英語必須の規約）
- R4：テスト戦略を確定した。`utils.js` への純関数切り出しを前提とし、単体テストを書く
- R5：本書の位置づけ（個人用コピー／公式化する場合は docs/ へ Markdown 化）を明記した
- R6：見積もりを約3〜4時間から **約4〜5時間** に見直し、T3 はフェーズ2分離を既定とした

第3版の改訂点：

- R7：`utils/translation/translate.js` はストア説明文（`description_en.txt`）専用で `messages.json` は対象外だったため、T2 の翻訳手順を「14言語分を手作業／LLM 支援で作成」に訂正した
- R8：T2 の英語文案の微修正（"replaced with this language" → "replaced by the selected language"）
- R9：T2 の日本語文案の冒頭を、現行 ja 文言の表記「注意:」に統一した

第4版の改訂点：

- R10：空・不正な言語設定の動作を仕様化した。`userLanguage` が空、または言語コードが辞書にない場合は **置換しない**（`{{languageName}}` を残す）。併せて空プロンプト判定を置換前へ移し、「設定済みなのに未設定と表示される」誤分岐を防ぐ
- R11：置換先の言語は「保存済みの全体設定」ではなく **実行時のポップアップの Language 選択値** であることを明記し、QA・README・返信文の表現を修正した
- R12：テストに記法の大小文字・空白・再展開・空言語名を追加し、worker 境界のテスト（呼び出し忘れ検出）を新設した
- R13：`getSystemPrompt` を `Pure utilities` から `Core async logic` へ移す作業を T1 に含めた（軽微指摘）

第5版の改訂点：

- R14：worker 境界テストの方式を具体化した。`vi.mock` は **部分モック**（`importOriginal` を展開して対象 API だけを差し替え）とし、`applyLanguagePlaceholder` は実装本体を残す。完了待ちは `sendResponse` の Promise 化で行い、テストごとにモジュールキャッシュ・捕捉ハンドラ・`chrome` スタブをリセットする
- R15：`summarize` の非展開テストに検出可能な入力（`languageCode: "zz"` ＋ `userLanguage: "Test {{languageName}}"`）を指定した。既定値のままでは記法が埋め込まれず、全アクションへ置換を適用する回帰を検出できないため
- R16：T1 の空判定先行の根拠を「未設定判定と展開処理の責務分離」に修正した（現仕様ではヘルパーが空の言語名を置換しないため、置換の結果として空になる事象は発生しない）

第6版の改訂点：

- R17：T2 の文案が冗長（「効かない＋ただし書き」の二文）との指摘を受け、**目的 → 手段の一文**に短文化した。接頭辞「注意:（Note:）」は `options_language_notes` 以外のメッセージで使われておらず、プロジェクト共通の慣習ではないため外した。旧文案が持っていた「既定ではカスタムアクションに効かない」という情報は、目的を示す一文（“To apply … to custom actions”）で代替する
- R18：README の構成を利用者導線に合わせて組み替えた（H2 を Setup → Usage → FAQ → License、FAQ 内を Auto-fallback → Base URL → Reasoning → 出力言語 → Firefox の順に統一、Firefox の見出しを疑問文へ改名）。Wiki は README の写しでアンカーを見出しから生成するため、アンカーへの影響確認と Wiki の手動更新タスクを §11 に記録した
- R19：実装後の再レビューで 3 点を反映した。（1）README の空言語条件を「**User-specified language** is selected and left empty」に修正し、他言語選択時に空欄でも置換される事実と矛盾しない文にした。（2）§11.2 のリンク件数を「従来は 3 件、今回の追加で 4 件」に修正。（3）worker 境界テストが既定の Gemini・非ストリーミング経路のみを対象とすることを §5 に明記（`openai` とストリーミングの確認は手動 QA に委ねる）

## 1. 背景と目的

現状、全体設定の「Language」は要約・翻訳には効くが、カスタムアクション（Custom actions）には効かない。オプションページにも `options_language_notes` として「Note: This language setting does not affect custom actions.」と明記されている状態である。

本計画では、カスタムプロンプト中に `{{languageName}}` と書くと、実行時に Language の言語名（例：Japanese）へ置換される仕組みを追加する。ここで使う言語は、保存済みの全体設定ではなく **実行時にポップアップで選択されている値** である（§2・§3）。これにより：

- プレースホルダを書いたアクションだけが Language 選択に追従する（書かないアクションは無影響）
- 特定のアクションだけ別言語にしたければ、従来通り言語名を直接書けばよい
- 設定項目・保存形式（ストレージキー）は増やさない

対象外（スコープ外）：

- リクエスト1件目「カスタムアクションごとにモデルを設定する」は、設定・保存・テストの複雑さが増大し、シンプルさを維持する方針と相反するため、本計画では扱わない（GitHub Issue で要望として記録し、需要を見て再検討する）。
- `{{languageName}}` 以外のプレースホルダ（モデル名など）は追加しない。汎用テンプレート化はしない。
- 組み込みアクション（要約・翻訳）で言語コードが辞書にない場合に、プロンプトへ `undefined` が入る既存の問題は、本変更のスコープ外とし、別 Issue で扱う（§7）。

## 2. 決定済み仕様

| 項目 | 仕様 |
| --- | --- |
| プレースホルダ記法 | `{{languageName}}`（完全一致、大文字小文字を区別する。空白ありの `{{ languageName }}` は受け付けない） |
| 置換先の値 | **実行時の Language 選択値**（ポップアップの `languageCode`。`popup.js` が実行時に読み、worker へ渡す）に対応する `languageNames` の値。ユーザー指定（`zz`）の場合は保存済み `userLanguage`。保存済み設定は、ポップアップで選択を変えていなければそのまま使われる（R11） |
| 言語名が空・不正な場合 | 置換しない（`{{languageName}}` をそのまま残す）。`undefined` や空文字をプロンプトへ埋め込まない。空判定は `trim()` 後に行う（R10） |
| 空プロンプトの判定 | 置換前の生プロンプトで行う。未設定判定（フォールバック文言の選択）と展開処理を分離し、順序への暗黙依存を作らない（R10・R16） |
| 複数回の出現 | すべて置換する（`replaceAll`） |
| 未知のプレースホルダ | `{{foo}}` などはそのまま残す（エラーにしない） |
| エスケープ | 実装しない。リテラルとして書きたい場合は全角の「｛｛languageName｝｝」で代替する旨をドキュメントに記載する |
| 置換対象 | 保存されたカスタムプロンプトのみ。Web ページ本文・選択テキスト・API 応答には展開しない |
| 後方互換 | プレースホルダを含まない既存プロンプトの動作は一切変わらない。保存データのマイグレーションなし |
| ロケール対応 | 文言変更は全15ロケールを同時に更新する（R1 で確定。フォールバック頼みは不可） |
| テスト方式 | 置換は純関数として `utils.js` に切り出して単体テストを書き（R4）、worker 境界のテストで呼び出しを検証する（R12） |

## 3. 現行コードとプロジェクト規約の前提（調査済み）

- `extension/service-worker.js`（全366行）の冒頭「Pure utilities」に `getSystemPrompt(actionType, mediaType, languageCode)` があり、`languageNames` 辞書を関数内に保持している。ただし同関数は `chrome.storage.local` を読むため、`Pure utilities` の定義（DOM も副作用も持たない）には厳密には反している（既存の配置問題。T1 で `Core async logic` へ移す）
- カスタムプロンプトは `noTextCustom1〜3` / `textCustom1〜3` の6分岐で `chrome.storage.local` から取得し、そのまま `systemPrompt` として使われている（Language が効かないのはこの構造のため）
- `getSystemPrompt` の呼び出し箇所は1箇所のみ（service-worker.js 221行付近）。結果は `apiContents` としてセッションに保存され、追質問（`results.js` の `askQuestion`）ではその保存済み内容が再利用されるため、置換は初回リクエスト生成時に1回行えば一貫する
- **言語の取得元（R11）**：生成時の `languageCode` は、`popup.js` が実行時に `document.getElementById("languageCode").value` で読み（`popup.js:459`）、`generate` メッセージで worker へ渡す（`popup.js:527–534`）。ポップアップの言語セレクトは起動時に `chrome.storage.local` から復元される（`popup.js:686–712`）が、選択変更を保存するリスナーはない。したがって保存設定と実行時の選択は異なりうる
- **空・不正な言語設定（R10）**：`userLanguage` は入力検証なしで保存される（`options.js:467`）。`chrome.storage.local.get({ userLanguage: "Turkish" })` の既定値はキー未保存時のみ効くため、空文字列が保存されていると `languageNames["zz"]` は `""` になる。また、辞書にないコード（旧バージョンで保存された値など）では `undefined` になる。いずれも現状はテンプレートリテラルへそのまま埋め込まれる
- `utils.js` のセクションは `UI helpers` / `Extension helpers` / `LLM APIs` の3つ。純粋な文字列ヘルパーは `Extension helpers`（`resolveSelectValue` や `normalizeBaseUrl` と同種の置き場所）に置く
- service-worker.js はモジュール読み込み時にリスナー登録などの副作用があるため、`chrome` のスタブなしでは単体テストから import できない。これが `getSystemPrompt` に単体テストが存在しない理由であり、純関数を切り出す根拠である。`chrome` を一通りスタブすれば import 自体は可能で、worker 境界のテストはその方式をとる（§5）
- Firefox 版は `firefox/manifest.json` のみで、コードは共通。実装は1箇所で済む。バージョン更新時は `extension/manifest.json` と `firefox/manifest.json` の両方を揃える（現行は両方とも 1.8.23）
- **ロケール整合性**：`test/static/extension-integrity.test.js` が「全ロケールのキーが en と完全一致すること」を検証する。新規キーの追加は全ロケール同時が必須。既存キーの文言変更ではテストは通るが、未更新ロケールには古い文言がそのまま残る（キーが存在する限り Chrome のフォールバックは発動しない）
- **翻訳の自動化について**：`utils/translation/translate.js` はストア説明文（`description_en.txt`）を他14言語へ翻訳する専用スクリプトであり、`messages.json` は対象外である。ロケールの文言翻訳に流用できる既存の自動化はリポジトリにないため、T2 では1文を14言語分、手作業／LLM 支援で用意する。ロケール編集時は AGENTS.md の Localization guidelines（カタカナ長音「ー」の統一、CJK では全角括弧など）にも従う
- **コメント言語**：本番コード内のコメントは英語必須。`if` 等の制御文には必ずブロック `{}` を付ける
- **CHANGELOG 規約**：タグ（`vX.Y.Z`）単位で、リリース時にタグ区間のコミットと diff から作成する。`## [Unreleased]` 運用はしていない。ヘッダは `## [X.Y.Z] - YYYY-MM-DD` ＋ GitHub リリースへのリンク参照、セクションは `Added` / `Changed` / `Fixed` を使う
- テスト基盤：Vitest（`test/unit` / `test/contract` / `test/static`）、E2E は Playwright（`e2e/specs`、リリース前と main で実行、PR 必須ではない）

## 4. 実装タスク

### T1 必須 — 置換処理の追加（utils.js ＋ service-worker.js）

決定（R4・R10）：置換は純関数として `utils.js` の `Extension helpers` セクションに切り出し、`getSystemPrompt` の分岐合流地点で、カスタムアクションの場合にのみ呼び出す。6分岐すべてに置換を書かない。

```js
// extension/utils.js — Extension helpers
export const applyLanguagePlaceholder = (prompt, languageName) => {
  const name = typeof languageName === "string" ? languageName.trim() : "";

  // Leave the placeholder untouched when no usable language name is available.
  if (!name) {
    return prompt;
  }

  return prompt.replaceAll("{{languageName}}", () => name);
};

// extension/service-worker.js — in getSystemPrompt, after the action branches
if (!systemPrompt) {
  systemPrompt = `Respond to the user in ${languageNames[languageCode]} that no custom action is set. ` +
    "Do not process any data after this.";
} else if (actionType.includes("Custom")) {
  systemPrompt = applyLanguagePlaceholder(systemPrompt, languageNames[languageCode]);
}
```

- service-worker.js 冒頭の `./utils.js` からの import に `applyLanguagePlaceholder` を追加する
- **空判定を置換の前に置く**（R10・R16）：現行の `if (!systemPrompt)` は分岐の後ろにある。本仕様ではヘルパーが空の言語名を置換しないため「置換の結果として空になる」ことは起きないが、未設定判定（フォールバック文言の選択）と展開処理を分離しておくと、順序への暗黙依存がなくなり、将来ヘルパーの仕様を変えたときにも誤分岐しない
- **空・不正な言語名は置換しない**（R10）：`languageNames[languageCode]` が `undefined`（辞書にないコード）や空白のみ（`userLanguage` が空で保存されている場合）なら、`{{languageName}}` を残す。`undefined` を文字列として埋め込まない
- 置換文字列に関数形 `() => name` を使うこと。通常の文字列を渡すと、置換先に含まれる `$&` や `$$` などの並びが特殊解釈される。固定辞書は無縁だが、`userLanguage` は自由入力のため、関数形でリテラルに差し込む
- `replaceAll` は1パス処理なので、置換後の値に `{{languageName}}` が含まれても再展開されない
- `trim()` 後の値を置換に使う（`userLanguage` の前後空白を除去する。保存値自体は変更しない）
- 併せて `getSystemPrompt` を `Pure utilities` から `Core async logic` へ移す（R13）。移動後も Event listeners より前で定義されるため、AGENTS.md の並び順規約は満たす
- コードコメントは英語のみ、制御文にはブロック `{}` を付ける（プロジェクト規約）

### T2 必須 — オプションページ注記の更新（全15ロケール）

- 既存キー `options_language_notes` の文言を、全15ロケール（`extension/_locales/`）で同時に変更する（キー自体は流用し、新規キーを増やさない）
- 変更前：「Note: This language setting does not affect custom actions.」
- 変更後（第6版・確定）：「To apply this language setting to custom actions, write {{languageName}} in the custom prompt.」／ 日本語：「この言語設定をカスタムアクションに適用するには、カスタムプロンプトに {{languageName}} と記述します。」（接頭辞なし。R17）
- 手順：en の新文言を確定 → 他14言語分を手作業／LLM 支援で作成する（流用できる既存スクリプトはない。`translate.js` はストア説明文専用） → ja は手元で確認・調整 → 全ロケールで旧文言の意味が残っていないかキー単位で横断確認 → `npm test` で整合性テストを通す
- ~~まず en / ja を更新し、他言語はフォールバックに任せる~~（第1版の案。キーが存在する限りフォールバックは発動せず、古い＝虚偽の注記が残るため廃止）

### T3 フェーズ2 — カスタムアクション欄へのヒント追加

- 初回リリースには含めない（第2版で既定を分離に変更）。実施する場合は次を守ること：
- 新規 i18n キーは **全15ロケールへ同時に追加** しないと整合性テストが落ちる。翻訳分だけ作業が膨らむのが分離の理由
- 低コストな代替として、`noTextCustomPrompt1` / `textCustomPrompt1` の textarea の `placeholder` 属性（英語ハードコード、i18n 不要）に `{{languageName}}` を使った例文を追加する案は、フェーズ1に含めるか別途判断する（§7）

### T4 必須 — README への記載

- FAQ に項目を追加する（案：「How do I set the output language for Custom actions?」）
- 記載内容：記法、Language 選択に追従すること、例文（「〇〇をして、結果を {{languageName}} で返信してください」相当の英語例）、エスケープ未対応と全角での代替、未知のプレースホルダはそのまま残ること
- 言語の取得元は「保存済み設定」ではなく **実行時のポップアップの Language 選択** だと分かる文言にする（例：「the language currently selected in the popup's Language menu, which defaults to your saved Language setting」）。保存設定だけが反映されると読める表現にしない（R11）
- ユーザー指定言語（`zz`）が空のままの場合は置換されず、`{{languageName}}` がそのまま送られることを明記する（R10）
- 配置は、FAQ の末尾側（出力言語の項目を Reasoning の後、Firefox の項目の前）とし、H2 は Setup → Usage → FAQ → License の順にする（R18・§11.1）

（第1版の T5「CHANGELOG に Unreleased で追記」は廃止し、§8 のリリース手順へ移した。）

## 5. テスト計画

### 単体テスト（`test/unit/utils.test.js` に追加）

| ケース | 期待結果 |
| --- | --- |
| プレースホルダ1箇所 | 言語名に置換される |
| プレースホルダ複数箇所 | すべて置換される |
| プレースホルダなし | 入力がそのまま返る |
| `{{LanguageName}}`（大文字小文字違い） | 置換されない（R12） |
| `{{ languageName }}`（空白あり） | 置換されない（R12） |
| 未知の `{{foo}}` | そのまま残る |
| 言語名に `$&` を含む値（userLanguage 想定） | `$` 並びが解釈されずリテラルに差し込まれる |
| 置換先に `{{languageName}}` を含む値 | 再展開されない（`replaceAll` の1パス処理であること）（R12） |
| 言語名が空文字列 / 空白のみ | 置換されず、入力がそのまま返る（R10・R12） |
| 言語名が `undefined` / 非文字列 | 置換されず、入力がそのまま返る（R10・R12） |
| プロンプトが空文字列 | 空文字列が返る（`getSystemPrompt` 側の空判定は置換前に行うため影響しない） |

### worker 境界テスト（`test/unit/service-worker-generate.test.js` を新設）

純関数のテストだけでは、worker 側の呼び出し忘れや分岐位置の誤りを検出できないため、生成メッセージの入口から検証する（R12）。

- `vi.mock` は **部分モック** にする（R14）。`importOriginal` で実モジュールを展開し、`generateContent` / `streamGenerateContent` / `getResponseContent` / `getModelConfigs` / `getOrCreateOpenCodeSessionId` / `createContextMenus` だけを `vi.fn()` に差し替える。`applyLanguagePlaceholder` は **実装本体を残す**（モジュール全体の自動モックにすると新ヘルパーもモックされ、置換そのものを検証できない）

```js
vi.mock("../../extension/utils.js", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    getModelConfigs: vi.fn(() => ({})),
    generateContent: vi.fn(async () => ({ ok: true, status: 200, body: {} })),
    streamGenerateContent: vi.fn(async () => ({ ok: true, status: 200, body: {} })),
    getResponseContent: vi.fn(() => "response"),
    getOrCreateOpenCodeSessionId: vi.fn(async () => "session"),
    createContextMenus: vi.fn(async () => {})
  };
});
```

- `globalThis.chrome` に以下を用意する：`runtime.onMessage.addListener`（ハンドラを捕捉）、`runtime.onStartup` / `runtime.onInstalled` / `storage.local.get` / `storage.session.get` / `storage.session.set` / `i18n.getMessage`。`chrome.commands` と `chrome.contextMenus` は未定義にしてガード節を通す
- スタブ設定後に `await import("../../extension/service-worker.js")` してから、捕捉したハンドラへ `{ message: "generate", ... }` を渡す
- **完了待ち**（R14）：`onMessage` のハンドラは非同期処理を内部で開始して `true` を返すだけで、戻り値は Promise ではない。`await listener(...)` では生成完了を待てないため、`sendResponse` を Promise 化して待ってから検証する。併せて、ハンドラの戻り値が `true`（非同期応答を維持する）であることも確認する

```js
const runGenerate = (listener, request) => new Promise((resolve) => {
  const keptChannelOpen = listener(request, {}, resolve);

  expect(keptChannelOpen).toBe(true);
});

const response = await runGenerate(listener, { message: "generate", ... });

expect(response.ok).toBe(true);
```

- 検証内容：
  - `actionType: "noTextCustom1"` かつ `taskInput` に同じ記法を含むケースで、保存された `requestApiContent` の system パートだけが展開され、user パート（入力本文）は原文のまま残ること
  - `actionType: "summarize"` ではプレースホルダが展開されないこと（R15）。組み込みプロンプトには既定では記法が現れないため、`languageCode: "zz"` と `userLanguage: "Test {{languageName}}"` を組み合わせる。組み込みプロンプトには `in Test {{languageName}}.` が埋め込まれるので、誤って全アクションへ置換を適用すると `in Test Test {{languageName}}.` となり検出できる。`Test {{languageName}}` がそのまま残り、`Test Test` を含まないことを検証する
  - `languageCode: "zz"` かつ保存済み `userLanguage` が空文字列のとき、`{{languageName}}` が残り、未設定フォールバックの文言へ分岐しないこと（R10）
- 後始末（R14）：各テストの前に `vi.resetModules()` でモジュールキャッシュを破棄し、`vi.clearAllMocks()` と `globalThis.chrome` スタブの再構築を行う。捕捉したハンドラは import ごとに作り直し、前のテストのリスナーが残らないようにする
- **経路カバレッジの限界（R19）**：このテストが通すのは既定の Gemini・非ストリーミング経路のみ。`apiProvider: "openai"` とストリーミング経路は §11.5 のとおり手動 QA で確認する。置換はプロバイダ分岐より前段の単一呼び出し箇所にあるため、経路差による回帰リスクは低いと判断する

### 静的テスト・Lint

- `npm run lint`（ESLint）と `npm test`（Vitest）が通ること
- `test/static/extension-integrity.test.js`：ロケールのキー整合（T2 後も全ロケール一致）が通ること
- `test/static/options-structure.test.js` がオプションページ構造を見ているため、HTML 構造を変える変更（T3）ではそちらの期待値も確認する。T2 は文言のみで構造変更なし
- プロバイダ両経路の確認（AGENTS.md の Validation）：`apiProvider: "gemini"` と `"openai"` の両方で動作すること

### 手動 QA マトリクス（実機確認）

2026-10-31 に **Chrome ＋ OpenAI 互換 API**、Language は **ja / en / de** で確認し、期待どおり動作することを確認した。ユーザー指定言語（zz）とその空欄ケース、Gemini 経路、Firefox は未確認。

| 確認項目 | 結果 |
| --- | --- |
| カスタムアクションで置換が効く（アクション種別の内訳は記録なし） | 確認（OpenAI 互換 API） |
| Language の切り替えに追従する | 確認（ja / en / de） |
| Gemini 経路でも置換が効く | 未確認 |
| ユーザー指定言語（zz）に切り替えて追従する | 未確認 |
| 保存設定とは異なる言語をポップアップで選択したとき、その選択値が反映される（再起動で保存値に戻ることを含む。R11） | 未確認 |
| ユーザー指定言語（zz）を空にして実行し、`{{languageName}}` が残り、「カスタムアクションが設定されていません」が出ない（R10） | 未確認 |
| `{{LanguageName}}` や `{{ languageName }}` は置換されない | 未確認（単体テストで担保） |
| プレースホルダなしの既存プロンプトで従来通り動作する（回帰なし） | 未確認 |
| 空のカスタムプロンプトで「カスタムアクションが設定されていません」相当のフォールバック文言が出る | 未確認 |
| 結果ページからの追質問でも、初回と同じ言語で応答が返る | 未確認 |
| 要約・翻訳（組み込みアクション）に影響がない | 未確認（`summarize` の非展開は worker 境界テストで担保） |
| Firefox で動作する | 未確認 |

E2E（Playwright）は PR 必須チェックではなく、main およびリリース前に実行する位置づけ（AGENTS.md）。本機能では手動 QA を正とし、必要ならモック応答での spec を追加する。

## 6. セキュリティ確認事項

- **信頼境界を越えない**：置換値は固定辞書＋ユーザー本人の設定値のみ。入力元も本人の保存済みプロンプトのみで、第三者の入力が混入する経路はない
- **既存パターンと同じ**：組み込みプロンプトは既に `languageNames[languageCode]`（zz を含む）を直接埋め込んでおり、新しい露出は増えない
- **実行・描画面**：文字列置換のみで評価（eval 等）は行わない。行き先は API リクエストのテキストであり、HTML 描画経路（XSS）には入らない
- **秘密情報を出さない**：プレースホルダは `{{languageName}}` のみとし、API キー等を出すプレースホルダは将来も作らない
- **`undefined` を埋め込まない**：言語名が解決できない場合は置換せず、`"undefined"` や空文字をプロンプトへ流さない（R10）
- ページ本文からのプロンプトインジェクションは従来からの別論点であり、本変更で悪化しない（置換はプロンプト側にのみ適用）

## 7. 未決定事項

第1版の未決定事項のうち、ロケール範囲（→ 全ロケール必須）とテスト方式（→ 切り出し＋単体テスト）は第2版で決定済み、空・不正な言語設定の扱い（→ 置換しない）は第4版で決定済みとした。残りは次の3点のみ：

1. textarea の placeholder 例文に `{{languageName}}` 版を追加するか（フェーズ1に含めるか）
2. T3（カスタムアクション欄へのヒント）の実施時期（フェーズ2の開始条件）
3. `userLanguage` を空のまま保存できる現行仕様（`options.js` は無検証）に、入力必須などのバリデーションを足すか。本計画では「空なら置換しない」で受け止め、バリデーション追加と、組み込みアクションの `undefined` 埋め込み（§1 対象外）は別 Issue として扱う

## 8. リリース手順（CHANGELOG を含む）とレビュー返信

1. T1・T2・T4 を実装し、§5 のテストを完了する（実施済み）。README の構成変更と Wiki 更新の要否は §11 を参照
2. バージョンを更新する：`extension/manifest.json` と `firefox/manifest.json` の両方（現行 1.8.23 の次、1.8.24 想定）
3. Chrome Web Store / Edge Add-ons / Firefox Add-ons へ提出する
4. **タグ後に** CHANGELOG を作成する（実装中には編集しない）。手順は AGENTS.md の Changelog 節に従う：
   - `git log` で `vPREV..vNEW` のコミットを集め、`git diff vPREV..vNEW -- extension/` で利用者向けの変更を確認する
   - ヘッダは `## [X.Y.Z] - YYYY-MM-DD`（タグの日付）＋ GitHub リリースへのリンク参照。セクションは `Added` 等を使い、`chore:` のバージョンバンプと `docs:` は含めない
   - 文案：「Custom action prompts now support the {{languageName}} placeholder, which is replaced by the language currently selected in the popup's Language menu.」
5. 公開後、Nguyễn 氏のレビューへ返信する。2番については「検討」ではなく実装済みとして伝えられる文面にする

返信文（2番の段落・更新案）：

> Regarding the output language: custom prompts now support the `{{languageName}}` placeholder. For example, if you write "…and reply in {{languageName}}", it is replaced with the language currently selected in the popup's Language menu (the saved Language setting is used by default), so each custom action can either follow the selection or name a language directly in the prompt.

## 9. リスクとロールバック

- **綴り間違いの静かな失敗**：`{{languagName}}` のような誤記は置換されずに残る。形式側では防げないため、緩和策はドキュメントと完成例のコピペ導線のみ（§T2・T4）
- **注記文の意味の反転**：`options_language_notes` は従来「効かない」という説明だったため、1ロケールでも更新漏れがあると、その言語では虚偽の注記が残る。T2 の横断確認と整合性テストで防ぐ（R1 の対象）
- **翻訳品質**：14言語分の文言は手作業／LLM 支援で用意するため、言語ごとに品質のばらつきが出やすい。CJK の全角括弧や長音などの Localization guidelines と照らして最低限の目視確認を行う
- **空設定時に置換されない**：`userLanguage` が空のまま保存されていると、プレースホルダは残る。エラーにはならないが、利用者には「効いていない」ように見える。README に明記し、§7 のバリデーション検討と併せて扱う（R10）
- **言語の取得元の誤解**：保存設定を変えただけで反映されると誤解されやすい（実際は実行時のポップアップ選択値）。T2・T4 の文言で「選択中の言語」と説明し、QA で差異を確認する（R11）
- ロールバックは容易：変更範囲は置換処理・文言・ドキュメントに限られ、保存データには手を入れていないため、前バージョンへ戻しても利用者データに影響しない

## 10. 作業見積もり（目安・第4版）

| 作業 | 目安 |
| --- | --- |
| T1 置換処理（utils.js 切り出し、空判定の移動、関数のセクション移動、単体テスト含む） | 1.5〜2時間 |
| worker 境界テストの新設（`test/unit/service-worker-generate.test.js`） | 1時間 |
| T2 ロケール文言の更新（全15ロケール、14言語分を手作業／LLM 支援で作成＋確認） | 1〜1.5時間 |
| T4 README | 0.5時間 |
| 手動 QA（2ブラウザ × マトリクス。空設定・実行時選択の確認を含む） | 1.5時間 |
| **合計（フェーズ1）** | **約5.5〜6.5時間** |
| T3 ヒント追加（フェーズ2・別途。新規キーの15ロケール対応を含む） | 約1〜1.5時間 |
| 実装後の追加作業（README 構成変更、注記の短文化、アンカー確認。Wiki 更新は別途） | 約0.5〜1時間 |

## 11. 実装後の追加作業（2026-10-31）

T1・T2・T4 と §5 の自動テストを実装した後、レビューを経て次の作業を追加で行った。計画当初のタスクではないため、ここに記録する。

### 11.1 README の構成変更（R18）

利用者導線に合わせて H2 と FAQ 内の順序を組み替えた。本文・画像リンク・コード記法は無変更で、移動と 1 見出しの改名のみ。

| 位置 | 変更前 | 変更後 |
| --- | --- | --- |
| H2 の順 | FAQ → Setup → Usage → License | Setup → Usage → FAQ → License |
| FAQ 1 | Pop-up windows are not appearing …（Firefox） | What is Auto-fallback? |
| FAQ 2 | What is Auto-fallback? | How do I set up an OpenAI-compatible Base URL? |
| FAQ 3 | How do I set up an OpenAI-compatible Base URL? | What are Reasoning effort and Thinking type? |
| FAQ 4 | What are Reasoning effort and Thinking type? | How do I set the output language for Custom actions? |
| FAQ 5 | （今回の追加時点で末尾）How do I set the output language … | Why don't pop-up windows appear from the context menus in Firefox? |

- 根拠：Setup の手順 4（API キー登録）が Usage の前提であること。加えて FAQ の項目はどれもオプションページの設定説明なので、Setup の直後に置く方が文脈が揃う。Firefox の項目は「問い合わせが散見された時期に先頭へ置いたもの」であり、現在は常時先頭に置く必要がない
- 見出しの統一：Firefox の項目だけ叙述文だったため、疑問文（`Why don't pop-up windows appear …?`）に変更し、FAQ 全体を疑問文で揃えた

### 11.2 アンカーリンクへの影響確認

`extension/options.html` は Wiki のアンカーへリンクしている（従来は 3 件、今回 `options_language_notes` への追加で 4 件）。Wiki は README の写しで、アンカーは見出し文言から生成される。

| リンク元 | アンカー | 対象見出しの変更 | 結果 |
| --- | --- | --- | --- |
| `options.html:71` | `#what-is-auto-fallback` | なし | 有効 |
| `options.html:95` | `#how-do-i-set-up-an-openai-compatible-base-url` | なし | 有効 |
| `options.html:131` | `#what-are-reasoning-effort-and-thinking-type` | なし | 有効 |
| `options.html:148`（今回追加） | `#how-do-i-set-the-output-language-for-custom-actions` | 新規（今回の FAQ 項目） | 有効（2026-10-31 の Wiki 更新で解決） |

- 並び順の変更はアンカーの値を変えない（見出し文言が同じため）
- Firefox 見出しの改名により、Wiki 側のアンカーは `#pop-up-windows-are-not-appearing-from-the-context-menus-in-firefox` から `#why-dont-pop-up-windows-appear-from-the-context-menus-in-firefox` へ変わる。リポジトリ内に旧アンカーへの参照はないが、外部から旧アンカーへリンクしている場合は切れる
- 今回 `options_language_notes` にも「Extension FAQ」リンク（4 件目）を追加した。他の 3 件と同じ `field-hint` パターン（`<span data-i18n>` ＋ `<a>`）で、リンク文言は既存と同じハードコード英語。リンク先の見出しは §11.3 の Wiki 更新で追加済みで、アンカーは解決する

### 11.3 Wiki（リポジトリ外）の手動更新タスク — 完了（2026-10-31）

Wiki `Home` は README の写しのため、リポジトリの変更だけでは追従しない。プッシュ前に手動で反映した。

1. FAQ 内の並びを README と同じ順に並べ替えた（Wiki は FAQ のみの構成で、H2 の Setup / Usage は存在しないため対象外）
2. 新規項目「How do I set the output language for Custom actions?」を追加した。`options.html:148` のリンク先アンカー `#how-do-i-set-the-output-language-for-custom-actions` はこれにより有効になった
3. Firefox 見出しの改名と、それに伴うアンカーの変化を反映した
4. 既存のズレを解消した（DeepSeek のモデル ID と Reasoning の対応表）

確認内容（公開済みページの取得結果）:

- Raw `Home.md`（105 行）の見出し順が README と一致
- README の FAQ 部分との本文差分は**画像 URL のみ**（`img/…` → `user-attachments`）。モデル ID のズレも解消済み
- 公開 HTML の見出し id に `how-do-i-set-the-output-language-for-custom-actions` / `why-dont-pop-up-windows-appear-from-the-context-menus-in-firefox` が存在し、`options.html` のリンクが解決する
- R19 の README 修正（空言語条件の追記）後に再同期し、README の FAQ 部分との**非画像差分が 0** であることを確認した（2026-10-31）

### 11.4 オプションページ注記の短文化（R17）

T2 で入れた文案は「効かない＋ただし書き」の二文で冗長との指摘を受け、目的 → 手段の一文へ変更した。併せて接頭辞「注意:（Note:）」を全 15 ロケールで外し、`options.html` の i18n フォールバック文言も同じ英文へ揃えた。文案は R17 と T2 を参照。

### 11.5 追加作業後の検証

| 項目 | 結果 |
| --- | --- |
| `npm run lint` | エラーなし |
| `npm test` | 17 ファイル / 178 テスト成功（`extension-integrity` のロケールキー整合を含む） |
| `README.md` の Markdown 診断 | エラーなし |
| §5 の手動 QA マトリクス | 完了（2026-10-31。Chrome ＋ OpenAI 互換 API、ja / en / de で確認。zz と空欄、Gemini 経路、Firefox は未確認） |
| §11.3 の Wiki 更新 | 完了（2026-10-31。公開ページの見出し id でアンカー解決を確認） |

## 受け入れ基準

- [ ] §2 の仕様表どおりに置換が動作する
- [ ] §5 の単体テスト・worker 境界テスト・静的テスト・手動 QA がすべて通る（ロケール整合性テストを含む）
- [ ] 言語名が空・不正な場合に `{{languageName}}` が残り、`undefined` が埋め込まれず、未設定フォールバックへ誤分岐しない
- [ ] worker 境界テストで、カスタムプロンプトの system パートだけが展開され、入力本文の同じ記法が残ることが確認できている（`applyLanguagePlaceholder` は実装本体を通す部分モックで検証する）
- [ ] `summarize` の非展開テストが、`languageCode: "zz"` と `userLanguage: "Test {{languageName}}"` の組み合わせで、全アクション適用の回帰を検出できる入力を含んでいる
- [ ] `getSystemPrompt` が `Core async logic` セクションへ移動している
- [ ] 全15ロケールの `options_language_notes` が新しい意味に更新され、古い文言が残っていない
- [ ] プレースホルダなしの既存利用に回帰がない
- [ ] README・オプションページ注記の説明が矛盾していない（CHANGELOG はリリース時に作成される）
- [ ] README が「保存済み設定だけが反映される」と読める表現になっていない
- [ ] README の H2 が Setup → Usage → FAQ → License の順で、FAQ 内の並びが §11.1 のとおりになっている
- [ ] `options.html` が参照する 3 アンカーの対象見出し文言が変わっていない（§11.2）
- [ ] `options.html` の `options_language_notes` から FAQ へのリンクが表示され、Wiki 側の同名見出しへ遷移する
- [ ] Wiki の手動更新（§11.3）をリリース前に完了している
- [ ] 追加したコードのコメントがすべて英語で、制御文にブロック `{}` がある
- [ ] 対象外とした「アクションごとのモデル設定」を実装していない
