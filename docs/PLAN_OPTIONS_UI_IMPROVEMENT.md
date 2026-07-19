# オプション画面 UI 改善 実装計画書

## 背景と目的

`extension/options.html` は設定項目の増加に伴い、`<hr>` 区切りの縦長リスト構造となり、目的の設定を探す際の視認性・操作性が低下している。本計画は `new.min.css` のデザイン言語を尊重しつつ、シンプルさを維持した UI への再構築を目的とする。

## 方針の決定事項

初期検討で作成したデザイン案のレビューを経て、以下の方針が確定した。

| 項目 | 決定内容 |
| --- | --- |
| 基本レイアウト | **[デザイン案 06](./options-ui-design-06-sidebar-scrollspy.html)（サイドバー + スクロールスパイ）ベースの11セクション構成** |
| Save ボタン | **[デザイン案 10](./options-ui-design-10-sticky-bottom-save-bar.html)（ボトム固定バー）** を採用。`position: fixed` で実装し、スクロール中も常に画面内に表示（末尾要素への `position: sticky; bottom: 0` ではページ上部で見えなくなるため不採用） |
| セクション統合 | 行わない。「1カード = 1テーマ」の原則で11カードに分割 |
| 折りたたみ / ウィザード / ページ切り替え | 採用しない。全項目を常時表示 |
| CSS 配置先 | **`extension/css/options.css` を新設**（`common.css` には追記しない） |
| モバイル（720px 以下） | サイドバーは**非表示**。カードのみの1カラム表示。save-bar は下端に fixed 維持 |
| スクロールスパイ | `options.js` に実装する |
| RTL 対応 | グリッドのカラム順は `dir` に自動追従させ、ボーダー・余白は CSS 論理プロパティを使用する |
| プロバイダ別カード | `Gemini API` / `OpenAI-compatible API` は**常時表示**し、非選択側は弱く表示する |
| アンカージャンプ余白 | `scroll-margin-block-start: 1rem` |
| 既存要素 ID / `data-i18n` | **既存 ID は保存ロジック互換のため維持し、DOM 構造のみ再編**する。`data-i18n` はセクション見出し用に最小限追加する |

### 参考プロトタイプ

最終方針の判断根拠として、以下の 3 案のみ `docs/` 直下に保存する。`docs/` 直下に置くことで、プロトタイプ内の `../extension/...` 相対参照（CSS / 画像）を変更せずに維持できる。

- [デザイン案 06: Sticky Sidebar + Scrollspy](./options-ui-design-06-sidebar-scrollspy.html)
- [デザイン案 08: Sidebar + Merged Mega-Cards](./options-ui-design-08-sidebar-mega-cards.html)
- [デザイン案 10: Sticky Bottom Save Bar](./options-ui-design-10-sticky-bottom-save-bar.html)

その他の探索用 HTML はリポジトリへ残さず、本計画書に判断結果のみを記録する。

## 画面構造（確定レイアウト）

```text
+----------------------------------------------------------+
| header (タイトル + アイコン)                               |
+----------+-----------------------------------------------+
| sidebar  | section.card × 11                              |
| (sticky) |   1. API Provider                              |
| nav 11件 |   2. Gemini API                                |
|          |   3. OpenAI-compatible API                     |
|          |   4. Language                                  |
|          |   5. Default Actions (no selection)            |
|          |   6. Default Actions (selection)               |
|          |   7. Custom Actions (no selection)             |
|          |   8. Custom Actions (selection)                |
|          |   9. Behavior                                  |
|          |  10. Appearance                                |
|          |  11. Backup & Sync                             |
|          +-----------------------------------------------+
+----------------------------------------------------------+
| .save-bar (fixed bottom: viewport 下端に常時表示)          |
|   [Save options]  Options saved.                         |
+----------------------------------------------------------+
```

- 11セクションの並びは現行の出現順を維持する（Provider → Gemini → OpenAI → Language → Actions ×2 → Custom ×2 → Behavior → Appearance → Backup）。「1カード = 1テーマ」の原則に基づき、Behavior（チェックボックス5件）・Appearance（テーマ/フォントサイズ）・Backup & Sync（Export/Import/Sync/Restore）をそれぞれ独立したカードとする。
- `Gemini API` と `OpenAI-compatible API` のカードは provider 切り替え時も常時表示する。非選択側は `is-inactive-provider` のような状態クラスを付与してコントラストを落とし、「現在使わない設定」であることだけを示す。これによりサイドバー、アンカージャンプ、スクロールスパイとの整合を保つ。

## セクション再編マッピング

現行の `<hr>` 区切り（14区画）から、11カードへの再編を行う。

| # | カード | 収録する現行要素 |
| --- | --- | --- |
| 1 | API Provider | `apiProvider` ラジオ2件 |
| 2 | Gemini API | `#geminiSection`（apiKey / languageModelContainer / userModelId） |
| 3 | OpenAI-compatible API | `#openaiSection`（openaiApiKey / openaiBaseUrl / openaiModelId / openaiReasoningEffort / openaiThinkingType） |
| 4 | Language | languageCodeContainer / userLanguage |
| 5 | Default Actions (No Selection) | `noTextAction` ラジオ5件 |
| 6 | Default Actions (Selection) | `textAction` ラジオ5件 |
| 7 | Custom Actions (No Selection) | contextMenuLabel1〜3 / noTextCustomPrompt1〜3 |
| 8 | Custom Actions (Selection) | contextMenuLabel1Text〜3Text / textCustomPrompt1〜3 |
| 9 | Behavior | contextMenus / streaming / renderLinks / autoSave / openResultsInTab チェックボックス5件 |
| 10 | Appearance | theme / fontSize セレクト2件 |
| 11 | Backup & Sync | Export/Import/Sync/Restore button 群、exportApiKey チェックボックス |

> **メモ**: カード9〜11は現行 HTML では見出しのない区画であったため、カード見出し用の新規 i18n キーを追加する（後述）。また、カード5〜8も既存キーは説明文としては使えるが、カード見出し・サイドバー文言としては長すぎるため、短い section title キーを別途導入する。これにより [デザイン案 08](./options-ui-design-08-sidebar-mega-cards.html) で検討した `.sub` / `<h3>` サブ見出しパターンは不要となり、CSS・HTML ともシンプルになる。

## 変更ファイル一覧

| ファイル | 変更内容 |
| --- | --- |
| `extension/options.html` | 構造再編（カード化・サイドバー追加・save-bar 追加）。`<hr>` を全廃。`options.css` の `<link>` を追加 |
| `extension/css/options.css` | **新規作成**。カード / サイドバー / save-bar / フォーム部品のスタイルを集約 |
| `extension/css/common.css` | **変更なし**（テーマ変数・フォントサイズの共通土台として現状維持） |
| `extension/options.js` | スクロールスパイを追加し、同ファイルから named export するテスト可能な provider / persistent status / host permission save / action handler helper を用いて、provider 切り替え UI を「非選択カードの弱表示」に変更。初期化完了前は保存系操作を無効化し、action handler の登録も初期化成功後へ寄せる。Save / Export / Sync の全保存入口で、OpenAI host permission の拒否と API 例外を分けて扱う |
| `extension/utils.js` | `ensureHostPermission()` の戻り値を tri-state（`granted` / `denied` / `error`）へ拡張し、OpenAI host permission の拒否と API 例外を options 側で分岐可能にする |
| `extension/_locales/*/messages.json` | セクション見出し / サイドバー、一般的な select 値・placeholder、初期化失敗メッセージ、host permission API 失敗メッセージ用の新規 i18n キーを追加（後述） |
| `test/static/options-structure.test.js` | **新規作成**。options.html の構造整合（11セクション/アンカー/ID 維持/見出し DOM 分離/css 読み込み順）を静的に検証する（後述 §5-1） |
| `test/helpers/options-dom.js` | **新規作成**。named export した helper / factory を jsdom 上で呼び出すための最小 DOM セットアップと共通 query を提供する helper（後述 §5-2） |
| `test/dom/options-provider-status.test.js` | **新規作成**。provider 状態ラベル残存を jsdom 上で動的に検証する（後述 §5-2）。新規依存は追加しない |
| `test/dom/options-persistent-status.test.js` | **新規作成**。`persistentStatus` の遅延表示・予約キャンセル・高さ同期順序を jsdom 上で動的に検証する（後述 §5-3）。新規依存は追加しない |
| `test/unit/options-host-permission.test.js` | **新規作成**。host permission 付き保存 helper の拒否・許可・不要ケースと、依存性注入した Save / Export / Sync handler が共通 helper を経由することを検証する（後述 §5-4）。新規依存は追加しない |
| `test/unit/utils.test.js` | `ensureHostPermission()` の tri-state 契約（許可済み / 拒否 / API 例外 / 不正 URL）を既存 unit test に追記する |

## 詳細設計

### 1. HTML（options.html）

- `<body>` 直下に `.layout`（CSS Grid: `180px 1fr`）を配置
- 既存 header の inline style は廃止して `options.css` に移す。`new.min.css` 既定の full-bleed header を options page 向けに明示的に上書きするため、`header` / `#header` / header 内 `img` / タイトル span の専用ルールを `options.css` に置く。アイコンとタイトルの間隔には物理方向の `margin-right` ではなく `margin-inline-end` を使用し、タイトル span の `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` は CSS へ移して維持する
- 左カラム: `<nav class="sidebar" aria-labelledby="header">` に11件のアンカーリンク（`#sec-*`）。既存のページタイトル `#header` を参照してナビゲーションの対象を支援技術へ伝える。API Provider カード見出しを参照して「API Provider ナビゲーション」と誤って命名しないため、新規 i18n キーは追加しない
- 右カラム: `<main>` 内に `<section class="card" id="sec-*">` を11個
- 各カードの先頭に `<h2>` を置く。カード見出しとサイドバー文言は、説明文用キーではなく**短い section title キー**を使う
- `<hr>` は全て削除する
- フォーム部品は `.form-group`（`<label for>` + 入力 + `<small>` 補足）で統一する。すべての input / select / textarea は、ラジオ・チェックボックスを含めて明示的な `<label for="対象 ID">` を持たせる。`apiKey`、`openaiApiKey`、`openaiBaseUrl`、各モデル ID、`userLanguage`、custom action の各ラベル・prompt、`theme`、`fontSize` に適用する。補足文は固有 ID を付け、対象コントロールの `aria-describedby` から参照する。`templates.html` から挿入する `languageModel` / `languageCode` についても、コンテナ外の `<label for>` を options.html に置いて関連付け、テンプレート内の select ID を維持する
- API Provider、Default Actions (No Selection)、Default Actions (Selection) の各ラジオ群は `<fieldset>` と `<legend>` で囲み、選択肢に入った時点でグループ名を支援技術へ伝える。Behavior の5チェックボックスも関連設定として `<fieldset>` / `<legend>` でグループ化する。カードの `<h2>` と `<legend>` の文言が重複しても、見出しはナビゲーション、legend はフォーム操作という別の意味を持つため省略しない
- 入力コントロールは `width: 100%; box-sizing: border-box;` でカード幅に揃える（現行の `size="39"` / `cols="80"` 属性は廃止）
- save-bar は `.layout` の外（`<body>` 直下の最後）に配置し、`position: fixed` で viewport 下端に固定する:

```html
<div class="save-bar">
  <div class="save-bar-inner">
    <button id="save" data-i18n="options_button_save" disabled>Save options</button>
    <span id="status" class="save-status" aria-live="polite"></span>
    <span id="persistentStatus" class="save-status" role="status" hidden></span>
  </div>
</div>
```

- 見出しの DOM は、i18n 適用が `textContent` 上書き（[extension/options.js](extension/options.js) 現行の `[data-i18n]` 一括代入）で状態ラベルを消さないよう、タイトル用 span と状態ラベル用 span を分離する。タイトルと状態ラベルが詰まらないよう、状態ラベル側には CSS で `margin-inline-start` を与える。`data-i18n` は内側の span にのみ付ける:

```html
<section class="card" id="sec-gemini">
  <h2><span data-i18n="options_provider_gemini">Gemini API</span><span class="provider-status"></span></h2>
  ...
</section>
```

- `persistentStatus` は既存の ID を維持したまま save-bar 内へ統合する。Import / Restore / host permission に関する重要メッセージを、スクロール位置に関わらず確認できるようにする
- Backup & Sync の `exportFile` / `importFile` / `syncCloud` / `restoreCloud` は、`<a>` ではなく **`<button type="button">`** として配置する。ID は維持し、`options.js` 側の参照互換は保つ。初期 markup では `disabled` を持たせ、`options.js` は初期化成功後にだけ有効化する。見た目は「リンク風」ではなく**明確に button と分かる**ものにするが、save-bar 内の主ボタン `#save` より視覚的な強さは一段落とし、塗りつぶしではなく secondary / outline 系の表現を採用する
- Export の「Include API key」チェックボックスはカード11（Backup & Sync）内に配置する
- `#geminiSection` / `#openaiSection` は ID を維持しつつ、`display: none` ではなく状態クラスで弱表示を切り替える
- `target="_blank"` の Google AI Studio / Extension FAQ の外部リンクにはすべて `rel="noopener noreferrer"` を付与する
- `<head>` のスタイル読み込みは以下の順序とする:

```html
<link rel="stylesheet" href="css/new.min.css">
<link rel="stylesheet" href="css/common.css">
<link rel="stylesheet" href="css/options.css">
```

### 2. CSS（options.css 新規作成）

`extension/css/options.css` に以下を集約する。`common.css` には一切追記しない（`common.css` はテーマ変数 `--nc-*` とフォントサイズのみを持つ共通土台として責務を維持し、ページ専用スタイルの混入を防ぐ）。

いずれのルールも `common.css` で定義済みの CSS 変数 `--nc-*` を使用するため、別ファイルでもテーマ追従はそのまま機能する:

```css
/* Body: new.min.css / common.css の幅制約を上書きし、共通の inline padding で .layout / .save-bar-inner の内容端を揃える */
:root { --options-page-padding: 2rem; }
/* box-sizing: border-box で padding を幅 900px の内側に含め、save-bar-inner と同じ外形幅・内容端で揃える */
body { width: 100%; max-width: 900px; box-sizing: border-box; margin: 0 auto; padding: var(--options-page-padding); overflow-x: hidden; }

/* Header: new.min.css の full-bleed header を options page 向けに打ち消し、本文グリッドと同じ内容端に揃える */
header { background: transparent; border-block-end: 0; margin-block: 0 1rem; margin-inline: 0; padding-block: 1rem 0; padding-inline: 0; }
#header { display: flex; align-items: center; }
#header img { margin-inline-end: .5rem; }
#header span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Options page layout */
/* CSS Grid のカラム順は body[dir] に自動追従するため、RTL ではサイドバーが右に移る。ボーダー・余白は論理プロパティで書き、RTL 対応を明示する */
.layout { display: grid; grid-template-columns: 180px 1fr; gap: 2rem; align-items: start; }
.sidebar { position: sticky; inset-block-start: 1rem; max-block-size: calc(100vh - var(--save-bar-height, 7rem) - 2rem); max-block-size: calc(100dvh - var(--save-bar-height, 7rem) - 2rem); overflow-y: auto; padding-block-end: .5rem; }
.sidebar a { display: block; padding: .35rem .6rem; border-radius: 4px; color: var(--nc-tx-2); text-decoration: none; font-size: .9em; border-inline-start: 3px solid transparent; }
.sidebar a:hover { background: var(--nc-bg-2); color: var(--nc-tx-1); }
.sidebar a.active { border-inline-start-color: var(--nc-lk-1); color: var(--nc-tx-1); font-weight: 600; background: var(--nc-bg-2); }
main { padding-block-end: var(--save-bar-height, 7rem); }

/* Cards */
.card { background: var(--nc-bg-2); border: 1px solid var(--nc-bg-3); border-radius: 8px; padding: 1.25rem; margin-block-end: 1rem; scroll-margin-block-start: 1rem; }
.card h2 { margin-block-start: 0; font-size: 1rem; color: var(--nc-tx-2); border-block-end: 1px solid var(--nc-bg-3); padding-block-end: .5rem; margin-block-end: 1rem; }
.layout main > .card:last-child { margin-block-end: 0; }
.card.is-inactive-provider { background: var(--nc-bg-1); border-color: var(--nc-bg-3); }
.card.is-inactive-provider h2 { color: var(--nc-tx-2); }
.provider-status { margin-inline-start: .5rem; font-size: .85em; font-weight: normal; color: var(--nc-tx-2); }

/* Forms */
.form-group { margin-block-end: 1rem; }
.form-group > label { display: block; margin-block-end: .25rem; font-weight: 500; }
.form-group input:not([type="radio"]):not([type="checkbox"]),
.form-group select, .form-group textarea { width: 100%; box-sizing: border-box; }

/* Fixed save bar: .layout の外に配置し、スクロール位置に関わらず viewport 下端に常時表示する */
.save-bar { position: fixed; inset-inline: 0; inset-block-end: 0; z-index: 10; background: var(--nc-bg-1); border-block-start: 1px solid var(--nc-bg-3); }
/* body の最大幅（900px）と共通 inline padding を使い、固定バーの内容端とページ本文の内容端を一致させる */
.save-bar-inner { box-sizing: border-box; max-width: 900px; margin: 0 auto; padding: .6rem var(--options-page-padding); display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
.save-bar button { margin-block-end: 0; }
.save-status { flex: 1 1 16rem; color: var(--nc-tx-2); font-size: .9em; min-width: 0; overflow-wrap: anywhere; }

/* Backup & Sync actions: button には見えるが、save-bar の primary Save ボタンより弱い secondary/outline 表現にする */
.backup-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
.backup-actions button { width: 100%; margin-block-end: 0; background: var(--nc-bg-1); color: var(--nc-tx-1); border: 1px solid var(--nc-bg-3); }
.backup-actions button:hover:not(:disabled) { background: var(--nc-bg-2); }
.backup-actions button:focus-visible { outline: 2px solid var(--nc-lk-1); outline-offset: 2px; border-color: var(--nc-lk-1); }
.backup-actions button:disabled { color: var(--nc-tx-2); background: var(--nc-bg-1); }

/* Mobile: hide sidebar, single column */
/* ※ 720px は .layout の 1カラム化用閾値。body 自体は常に width: 100%; max-width: 900px; のまま保ち、ここではレイアウトだけを切り替える */
@media (max-width: 720px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar { display: none; }
  /* --save-bar-height は安全領域ぶんの padding を含む実測値なので、ここでは再加算しない */
  main { padding-block-end: var(--save-bar-height, 7rem); }
  .save-bar-inner { padding-block-end: calc(.6rem + env(safe-area-inset-bottom)); }
  .backup-actions { grid-template-columns: 1fr; }
}
```

- `new.min.css` / `common.css` の `body` 幅制約を上書きするため、`options.css` 先頭で上記コードブロック冒頭の `body` 宣言を置く。コードと散文で sizing 方針を一致させる。`new.min.css` の `body { max-width: 750px; padding: 2rem }` と `common.css` の `body { width: 640px; }` / `@media (max-width: 639px) { body { width: 84% } }` をそのまま残すと、広幅では本文が 750px に留まり、狭幅では save-bar と本文の左右端が揃わなくなる。そのため以下まで上書きし、ページシェルの sizing 方針を一元的に定義する:
  - `--options-page-padding: 2rem` を定義し、`width: 100%; max-width: 900px; box-sizing: border-box; margin: 0 auto; padding: var(--options-page-padding); overflow-x: hidden;` をまとめて宣言して、`new.min.css` 由来の横 padding を保ったまま外形幅を 900px に揃える
  - `padding` を残したまま `overflow-x: hidden` を維持し、狭幅でも水平はみ出しを防ぐ
  - `body` と `.save-bar-inner` の**外形幅**をともに最大 900px に揃えて中央寄せし、さらに両者に共通の `--options-page-padding` を適用して、本文と save-bar の**コンテンツ開始・終了位置**を一致させる

> `body` と `.save-bar-inner` は外形幅を最大 900px に揃えたうえで、共通の `--options-page-padding` を使用する。そのため、fixed save-bar とページ本文は外形だけでなく、フォーム・ボタン・テキストの内容端も同じ位置に揃う

- RTL 対応: レイアウトは `border-inline-start` / `border-block-end` / `margin-inline-end` など CSS 論理プロパティで記述する。CSS Grid のカラム順は `dir` に従うため、RTL ロケール（ar）ではサイドバーが右側に、インジケータが右端に自動的に移る。`margin-left` / `margin-right` / `margin-top` / `margin-bottom` / `padding-left` / `padding-right` / `padding-top` / `padding-bottom` / `border-left` / `border-right` / `border-bottom` のような物理方向プロパティは、`options.css` と再編対象の header に使用しない。header の上書きでも `margin-inline-end` / `border-block-end` などの論理プロパティを用い、`new.min.css` 由来の物理方向指定を持ち込まない
- **サイドバーの縦方向あふれ対策**: `.sidebar` は `inset-block-start: 1rem` に加え、`max-block-size: calc(100vh - var(--save-bar-height, 7rem) - 2rem); max-block-size: calc(100dvh - var(--save-bar-height, 7rem) - 2rem); overflow-y: auto; padding-block-end: .5rem;` を持つ。これにより低いウィンドウ、ブラウザ拡大、大きいフォントでも、fixed save-bar に隠れず11項目すべてへ到達できる。古い環境では前者の `100vh` フォールバックが適用され、新しい環境では正確な動的 viewport 単位の後者が上書きする
- `main` の下余白は save-bar の実測高さを CSS 変数 `--save-bar-height` として反映し、fixed save-bar が最終カードや Backup & Sync の button 群に重ならないようにする。加えて、`main` 末尾のカードの `margin-block-end` は `0` に固定し、最後のカード外側マージンが save-bar 回避余白の計算を曖昧にしないようにする。初期値は `7rem` とし、`initSaveBarHeight()` はまず `.save-bar` の高さを即時反映する。`ResizeObserver` が利用できる環境では、高さが変化するたびに `document.documentElement.style.setProperty()` でピクセル値を更新する。利用できない環境では、以下の3系統で再計測する: (a) `window` の `resize`、(b) `.save-bar` を `childList` / `characterData` / `subtree` / `attributes`（`attributeFilter: ["hidden"]`）で監視する `MutationObserver`（`persistentStatus` の `hidden` トグルは属性変更であり、`childList` / `characterData` だけでは捕捉できないため `attributes` 監視が必須）、(c) `syncSaveBarHeight()` の明示呼び出し。明示呼び出しのタイミングは、少なくとも **i18n 適用と `setOptionsToForm()` 完了後の初期表示時**、**`setPersistentStatus()` の次フレーム内で文言を代入した直後**、**予約をキャンセルして即時クリアした直後**、**保存後に `applyFontSize()` / `applyTheme()` を呼んだ直後** とする（フォントサイズ・テーマ変更は `body` の属性変更であり `.save-bar` 配下の mutation として現れないため、observer だけでは捕捉できない）。これにより大きいフォント、長い翻訳文、`persistentStatus` の可変長メッセージを含めても必要な余白を確保する。モバイルでは `.save-bar-inner` に `env(safe-area-inset-bottom)` を加算し、その高さを実測するため、`main` 側では安全領域を再加算しない
- **save-bar の水平オーバーフロー対策**: `persistentStatus` には `options_save_required_for_host_permission` など長文メッセージが入るため、デスクトップ幅でも `.save-bar-inner` が単一行に収まるとは限らない。`.save-bar-inner` は常に `flex-wrap: wrap` を有効にし、長文時は2行目以上に折り返して Save ボタンを押し潰さない。`.save-status` は `flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere;` とし、flex アイテムの縮小と、空白のない長い URL・翻訳文の任意位置での改行を許容する。高さ計測は折り返し分の増分にも追従するため、最終カードとの重なりを防ぐ設計とする
- **Backup & Sync button の視覚優先度**: `#save` は save-bar 内の主操作として既定の button スタイルを保ち、Backup & Sync の button 群は `.backup-actions button` で **secondary / outline** に寄せる。操作であることが一目で分かる border と余白は維持しつつ、背景色・コントラスト・塗りの強さは `#save` より弱くし、画面内の主従関係を崩さない。リンク風テキストにはしない。`outline` と `border-color` はどちらもテーマ変数 `var(--nc-lk-1)` を使うため、light/dark 両テーマでフォーカス可視性を確保する。補助的な `box-shadow` には依存せず、`outline` / `border-color` のみでキーボードフォーカスを成立させる
- 非選択 provider カードの弱表示ではカード全体の `opacity` を下げない。背景・境界線・任意の状態ラベル（例: `Current provider`）で状態を示し、テキストや入力欄のコントラストを維持する。
- **フォーカス・編集ポリシー**: 非選択側カードは弱表示のみで、入力欄に `disabled` / `readonly` / `aria-disabled` は付与しない。Tab 移動でフォーカスが当たり、値の編集も可能なままとする。これは「後で provider を切り替えたくなったとき、直前に値をためておける」UX を意図したものであり、誤保存リスクよりも操作性を優先する。保存ロジックは非選択側の値も入力済みの内容をそのまま取得する現行仕様（`getOptionsFromForm` が `document.getElementById(...).value` で直接取得）を維持し、「編集可能な非選択カード」を公式挙動とする。誤入力を完全に防止したい場合は別途 `disabled` 化のサブ計画に分離する。本計画のスコープでは編集を許容する
- フォントサイズ設定（`data-font-size`）との整合: 既存の larger/smaller 指定は維持。カード内 `h2` の `font-size: 1rem` は `body[data-font-size]` の各 h1 指定と干渉しないことを確認する
- **ファイル分割の理由**: `.card` / `.sidebar` / `.save-bar` / `.form-group` は汎用的な名前であり、`common.css` に置くと他ページ（popup/results）から「共通部品」と誤認されて流用され、オプション画面への意図しない副作用を招く恐れがある。ページ専用ファイルに閉じ込めることで、シンプルなクラス名を安全に使い、長期的なメンテナンス性を確保する

### 3. JavaScript（options.js）

- **既存ロジックの維持**: `saveOptions` / `restoreOptions` / `initialize` / 各種イベントリスナーは原則として変更しない。**既存 ID は保存ロジック互換のため維持し、DOM 構造のみ再編**する
- **追加: テスト対象の分離**: `options.js` のテスト対象ロジックは、`document` や対象要素、依存 API を**引数で受ける helper / factory** として切り出す。`persistentStatus` などの DOM 要素をモジュールスコープで `getElementById()` して保持し続ける形は避け、`updateProviderCards(documentRef, ...)`、`createPersistentStatusUpdater(persistentStatusElement, ...)`、`createHostPermissionSaveGuard(...)`、`createOptionsActionHandlers(...)` のような引数注入型に寄せる。トップレベルに残す副作用は `DOMContentLoaded` での起動配線に限定し、DOM テストは module cache や再 import 順に依存しない前提で組み立てる
- **追加: 初期化レース対策**: template 挿入前に Save / Export / Import / Sync / Restore が押される race を防ぐため、保存系 UI は**初期化完了まで無効状態で開始**する。`DOMContentLoaded` ではまず Save / Export / Import / Sync / Restore button を `disabled` にし、`await initialize()` が成功した場合にだけ有効化しつつ action handler を登録する。初期化失敗時だけでなく、初期化中も未完成 DOM を読む処理へ進ませない
- **例外1: provider UI**: `updateProviderUI()` は `display: none` 切り替えではなく、`#geminiSection` / `#openaiSection` に状態クラスを付与する実装へ変更する。DOM 更新処理は `options.js` の `UI helpers` セクションに `export` する `updateProviderCards(documentRef, isGemini, selectedLabel)` に切り出す。helper は渡された `documentRef` のみを使い、Chrome API・ストレージ・テンプレート読込・イベント登録に依存しないため、jsdom から直接テストできる。新規の extension JS ファイルは作成しない。`options.js` の `updateProviderUI()` は選択中 provider と `chrome.i18n` の状態ラベルを取得して当該 helper を呼ぶ薄いラッパーとする。選択中のカードには、ローカライズした状態ラベルを付与する。コントラストを下げすぎない。状態ラベルはタイトル用 span と別要素（`.provider-status`、空のまま保持）として置くため、`[data-i18n]` 一括 `textContent` 代入の後に `updateProviderUI()` を呼んでも消えない。実装イメージ:

```javascript
const updateProviderUI = () => {
  const isGemini = document.querySelector('input[name="apiProvider"]:checked').value === "gemini";
  updateProviderCards(
    document,
    isGemini,
    chrome.i18n.getMessage("options_provider_selected")
  );
};
```

- **例外2: `persistentStatus` の live region 化に伴う表示順の変更**: 現行実装は警告表示時に `textContent` へ文言を代入してから `hidden = false` を行う順序（import / restore の2箇所）になっており、`role="status"` を付けた要素が「非表示状態で内容が確定し、その後に表示される」経路では、スクリーンリーダーが変更をアナウンスしない環境がある。また、非表示解除と文字列入替を同一タスク内で続けて行うと、支援技術側で「空のまま」と解釈される環境もある。そのため `UI helpers` に named export の `createPersistentStatusUpdater(persistentStatusElement, syncHeight, requestFrame, cancelFrame)` を追加する。factory は `{ setPersistentStatus, clearPersistentStatus }` を返す。production はブラウザの `requestAnimationFrame` / `cancelAnimationFrame` と `syncSaveBarHeight` を渡して生成したこの2関数だけを使い、既存の全 `persistentStatus.textContent` / `persistentStatus.hidden` 直接操作を置換する。**`setPersistentStatus(message)` は「unhide → 空にする → 次フレームで文言を代入」の順に変更**する。具体的には `persistentStatus.hidden = false` → `persistentStatus.textContent = ""` → `requestFrame(() => { persistentStatus.textContent = message; syncHeight(); })` とする。`requestFrame` の ID は保持し、表示予約中に再表示・クリアする場合は必ず `cancelFrame()` して古い文言が後から復活しないようにする。**`clearPersistentStatus()` は即時に「予約をキャンセル → `textContent = ""` → `hidden = true` → `syncHeight()`」の順で実行**し、保存・復元・成功時のクリアでも同 helper を使う。空の live region を通知する必要はないため、非表示化を次フレームへ遅らせない。これにより、クリア直後のちらつきと予約済みコールバックによる古い警告の再表示を防ぐ。これは保存・復元の成功/失敗分岐や権限要求条件には影響せず、表示順序のみの変更である。なおフォールバック経路では `hidden` トグルが MutationObserver の attributes 監視と `syncSaveBarHeight()` 明示呼び出しの両方で高さ再計測に捕捉される（後述の save-bar 高さ同期を参照）

- **例外3: OpenAI host permission の拒否時処理**: host permission は Save ボタンだけでなく、`saveOptions()` を起点にする **Save / Export / Sync の全保存入口**で統一して扱う。side effect を伴う `createHostPermissionSaveGuard({ getOptions, ensurePermission, save, setPersistentStatus })` は `Core async logic` に named export として置く。factory が返す `saveWithHostPermission()` は、OpenAI provider かつ **空でない** Base URL の場合に、必ず `ensurePermission()` の戻り値を確認してから `save()` を呼ぶ。ここで使う `ensurePermission()` は、`extension/utils.js` の `ensureHostPermission()` を **tri-state 戻り値**へ拡張したものであり、少なくとも `{ status: "granted" | "denied" | "error", error? }` を返す。URL の正規化・妥当性判定は引き続き `ensureHostPermission()` 側に一元化し、不正 URL は `status: "granted"` と同等の「host permission は不要」のケースとして保存を許可する。戻り値が `status: "denied"` の場合は、`save()` / `chrome.storage.local.set()` / `createContextMenus()` を実行せず、成功の transient status を表示せず、`clearPersistentStatus()` も呼ばない。代わりに `setPersistentStatus(chrome.i18n.getMessage("options_save_required_for_host_permission"))` を呼び、再試行して許可されるまで重要メッセージを維持する。戻り値が `status: "error"` の場合も保存を中断するが、ユーザー拒否とは分けて `setPersistentStatus(chrome.i18n.getMessage("options_host_permission_request_failed"))` を表示し、`console.error("Failed to request host permission:", error)` を記録する。戻り値が `status: "granted"`、または Gemini provider / 空の Base URL の場合にだけ保存を実行し、呼び出し元が成功 status と persistent status のクリアへ進む。Save、Export、Sync は必ずこの共通 helper の成功時にのみ後続処理を実行する。Import / Restore は既存どおり `needsHostPermissionPrompt()` で未許可を検出して警告・中断し、未許可でない場合は同 helper を経由して保存する。これにより将来の保存入口追加時も permission gate を再利用できる
- `createOptionsActionHandlers({ saveWithHostPermission, showStatusMessage, getOptions, ... })` は、各 UI 操作を組み立てる named export として `Button action handlers` に置く。production は実依存を注入して返却された Save / Export / Sync / Import / Restore handler を button の `click` イベントへ登録し、unit test は guard spy を注入して3入口の routing を検証する
- **追加: save-bar 高さ同期**: `syncSaveBarHeight()` を `UI helpers` に追加し、`.save-bar` の `getBoundingClientRect().height` をルート CSS 変数 `--save-bar-height` へ反映する。`initSaveBarHeight()` は `syncSaveBarHeight()` を即時呼び出し、以降の追従をセットアップする。`ResizeObserver` が利用できる環境では同じ計測関数を observer から呼び、翻訳文・フォントサイズ・`persistentStatus` の表示で高さが変わった場合も `main` 下余白を追従させる。`ResizeObserver` が利用できない環境では、次の3経路で追従する: (a) `window` の `resize`、(b) `.save-bar` を `childList` / `characterData` / `subtree` / `attributes`（`attributeFilter: ["hidden"]`）で監視する `MutationObserver`（`persistentStatus` の `hidden` トグルは属性変更として発生するため、`childList` / `characterData` のみでは取りこぼす）、(c) `syncSaveBarHeight()` の明示呼び出し。明示呼び出しは少なくとも、**i18n 適用と `await setOptionsToForm()` 完了後に `initSaveBarHeight()` を呼ぶ初期化時**、**`setPersistentStatus()` による表示予約後の文言代入時**、**即時のクリア時**、**保存後の `applyFontSize()` / `applyTheme()` 適用直後** に行う。フォントサイズ・テーマ変更は `body` 属性の変更であり `.save-bar` 配下の mutation として現れないため、フォールバックでは必ず explicit hook を併用する。さらに `.layout main > .card:last-child { margin-block-end: 0; }` を前提とし、save-bar 回避余白は `main` の padding に一本化する。observer は options page の生存期間中のみ必要であり、明示的な disconnect は不要

- **追加: スクロールスパイ**（約25行）。`.active` と `aria-current="location"` の更新だけを行う `updateScrollSpy()` を `UI helpers` に置く。listener の登録は AGENTS.md に従い **`Event listeners` セクションにのみ**置く。`DOMContentLoaded` ハンドラは `await initialize()` の成功後に、初期化済みフラグを確認して `scroll` / `resize` / sidebar link `click` listener を各一度だけ登録し、`updateScrollSpy()` を即時実行する。クリック後は次フレームで同 helper を呼ぶ。active link には `aria-current="location"` を付与し、他の全リンクからは属性を削除する。AGENTS.md のブレース必須ルールに従い、`if` は必ず `{ ... }` で囲む:

```javascript
let isScrollSpyInitialized = false;

const updateScrollSpy = () => {
  const links = Array.from(document.querySelectorAll('.sidebar a'));
  const sections = links.map((a) => document.querySelector(a.getAttribute('href')));

  const getSpyOffset = () => {
    const header = document.querySelector('header');

    // レイアウト変動（フォントサイズ、テーマ、モバイル幅）に追従するため、
    // 実測のヘッダー高をもとに判定境界を決める
    return (header ? header.getBoundingClientRect().height : 0) + 16;
  };

  const threshold = getSpyOffset();
  let current = 0;
  sections.forEach((sec, i) => {
    if (sec && sec.getBoundingClientRect().top <= threshold) {
      current = i;
    }
  });
  links.forEach((a, i) => {
    const isCurrent = i === current;
    a.classList.toggle('active', isCurrent);
    a.toggleAttribute('aria-current', isCurrent);
    if (isCurrent) {
      a.setAttribute('aria-current', 'location');
    }
  });
};
```

- `initialize()` ではテンプレート挿入・i18n 適用後に `await setOptionsToForm()` を実行し、保存済み provider の状態反映まで完了させる。その後に `initSaveBarHeight()` を一度呼び出す。これにより save-bar 高さは **i18n と保存済み値が反映された最終レイアウト** を基準に計測できる。`initialize()` は成功/失敗を呼び出し元へ返し、`Event listeners` セクションの DOMContentLoaded handler は **成功時にだけ** save/export/import/sync/restore の button action handler と scroll-spy listener を登録し、`updateScrollSpy()` を実行する
- **初期化失敗時の扱い**: `loadTemplate()` の戻り値を `appendChild()` 前に検査する。いずれかの template を取得できない場合は `console.error` を記録し、新規キー `options_initialization_failed` を `persistentStatus` へ表示して、保存・データ移行を開始する操作を無効化する。Save / Export / Import / Sync / Restore の各 `button` は初期化開始時点から `disabled` を付与しておき、**初期化成功後にだけ**有効化する。各 click handler の先頭でも初期化完了フラグを確認して return する。テンプレート依存の select がない不完全な状態で保存処理へ進ませず、ページを再読み込みして復旧できる状態を保つ。これにより、template 取得失敗時だけでなく、template 挿入前の初期化途中に操作された場合の race も排除する。正常な初期化完了後にのみ scroll-spy と save-bar の追従を開始する
- AGENTS.md のセクション語彙・ブレース必須ルールに従う

### 4. i18n

- 既存キーはできるだけ流用する。`options_button_save` など既存文言は変更しない
- サイドバー文言とカード見出しは同一の**section title キー**を使い、説明文用キーとは分離する
- 既存キーをそのまま流用するセクション:
  - `options_provider` → API Provider
  - `options_provider_gemini` → Gemini API
  - `options_provider_openai` → OpenAI-compatible API
- 新規追加する section title キー:
  - `options_section_language`
  - `options_section_default_action_no_selection`
  - `options_section_default_action_selection`
  - `options_section_custom_no_selection`
  - `options_section_custom_selection`
  - `options_section_behavior`
  - `options_section_appearance`
  - `options_section_backup`
- 状態ラベル用の新規キー:
  - `options_provider_selected`（選択中の provider カードにのみ表示）
- 一般的な選択肢・placeholder 用の新規キー:
  - `options_value_system` / `options_value_light` / `options_value_dark`
  - `options_value_large` / `options_value_medium` / `options_value_small`
  - `options_value_unspecified`
  - `options_placeholder_label_optional`
- 初期化失敗用の新規キー:
  - `options_initialization_failed`
- host permission API 失敗用の新規キー:
  - `options_host_permission_request_failed`
- 既存の長い説明文キー（例: `options_action_description_no_selection` / `options_action_description_selection`）は、カード内部の補助説明として必要な場合のみ残し、サイドバーや `<h2>` 見出しには使わない
- 旧計画で想定していた `options_group_*` 系キーは導入しない
- theme / font-size の選択肢、OpenAI reasoning の `Unspecified` option、custom action label の placeholder は上記キーを `data-i18n` / `data-i18n-placeholder` でローカライズする。初期化時の既存 `[data-i18n]` 処理は後者も処理するよう拡張する。一方で `templates.html` に定義されている select 要素の option / optgroup 文言（`Auto-fallback` / `Stable` / `Preview` / `Gemma` / `User-specified`、各言語名）は翻訳対象に含めず、テンプレートに静的定義された表記のまま維持する。特に `User-specified` は翻訳せず英語のままとする。OpenAI reasoning の `Specified` optgroup も翻訳しない。モデル名、モデルの thinking 表現、custom action の具体的な英語プロンプト例は技術的な値・例示として原文を維持する
- すべての `extension/_locales/*/messages.json`（en を含む15ロケール）に新規キー19件（section title 8件 + 状態ラベル1件 + 一般的な選択肢/placeholder 8件 + 初期化失敗1件 + host permission API 失敗1件）を追加する。`templates.html` に定義されている select 要素の表示文言は静的定義のままとし、default locale へのフォールバックにも依存しない
- **注意**: `test/static/extension-integrity.test.js` が「全ロケールのキーが en と完全一致する」ことを検証している。そのため en / ja のみの段階的展開はできず、**15ロケールすべてに同一キーを同一コミットで一括追加しないと `npm test` が即座に落ちる**。実装時は en を含む全ロケールを同一コミットで更新し、途中状態で `npm test` が落ちないようにする

### 5. 構造テスト（test/static/options-structure.test.js 新規作成）

DOM 再編を自動で回帰検知するため、以下のテストを新規作成し `npm test` に含める（vitest の既存 glob で自動収集される）。現状の自動テストは options 画面の構造を一切検証しておらず（`extension-integrity.test.js` は manifest の `options_page` 存在確認のみ、E2E は options UI を操作しない）、このギャップを埋めるのが目的。

#### 5-1. 静的構造テスト `test/static/options-structure.test.js`

実装方針は既存の `extension-integrity.test.js` と同様に HTML ファイルを読み込むが、正規表現による属性文字列の検査ではなく jsdom で parse して DOM 構造を軽量に検証するものとする。

検証項目:

- `<section class="card" id="sec-*">` が11個あり、サイドバーの `<a href="#sec-*">` と1対1対応する
- options.html に静的に置く既存 ID が、以下の定数配列のすべてについて一意に存在することを検証する: `header`, `providerGemini`, `providerOpenai`, `geminiSection`, `apiKey`, `languageModelContainer`, `userModelId`, `openaiSection`, `openaiApiKey`, `openaiBaseUrl`, `openaiModelId`, `openaiReasoningEffort`, `openaiThinkingType`, `languageCodeContainer`, `userLanguage`, `noTextSummarize`, `noTextTranslate`, `noTextCustom1`, `noTextCustom2`, `noTextCustom3`, `textSummarize`, `textTranslate`, `textCustom1`, `textCustom2`, `textCustom3`, `contextMenuLabel1`, `contextMenuLabel2`, `contextMenuLabel3`, `noTextCustomPrompt1`, `noTextCustomPrompt2`, `noTextCustomPrompt3`, `contextMenuLabel1Text`, `contextMenuLabel2Text`, `contextMenuLabel3Text`, `textCustomPrompt1`, `textCustomPrompt2`, `textCustomPrompt3`, `contextMenus`, `streaming`, `renderLinks`, `autoSave`, `openResultsInTab`, `theme`, `fontSize`, `save`, `status`, `persistentStatus`, `exportFile`, `importFile`, `syncCloud`, `restoreCloud`, `exportApiKey`。この配列以外の正当な ID の追加は許容する。`languageModel` / `languageCode` は `templates.html` を `loadTemplate()` で挿入して生成するため、この HTML 構造テストの対象外とし、既存のテンプレート読み込み経路に委ねる
- `#save` / `#exportFile` / `#importFile` / `#syncCloud` / `#restoreCloud` はいずれも `button` 要素であり、初期 markup で `disabled` を持つこと。初期化前操作を HTML レベルでも防いでいることを静的に保証する
- `#geminiSection` / `#openaiSection` の `h2` が `<span data-i18n>` + `<span class="provider-status">` の分離構造を持つ（i18n 一括代入で状態ラベルが消えないことの構造保証）
- 全 input / select / textarea（`templates.html` から生成する `languageModel` / `languageCode` を除く）が、対応する `label[for]` を1個だけ持つこと。`aria-describedby` を指定したコントロールは、参照先の補足要素が存在すること。ラジオ群と Behavior は対応する `fieldset > legend` を持つこと
- `<head>` の stylesheet 読み込み順が `new.min.css` → `common.css` → `options.css` である
- `target="_blank"` の全リンクが `rel` に `noopener` と `noreferrer` を含むこと
- `templates.html` も parse して `languageModel` / `languageCode` が各1個存在することを確認し、options.html 側の `label[for]` と組み合わせて、動的 select を含む全コントロールのラベル関連付けを保証する

#### 5-2. provider 状態ラベル残存テスト `test/dom/options-provider-status.test.js`

provider 状態ラベルの残存は、本計画の中核不変量（i18n 一括 `textContent` 代入後でも `.provider-status` にローカライズラベルが復帰する）であり、静的分析だけでは保証できない。そのため jsdom 上で最小 DOM を構築し、`options.js` から named import した `updateProviderCards()` を直接呼び出して検証する。新規の extension JS ファイルは作成しない。`test/helpers/options-dom.js` を新設し、両 DOM テストで共用する。helper は `persistentStatus`、provider ラジオ、両 provider セクション、`save`、`exportFile`、`importFile`、`syncCloud`、`restoreCloud` を含む**新しい最小 jsdom DOM を各 `beforeEach` で生成**する。テスト対象は `document` や要素を引数で受ける named export に寄せ、`persistentStatus` などを module scope で捕捉しない設計にするため、DOM テストは `DOMContentLoaded` の発火や module cache の再初期化に依存しない。必要なら DOM を生成した後に module を import するが、`document.addEventListener` の monkey patch やトップレベル副作用の抑止ハックは前提にしない。各 `afterEach` では jsdom window を close し、global の document/window を復元する。テストは `updateProviderCards()` を直接呼び出すため、それ以外の副作用を検証対象にはしない。実装方針は既存の `test/dom/markdown.test.js` + `test/helpers/dom-markdown.js` と同パターンとし、新規依存は追加しない（`jsdom` は既に `devDependencies` に存在）。

検証項目（1つの `describe`・最小限の `it`）。`is-inactive-provider` は「選択中でない provider 側にだけ付く」点を明示的に検証し、両方付与 / 両方未付与の回帰も漏れなく拾う:

- gemini 選択時: `#geminiSection` には `is-inactive-provider` が付かず、**かつ `#openaiSection` にだけ付く（exclusive）**。`#geminiSection` の `.provider-status` のみローカライズラベルが入る（`#openaiSection` 側は空文字列）
- openai 選択時: 上記が逆転する（exclusive であることを再確認）
- `[data-i18n]` 一括 `textContent` 代入のシミュレーションを実行したあとに再度 `updateProviderCards(document, isGemini, selectedLabel)` を呼ぶと、`.provider-status` の内容が復帰すること（一括代入で消えないことの動的保証）

`ResizeObserver` による実レイアウト上の `--save-bar-height` 同期と、スクロールスパイの `.active` 付与は、jsdom 上では layout/scroll の挙動が実ブラウザと異なるため自動テストの対象外とし、手動 smoke（ステップ7）で担保する。手動確認では active link が1個だけであり、同じ link だけが `aria-current="location"` を持つことも確認する。一方で provider 状態ラベルと、依存性注入した `persistentStatus` 更新順序・予約キャンセルは、レイアウトに依存しない中核不変量として軽量 DOM テストで検証する。UI 全体を DOM テストで網羅する方向には倒さない（`docs/archive/TESTING_PLAN_PERSONAL.md` の「細かい UI DOM テストは当面不要」方針を維持）。

#### 5-3. persistent status 更新テスト `test/dom/options-persistent-status.test.js`

`persistentStatus` の表示予約とクリアには時間差があり、目視だけでは「クリア済みなのに予約済みコールバックが古い警告を再表示する」回帰を安定して検出できない。そのため `options.js` から named import した `createPersistentStatusUpdater()` を、最小 DOM の `#persistentStatus`、記録用の `syncHeight`、手動で callback を実行できる `requestFrame` / `cancelFrame` とともに直接テストする。ここでも `persistentStatusElement` を引数で受ける factory を直接検証し、`DOMContentLoaded` や module cache 制御には依存しない。DOM セットアップ方針は §5-2 と同じとし、新規依存は追加しない。

検証項目（1つの `describe`・最小限の `it`）:

- 警告表示の呼び出し直後は `hidden` が `false`、文言は空であり、予約 callback の実行後にだけ文言と `syncHeight` が更新される
- 警告を予約してから callback 実行前にクリアした場合、予約が cancel され、`hidden` が即時に `true`、文言が空、`syncHeight` が即時に更新される。取り消された callback を後から実行しても古い警告が再表示されない
- 複数回の表示要求では先行予約が cancel され、最後に要求した文言だけが表示される

#### 5-4. host permission 付き保存テストと手動確認

Save / Export / Sync は §3 の `createHostPermissionSaveGuard()` が返す同一の `saveWithHostPermission()` を必ず経由する。`test/unit/options-host-permission.test.js` では、依存性注入した `getOptions` / `ensurePermission` / `save` / status 操作を用い、実ブラウザの permission dialog なしに以下を検証する:

- OpenAI provider と有効な Base URL で permission が拒否された場合、`save`、成功 status、persistent status のクリアが呼ばれず、`options_save_required_for_host_permission` だけが設定される
- OpenAI provider と有効な Base URL で permission API が例外を返した場合、`save`、成功 status、persistent status のクリアが呼ばれず、`options_host_permission_request_failed` と `console.error` だけが設定される
- permission が許可済みまたは要求を許可した場合、`save` が一度だけ呼ばれ、呼び出し元が成功処理へ進める `status: "granted"` 相当の戻り値になる
- Gemini provider、空 Base URL では permission 要求なしで保存する。不正な非空 URL は `ensureHostPermission()` を一度呼び、その `status: "granted"` 相当の戻り値により保存する
- guard 単体テストに加え、同一モジュール内の lexical binding を mock する方式には依存しない。Save / Export / Sync の実ハンドラを、named export の `createOptionsActionHandlers({ saveWithHostPermission, showStatusMessage, getOptions, ... })` factory が返す関数として構成する。production はこの factory へ実依存を渡し、テストは `saveWithHostPermission` spy を注入した handler を直接呼び出して、3入口すべてが guard の成功時だけ成功処理（Export の file 作成、Sync の `storage.sync.set`、Save の transient status）へ進むことを検証する

加えて `test/unit/utils.test.js` に `ensureHostPermission()` の shared contract テストを追記し、`chrome.permissions.contains()` / `request()` の結果に応じて `status: "granted" | "denied" | "error"` を返すこと、不正 URL は `status: "granted"` 扱いで `error` にしないことを直接検証する。これにより、options 側の guard と shared utility の責務境界をそれぞれ unit test で固定する

加えて実装後の Chrome / Firefox 手動 smoke で、OpenAI provider と有効な未許可 Base URL を設定し、permission ダイアログを拒否した場合に以下を確認する:

- `chrome.storage.local` の設定値が保存前から変わらず、Export / Sync でも同様に保存・同期が発生しない
- `options_saved` の transient status が表示されない
- `persistentStatus` が hidden にならず、host access を許可するよう促すメッセージが残る
- Save を再実行して permission を許可した場合にだけ保存成功表示と persistent status のクリアが行われる

また unit test では、permission API 自体が例外を投げた場合に、拒否時メッセージではなく `options_host_permission_request_failed` と `console.error` が使われ、保存が中断されることを確認する

## 影響範囲と非破壊性の確認

| 観点 | 確認事項 |
| --- | --- |
| options.js の DOM 参照 | 全 ID を維持するため、`getElementById` 系の参照は破壊されない |
| プロバイダ切り替え | `#geminiSection` / `#openaiSection` は常時表示とし、非選択側のみ弱表示するため、サイドバー・アンカージャンプ・スクロールスパイとの不整合が生じない |
| テーマ / フォントサイズ | `body[data-theme]` / `body[data-font-size]` の適用箇所は変わらず、`--nc-*` 変数でカードも追従 |
| ステータスメッセージ | `persistentStatus` を save-bar 内へ統合し、host permission などの重要な保存関連メッセージを常時確認可能にする |
| アクセシビリティ | 非選択 provider カードは opacity に依存せず、コントラストを保った視覚表現と、選択カードのローカライズした状態ラベルで区別する。非選択側の入力欄は `disabled`/`readonly`/`aria-disabled` を付与せず編集可能なまま（後述「フォーカス・編集ポリシー」参照）。すべての入力コントロールに `<label for>` を関連付け、補足は `aria-describedby` で参照する。サイドバーは既存の表示見出しを `aria-labelledby` で参照する。status には `aria-live` / `role="status"` を設定する |
| 他画面（popup / results） | スタイルは `options.css`（options.html のみ読み込み）に隔離されるため、popup/results への影響は構造上ゼロ |
| RTL（ar など右書きロケール） | CSS 論理プロパティと `dir` 追従のグリッドで、サイドバー位置とインジケータが RTL に自動対応する。再編対象の header を含め、物理方向プロパティは使用しない |
| `utils.js` の shared helper 契約 | `ensureHostPermission()` は現状 boolean 戻り値だが、本計画では tri-state へ拡張する。現時点の呼び出し元は options のみだが shared utility の契約変更であるため、`test/unit/utils.test.js` で戻り値仕様を固定し、他画面へ波及させない |
| メンテナンス性 | `options.css` への分離と「既存 ID 維持・DOM 構造のみ再編」の方針により、見た目の改善と既存ロジック互換を両立できる |
| 翻訳 | 新規 section title キー8件、状態ラベル1件、一般的な選択肢/placeholder 8件、初期化失敗1件、host permission API 失敗1件（計19件）を en を含む15ロケール全てに追加する。`templates.html` に定義されている select 要素の option / optgroup 文言は翻訳対象に含めず静的定義のまま維持し、`User-specified` は英語のまま、OpenAI reasoning の `Specified` optgroup も非翻訳とする。`extension-integrity.test.js` のキー一致検証に抵触しないよう、同一コミットでの一括追加が必須。説明文キーと見出しキーの分離により、将来の文言調整やレイアウト変更時の再利用性が高まる |
| `storage.sync` quota | provider 両カード常時表示化は保存ロジックを変更しないため、`chrome.storage.sync` の quota に新たな影響はない。両 API key を入れるユーザーは従来同様 `syncOptionsToCloud` が quota 制約内で動作する |
| Firefox manifest | `firefox/manifest.json` の `options_page` は `options.html` で Chrome と共通のため、本計画の変更は Firefox にも自動適用される。manifest 側の変更は不要 |

## 実施ステップ

1. **options.css**: 新規作成し、上記スタイルを集約（先頭で `body` を `width: 100%; max-width: 900px; box-sizing: border-box;` に上書き。`new.min.css` 既定の header を options page 向けに打ち消す専用 header ルール、可読性を保つ provider 状態スタイル、header を含む RTL 対応の論理プロパティ、フォントサイズ・安全領域を考慮した `main` 下余白と最後のカードの `margin-block-end: 0` を追加。Backup & Sync の button 群は Save より弱い secondary / outline 表現とし、モバイルでは 1 カラムに切り替える）
2. **options.html**: 構造再編。`css/options.css` の `<link>` を `common.css` の後に追加。既存 ID を維持しつつ、カード/サイドバー/save-bar（`.layout` 外・fixed）を配置し、見出しをタイトル span + `.provider-status` span に分離、`persistentStatus` を save-bar 内へ移動する。Backup & Sync は `button` 群 + `exportApiKey` チェックボックスとして再構成し、radio / Behavior の fieldset + legend と、全 `target="_blank"` リンクの `rel="noopener noreferrer"` も同時に追加する
3. **utils.js**: `ensureHostPermission()` を tri-state 戻り値へ拡張し、URL 正規化・妥当性判定は同 helper に集約したまま、permission 許可 / 拒否 / API 例外を options 側で判別できるようにする
4. **options.js**: `updateProviderUI()` を状態ラベル付きの弱表示型に変更し、`initSaveBarHeight()`（ResizeObserver + フォールバックの MutationObserver / 明示同期）を追加する。`createPersistentStatusUpdater()` が返す `setPersistentStatus()` / `clearPersistentStatus()` を導入し、全ての直接 DOM 操作を置換する。表示を「unhide → 空にする → 次フレームで文言代入 + `syncSaveBarHeight()`」、クリアを「予約キャンセル → 空にする → 即 hidden = true + `syncSaveBarHeight()`」に統一する。`createHostPermissionSaveGuard()` を導入し、Save / Export / Sync の全保存入口を permission `denied` と permission API `error` で分岐させ、前者では許可要求メッセージ、後者では API 失敗メッセージと `console.error` を使い分けたうえで、いずれも保存・成功表示・persistent status クリアへ進ませない。Save / Export / Sync は `createOptionsActionHandlers()` factory が返す testable handler として構成し、Import / Restore も未許可検出後は同 guard 経由で保存する。`updateScrollSpy()` は UI helper とし、scroll / resize / click listener は `Event listeners` セクションの DOMContentLoaded handler で一度だけ登録する。保存系 UI は HTML 初期 markup の時点で無効状態にしておき、`options.js` は `initialize()` 成功後にだけ action handler を登録して controls を有効化する。template 取得失敗時は保存操作を無効化し、ローカライズした persistent error を表示する。`syncSaveBarHeight()` の明示呼び出し箇所は、初期表示（i18n + `await setOptionsToForm()` 完了後）、警告表示直後、警告クリア直後、保存後の `applyTheme()` / `applyFontSize()` 直後を最低ラインとして実装する
5. **provider helper**: `options.js` の `UI helpers` セクションに `updateProviderCards(documentRef, isGemini, selectedLabel)` を配置して named export する。`updateProviderUI()` はこの helper を呼ぶ薄いラッパーへ変更する。新規の extension ソースファイルは追加しない
6. **_locales**: en を含む15ロケールに `options_section_*`、`options_provider_selected`、一般的な select 値・placeholder、初期化失敗キー、host permission API 失敗キーを同一コミットで一括追加する。`templates.html` に定義されている select 要素の option / optgroup 文言は翻訳せず静的定義のまま維持し、`User-specified` も英語のままとする。旧計画の不要キー案は採用しない
7. **構造・DOM・unit テスト**: `test/static/options-structure.test.js` を新規作成（11セクション/アンカー整合・ID 維持・見出し DOM 分離・fieldset/legend・動的 select を含む label 関連付け・外部リンク rel・stylesheet 順・保存系 button の初期 disabled 状態を検証）。加えて `test/helpers/options-dom.js`（helper / factory 呼び出し用の DOM セットアップ）、`test/dom/options-provider-status.test.js`（provider 状態ラベル残存）、`test/dom/options-persistent-status.test.js`（遅延表示・予約キャンセル・高さ同期順序）、`test/unit/options-host-permission.test.js`（Save / Export / Sync 共通の permission guard と action handler routing）、`test/unit/utils.test.js`（`ensureHostPermission()` の tri-state 契約）を更新・新規作成する
8. **検証**:

- `npm run lint`
- `npm test`（`extension-integrity.test.js` のロケールキー一致検証と、新規 `options-structure.test.js` の構造検証、新規 `test/dom/options-provider-status.test.js` の provider 状態ラベル検証、新規 `test/dom/options-persistent-status.test.js` の status 更新検証、更新した `test/unit/utils.test.js` の host permission 契約検証が通ること）
- 手動（Chrome / Firefox）: テーマ3種（system/light/dark）× フォントサイズ3種の表示確認、モバイル幅（720px 以下）での1カラム化・save-bar 固定・安全領域確認、provider 切り替え時の状態ラベルとコントラスト確認、**header が full-bleed 化せず本文グリッドと同じ内容端に揃い、長いローカライズ済みタイトルでも省略表示が維持されること**、**provider カード見出しでタイトルと状態ラベルの間に十分な余白があり、文字列が連結して見えないこと**、**Backup & Sync の button 群がリンク風ではなく button と認識でき、ただし save-bar の主ボタン `#save` より視覚的に弱い secondary / outline 表現になっていること**、**Backup & Sync の button 群の `:focus-visible` が light/dark 両テーマで十分見え、Save より弱い見た目でもキーボードフォーカスを見失わないこと**、**save-bar が長い `persistentStatus` メッセージで高くなっても最終カードと Backup & Sync の button 群に重ならないこと**（水平オーバーフローで折り返すことの目視）、**save-bar の2行化で Save ボタンが押し潰されないこと**、最終カードが save-bar に隠れないこと、**最終カード内の最後のフォーカス可能要素へ Tab 移動しても save-bar に隠れないこと**、全 input / select / textarea の label と hint の関連付けを支援技術またはアクセシビリティツリーで確認すること、**低いウィンドウ高・大きいフォントでもサイドバーを内部スクロールして11項目すべてへ到達できること**、host permission メッセージが save-bar 内で確認できること、**OpenAI の host permission ダイアログを拒否した場合、Save / Export / Sync のいずれでも設定が保存・同期されず、成功メッセージが表示されず、persistent warning が残ること。再実行で許可した場合だけ保存成功となること**、**template 読み込み失敗時に Save / Export / Import / Sync / Restore の各 button が disabled のままで実行できず、初期化失敗メッセージが確認できること**、**`persistentStatus` の警告が非表示 → 表示の遷移で視覚的に見え、かつ支援技術で通知されうる順序（unhide → 空にする → 次フレームで文言代入 + 高さ同期、クリアは予約キャンセル後に即時非表示）になっていること**、**表示予約直後にクリアしても古い警告が次フレームで再表示されないこと**、**スクロール位置追従でサイドバー `.active` と `aria-current="location"` が同じ1件だけ付くこと**（ResizeObserver/scroll-spy 挙動は jsdom で検証しないため手動で担保）、**RTL ロケール（ar）でサイドバーが右側・インジケータが右端になること**を確認

- **E2E（任意・完了条件外）**: `npm run test:e2e` はオプション画面を直接カバーしていないが、回帰が無いことの確認に実行推奨。ただし完了条件の必須項目には含めない

## 完了条件

- 11カード + サイドバーナビ + fixed save-bar が Chrome で正常表示され、save-bar はスクロール位置に関わらず常時画面内に表示される
- 全設定の保存・復元が従来通り動作する
- ライト/ダークテーマ、フォントサイズ3段階で視認性に問題がない
- 720px 以下でサイドバー非表示・1カラム化し、save-bar は下端に固定される
- `persistentStatus` の長いメッセージ表示などで save-bar の高さが増えても、最終カードと Backup & Sync の button 群が save-bar に隠れない
- `persistentStatus` の警告が「unhide → 空にする → 次フレームで文言代入 + 高さ同期」の順で表示され、クリアは「予約キャンセル → 空にする → 即 hidden = true + 高さ同期」の順で行われ、古い予約済みメッセージが再表示されず、支援技術で通知されうる live region として機能する
- RTL ロケール（ar）でサイドバーが右側・インジケータが右端に表示される
- Chrome と Firefox でオプション画面の基本表示・保存・provider 切り替えが正常に動作する
- OpenAI host permission を拒否した場合は Save / Export / Sync のいずれも設定を保存・同期成功として扱わず、persistent warning が維持され、許可後の再実行でのみ保存成功となる
- 非選択 provider カードと保存関連のステータスメッセージが、可読性・操作性を損なわずに表示される
- すべての入力コントロールが label と関連付けられ、低い表示領域・大きいフォントでもサイドバーの11項目すべてへ到達できる
- `npm run lint` / `npm test` がパスする（`test/static/options-structure.test.js` の構造検証、`test/dom/options-provider-status.test.js` の provider 状態ラベル検証、`test/dom/options-persistent-status.test.js` の status 更新検証を含む）

## 将来の拡張余地（本計画のスコープ外）

- 変更検知による save-bar の強調（未保存時にボタンを目立たせる）
- `beforeunload` による未保存警告
- `options_section_*` の既存15ロケール翻訳を、フィードバックに応じて改善する（`utils/translation/` 経由）
