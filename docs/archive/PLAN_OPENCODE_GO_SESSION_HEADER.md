# OpenCode Go `x-opencode-session` ヘッダー対応 調査と実装方針

- 状態: 実装済み
- 作成日: 2026-10-10
- 実装日: 2026-10-10
- 更新日: 2026-10-10 (公式クライアントのセッション ID 生成アルゴリズムを追記、レビュー反映: セッション ID のライフサイクル、共通ヘルパー `getOrCreateOpenCodeSessionId()` と 3 関数の export、公開 API の省略可能引数化、User-Agent / CORS 記述の訂正、テストは unit / static / contract 中心に配置)
- 関連 Issue: [#51](https://github.com/sh2/extension-summarize-translate-gemini/issues/51)
- 影響範囲: `extension/utils.js`, `extension/popup.js`, `extension/service-worker.js`, `extension/results.js`, `test/contract/`, `test/unit/`, `test/static/`, `test/helpers/` (`chrome.storage` モックに `get()` を追加)

## 1. 背景

OpenAI互換APIで OpenCode Go (`https://opencode.ai/zen/go/v1`) を使うと、次の 400 エラーが出るようになった。

```text
Error: 400
Request is missing x-opencode-session and cannot be routed efficiently.
Please see https://opencode.ai/docs/go/#where-can-i-use-it
```

原因は OpenCode Go 側がリクエストヘッダー `x-opencode-session` を要求するようになったため。
本ドキュメントはヘッダーの仕様を整理し、本拡張機能への実装方針と実装結果をまとめたものである。

## 2. 仕様調査

### 2.1 公式ドキュメントの要件

公式ドキュメント ([opencode.ai/docs/go](https://opencode.ai/docs/go/)) の「どこで使用できますか?」セクション (最終更新 2026-10-08) によると、OpenCode Go はコーディングエージェント向けのサービスであり、クライアントは以下を満たす必要があるとされている。

1. 一般的なコーディングエージェントのトラフィックを送信する。
2. 汎用的な SDK 名や HTTP ライブラリ名ではなく、`my-coding-agent/1.0` のような独自の User-Agent で自身を識別する。
3. ルーティングとプロンプトキャッシュを最適化できるよう、**会話ごとに安定したセッション ID を `x-opencode-session` で送信する**。

### 2.2 公式クライアント (OpenCode 本体) の送信ヘッダー

OpenCode 本体のソースコード (`packages/opencode/src/session/llm/request.ts`) では、プロバイダー ID が `opencode` で始まる場合 (OpenCode Go / Zen 経由) に次のヘッダーを送っている。

| ヘッダー | 値 |
| --- | --- |
| `x-opencode-session` | セッション ID (`ses_` で始まる文字列、例: `ses_206f84f18ffeZ6hhD7pFYAiW5T`)。**加工なしのセッション ID そのもの**で、`x-opencode-session-id` と同値 |
| `x-opencode-session-id` | 同上 (互換用の別名) |
| `x-opencode-parent-session-id` | 親セッション ID (存在する場合のみ) |
| `x-opencode-project` | プロジェクト ID |
| `x-opencode-request` | リクエスト (ユーザーメッセージ) ID |
| `x-opencode-client` | クライアント種別 |
| `User-Agent` | `opencode/<バージョン> ...` |

OpenCode 以外のプロバイダー向けには `x-session-affinity` と `X-Session-Id` にセッション ID を設定している。

### 2.3 セッション ID の生成アルゴリズム (公式クライアント)

`x-opencode-session` の値は加工なしのセッション ID そのものである (`2.2` のとおり `x-opencode-session-id` と同値)。その ID は `packages/schema/src/session-id.ts` と `packages/schema/src/identifier.ts` で生成される。以下は**要点を抜き出した抜粋であり、公式コードそのままではない** (`Schema.brand` / `statics` / 引数チェック等は省略)。

```ts
// packages/schema/src/session-id.ts
export const SessionID = Schema.String.check(Schema.isStartsWith("ses")).pipe(
  Schema.brand("SessionID"),
  statics((schema) => {
    const create = () => schema.make("ses_" + descending())
    return { create, descending: (id?) => (id === undefined ? create() : schema.make(id)) }
  }),
)
```

```ts
// packages/schema/src/identifier.ts
const length = 26
const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
let lastTimestamp = 0
let counter = 0

export function ascending() { return create(false) }
export function descending() { return create(true) }

export function create(descending: boolean, timestamp = Date.now()) {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp
    counter = 0
  }
  counter++

  const current = BigInt(timestamp) * 0x1000n + BigInt(counter)
  const value = descending ? ~current : current
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("")
  const bytes = crypto.getRandomValues(new Uint8Array(length - 12))
  return time + Array.from(bytes, (byte) => chars[byte % 62]).join("")
}
```

| 要素 | 内容 |
| --- | --- |
| プレフィックス | `ses_` |
| 本体長 | 26 文字 (`ses_` を含めると 30 文字) |
| 先頭 12 文字 (6 バイト) | `~(Date.now() * 4096 + 同一ミリ秒内カウンター)` の**下位 48bit** を、bit 40 から 8bit ずつ 6 バイト取り出して hex 化したもの。`descending` ではビット反転 (`~`) を使うため、新しい ID ほど辞書順で前に並ぶ |
| 残り 14 文字 | `crypto.getRandomValues` で得た各バイトを `% 62` で base62 文字 (`0-9A-Za-z`) に写像したランダム部 |
| 一意性 | 時刻 + ミリ秒内カウンター + ランダム 14 文字。`% 62` の剰余写像には分布の偏りがあるため、エントロピーは**最大でも約 83bit** (一様分布を仮定した概算)。衝突確率は十分低いが保証ではない |

例: `ses_206f84f18ffeZ6hhD7pFYAiW5T` のうち `206f84f18ffe` が時刻部、`Z6hhD7pFYAiW5T` がランダム部。

本拡張機能では **ミリ秒内カウンターは省略する**。セッション ID は会話 (結果タブ) ごとに 1 回生成するだけなので、同一ミリ秒での衝突もソート順も問題にならず、一意性はランダム 14 文字 (実効 80bit 超) で十分に担保される。長さと形式は公式と同じ (`ses_` + 6 バイト hex + 14 文字) に保つ。

カウンターを省くと、反転前の値が `Date.now() * 0x1000n` ちょうどになるため、時刻部の末尾 3 文字が常に `fff` になる (公式の例 `ffe` はカウンターが 1 のとき)。実害はなく、実装ではカウンターなしのまま (`fff` になる側) とした。

なお `Date.now()` と `crypto.getRandomValues()` に依存するため、この関数はモジュール状態を持たないものの**純粋関数ではない**。配置は `extension/utils.js` の `Pure utilities` ではなく `Extension helpers` とする (`utils.js` は `UI helpers` / `Extension helpers` / `LLM APIs` の構成で、`Pure utilities` セクションは存在しない)。

```js
// extension/utils.js の Extension helpers に置く想定
const SESSION_ID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const createOpenCodeSessionId = () => {
  const value = ~(BigInt(Date.now()) * 0x1000n);
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn).toString(16).padStart(2, "0")
  ).join("");
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return `ses_${time}${Array.from(bytes, (byte) => SESSION_ID_CHARS[byte % 62]).join("")}`;
};
```

### 2.4 本拡張機能に必要な最小要件

- サーバーが 400 で失敗させているのは `x-opencode-session` の欠落のみ。値のフォーマットは公式には「会話ごとに安定したセッション ID」とだけ述べられているが、公式クライアントは `ses_` + 26 文字 (`2.3`) を送っている。本拡張機能も同じ形式を生成して送る方針とする (この形式が受け付けられることは実機で確認済み → `5` 章)。
- `User-Agent` については公式ドキュメントが独自 UA による識別を求めている。`User-Agent` は現在の Fetch 仕様では禁止ヘッダーではないが、**Chrome は Fetch リクエストから指定値を黙って除去する** (crbug 571722)。Firefox を含む拡張コンテキストでの挙動は未検証。現状の 400 は `x-opencode-session` の欠落によるものなので、`User-Agent` 対応は今回の必須要件には含めない (`declarativeNetRequest` で書き換える方法はあるが、権限追加が必要)。
- その他の `x-opencode-*` ヘッダー (`x-opencode-project` 等) は公式クライアントが送っているのみで、エラーにはなっていない。省略して問題ないと推測される (未検証)。

### 2.5 留意点 (サービスの性格)

OpenCode Go はコーディングエージェント利用を想定したサービスであり、トラフィック監視を行っていると公式に明記されている。Web ページ要約用の拡張機能からの利用が利用規約上許容されるかは利用者の判断に委ねられる。本対応は「既存ユーザーが自分の API キーで使い続けられるようにする」ことを目的とする。

## 3. 現状の実装構造 (関連部分)

- LLM 呼び出しは `extension/utils.js` の `generateContent()` / `streamGenerateContent()` に集約されている (AGENTS.md のルール)。
- OpenAI 互換パスは `generateContentOpenAI()` / `streamGenerateContentOpenAI()` が `buildOpenAIApiUrl(baseUrl, "/chat/completions")` に向けて `fetch()` する。ヘッダーは `Content-Type` と `Authorization` のみ。
- 会話 (フォローアップ) は結果タブごとに `chrome.storage.session` の `conversation_${resultIndex}` に保存される。`resultIndex` は結果タブ URL の `i` パラメーター。
- 最初の要約リクエストは `extension/service-worker.js` の生成ハンドラーから発信され、フォローアップは `extension/results.js` の `askQuestion()` から発信される。

つまり「会話」の単位 = 結果タブ (`resultIndex`) ごとの `conversation_${resultIndex}` であり、セッション ID も同じ単位で管理するのが自然である。

## 4. 実装方針 (実装済み)

### 4.1 セッション ID の生成と保存

- ID 形式: `2.3` の `createOpenCodeSessionId()` で生成する `ses_` + 26 文字 (公式クライアントと同一形式、カウンターなし)。
- 保存先: `chrome.storage.session` のキー `opencodeSession_${resultIndex}`。
- 取得は「既存キーがあれば使う、なければ生成して保存」の get-or-create。**プロバイダーやホストに関わらず常に取得する** (生成するのは数十バイトの文字列 1 個で、ホスト判定を呼び出し側に漏らさないため)。ヘッダーを付けるかどうかは `utils.js` 側だけで判断する。
- 呼び出し側の重複を避けるため、`getOrCreateOpenCodeSessionId(resultIndex)` (仮称) として `utils.js` の `Extension helpers` にまとめ、`service-worker.js` / `results.js` はこれを呼ぶだけにする。

ライフサイクル (どの操作で ID を維持/破棄するか):

| 操作 | セッション ID の扱い | 理由 |
| --- | --- | --- |
| 初回の要約リクエスト | 生成して保存 (`service-worker.js` の生成ハンドラー) | 最初の会話系列の起点 |
| フォローアップ (`askQuestion()`) | 既存 ID を再利用 (なければ生成) | 同一会話としてルーティング/キャッシュを継続 |
| 結果ページの再読み込み | 保存済み ID を再利用 | タブを閉じて開き直しても同一会話 |
| キャッシュヒット (初回 API 呼び出しなし) | **ID は保存しない**。最初のフォローアップ時に生成 | コピー元の会話 ID を引き継がないため |
| 会話クリア (`clearConversation()`) | **維持する (削除しない)** | `result.requestApiContent` と `result.responseContent` を保持したまま質問履歴だけをやり直すため、サーバー側から見れば同一会話系列が続く |
| スロット再利用 (`popup.js` の `resultIndex` 更新) | **削除する** | `resultIndex` は 0〜19 の循環スロットで、別の会話に割り当てられるため |
| API 失敗後の手動再送 | 維持する | OpenAI 互換経路には自動リトライ/フォールバックがなく (`generateContentWithFallback` は Gemini 専用)、失敗後の再送はユーザー操作。再送も同一会話として扱う |

スロット再利用時 (`extension/popup.js` の `resultIndex = (resultIndex + 1) % 20` 直後、既存の `result_` / `conversation_` / `streamContent_` / `autoSavePending_` / `retryStatus_` を削除している箇所) に、`opencodeSession_${resultIndex}` の削除を追加する。これを怠ると 21 件目以降で別会話の ID を再利用してしまう。

なお初回リクエストでは、API 呼び出しの前に ID を取得・保存する。そのため API が失敗したり 1004 で例外になったりしても ID は残り、その後のフォローアップで再利用される (表の「失敗後の手動再送は維持する」と整合)。

クリアと送信の競合については、クリアで ID を削除しない方針により解消される (削除待ちの状態が発生しない)。get-or-create は read-modify-write でありアトミックではないが、スロット単位の操作は既存の会話処理と同等の前提に留める (新たな排他制御は導入しない)。

### 4.2 ヘッダー送信の制御

`x-opencode-session` をすべての OpenAI 互換エンドポイントに無条件で送るのは避けたい。理由:

- 拡張ページからの `fetch()` はホスト権限を持つオリジンでは CORS の適用外だが、権限未付与のホストは別で、`Authorization` と `Content-Type: application/json` により既にプリフライトが発生している。そこへ `x-opencode-session` を足すと、そのプロバイダーの `Access-Control-Allow-Headers` に含まれていない場合にプリフライトで失敗しうる。
- 他プロバイダーが未知のヘッダーを拒否する可能性もある。

そこで **Base URL が OpenCode Go の場合のみヘッダーを付与する** 方針とする。

- 判定方法: `tryNormalizeBaseUrl(baseUrl)` で正規化した Base URL を `new URL()` に渡し、`protocol === "https:"` かつ `hostname === "opencode.ai"` であること。サブドメインは許可しない (対象は `opencode.ai` のみで十分)。`buildOpenAIApiUrl` はパスを足すだけなのでホスト名は Base URL と同じで、この形なら `LLM APIs` の関数に依存せず `Extension helpers` 内で完結する (「使う前に定義する」順序ルールを守れる)。
- ユーザー設定は追加しない (オプション UI の変更なし)。将来的に他ホストも許可したくなったら設定項目化を検討する。

### 4.3 修正箇所

1. `extension/utils.js`
   - `Extension helpers` セクションに `createOpenCodeSessionId()` / `isOpenCodeGoUrl(baseUrl)` / `getOrCreateOpenCodeSessionId(resultIndex)` (いずれも仮称) を追加。`normalizeBaseUrl` と同じく **3 つとも export する** (`test/unit/` から直接検証するため)。
   - `generateContentOpenAI()` / `streamGenerateContentOpenAI()` に `sessionId` 引数を追加し、OpenCode Go 向けリクエストのときのみ `headers` に `x-opencode-session: sessionId` を追加。
   - `generateContent()` (現在 6 引数) と `streamGenerateContent()` (現在 7 引数) は、**末尾に省略可能な `sessionId` を追加**する。呼び出し元 (`service-worker.js` / `results.js`) は Gemini と OpenAI で共通なので、Gemini のときも `sessionId` が渡される。Gemini 経路では受け取った値を無視し (`generateContentWithFallback` 側には渡さない)、省略可能な引数なので既存のテストや呼び出しはそのまま動く。
   - `sessionId` が未指定でも、宛先が OpenCode Go なら `utils.js` 内でその場限りの ID を生成してヘッダーに付ける (400 を防ぐフェイルセーフ)。
2. `extension/popup.js`
   - スロット確保時 (`resultIndex` 更新直後) に `opencodeSession_${resultIndex}` を削除する。
3. `extension/service-worker.js`
   - 生成ハンドラーで `getOrCreateOpenCodeSessionId(resultIndex)` を呼び、その値を `generateContent()` / `streamGenerateContent()` の末尾引数として渡す。
4. `extension/results.js`
   - `askQuestion()` で `getOrCreateOpenCodeSessionId(resultIndex)` を呼び、末尾引数として渡す。`clearConversation()` では**削除しない**。
5. テスト
   - `test/contract/`: `apiProvider: "openai"` で Base URL が `opencode.ai` のとき `x-opencode-session` が付き、値が `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$` に一致すること。非 OpenCode の Base URL では付かないこと、Gemini パスには付かないこと、`sessionId` 未指定でも OpenCode Go 宛てならヘッダーが付くこと (フェイルセーフ)、Base URL 未設定/不正時に既存のエラー応答 (1002/1003) が変わらないこと (非ストリーム/ストリーム両方)。
   - `test/unit/`: `createOpenCodeSessionId()` の形式 (`ses_` + 26 文字)、`isOpenCodeGoUrl()` の判定 (https / ホスト完全一致 / 否定ケース)、`getOrCreateOpenCodeSessionId()` の get-or-create (既存 ID の再利用・無ければ生成・削除後は新規) を `chrome.storage` モックで検証する。
   - `test/static/`: `results.js` 用の jsdom 環境はないため、`test/static/popup-results-structure.test.js` と同じ要領でソースを読み、「スロット削除処理で `opencodeSession_` も削除していること」「`clearConversation()` が `opencodeSession_` を削除していないこと」を検証する。キャッシュヒット時に ID を保存しないことは同様のソース確認か E2E / コードレビューで担保する。
   - `test/helpers/`: `chrome.storage` モックに `get()` を追加 (現状は `set`/`remove` のみで、呼び出し側の unit テストが書けない)。
   - locale への影響なし (UI 追加なし)。

### 4.4 検討した別案

| 案 | 採否 | 理由 |
| --- | --- | --- |
| すべての OpenAI 互換リクエストに無条件で付与 | 不採用 | 他プロバイダーの挙動を変えてしまう。ホスト判定で対象を絞れる |
| オプション画面にトグルを追加 | 見送り | UI 変更と locale 対応のコストに対し効果が小さい。ホスト判定で自動化できる |
| `declarativeNetRequest` で User-Agent も書き換える | 見送り | 現時点で要求されておらず、権限追加が重い。必要になったら別タスクで検討 |
| 会話クリア時にセッション ID も削除 | 不採用 | `result.requestApiContent` / `responseContent` はクリア後も送信され続けるため、サーバーから見れば同一会話系列。ID を維持した方がキャッシュ効率がよい |
| `conversation` 配列のハッシュをセッション ID にする | 不採用 | 内容が変わるたびに ID が変わり「安定した ID」要件を満たさない |

## 5. 確認結果と残存リスク

- サーバーは `ses_` + 26 文字の形式を受け付けることを実機で確認済み (2026-10-10)。400 は解消した。
- セッション ID は結果タブ (`resultIndex`) 単位で管理するため、**同じページを要約し直すとスロットが変わり別セッションになる** (プロンプトキャッシュの継続的な恩恵は同一結果タブ内のフォローアップに限られる)。スロット一周時に旧 ID を確実に削除しないと別会話の ID を再利用してしまう (`4.1`)。
- `User-Agent` は Chrome の Fetch で除去されるため設定できない (crbug 571722)。OpenCode 側が `User-Agent` を必須化した場合は、`declarativeNetRequest` による UA 書き換え (`opencode.ai` ホストのみ) を追加検討する。Firefox での挙動は未検証。
- get-or-create とスロット確保は read-modify-write でありアトミックではない。同一スロットに対する多重操作 (重複した結果タブ、popup 連打など) は既存実装と同様に競合しうる。
- OpenCode 側の仕様は変更が続いている (クライアント対応状況が公式ドキュメントで日々更新されている)。ヘッダー要件が変わったら本ドキュメントを更新すること。

## 6. 参考リンク

- 公式ドキュメント: [opencode.ai/docs/go](https://opencode.ai/docs/go/) (「どこで使用できますか?」セクション)
- エンドポイント: `https://opencode.ai/zen/go/v1/chat/completions` (`/models`, `/responses`, `/messages` もあり)
- OpenCode 本体のヘッダー実装: `packages/opencode/src/session/llm/request.ts` (anomalyco/opencode リポジトリ)
- セッション ID 定義: `packages/schema/src/session-id.ts`, `packages/schema/src/identifier.ts` (同上、`dev` ブランチ)
- README のプロバイダー一覧: OpenCode Go は `https://opencode.ai/zen/go/v1`

上記のソース参照は `dev` ブランチ時点のファイル名・内容に基づく。実装時は行番号・内容が移動している可能性があるため、必要に応じて commit 固定の URL に置き換えて確認する。

## 7. 実装後の後処理

- [x] 実装 (2026-10-10): `extension/utils.js` / `popup.js` / `service-worker.js` / `results.js` と `test/unit/` `test/contract/` `test/static/` `test/helpers/`。`npm run lint` 成功、`npm test` 156 件成功。
- [x] 本ドキュメントを `docs/archive/` に移動。
- [x] 実機で OpenCode Go の 400 が解消することを確認する (2026-10-10 確認済み)。
