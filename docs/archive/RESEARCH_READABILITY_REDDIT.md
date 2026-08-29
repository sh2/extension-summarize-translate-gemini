# Readability.js による Reddit 本文抽出の失敗メカニズム調査

## 概要

**現象:** Reddit のスレッドページ(`old.reddit.com` / `www.reddit.com`)で、[`getWholeText()`](../extension/popup.js) による本文抽出を実行すると、スレッド全体ではなく**一部のコメント断片のみ**が抽出される。

**目的:** 本ドキュメントは、ベンダーライブラリ [Readability.js](../extension/lib/Readability.min.js)(`@mozilla/readability` v0.6.0)が Reddit でなぜ失敗するのかを、実 HTML を用いた再現実験とライブラリ内部ログで検証した結果をまとめたものである。

**検証方法:**

1. 対象スレッド `https://old.reddit.com/r/opencodeCLI/comments/1vv5808/...` の実 HTML を取得(Wayback Machine 経由。直接アクセスはボット対策によりブロックされるため)。
2. jsdom + ベンダーの `Readability.min.js` を読み込み、拡張機能と同じ処理(`document.cloneNode(true)` → `new Readability(doc).parse()`)を実行して再現。
3. `debug: true` オプションの内部ログと、`removeChild()` のフックにより、削除対象要素と候補スコアを追跡。

---

## 再現結果

| 項目 | 値 |
| --- | --- |
| ページ上のコメント数 | 9 件(本文合計 約 1,661 文字) |
| 投稿本文(selftext) | 「Usage stabilized at about 12T/day…」 |
| **Readability の抽出結果** | **411 文字 = 2 番目のトップレベルコメント 1 件のみ** |

- 他の 8 件のコメントも投稿本文も一切含まれない(タイトルのみ正しく取得される)。
- 「コメントの一部からのみ文章を抽出する」という報告を正確に再現した。

---

## 失敗メカニズム

### 1. Readability は「comment」をノイズとして除去・減点する設計である

Readability.js はニュース記事などの**記事ページ**向けに設計されており、ブログのコメント欄を本文から除外するために、クラス名/ID を判定する正規表現を内蔵している(v0.6.0 実装より抜粋)。

```js
// クラス名/ID が一致すると除去(unlikelyCandidates)または減点(negative)
unlikelyCandidates: /...|combx|comment|community|header|footer|menu|sidebar|social|.../
negative:           /...|comment|share|meta|media|promo|related|widget/   // スコア −25
positive:           /...|article|body|content|entry|h-entry|main|page|post|text|blog|story/  // +25
```

ニュース記事では有効だが、**掲示板では「本文のほぼ全部が `.comment` / `.commentarea` 配下にある」**ため、このヒューリスティックが致命的に裏目に出る。

内部ログの実測:

```text
Removing unlikely candidate - comments   × 9
Removing unlikely candidate - commentarea
```

※ 削除された `span.comments` は「N comments」ラベルであり、コメント本体ではない。なお、この除去ログは第 1 試行(`FLAG_STRIP_UNLIKELYS` 有効)のものであり、この試行では `.commentarea` の除去と同時にその子孫(全 `.comment`)もまとめて取り除かれる。一方、第 2 試行以降は同フラグが解除され、各試行の開始時に元の DOM が復元されるため除去は行われず、`.comment` コンテナは残ったまま「### 2」のスコアリングで強く減点される(再試行の仕組みは「### 4」参照)。

### 2. 減点と加点の綱引きで「高密度な 1 コメント断片」が勝つ

Readability は段落(`<p>`)のテキスト量に応じて祖先コンテナへポイントを配分する。Reddit のコメント構造では次のように作用する。

- 外側: `.comment` コンテナ → negative 正規表現一致で **−25**
- 内側: `.usertext-body`(`body`/`text` に一致)**+25**、`.entry`(`entry` に一致)**+25**

実測スコア(第 2 試行以降、`FLAG_STRIP_UNLIKELYS` 解除後):

```text
Candidate: thing_t1_p56sl6i(comment)   score −16.06   ← 外殻はマイナス
Candidate: .usertext-body              score +36      ← 中身だけプラス
Candidate: .md                         score +17
```

この結果、アルゴリズムは「コメントツリー全体」を選べず、**減点を回避できる最内側の小コンテナ=テキスト密度が最も高い 1 コメントの本文**を「記事本体」として選んでしまう。

### 3. 兄弟ノードは条件付きでしか結合されない

最上位候補決定後、Readability は同階層の兄弟ノードを一定スコア以上の場合のみ結合する。他のコメントはそれぞれ独立した別ツリーのため対象にならず、**丸ごと破棄される**。これが「一部だけ抽出される」直接原因である。

### 4. 再試行(attempt)機構でも改善しない

抽出文字数が閾値未満の場合、Readability はフラグを `STRIP_UNLIKELYS` → `WEIGHT_CLASSES` → `CLEAN_CONDITIONALLY` の順に段階的に緩めて再試行する。閾値は `Readability.js` で `DEFAULT_CHAR_THRESHOLD: 500` と定義され、上流 README では `the number of characters an article must have in order to return a result` と説明されている。ライブラリ内部では `_getInnerText(articleContent, true).length`(空白折りたたみ済)で判定し、`pageCacheHtml = page.innerHTML` で保存した元の DOM を各失敗試行で `page.innerHTML = pageCacheHtml` により復元しながら再試行する。実測のログでは次のようになった。

- 第 1 試行: サブレディット概説(サイドバーの `.usertext-body`)が勝つ(「### 1」の unlikely candidate 除去が有効な試行)
- 第 2 試行: 別の 1 コメント断片が勝つ(「### 2」のスコアリングが適用される試行)

どちらも部分的断片であり、コメント欄全体が復元されることはなかった。さらに、すべてのフラグを使い切っても閾値(既定 500 文字)に届かなかった場合、Readability は試行履歴を文字数の降順にソートし、**最長の試行結果をそのまま返す**。このため閾値未満の断片がエラーではなく正常な抽出結果として返され、「一部だけ抽出される」という現象が確定する。

---

## `www.reddit.com`(shreddit)について

- 拡張機能はコンテンツスクリプト経由で**ユーザーのブラウザに描画済みの DOM**(`document.cloneNode(true)`)を対象とするため、ボットチャレンジやログインウォール変異 DOM の問題は発生しない。未ログイン変異 DOM でログイン文言のみが抽出された事例は、Wayback Machine 経由の解析時のものであり実機では該当しない。
- ただし新 Reddit は `<shreddit-comment>` 等 Web Components ベースの DOM で意味的マークアップが乏しく、本項で述べた `comment` クラス名への減点メカニズムは同様に働く。
- 新 Reddit はコメントを仮想スクロール/遅延読み込みするため、ライブ DOM には「その時点で展開済みのコメント」しか存在しない。これは抽出手法に関わらず共通の制限である。

---

## 対処の方向性

### 設計方針

本件への対処は、以下の原則で設計する。

1. **入力側推測ではなく出力側検証** — クラス名パターンやドメインリストで「失敗しそうなページ」を予測するのではなく、抽出結果をライブラリ自身の成功基準で検証する。ドメイン非依存で、断片化という症状が短い出力として現れるすべての失敗モードを一網で捉えられる。
2. **閾値は新規のマジックナンバーを作らず `500` を流用** — `500` は `Readability.js` の `DEFAULT_CHAR_THRESHOLD` であり、上流 README でも `the number of characters an article must have in order to return a result` と定義された成功判定そのものである。新たな定数の根拠説明が不要になる。
3. **fail-open(欠落よりノイズ)** — 本拡張機能は LLM フロントエンドであり、要約用途ではノイズが混入しても LLM が無視できる一方、欠落は復元できない。Recall を優先する。

### 1. アルゴリズムによるフォールバック(推奨・v1)

既存の `document.body.innerText` フォールバック([`getWholeText()`](../extension/popup.js) で `article === null` 時のみ発動)を、ライブラリ自身の閾値で拡張する。

```js
const getWholeText = () => {
  const documentClone = document.cloneNode(true);
  const article = new Readability(documentClone).parse();

  // Readability's own success criterion (DEFAULT_CHAR_THRESHOLD: 500).
  // A shorter result means the parse effectively failed (e.g. forum
  // fragments), so fall back to the whole page text.
  if (article && article.textContent.replace(/\s+/g, " ").trim().length >= 500) {
    return article.textContent;
  } else {
    console.log("Failed to parse the article. Using document.body.innerText instead.");
    return document.body.innerText;
  }
};
```

- **なぜ `500` か:** 「### 4」で述べたとおり、ライブラリ自身が `textLength < 500` を失敗とみなして再試行する基準である。今回の Reddit 事例(411 文字)は全フラグを使い切っても閾値に届かず最長試行がそのまま返されたケースに該当し、この条件で確実に捕捉できる。
- **空白の折りたたみ:** ライブラリ内部は `_getInnerText(articleContent, true).length`(空白折りたたみ済)で判定しているため、拡張機能側でも `replace(/\s+/g, " ")` で尺度を合わせる。本文 480 文字 + 改行・インデントで 500 を超えて断片がすり抜ける境界ケースを防ぐ。
- **実装上の制約:** `getWholeText()` は `chrome.scripting.executeScript` で注入されるため、関数内で自己完結させる(外部モジュール参照不可)。
- **ログ:** 既存メッセージを流用し `console.log`(ロギング方針の「通常利用で起こりうる結果」扱い)。
- **CJK への注意:** `500` は英語圏向けの文字数基準のため、日本語の短めの記事(400 文字程度)でもフォールバックが発火し得る。Recall 重視の本用途では許容範囲だが、挙動として認識しておく。

#### パターン別の挙動

| # | `extracted` | `rawText` | 判定 | 代表例 | 評価 |
| --- | --- | --- | --- | --- | --- |
| A | `<500` | `>1500` | `rawText` | Reddit(411/1661) | 主目的。欠落を検出してフォールバック |
| B | `<500` | `<=1500` | `rawText` | 短い正当記事(300/800) | Recall 重視の仕様。ナビ等のノイズが混入するが LLM が処理できるため許容 |
| C | `>=500` | `>1500` | `extracted` | 長文記事(2000/5000) / Reddit で 1 コメントが 600 文字 | 前者は正しく維持、後者は検出漏れ(共通の限界) |
| D | `>=500` | `<=1500` | `extracted` | 通常記事(800/1200) | 想定どおり維持 |
| E | `null` | - | `rawText` | `parse()` 失敗 | 既存フォールバックと同等 |

#### 検討した代替案: `rawText > 1500` の併用

文字数比による異常検出として `extracted.length < 500 && rawText.length > 1500` も検討した。

```js
const rawText = document.body.innerText;
if (article && article.textContent) {
  const extracted = article.textContent;
  const tooShort = extracted.length < 500 && rawText.length > 1500;
  return tooShort ? rawText : extracted;
}
return rawText;
```

- **利点:** パターン B で誤フォールバックを回避し Precision が上がる。
- **欠点:** 第 2 の定数 `1500(=500*3)` の根拠が弱く、境界(例: `rawText` 1400 文字で 400 文字断片)ですり抜ける。
- **判断:** 要約用途では B の誤フォールバックコストが低く(ノイズは LLM が無視できる)、欠落コストの方が高いため、Recall 重視の単純な `500` 判定を採用する。`1500` 条件は翻訳用途でノイズが問題になる場合にのみ再検討する。

#### 残る限界

- 1 コメントが 500 文字を超える掲示板では `>=500` のため検出できない。
- Readability が「間違ったが長い」コンテナを選んだ場合も検出できない。

いずれも閾値方式の限界であり、次項のサイト別セレクタで補完する。

### 2. サイト別セレクタによる特別扱い(v2・品質向上)

上記フォールバックは安全網であり、Reddit への最終的な品質解としてはホスト名で判定し DOM セレクタで直接抽出する方式が優れる。`popup.js` には YouTube を URL で分岐する前例があり、同様に `host` 判定を追加する形が自然である。ホスト名 → 抽出関数の小さなマップにすれば拡張も容易である。

- `old.reddit.com`: コメント `document.querySelectorAll(".comment .md")`、投稿本文 `.expando .md`
- `www.reddit.com`: `shreddit-comment` 系カスタム要素(要実装時確認)

オプションでサイト別設定を持たせる案もあるが、判定をユーザーに委ねる負担が大きく UI も複雑化するため、内蔵リストを優先しオプション化は見送る。

### 3. JSON API の利用は非現実的

`https://www.reddit.com/comments/<id>.json` はボット対策によりブロックされることを確認済み(チャレンジ HTML が返却される)。拡張機能からの直接 fetch は期待できない。

---

## 関連ファイル

- [`extension/popup.js`](../extension/popup.js) — `getWholeText()`(Readability 呼び出し箇所)
- [`extension/lib/Readability.min.js`](../extension/lib/Readability.min.js) — ベンダーライブラリ(v0.6.0)
