# Word への貼り付けで質問と回答の区切りが分かりにくい問題（調査）

- 関連: [HTML 書式付きコピー対応（Issue #50）](archive/PLAN_HTML_CLIPBOARD_COPY.md) の §8 リスク 2
- 調査日: 2026-09-20 / 決定: 2026-09-21
- **結論（2026-09-21）**: **UI の装飾をクリップボードの HTML に載せない**方針を採用し、
  質問ブロックのインライン `style` を CSS へ移した。貼り付け先の見た目はそのアプリの
  既定の書式に委ねる（§5 の決定を参照）。

## 1. 症状

結果ページで Copy した内容を Word に貼り付けると、質問（ユーザー発言）と回答（AI 発言）が
連続して見え、話者の交代が読み取りにくい。Gmail / Google ドキュメント / Mery では問題ない。

再現: 記事を要約 → 結果ページでフォローアップを 2 往復 → Copy → Word の新規文書に貼り付け。

## 2. 原因

質問ブロックの区切りを、**貼り付け先で再現されない書式だけ**で表現していた。

```html
<div style="background-color: var(--nc-bg-3); border-radius: 1rem; margin: 1.5rem; padding: 1rem 1rem .1rem;">
```

- `margin: 1.5rem` / `padding: 1rem 1rem .1rem`: Word の CSS 対応は **CSS1 のサブセット**で
  `rem` は CSS1 に存在しない。未対応の値を含む宣言は**宣言ごと破棄される**（§4）。
- `background-color: var(--nc-bg-3)`: カスタムプロパティは貼り付け先に存在しない。無効な
  `var()` 置換ではプロパティが初期値（`background-color` なら `transparent`）になるため、
  **Word に限らずどの貼り付け先でも背景色は再現しない**（Gmail の対応プロパティ一覧にも
  カスタムプロパティは無く、Can I email... の計測も ✗。§7）。
- テキスト側に発言者のマーカー（引用符・`Q:` などの接頭辞）が無いため、書式が失われると
  手がかりが完全に消える。

背景色と文書末尾の空段落は**対応対象外**と決定済み（再現を要件としない）。

**対策（2026-09-21 実施）**: この 4 宣言を `results.html` の `.conversation-question` に
移し、JS からインライン `style` を設定しないようにした。ペイロードには要素構造と `dir`
だけが残る。

## 3. 貼り付け先ごとの挙動

| 貼り付け先 | 段落区切り | 余白 | 質問のインデント | 背景色 | 実用性 |
| --- | --- | --- | --- | --- | --- |
| 結果ページ（表示） | あり | あり | あり | あり | 基準 |
| Mery / メモ帳（`text/plain`） | あり | あり | なし | なし | 問題なし |
| Gmail / Google ドキュメント | あり | あり | なし（変更前はあり） | なし | 実機確認済み（下記） |
| Word（元の書式を保持） | あり | あり（Word の自動段落間隔） | なし | なし | 同上 |
| Word（書式を結合） | あり | なし | なし | なし | 同上 |

変更前の Gmail は、インライン `margin: 1.5rem` を Chromium が解釈して質問が
インデントされ、それが話者の区別に使えていた。今回の変更で**質問のインデントは無くなる**
（2026-09-21 に Gmail 実機で確認済み）。ただし各ターンは貼り付け先が付ける段落間隔で
区切られるため、読み分け自体は成立する（番号付きリストの字下げも保たれる）。Word は
元々この宣言を無視していたため変化しない。

## 4. Word の HTML 取り込み仕様

Microsoft の [Word 2007 HTML and CSS Rendering Capabilities in Outlook 2007][ms-word-css]
（Outlook は Word の HTML 解析・描画エンジンを使う）による。

- 対応 CSS は **CSS1 のサブセット**。プロパティは CORE / COREEXTENDED / FULL の 3 段階。
- `div` / `p` = COREEXTENDED（CORE + `text-indent` + `margin*` のみ。`padding` は含まない）
- `blockquote` = FULL
- `rem` は CSS1 に無く、[CSS Values and Units Level 3][w3c-values-rem] で追加された単位。
  未対応の値を含む宣言は丸ごと破棄される（[CSS1 §7.1][w3c-css1-parsing] /
  [CSS Values 3: Partial implementations][w3c-values-partial]）。

質問ブロックの各宣言がどうなるか:

| 宣言 | 対象要素 | Word の対応 | 結果 |
| --- | --- | --- | --- |
| `margin: 1.5rem` | `div` / `p` | COREEXTENDED に `margin` はある | `rem` が無いため宣言ごと破棄 |
| `padding: 1rem 1rem .1rem` | `div` / `p` | COREEXTENDED に `padding` は無い | 単位以前に非対応 |
| `background-color: var(--nc-bg-3)` | すべて | `background-color` は CORE で対応 | 値が解決できないため無効 |
| `border-radius: 1rem` | すべて | 対応リストに無い | 非対応 |

[Can I email...][caniemail-rem] の実測でも、Outlook Windows（Word エンジン）は `rem`
**非対応**、Gmail は **対応**。

**ただし「表で対応」は「余白が効く」を意味しない**（§5）。

## 5. 検討した対策と結論

| # | 案 | 結論 |
| --- | --- | --- |
| **採用** | **UI の装飾をインライン `style` から CSS へ移す** | ペイロードに `var()` / `rem` が残らず、貼り付け先で静かに死ぬ宣言が消える。結果ページの表示は不変（§5 の決定） |
| A | 質問ブロックを `<blockquote>` 化し `px` 余白を付与 | 実装して実測 → Word では効果なし（撤回） |
| B | `<blockquote>` 化のみ | 同上（余白の調整すら無い） |
| C | `px` ベースの余白に置換 | `div` の `padding` は非対応、`margin` も余白として再現されない |
| D | 質問に `Q:` などのテキスト接頭辞を付与 | 画面表示と一致しなくなるため不採用 |

案 A は実装して Word で計測した。質問段落の**左インデントは 0 mm**（Word の「書式の詳細」
Shift+F1）で、インライン `margin` は無視された。`blockquote` は表上 FULL 対応だが、
**付けた `margin` が Word の段落インデントへ写ることは保証されない**。この実測により案 A
（および B / C）は成立しないと判断し、実装は撤回した。

### 決定（2026-09-21）

**原則**: 貼り付け先に持ち込むのは LLM が返した Markdown に由来する内容（要素構造）
だけとし、**拡張機能の UI 装飾は持ち込まない**。

- 貼り付け先の見た目は、そのアプリの既定の書式に委ねる。
- 拡張機能のスタイルシートやルートフォントサイズに依存する値（`var()` / `rem`）を
  ペイロードに残さない。
- 結果ページの表示は従来どおり（装飾は `results.html` の CSS が担う）。
- 計画書の**決定 2（「表示と一致」）を「生成元は表示 DOM、内容は Markdown 由来の
  本文のみ」に改訂**する。生成元を表示 DOM にする理由（`renderLinks` / CJK emphasis
  修正の二重管理回避）は維持する。
- テキスト方向（`dir="auto"`）は見た目ではなくメタデータとして残す。

**受け入れたトレードオフ**: 質問のインデントは貼り付け先で再現されなくなる。Gmail 実機で
確認済みで、読み分けは貼り付け先の段落間隔に委ねる（§3）。

### Word での読み分け

Word に「**元の書式を保持**」で貼り付けると、Word が HTML 取り込み時に付ける自動段落間隔
（`段落前 / 段落後 = 自動`）で質問と回答の間が空く。拡張機能のペイロード側で余白を
制御する余地はなく、貼り付けモードの選択が実質的な回避策になる（「書式を結合」では
段落間隔ごと失われる）。

## 6. 検証方法（再発防止）

- **目視で判断しない**。Word のインデントは Shift+F1（書式の詳細）の左インデント値（mm）で
  確認する。
- **範囲選択コピーでペイロードを検証しない**。Chromium は選択範囲を計算済みスタイル付きで
  シリアライズし、ページの `<style>` も載せるため、拡張機能のペイロードと別物になる。
  検証するときは `navigator.clipboard.write` に**作成済みの HTML 文字列**を書き込む
  （拡張機能と同じ API 経路）。候補は 1 つのペイロードにまとめ、**1 回の貼り付け**で比較して
  貼り付けモードを固定する。
- 拡張機能を変更したら**再読み込みと結果ページの開き直し**を行う。リロード前のタブでコピー
  した内容を貼り付けると旧ペイロードが貼り付き、誤った結論を導く。
- **ペイロードに `var()` / `rem` が無いことをテストで固定する**。
  `test/dom/clipboard-copy.test.js`（定義依存の値を載せない）と
  `test/static/popup-results-structure.test.js`（質問の装飾は CSS 側にある）が担当。
- 表示側の退行確認は、ブラウザーで `results.html` を開いて `.conversation-question` の
  計算値を見る（`background-color` / `border-radius` / `margin` / `padding`）。

## 7. 出典

- Microsoft: [Word 2007 HTML and CSS Rendering Capabilities in Outlook 2007 (Part 1 of 2)][ms-word-css]
- Microsoft: [貼り付け時の書式を制御する][ms-paste]
- W3C: [CSS1 §6.1 Length units][w3c-css1-units] / [§7.1 Forward-compatible parsing][w3c-css1-parsing]
- W3C: [CSS Values and Units Level 3][w3c-values-rem]（Partial implementations を含む）
- Can I email...: [rem unit][caniemail-rem] / [CSS Variables][caniemail-vars] / [`<blockquote>` element][caniemail-blockquote]
- Google: [Gmail の CSS サポート][gmail-css]
- MDN: [Using CSS custom properties][mdn-vars]

[ms-word-css]: <https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2007/aa338201(v=office.12)>
[ms-paste]: https://support.microsoft.com/en-us/word/control-the-formatting-when-you-paste-text
[w3c-css1-units]: https://www.w3.org/TR/REC-CSS1/#length-units
[w3c-css1-parsing]: https://www.w3.org/TR/REC-CSS1/#forward-compatible-parsing
[w3c-values-rem]: https://www.w3.org/TR/css-values-3/#font-relative-lengths
[w3c-values-partial]: https://www.w3.org/TR/css-values-3/#w3c-partial
[caniemail-rem]: https://www.caniemail.com/features/css-unit-rem/
[caniemail-vars]: https://www.caniemail.com/features/css-variables/
[caniemail-blockquote]: https://www.caniemail.com/features/html-blockquote/
[gmail-css]: https://developers.google.com/workspace/gmail/design/css
[mdn-vars]: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties
