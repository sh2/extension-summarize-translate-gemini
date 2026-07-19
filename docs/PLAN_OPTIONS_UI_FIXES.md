# Options UI 修正手順書

## 目的

`docs/PLAN_OPTIONS_UI_IMPROVEMENT.md` に基づいて導入した options 画面について、実装後レビューで指摘された以下 4 点を修正する。

1. `Default Actions (No Selection)`、`Default Actions (Selection)`、`Behavior` が右ペインに 2 回ずつ表示されて冗長
2. `Backup & Sync` のボタンがデスクトップでも 2 列配置で、文言が収まっていない
3. `Backup & Sync` の「API キーを含める」が「Export options to file」から離れすぎている
4. 非選択の API プロバイダー設定カードが「薄くなる」どころか明るく目立ってしまう

本書は修正の実装手順のみを示し、この時点ではコード修正は行わない。

## 前提

- 変更対象は原則として以下の 2 ファイルに限定する
  - `extension/options.html`
  - `extension/css/options.css`
- `options.js` の保存ロジック・イベント配線は変えない
- 既存の要素 ID、`data-i18n` キー、DOM 内の制御要素名は維持する
- 変更後は `npm run lint` と `npm test` を実行する

## 修正 1: 冗長な見出し（legend）を削除する

### 現状の問題

`API Provider` / `Default Actions (No Selection)` / `Default Actions (Selection)` / `Behavior` の各カードでは、カード見出しの `<h2>` と、同じ文言を持つ `<legend>` が続いている。そのため右ペインでは同じ見出しが 2 回読み上げ・表示されるように見える。

### 方針

`<fieldset>` 自体は残し、**視覚的に冗長な `<legend>` をすべて削除**する。`.sec-provider` を含めた全 4 箇所を同じ方針で揃えることで、カード間で見出し構造が不揃いになるのを防ぐ。グループの意味づけは `<fieldset>` 自体が担保するため、legend 無しでもフォーム制御上のグループは維持される。

### 実装手順

1. `extension/options.html` を開く
2. 以下 4 箇所の `<fieldset>` 直下にある **`<legend>` 要素ごと** 削除する。中の `<span data-i18n="...">` ごと消し、`<fieldset>` 自体は残す。空の `<legend></legend>` を残さない
   - `sec-provider`（`<legend><span data-i18n="options_provider">...`）
   - `sec-default-no-selection`（`<legend><span data-i18n="options_section_default_action_no_selection">...`）
   - `sec-default-selection`（`<legend><span data-i18n="options_section_default_action_selection">...`）
   - `sec-behavior`（`<legend><span data-i18n="options_section_behavior">...`）
3. `extension/css/options.css` の `legend { ... }` ルールは出現しなくなるため削除する
4. スクリーンリーダー向けにグループ名を残したい場合は、各 `<fieldset>` に `aria-label` でカード見出しと同じ文言を付ける（`data-i18n` はそのまま利用）。本修正ではまず視覚的冗長さの解消を優先し、`aria-label` 化は必須ではない

### 補足

- `<fieldset>` 自体はフォーム制御・アクセシビリティ上のグループ化として残す
- `<legend>` を消して `aria-label` も置かない場合、スクリーンリーダーで `<fieldset>` のグループ名が読まれなくなるトレードオフを受け入れる意思表示になる。本修正では視覚的冗長さの解消を優先しこれを受容するが、将来アクセシビリティ上問題が出れば `aria-label` 化へ展開する
- HTML 構造テスト（`test/static/options-structure.test.js`）が `fieldset` 内の `legend` 存在を必須検証している場合は、併せてテスト期待値を更新する（後述）

## 修正 2: Backup & Sync のボタンをデスクトップでも 1 列にする

### 現状の問題

`Backup & Sync` カードでは `.backup-actions` が

```css
grid-template-columns: repeat(2, minmax(0, 1fr));
```

となっており、デスクトップでも 2 列表示される。ボタン文言が長いため、横幅不足で折り返しや詰まりが発生している。

### 方針

`Backup & Sync` のボタン群は、デスクトップでもモバイルでも **常に 1 列** にする。

### 実装手順

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
3. `@media (max-width: 720px)` 内にある `.backup-actions { grid-template-columns: 1fr; }` は冗長になるので削除する
4. 1 列化によって `Backup & Sync` カードの縦長が増えるため、`syncSaveBarHeight()` によって `main` の `padding-block-end` が save-bar 高さへ追従していることを、実装後に Chrome / Firefox で手動確認する。最後のボタンが fixed save-bar に隠れないことを確認する（テスト自動化の対象外）

### 補足

- 2 列にする意図があったとしても、現状は文言の収まりが悪いので、1 列化を優先する
- `align-items: stretch` にすると `.checkbox-item` まで cross axis 方向に広がり、Include API key の小さな設定1行のためだけに外枠が全幅取ってしまう。`flex-start` で内容幅に収める方が視覚的に自然
- save-bar 回避余白の計算は `--save-bar-height` に依存するため、高さ同期ルールが壊れていないことを手動で担保する

## 修正 3: 「API キーを含める」を Export ボタンの近くへ移動する

### 現状の問題

`Include API key` チェックボックスは `Export options to file` のみに効く設定だが、現在は `Backup & Sync` カードの末尾に離れて配置されている。関連性が見えにくい。

### 方針

`Include API key` チェックボックスは `Export options to file` ボタンの直下に配置する。

### 実装手順

1. `extension/options.html` を開く
2. `sec-backup` 内の `.backup-actions` を以下の順序に並べ替える

- `exportFile` ボタン
- `exportApiKey` チェックボックス
- `importFile` ボタン
- `syncCloud` ボタン
- `restoreCloud` ボタン

3. `exportApiKey` を `.backup-actions` の外に置くのではなく、**Export ボタンに視覚的に近接する位置**として `exportFile` の直後へ配置する

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

4. `extension/css/options.css` には、`exportFile` と `exportApiKey` の視覚的隣接性を固定するため、必要に応じて次の最小ルールを追加する

```css
.export-api-key-option {
  margin-block-start: 0;
}
```

   - `.backup-export-group` のような二重ラッパは作らず、`.backup-actions` が 1 列のフラットな並びを維持する

### 補足

- `exportApiKey` の ID は変えない
- `options.js` 側の参照はそのまま使えるため JS 変更不要
- 静的テストには「`#exportFile` の次兄弟が `#exportApiKey` を含むこと」と書く。推奨 DOM では `#exportFile` の直後が `<div class="checkbox-item export-api-key-option">` で、その中に `<input id="exportApiKey">` があるため、テストは「`#exportFile` の `nextElementSibling` が `#exportApiKey` を含むこと」として表現し、配置意図を固定する

## 修正 4: 非選択 provider カードが明るく目立つ問題を改善する

### 現状の問題

非選択側の provider カードには `.is-inactive-provider` が付くが、現在は

```css
.card.is-inactive-provider {
  background: var(--nc-bg-1);
  border-color: var(--nc-bg-3);
}
```

で背景が `var(--nc-bg-1)` になる。これがライト／ダークで**逆方向に効く**ことが「明るく目立つ」の本質である:

| テーマ | `--nc-bg-1` | 標準カード `--nc-bg-2` | 見え方 |
|---|---|---|---|
| Light | `#FFFFFF` | `#F6F8FA` | **非選択が白くなり前面へ出る**（指摘の現象） |
| Dark  | `#000000` | `#111111` | 非選択が沈み、奥に引く（本来狙いたい挙動） |

`--nc-bg-1` と `--nc-bg-2` の大小関係はテーマで逆転するため、背景の入れ替えでは両テーマで一貫した「弱表示」を作れない。背景を触る方針を採ると、ライトを直すために `--nc-bg-3` などを背景に流用する必要が出てきて、境界色を背景に転用する副作用やテーマ変数の責務混入を生む。

### 方針

**背景は触らない。** テキスト色と境界表現の差だけで「未選択」を表す。`--nc-tx-2` は両テーマで本文より一段弱い色（Light `#1A1A1A`、Dark `#EEEEEE`）であるため、テーマ非依存で弱表示を作れる。背景を入れ替えないことで、ライトで「前面へ出る」問題も再発しない。

### 実装手順

1. `extension/css/options.css` を開く
2. 以下のルールを見直す

- `.card.is-inactive-provider`
- `.card.is-inactive-provider h2`
- `.provider-card-content.is-inactive-provider`

3. 背景の上書きをなくし、代わりに **境界を dashed に弱め、テキストを `--nc-tx-2` に統一** する

```css
.card.is-inactive-provider {
  background: var(--nc-bg-2);      /* 標準カードと同じ背景。入れ替えない */
  border-color: var(--nc-bg-3);
  border-style: dashed;             /* 実線→破線で“未使用”を示す */
}

.card.is-inactive-provider h2,
.card.is-inactive-provider label,
.card.is-inactive-provider .field-hint {
  color: var(--nc-tx-2);            /* 両テーマで本文より一段弱 */
}

.provider-status {
  /* 既定の色を維持。非選択側は空文字で非表示になるため、ここでは触らない */
}
```

4. 入力コントロールの背景は上書きしない（`new.min.css` 既定の背景を維持）。ライトで入力が白く浮き上がる副作用を避けるため、`input/select/textarea` に対する `background: var(--nc-bg-1)` は適用しない
5. `filter: grayscale(...)` 系は採用しない。ダークテーマではコントラストが元々弱く、彩度低下が載ると文字がさらに読みにくくなるため
6. アクティブ側カードは既定の実線で強調されたままなので、アクティブ／非アクティブ双方で境界表現に差が付く。これだけで両テーマで“使用中／未使用”が視認できる

### 期待される見え方

| テーマ | 非選択カード背景 | 非選択カード境界 | 非選択カード文字 | 判定 |
|---|---|---|---|---|
| Light | `#F6F8FA`（標準と同じ） | 破線 `#E5E7EB` | `#1A1A1A` | 背景は浮かず、破線と淡い文字で沈む |
| Dark  | `#111111`（標準と同じ） | 破線 `#222222` | `#EEEEEE` | 背景は浮かず、破線と淡い文字で沈む |

### 補足

- 「薄くする」ためだけに `opacity: 0.6` などをカード全体へ掛けるのは避ける（文字・入力欄まで一括で薄くなり、可読性と操作感を損なうため）
- 現在の計画どおり、非選択カードの入力自体は編集可能のままにする（`disabled` / `readonly` / `aria-disabled` は付与しない）
- `filter: grayscale(...)` を含む彩度低下系は、ダークテーマでの読みやすさを損なうため本件では使わない

### 実装時の引き返し線

修正 4 を実装する時はまず **`--nc-tx-2` + `border-style: dashed` だけで両テーマに切り替えて確認する**。両テーマとも `--nc-tx-2` は本文 `--nc-tx-1` との差が小さく（Light は `#1A1A1A` vs `#000000`、Dark は `#EEEEEE` vs `#FFFFFF`）、「一段弱い」表現が視覚的に足りない可能性がある。ダークではさらに `--nc-bg-3` が `#222222` で背景 `--nc-bg-2` `#111111` と差が小さく、破線がほぼ消えて「ふち無しカード」に見える恐れもある。

実装後、ライトで非選択が“浮く”現象が再発していないか、ダークで境界が消えすぎていないかを確認し、いずれかで不十分なら次へ展開する:

- テーマ別変数 `--options-inactive-text` / `--options-inactive-border` を `body[data-theme="light"]` / `body[data-theme="dark"]` で定義し、`--nc-tx-2` / `--nc-bg-3` ではなく、ライト・ダークそれぞれで意図通りの方向・差になる色を直接指定する
- アクティブ側を浮かせる補強（アクティブ側 `h2` を `--nc-tx-1` に明示、またはアクティブ側カードに `--nc-lk-1` 系のインライン強調を付ける）を追加し、アクティブ／非アクティブ双方で差を付ける

この二段構えにより、最小構成で試して不十分な場合だけテーマ別変数へ広げる判断線を明示する

## 修正後の確認観点

1. `API Provider` / `Default Actions` 系 / `Behavior` の各カードで、見出しが 1 回だけに見えること
2. `Backup & Sync` の 4 ボタンがデスクトップでも縦 1 列で表示されること
3. `Include API key` が Export ボタンの直下にあり、意味上の関連が見て取れること
4. 非選択 provider カードが「未選択」と分かる程度に弱く見え、かつ文字が十分読めること（ライト・ダーク両テーマで）
5. `npm run lint` と `npm test` が通ること
6. Chrome / Firefox の両テーマで、`Backup & Sync` カード末尾が fixed save-bar に隠れていないこと

## 想定されるテスト更新

今回の修正では以下を**必須**で行う。

- `test/static/options-structure.test.js`
  - `fieldset` 内の `legend` 期待値（`expect(fieldset?.querySelector("legend")).not.toBeNull()`）は、全 4 箇所で legend を削除した結果落ちるため、**legend 存在検証を取り除く**か、`aria-label` 化した場合は `aria-label` 検証へ差し替える
  - `Backup & Sync` 内で `exportApiKey` を含むグループが `exportFile` の直後にあることを検証する（兄弟順序ベースで可）

実装順の終盤でこれらを反映しないと `npm test` が即座に落ちるため、HTML/CSS 変更と同一コミットでテスト期待値も更新する。

## 実装順の推奨

1. HTML 側の `legend` 削除（4 箇所すべて）と `exportApiKey` 移動
2. CSS 側の `.backup-actions` 1 列化と `export-api-key-option` の余白調整
3. 非選択 provider カードの配色調整（背景は触らず、境界 dashed + `--nc-tx-2`）
4. `test/static/options-structure.test.js` の期待値更新（legend 検証の取り下げ、`exportApiKey` 隣接検証の追加）
5. `npm run lint`
6. `npm test`
7. Chrome / Firefox 両テーマで手動 smoke（save-bar と重ならないこと、非選択カードが弱く見えること）

## 非ゴール

- options.js の保存ロジック変更
- locale 文言の追加・削除
- カード構成そのものの再設計
- 非選択 provider カードの `disabled` 化

以上。