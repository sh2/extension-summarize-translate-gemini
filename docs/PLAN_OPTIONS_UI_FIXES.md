# Options UI 修正手順書

## 目的

`docs/PLAN_OPTIONS_UI_IMPROVEMENT.md` に基づいて導入した options 画面について、実装後レビューで指摘された以下 4 点を修正する。

1. `API Provider` / `Default Actions (No Selection)` / `Default Actions (Selection)` / `Behavior` が右ペインに 2 回ずつ表示されて冗長
2. `Backup & Sync` のボタンがデスクトップでも 2 列配置で、文言が収まっていない
3. `Backup & Sync` の「API キーを含める」が「Export options to file」から離れすぎている
4. 選択中 provider カードの `Current provider` ラベルが地味で、選択／非選択の差が弱い

各修正は独立に再適用できる。実装者は本文中の「状態」と「前提」を見て、その修正がまだ未適用かを判断してから作業すること。

## 修正の状態

- 修正 1: **適用済**
- 修正 2: **適用済**
- 修正 3: **適用済**
- 修正 4: **適用済**

> この表は実装完了後に「適用済」へ書き換えること。実装途中で本書を再実行する場合は、未適用の修正だけを適用する。

## 前提

- 変更対象は原則として以下の 2 ファイルに限定する
  - `extension/options.html`
  - `extension/css/options.css`
- テストファイルは修正 1・3 に伴う期待値更新のためだけ触る（修正 2・4 はテスト不改修）
  - `test/static/options-structure.test.js`
- `options.js` の保存ロジック・イベント配線は変えない
- 既存の要素 ID、`data-i18n` キー、DOM 内の制御要素名は維持する
- **provider カードの選択／非選択は `.provider-status`（`Current provider` ラベル）だけで表現する。背景・枠線・文字色など、その他の provider カード CSS は触らない**
- 変更後は `npm run lint` と `npm test` を実行する

## 修正 1: 冗長な見出し（legend）を削除する

- **状態**: 適用済
- **前提ファイル**: `extension/options.html`、`extension/css/options.css`、`test/static/options-structure.test.js`
- **他修正との依存**: なし（独立）

### 確認メモ（修正 1）

- `extension/options.html` の `sec-provider` / `sec-default-no-selection` / `sec-default-selection` / `sec-behavior` から `<legend>` は削除済み
- `extension/css/options.css` に `legend { ... }` ルールは残っていない
- `test/static/options-structure.test.js` も `legend` 必須前提を外す形で更新済み

### 現状の問題（修正 1）

`API Provider` / `Default Actions (No Selection)` / `Default Actions (Selection)` / `Behavior` の各カードでは、カード見出しの `<h2>` と、同じ文言を持つ `<legend>` が続いている。そのため右ペインでは同じ見出しが 2 回読み上げ・表示されるように見える。

### 方針（修正 1）

`<fieldset>` 自体は残し、**視覚的に冗長な `<legend>` をすべて削除**する。`.sec-provider` を含めた全 4 箇所を同じ方針で揃えることで、カード間で見出し構造が不揃いになるのを防ぐ。グループの意味づけは `<fieldset>` 自体が担保するため、legend 無しでもフォーム制御上のグループは維持される。

### 実装手順（修正 1）

1. `extension/options.html` を開く
2. 以下 4 箇所の `<fieldset>` 直下にある **`<legend>` 要素ごと** 削除する。中の `<span data-i18n="...">` ごと消し、`<fieldset>` 自体は残す。空の `<legend></legend>` を残さない
   - `sec-provider`（`<legend><span data-i18n="options_provider">...`）
   - `sec-default-no-selection`（`<legend><span data-i18n="options_section_default_action_no_selection">...`）
   - `sec-default-selection`（`<legend><span data-i18n="options_section_default_action_selection">...`）
   - `sec-behavior`（`<legend><span data-i18n="options_section_behavior">...`）
3. `extension/css/options.css` の `legend { ... }` ルールは出現しなくなるため削除する
4. スクリーンリーダー向けにグループ名を残したい場合は、各 `<fieldset>` に `aria-label` でカード見出しと同じ文言を付ける（`data-i18n` はそのまま利用）。本修正ではまず視覚的冗長さの解消を優先し、`aria-label` 化は必須ではない

### 補足（修正 1）

- `<fieldset>` 自体はフォーム制御・アクセシビリティ上のグループ化として残す
- `<legend>` を消して `aria-label` も置かない場合、スクリーンリーダーで `<fieldset>` のグループ名が読まれなくなるトレードオフを受け入れる意思表示になる。本修正では視覚的冗長さの解消を優先しこれを受容するが、将来アクセシビリティ上問題が出れば `aria-label` 化へ展開する
- HTML 構造テスト（`test/static/options-structure.test.js`）が `fieldset` 内の `legend` 存在を必須検証している場合は、併せてテスト期待値を更新する（後述）

## 修正 2: Backup & Sync のボタンをデスクトップでも 1 列にする

- **状態**: 適用済
- **前提ファイル**: `extension/css/options.css`
- **他修正との依存**: 修正 3 と同時に適用してよい。`.backup-actions` を触るのは本修正のみ

### 確認メモ（修正 2）

- `extension/css/options.css` の `.backup-actions` は `display: flex; flex-direction: column; align-items: flex-start;` へ変更済み
- `@media (max-width: 720px)` 側の `.backup-actions { grid-template-columns: 1fr; }` は削除済み

### 現状の問題（修正 2）

`Backup & Sync` カードでは `.backup-actions` が

```css
grid-template-columns: repeat(2, minmax(0, 1fr));
```

となっており、デスクトップでも 2 列表示される。ボタン文言が長いため、横幅不足で折り返しや詰まりが発生している。

### 方針（修正 2）

`Backup & Sync` のボタン群は、デスクトップでもモバイルでも **常に 1 列** にする。

### 実装手順（修正 2）

1. `extension/css/options.css` を開く
2. `.backup-actions` の定義を以下の方針で変更する

```css
.backup-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: .75rem;
}
```

- `flex-direction: column` で常に 1 列とする
- `align-items: flex-start` で、**ボタンは `width: 100%` で広げたい**、かつ `.checkbox-item`（Include API key）は内容幅に収める、という意図を明示する
- ボタンには `width: 100%` を残したまま、長文言ボタンがコンテナ幅いっぱいまで過度に広がらないよう `.backup-actions button { max-inline-size: 32rem; }` を併用する

1. `@media (max-width: 720px)` 内にある `.backup-actions { grid-template-columns: 1fr; }` は冗長になるので削除する
2. 1 列化によって `Backup & Sync` カードの縦長が増えるため、`syncSaveBarHeight()` によって `main` の `padding-block-end` が save-bar 高さへ追従していることを、実装後に Chrome / Firefox で手動確認する。最後のボタンが fixed save-bar に隠れないことを確認する（テスト自動化の対象外）

### 補足（修正 2）

- 2 列にする意図があったとしても、現状は文言の収まりが悪いので、1 列化を優先する
- `align-items: stretch` にすると `.checkbox-item` まで cross axis 方向に広がり、Include API key の小さな設定1行のためだけに外枠が全幅取ってしまう。`flex-start` で内容幅に収める方が視覚的に自然
- save-bar 回避余白の計算は `--save-bar-height` に依存するため、高さ同期ルールが壊れていないことを手動で担保する

## 修正 3: 「API キーを含める」を Export ボタンの近くへ移動する

- **状態**: 適用済
- **前提ファイル**: `extension/options.html`、`extension/css/options.css`（`.export-api-key-option` のみ）、`test/static/options-structure.test.js`
- **他修正との依存**: 修正 2 と同時に適用してよい。`.backup-actions` 内の順序だけを触る

### 確認メモ（修正 3）

- `extension/options.html` では `#exportApiKey` を含む `.export-api-key-option` が `#exportFile` の直後に移動済み
- `extension/css/options.css` の `.export-api-key-option` は `margin-block-start: 0;` へ更新済み
- `test/static/options-structure.test.js` は `#exportFile` の `nextElementSibling` が `#exportApiKey` を含むことを検証済み

### 現状の問題（修正 3）

`Include API key` チェックボックスは `Export options to file` のみに効く設定だが、現在は `Backup & Sync` カードの末尾に離れて配置されている。関連性が見えにくい。

### 方針（修正 3）

`Include API key` チェックボックスは `Export options to file` ボタンの直下に配置する。

### 実装手順（修正 3）

1. `extension/options.html` を開く
2. `sec-backup` 内の `.backup-actions` を以下の順序に並べ替える

- `exportFile` ボタン
- `exportApiKey` チェックボックス
- `importFile` ボタン
- `syncCloud` ボタン
- `restoreCloud` ボタン

1. `exportApiKey` を `.backup-actions` の外に置くのではなく、**Export ボタンに視覚的に近接する位置**として `exportFile` の直後へ配置する

### 推奨する DOM イメージ

階層の二重化を避け、`.backup-actions` を 1 列の並びに保ったまま `exportFile` の直後に `exportApiKey` を置く。`.backup-actions` は修正 2 で `flex-direction: column` にするため、直下の子としてボタンとチェックボックスを並べてよい。

```html
<div class="backup-actions">
  <button id="exportFile" type="button" data-i18n="options_export" disabled>Export options to file</button>
  <div class="checkbox-item export-api-key-option">
    <input id="exportApiKey" type="checkbox">
    <div>
      <label for="exportApiKey" data-i18n="options_export_api_key">Include API key</label>
    </div>
  </div>
  <button id="importFile" type="button" data-i18n="options_import" disabled>Import options from file</button>
  <button id="syncCloud" type="button" data-i18n="options_sync_cloud" disabled>Sync options to cloud</button>
  <button id="restoreCloud" type="button" data-i18n="options_restore_cloud" disabled>Restore options from cloud</button>
</div>
```

1. `extension/css/options.css` には、`exportFile` と `exportApiKey` の視覚的隣接性を固定するため、必要に応じて次の最小ルールを追加する

```css
.export-api-key-option {
  margin-block-start: 0;
}
```

- `.backup-export-group` のような二重ラッパは作らず、`.backup-actions` が 1 列のフラットな並びを維持する

### 補足（修正 3）

- `exportApiKey` の ID は変えない
- `options.js` 側の参照はそのまま使えるため JS 変更不要
- 静的テストには「`#exportFile` の次兄弟が `#exportApiKey` を含むこと」と書く。推奨 DOM では `#exportFile` の直後が `<div class="checkbox-item export-api-key-option">` で、その中に `<input id="exportApiKey">` があるため、テストは「`#exportFile` の `nextElementSibling` が `#exportApiKey` を含むこと」として表現し、配置意図を固定する

## 修正 4: 選択側 `.provider-status` をアクセント表示にする

- **状態**: 適用済
- **前提ファイル**: `extension/css/options.css`
- **他修正との依存**: なし。`.provider-status` ルールの書き換えと、既存 `.is-inactive-provider` 系ルールの削除だけを行い、テスト不改修

### 確認メモ（修正 4）

- `extension/css/options.css` の `.provider-status` は `display: inline-flex`、`padding`、`border-radius: 9999px`、`font-weight: 600`、`background: var(--nc-lk-1)` を持つピル状バッジへ更新済み
- `extension/css/options.css` から `.card.is-inactive-provider` / `.card.is-inactive-provider h2, label, .field-hint` / `.provider-card-content.is-inactive-provider` の各ルールは削除済み
- provider カードの選択／非選択で見た目に残る差分は `.provider-status` の表示有無だけになっている

### 方針の要点

provider カードの選択／非選択は **`.provider-status`（`Current provider` ラベル）だけで表現する**。非選択側の背景・枠線・文字色には一切差を付けず、`Current provider` 以外の provider カード CSS には触らない。これにより:

- 非選択カードが逆に目立つバグを恒久的に排除できる
- 選択側は `Current provider` バッジが明確に目立つ
- CSS の変更点は `.provider-status` 1 ルールの書き換えと、既存 `.is-inactive-provider` 系ルールの削除だけになり、壊しにくい

### 現状の問題（修正 4）

現状の `.provider-status` は

```css
.provider-status {
  margin-inline-start: .5rem;
  font-size: .85em;
  font-weight: 400;
  color: var(--nc-tx-2);
}
```

で、本文と同系統の地味な見た目になっている。そのため選択／非選択の差がほとんど分からない。一方で `.card.is-inactive-provider` 系ルールが残っていると、背景・枠線・文字色で差を付ける古い挙動が残り、ライトテーマで非選択カードが逆に目立つ現象も出続ける。

本修正では **`.provider-status` 1 ルールの書き換えと、既存 `.is-inactive-provider` 系ルールの削除だけ** で、選択／非選択の差を `.provider-status` に一本化する。

### やらないこと（前提より）

- `.card.is-inactive-provider` / `.card.is-inactive-provider h2` / `.card.is-inactive-provider label` / `.card.is-inactive-provider .field-hint` / `.provider-card-content.is-inactive-provider` に**新しい CSS を書かない**。該当ルールは削除するだけ
- `extension/options.js` の `updateProviderCards()` が付与する `is-inactive-provider` class 自体は残す。class が付与されても対応する CSS が無ければ見た目に影響しない
- `--nc-*` 変数の再定義、テーマ別変数の新設はしない

### 詳細設計

`.provider-status` を**ピル状バッジ**にし、`--nc-lk-1` / `--nc-lk-tx` を使ってライト・ダーク双方で明確に目立たせる:

```css
.provider-status {
  display: inline-flex;
  align-items: center;
  margin-inline-start: .5rem;
  padding: .15rem .45rem;
  border-radius: 9999px;
  font-size: .75rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--nc-lk-tx);
  background: var(--nc-lk-1);
}

.provider-status:empty {
  display: none;
}
```

#### 各プロパティの選定理由

- `display: inline-flex; align-items: center;`: 角丸ピル形状で中身を中央に揃え、バッジ感を出す
- `padding: .15rem .45rem;`: ピル内の余白を最少にし、見出しと並べても浮きすぎない
- `border-radius: 9999px;`: 完全なピル形状。テーマ非依存
- `font-size: .75rem;`: 見出し `1rem` より小さくし、補助ラベルであることを明示
- `font-weight: 600;`: 現行 `400` から上げて「使用中」を主張
- `color: var(--nc-lk-tx);`、`background: var(--nc-lk-1);`:
  - Light: `--nc-lk-1: #0070F3`、`--nc-lk-tx: #FFFFFF` → 青いピルに白文字
  - Dark: `--nc-lk-1: #3291FF`、`--nc-lk-tx: #FFFFFF` → 明るい青ピルに白文字
  - どちらのテーマでも `--nc-lk-1` は強調色として定義済みのため、ライト・ダーク双方で「目立つ」が成立する。新規変数は不要

### 既存の `.is-inactive-provider` 系 CSS を削除する（付随保安）

既存の `.is-inactive-provider` 系ルールが残っていると「背景・枠線・文字色で差を付ける」古い挙動が残り、本修正の要点（`.provider-status` 以外は触らない）と矛盾する。そのため以下のルールを**ルールごと削除**する:

- `.card.is-inactive-provider { ... }`
- `.card.is-inactive-provider h2, .card.is-inactive-provider label, .card.is-inactive-provider .field-hint { ... }`
- `.provider-card-content.is-inactive-provider { ... }`

この削除は「新規に CSS を書く」ではなく「既存ルールを消す」操作。`is-inactive-provider` class が付与されても、対応する CSS が無ければ見た目は変わらないため、非選択カードは通常カードと同じ見た目になる。

> 🔊3-5 行の再実行向け備忘: 削除操作は「既存ルールが存在する場合のみ」行う。再実行時、これらのルールがまだ残っていれば削除し、既に無ければ何もしない。「状態」表を `適用済` にした上で再削除を試さないこと。

### 期待される見え方

| テーマ | ピル背景 | ピル文字 | 非選択カード | 結果 |
| --- | --- | --- | --- | --- |
| Light | `#0070F3`（青） | `#FFFFFF` | 選択中と同じ既定のカード | 選択側の青ピルだけが「使用中」を示す |
| Dark | `#3291FF`（明るい青） | `#FFFFFF` | 選択中と同じ既定のカード | 選択側の明るい青ピルだけが「使用中」を示す |

非選択カードの `.provider-status` は `textContent` が空文字で `.provider-status:empty { display: none }` により非表示。非選択カードは通常カードと全く同じ見た目になる。

### テストへの影響

- `test/dom/options-provider-status.test.js` は `.provider-status` の `textContent` 検証のみで見た目は検査しないため**影響なし**
- `test/static/options-structure.test.js` は `.provider-status` の存在と class 属性のみ検査し、スタイル内容は検査しないため**影響なし**
- 既存テストはすべて CSS 変更のみで通過する

### 想定される手動確認

- Chrome / Firefox で `API Provider` を `Gemini` と `OpenAI-compatible` に切り替え、それぞれ選択側のカード見出しに青いピルの `Current provider` が表示されること
- 非選択側に何も表示されないこと。非選択カードは通常カードと同一の見た目になること
- ライト・ダーク両テーマでピルが本文より明確に目立つこと

### 実装順

1. `extension/css/options.css` の `.provider-status` ルールを上記へ書き換える
2. 同時に、既存の `.card.is-inactive-provider` / `.card.is-inactive-provider h2, label, .field-hint` / `.provider-card-content.is-inactive-provider` の各ルールを**削除**する
3. `npm run lint`
4. `npm test`
5. Chrome / Firefox 両テーマで手動 smoke（ピルが目立つこと、非選択カードが通常カードと同じ見た目であること）

## 修正後の確認観点

1. `API Provider` / `Default Actions` 系 / `Behavior` の各カードで、見出しが 1 回だけに見えること
2. `Backup & Sync` の 4 ボタンがデスクトップでも縦 1 列で表示されること
3. `Include API key` が Export ボタンの直下にあり、意味上の関連が見て取れること
4. 選択中 provider カードの `Current provider` がピルバッジで明確に目立つこと（ライト・ダーク両テーマで）。非選択カードは通常カードと同じ見た目であること
5. `npm run lint` と `npm test` が通ること
6. Chrome / Firefox の両テーマで、`Backup & Sync` カード末尾が fixed save-bar に隠れていないこと

## 想定されるテスト更新

修正 1・3 のみがテスト期待値を変える。修正 2・4 は CSS のみでテスト不改修。

- `test/static/options-structure.test.js`
  - **修正 1 こみ**: `fieldset` 内の `legend` 期待値は、全 4 箇所で legend を削除した結果落ちるため、**legend 存在検証を取り除く**か、`aria-label` 化した場合は `aria-label` 検証へ差し替える
  - **修正 3 こみ**: `Backup & Sync` 内で `#exportFile` の `nextElementSibling` が `#exportApiKey` を含むことを検証する

実装順の終盤でこれらを反映しないと `npm test` が即座に落ちるため、HTML/CSS 変更と同一コミットでテスト期待値も更新する。修正 2・4 はこのテスト更新の対象外。

## 実装順の推奨

現時点では修正 1〜4 がすべて適用済み。再実行時に状態表が全件 `適用済` であれば、追加のコード変更は不要。

見た目が退行した場合のみ、以下の順で該当差分を再適用する。

1. `extension/css/options.css` の `.provider-status` がピルバッジ形状を維持しているか確認する
2. `.card.is-inactive-provider` / `.card.is-inactive-provider h2, label, .field-hint` / `.provider-card-content.is-inactive-provider` の各ルールが再流入していないか確認する
3. 差分があれば必要箇所だけ戻す
4. `npm run lint`
5. `npm test`
6. Chrome / Firefox 両テーマで手動 smoke（save-bar と重ならないこと、選択側のピルが目立つこと、非選択カードが通常カードと同じ見た目であること）

## 再実行時の注意

本書は `docs/PLAN_OPTIONS_UI_FIXES.md を再度実装してください` という指示で壊れず再適用できる構造になっている。再実行時は以下を守ること:

1. 「修正の状態」表を先に確認し、**「適用済」の修正は再度適用しない**。手順を再実行すると、意図しない二重適用や、既に存在しない要素への編集試行で失敗する
2. 未適用の修正だけを原本順序で適用する。各修正は「前提ファイル」欄に書かれたファイルだけを触る
3. 同一ファイルを複数修正で触る場合でも、**状態表で `適用済` の修正は巻き戻さない**。現時点では `extension/css/options.css` に対しても追加変更は原則不要
4. 修正 4 は「`.provider-status` 書き換え」と「既存 `.is-inactive-provider` 系ルール削除」の 2 操作で完了済み。再実行時、これらのルールが既に存在しなければ削除操作は skip する
5. 適用後は「修正の状態」表を更新し、次回の再実行で SAFE に判別できるようにする

## 非ゴール

- options.js の保存ロジック変更
- locale 文言の追加・削除
- カード構成そのものの再設計
- 非選択 provider カードの `disabled` 化
- 修正 4 で `.provider-status` と `.is-inactive-provider` 系以外の provider カード CSS を触ること
- `.provider-status` 以外で背景・枠線・文字色の差を付け直すこと

以上。
