# 結果ページへの画像入力対応 実装計画

Issue #43 対応。結果ページ（`results.html` / `results.js`）のフォローアップ質問入力欄で、画像を添付できるようにする。

## 目的

要約・翻訳結果に対するフォローアップ質問において、ユーザーが画像を添付できるようにする。典型的なユースケース:

- 「このスクショの部分について追加で聞きたい」
- 「この図を翻訳して」
- 「このエラー画面の原因は？」

## 仕様

### 添付方式（3 種類、業界標準に準拠）

1. **クリップボード貼り付け**（`paste` イベント）
   - スクリーンショットや Web 画像のコピーをそのまま `Ctrl/Cmd+V` で添付
   - `e.clipboardData.items` を走査し `kind === "file"` のものを取得
   - `navigator.clipboard.read()` は使わず、`paste` イベント経由で権限プロンプトなしに取得

2. **ドラッグ＆ドロップ**（`drop` イベント）
   - デスクトップやファイルマネージャから `textarea` ラッパーまたは添付 UI ラッパーへドロップ
   - `e.dataTransfer.files` から `File` を取得
   - v1 の主対象は**ローカル画像ファイルのドロップ**。ブラウザページ上の `<img>` を直接ドラッグして取り込む動作は保証しない（ブラウザにより `dataTransfer` の内容が URL 文字列になったり File にならなかったりするため）

3. **ファイル選択ボタン**（`<input type="file">`）
   - `textarea` の下に「画像を添付」ボタンとして配置（UI 構成セクションと同一の配置）
   - トラックパッド・タッチデバイス等でドラッグが困難な環境の救済
   - `accept="image/*"` を指定

### 添付枚数

- **1 枚のみ**
- 2 枚目を投入した場合は上書き（既存画像を差し替え）
- 削除ボタン（×）で添付解除可能
- **画像のみの送信は禁止**: テキストが空の状態では送信ボタン（`#send`）を非活性化し、送信できない。画像を添付してもテキスト欄が空なら Send は押せない。エラーメッセージは表示せず、ボタンの非活性化のみで示す（詳細は UI 構成・実装ステップを参照）

### 受け付けるファイル

- 画像のみ。ただし**実装上の対応可否は API 仕様ではなくブラウザのデコード可否に依存**する（本実装は全ルートで canvas 再エンコードを行うため）
  - v1 の実質対象: PNG / JPEG / WebP / GIF（先頭フレーム相当）。ブラウザが `<img>` で読め、canvas に描画でき、JPEG に再エンコードできるもの
  - HEIC/HEIF は Gemini API 側は対応するが、多くのブラウザ（Chrome/Firefox）が `<img>` でデコードできないため v1 では実質対象外。エラーになった場合は拒否メッセージを表示
- 非画像ファイル（PDF 等）は v1 では拒否し、メッセージを表示
- PDF は別スコープ（Gemini は `application/pdf` で `inline_data` 対応だが本計画では対象外）

### 画像の正規化・圧縮

- canvas を用いて長辺 1536px 以下にリサイズ
- JPEG に圧縮（品質は 0.8）
- 理由:
  - **Gemini**: 768×768px タイル方式と整合。長辺 1536px = 768×2 で 2×2 タイル（最大 1,032 トークン）にきっちり収まり無駄がない。1568px 等の中途半端なサイズだとタイル境界をまたいで余分なタイルが発生する
  - **OpenAI**: `detail` パラメータは**送らずデフォルト（`auto`）で動かす**。現行 `extension/utils.js` の `convertToOpenAI()` は `detail` を付与しないため、本実装でも追加パラメータは入れない。`auto` 既定の挙動（gpt-5.5 では `original` 相当、gpt-5.4 では `high` 相当）を前提とし、いずれの既定でも 1536px は安全圏（`high` の 2048px 上限、`original` の 6000px 上限のいずれにも余裕を持って収まる）
  - `chrome.storage.session`（~10MB クォータ）の圧迫を防ぐため
  - OpenAI 互換 API で `webp`/`heic` を弾くプロバイダがあるため、JPEG に正規化して安全に送るため

### UI 構成

```text
[textarea ────────────────────────────────]
[画像を添付]                                ← hidden <input type="file"> 起動ボタン
[プレビュー: 🖼️ ×]   ← 添付画像サムネイル＋削除ボタン（最大 320×180px）
[言語モデル ▼] [Send]
```

- **クリップボタンは設けない**。`textarea` 内部右下への絶対配置は廃止し、テキスト入力領域を圧迫しないよう `textarea` の下に独立した「画像を添付」ボタンを配置する
- 「画像を添付」ボタンは `hidden` な `<input type="file" accept="image/*">` を起動するラベル付きボタン
- **プレビューは「画像を添付」ボタンの直下**に表示する
  - サムネイルの最大サイズは **320×180px**
  - 元画像がこれより大きい場合は縮小して表示するが、**小さい画像は拡大しない**（元サイズのまま表示）
  - **アスペクト比は維持**する（`object-fit: contain` 相当、または `max-width`/`max-height` のみ指定）
  - プレビュー枠右上に × 削除ボタンを重ねる（プレビュー容器を `position: relative`、× ボタンを `position: absolute; top: 0; right: 0` で配置）。元画像が 320×180px 未満で拡大しない場合でも、ボタンは画像本体ではなくプレビュー容器の右上に固定されるため、小さい画像では画像から離れた位置に見える
  - コンテナ幅が 320px 未満（モバイル等）の場合はコンテナ幅に収まるよう縮小する。`max-width: 320px` と `width: 100%` を併用し、コンテナ幅 ≤ 320px ならコンテナ幅いっぱい、それより広ければ 320px 上限とする
- **言語モデル選択欄は「画像を添付」ボタンおよびプレビューの下**に配置する（`Send` ボタンと同じ行）
- ドラッグ中はドロップゾーン（`textarea` と添付 UI ラッパー全体）をハイライトする。添付前はプレビュー領域が空または非表示の場合があるため、プレビュー単体ではなく「画像を添付」ボタンとプレビューを含むラッパー全体を対象にする
- テキスト貼り付けと画像貼り付けを両立（`paste` イベントで `kind` 判定）
- 添付画像は `textarea` とは別のプレビュー領域にサムネイル表示

### モバイル表示（`max-width: 639px`）

既存の `extension/css/common.css` および `extension/results.html` のインライン `@media` ルールに合わせ、モバイルでは以下の調整を行う。

- `body` 幅は既存通り 84% になる（375px viewport で ≈315px）
- **プレビュー**: `max-width: 320px` + `width: 100%` により、コンテナ幅（≈315px）に収まる。320px 上限には達しないがはみ出しは発生しない
- **「画像を添付」ボタン / `#send`**: 既存の `@media (max-width: 639px)` ルールの `display: block` 対象に追加し、`select` / `#clear` / `#copy` と同様に縦積みにする
  - 対象セレクタ: `body #attach-image-button`, `body #send`
  - これにより言語モデル `select` の下に `Send` が回り込まず、縦に積まれる
- **「画像を添付」ボタンとプレビューの順序**: 縦積みでもデスクトップと同じ順序（`textarea` → 「画像を添付」→ プレビュー → 言語モデル → Send）を維持する。DOM 順序で自然に実現するため `flex-direction` 等の追加制御は不要

## 技術的実現性

### API レイヤーは既存のままで対応可能

- `extension/service-worker.js` L164-170 で `captureVisibleTab` の JPEG データURLを `inline_data: { mime_type, data }` 形式の `parts` に変換する実績あり
- `extension/utils.js` L367-374 `convertToOpenAI()` が `inline_data` を OpenAI 互換 `image_url` データURLに変換するロジックを既に持つ
- → **`extension/utils.js` の変更は不要**

### 権限

| 操作 | 必要な権限 | 備考 |
| --- | --- | --- |
| `drop`/`paste` イベント | なし | 標準 DOM イベント |
| `navigator.clipboard.read()` | `clipboard-read` | **使わない**（paste イベントで代用） |
| File API / FileReader | なし | 標準 Web API |

→ `extension/manifest.json` / `firefox/manifest.json` ともに**権限追加なし**。`host_permissions` も不要。Firefox MV3 でも同じ DOM イベントが動作する。

### ストレージ

- `chrome.storage.session` のクォータは ~10MB
- 圧縮済み画像（数十 KB）を `conversation_${resultIndex}` にインライン保存
- リサイズ圧縮でクォータ超過リスクを緩和
- 様子を見て IndexedDB 移行も将来検討

### API 側の考慮

- **Gemini**（2026-06 現行、Gemini 3.5）: `inline_data` は `image/png|jpeg|webp|heic|heif` をサポート。インラインはリクエスト合計 20MB 上限。解像度の明示的ピクセル上限は廃止され、768×768px タイル方式（各タイル 258 トークン）で処理。長辺 1536px は 2×2 タイルに収まり効率的
- **OpenAI 互換**（2026-06 現行、GPT-5.5）: `convertToOpenAI()` が既にデータURL化するため追加対応不要。`detail` パラメータは**送らずデフォルト（`auto`）で動かす**。gpt-5.5 では `auto`/省略時は `original` 相当（最大 6000px / 10,000 パッチ）、gpt-5.4 では `high` 相当（最大 2048px / 2,500 パッチ）。いずれの既定でも長辺 1536px は安全圏。JPEG に正規化して送るのが安全
  - **注記**: 上記は公式 OpenAI の仕様に基づく。本プロジェクトの OpenAI パスは汎用の「OpenAI 互換エンドポイント」パスであり、サードパーティの互換プロバイダはビジョン入力や `image_url` データURL の受け入れ可否・サイズ挙動が公式と異なり得る。実装時は公式 OpenAI と主要な互換プロバイダの両方で実機確認し、必要に応じてプロバイダ別のエラーメッセージを整備する
- **非ビジョンモデル**（テキスト専用モデル）に画像を送ると API エラー。v1 では既存の汎用エラーハンドリング（`response_unexpected_response`）で表面化する挙動を許容し、専用メッセージは追加しない
- `result.requestApiContent` が初期要約で画像を含む場合、フォローアップの `apiContents` 構築時に既に画像 `parts` が含まれる — 既存ロジックで問題なし

## 実装対象と変更規模

| ファイル | 変更規模 | 内容 |
| --- | --- | --- |
| `extension/results.html` | 小（~25–35行） | `textarea` ラッパー化、「画像を添付」ボタン、プレビュー領域（最大 320×180px、`max-width: 320px` + `width: 100%`）、hidden `<input type="file">`、言語モデル選択欄の順序入れ替え、モバイル `@media` ルールに `#attach-image-button` / `#send` を追加 |
| `extension/results.js` | 中（~170–280行） | `attachedImage` 状態、drop/paste/file ハンドラ、canvas リサイズ・圧縮、プレビュー描画、`askQuestion()` の `parts` 構築変更、`appendQuestionToUi()` の `parts` ベース化と復元ルート修正、`setResultControlsEnabled()` 拡張、送信ボタン活性制御、`clearConversation()` のクリア追加 |
| `extension/utils.js` | なし | `inline_data`/`convertToOpenAI` は既存のままで OK |
| `extension/service-worker.js` | なし | フォローアップは results.js から直接 `generateContent` を呼ぶため不要 |
| `extension/manifest.json` / `firefox/manifest.json` | なし | 権限追加なし |
| `extension/_locales/*/messages.json` | 小（数文字列×15言語） | 「画像を添付」ボタン文言、非画像ファイル拒否メッセージ（例: 「画像ファイルのみ添付できます」）等。「画像のみ添付できません」等の送信時エラーメッセージは不要（送信ボタン非活性で表現） |
| `eslint.config.mjs` | なし | 既存ルールに従う（`if`/`for` に必ず `{}`） |

## 実装ステップ（推奨順序）

1. **UI 骨組み**（`results.html`）
   - `textarea` の下に「画像を添付」ボタン（`#attach-image-button`）を配置（`hidden` な `<input type="file" accept="image/*">` を起動）
   - 「画像を添付」ボタンの直下にプレビュー領域（サムネイル＋× 削除ボタン、最大 320×180px、`max-width: 320px` + `width: 100%`）を配置
   - プレビュー領域の下に既存の言語モデル選択欄（`#languageModelContainer`）と `Send` ボタンを配置
   - `textarea` はラッパー `<div>` で囲み、別途「画像を添付」ボタンとプレビューを含む添付 UI ラッパーも設ける。`drop`/`dragover` のハイライト対象は `textarea` ラッパーと添付 UI ラッパー全体とする
   - 既存の `@media (max-width: 639px)` ルールの `display: block` 対象に `#attach-image-button` と `#send` を追加し、モバイルで縦積みにする

2. **入力ハンドラ**（`results.js`）
   - `attachedImage` 変数（単一、`{ mimeType, data }` or `null`）
     - `mimeType`: API 送信用。本実装では JPEG 再エンコード後のため常に `"image/jpeg"`
     - `data`: base64 部（`data:` ヘッダなし）。Gemini `inline_data.data` / OpenAI `image_url` base64 部として直接使用
   - プレビュー表示や UI 上で data URL が必要な場合は都度 `data:${mimeType};base64,${data}` を合成する
   - `paste` / `dragover` / `drop` / `change` イベントリスナ
   - 非画像ファイルの拒否とメッセージ表示
   - **`change` ハンドラ処理後に `input.value = ""` をリセット**し、同じファイルを再選択した場合でも `change` イベントが発火するようにする
   - **`setResultControlsEnabled()` の拡張**: 送信中・結果待ち中の無効化対象に `#attach-image-button` と hidden `<input type="file">` を追加する
   - **空テキスト時の送信ボタン非活性化**: `textarea` の `input` イベントで `question.trim()` の有無を監視し、テキストが空なら `#send` を `disabled` にする。画像のみ添付してテキストが空の場合も非活性のまま。エラーメッセージは表示しない
   - **送信ボタン活性制御の優先ルール**: `#send` の `disabled` は以下の全条件を満たす場合のみ `false` とする:
     1. `result.requestApiContent` が存在する（`initialize()` で空の場合はテキストを入力しても `#send` を `disabled` のまま維持）
     2. `textarea` のテキストが空でない
     3. 送信中ではない（`setResultControlsEnabled(false)` 中）
   - `setResultControlsEnabled(true)` で復元する際も上記ルールで再評価し、テキストが空なら `disabled` を維持する（単純に `disabled = false` にはしない）
   - 初期表示直後も同じルールを適用する（`initialize()` 終了時に `result.requestApiContent` があれば空テキストで非活性、`text` 入力で活性化）
   - `askQuestion()` 先頭の空テキスト早期 return は念のため維持するが、通常はボタンが押せないため到達しない

3. **画像の正規化**（`results.js`）
   - `FileReader.readAsDataURL()` → `Image` → canvas で長辺 1536px リサイズ → JPEG `toDataURL("image/jpeg", 0.8)`
   - `attachedImage` へ格納

4. **プレビュー描画**（`results.js`）
   - サムネイル表示と × 削除ボタン
   - サムネイルは最大 320×180px とし、元画像がこれより大きい場合のみ縮小（小さい画像は拡大しない）。アスペクト比は維持
   - ドラッグ中は `textarea` ラッパーと添付 UI ラッパー全体をハイライト

5. **`askQuestion()` の `parts` 構築変更**（`results.js`）
   - `attachedImage` がある場合: `[{ text: question }, { inline_data: { mime_type, data } }]`
   - ない場合: 従来通り `[{ text: question }]`
   - 送信後に `attachedImage` をクリア、プレビューも消去

6. **`appendQuestionToUi()` 拡張**（`results.js`）
   - 引数を `question`（文字列）から `parts`（配列）に変更し、テキストと画像の両方を描画できるようにする
   - `askQuestion()` と `initialize()` の復元ループの両方から `parts` を渡すよう修正する
   - `initialize()` の復元ループは現状 `extractTextFromParts()` でテキストのみ取り出しているため、`parts` 全体を渡すように変更する（これによりページ再読込後も過去質問の画像サムネイルが再表示される）

7. **`clearConversation()` 拡張**（`results.js`）
   - `attachedImage` とプレビューもクリア

8. **ローカライズ**（`extension/_locales/*/messages.json`）
   - 新規メッセージ文字列を 15 言語分追加
   - **`aria-label` / `alt` のローカライズは本 issue では行わない**: × 削除ボタンの `aria-label`、プレビュー画像の `alt` は固定文字列（英語）または空とし、i18n メッセージとしては追加しない。将来 issue で対応を検討

9. **検証**
   - `npm run lint` でエラー解消
   - `apiProvider: "gemini"` / `"openai"` 両パスの動作確認
   - 非ビジョンモデル時に既存の汎用エラー（`response_unexpected_response`）で破綻なく表面化することを確認
   - Firefox での動作確認
   - **モバイル表示（`max-width: 639px`）の確認**: プレビューがコンテナ幅に収まること、「画像を添付」ボタン / `Send` が縦積みになること、要素順序がデスクトップと同じであること

## リスク・エッジケース

- **大きな画像**: リサイズ・圧縮で緩和
- **非画像ファイルのドロップ/貼り付け**: 拒否してメッセージ表示
- **クリップボードの PNG は大きくなりがち**: 圧縮で対応
- **非ビジョンモデルへ送信**: API エラー。v1 では既存の汎用エラーハンドリング（`response_unexpected_response`）で許容
- **ストリーミングパス**: 同じ `apiContents` 構築ロジックを使うため追加対応不要
- **`extractTextFromParts()`（copy/save 用）**: テキストのみ抽出するため、copy/save 出力には画像が含まれない。`appendQuestionToUi()` を `parts` ベースにしても、copy/save 処理は `extractTextFromParts()` のまま維持し、画像はテキストのみの出力に落ちる（許容範囲。`[image]` プレースホルダを入れる案は将来検討）
- **画像付き会話の再送コスト**: 画像 `parts` を `conversation` に保存するため、以後のフォローアップでも過去画像が毎回 API に再送される。トークン・レイテンシ・`storage.session` 使用量が増加するが、1 枚・圧縮済み（数十 KB）に制限しているため大きなリスクではないと判断。様子を見て IndexedDB 移行や履歴から画像を間引く工夫を将来検討

## 関連ファイル

- `extension/results.html` — 結果ページ HTML
- `extension/results.js` — 結果ページロジック（`askQuestion()`, `appendQuestionToUi()`, `clearConversation()` 等）
- `extension/utils.js` — `generateContent()`, `streamGenerateContent()`, `convertToOpenAI()`（変更不要）
- `extension/service-worker.js` — 初回生成処理（変更不要）
- `extension/manifest.json` / `firefox/manifest.json` — 権限（変更不要）
