# CJK 強調記法（`**`）のパース問題修正

## 背景

LLM が以下のような日本語テキストを生成したとき、marked での描画結果が意図と異なる。

```markdown
**Moonshot AI**は、世界初のオープンな3兆パラメータ級モデルとなる**「Kimi K3」のオープンウェイト公開**を控え、その**優れたコーディング性能と新アーキテクチャ**が注目を集めている。
```

- 期待される強調: `Moonshot AI` / `「Kimi K3」のオープンウェイト公開` / `優れたコーディング性能と新アーキテクチャ`
- 実際の強調: `Moonshot AI` / `を控え、その`（後の2箇所のペアがずれる）

## 原因（技術解説）

marked のバグではなく、CommonMark 仕様（0.31.2）の emphasis 規則に起因する。marked 18.0.5 は仕様通りに実装されている。

### CommonMark の delimiter run 規則

`*` や `**` の並び（delimiter run）が強調を開ける・閉じれるかは、前後の文字で決まる。

- **left-flanking**（開き候補の必要条件）:
  1. 直後が Unicode 空白でない、かつ
  2. (a) 直後が Unicode 句読点でない、または (b) 直後が句読点かつ直前が Unicode 空白または句読点
- **right-flanking**（閉じ候補の必要条件）:
  1. 直前が Unicode 空白でない、かつ
  2. (a) 直前が Unicode 句読点でない、または (b) 直前が句読点かつ直後が Unicode 空白または句読点
- `*` / `**` は left-flanking なら opener、right-flanking なら closer になれる
- 「Unicode 句読点」は Unicode 一般カテゴリ P（句読点）および S（記号）。`「`（U+300C）は Ps、`」`（U+300D）は Pe、`$` は Sc、`+` は Sm で、いずれも句読点扱いになる（検証済み）
- 文字列の先頭・末尾は空白として扱われる

### 報告例のトレース

1. `**Moonshot AI**`: 先頭の `**` は先頭=空白扱いで left-flanking 成立。正常にペアになる
2. `なる**「`: 直前 `る`（非句読点・非空白）、直後 `「`（Ps）。条件2(b) を満たさず **left-flanking 不成立 → opener になれない**
3. `公開**を`: 直前 `開`（非句読点）で left-flanking / right-flanking ともに成立。スタックに開きがないため opener として積まれる
4. `その**優`: right-flanking 成立 → 3. とペアになり **`を控え、その` が太字化**
5. 末尾の `**` は閉じ相手がなくリテラル表示

### closer 側の対称問題

太字の末尾が閉じ括弧で終わる場合も壊れる。`**「text」**を` の `」**を` は、直前 `」`（Pe = 句読点）かつ直後 `を`（非句読点・非空白）で right-flanking 条件2(b) を満たさず、**closer になれない**。つまり opener 側・closer 側の両方の修正が必要。

## 前処理 regex とレビュー結果

### 採用する正規表現

```js
// opener 側: 非句読点 + アスタリスク列 + 開き括弧 → アスタリスク列の前に空白挿入
const CJK_EMPHASIS_OPENER_PATTERN = /([^\s\p{P}\p{S}])(\*+)(?=[\p{Ps}\p{Pi}])/gu;
// closer 側: 閉じ括弧 + アスタリスク列 + 非句読点 → アスタリスク列の後に空白挿入
const CJK_EMPHASIS_CLOSER_PATTERN = /(?<=[\p{Pe}\p{Pf}])(\*+)([^\s\p{P}\p{S}])/gu;
```

| 要素 | 役割 |
| --- | --- |
| `[^\s\p{P}\p{S}]` | 空白・句読点・記号以外の文字（CJK 通常文字・ラテン文字・数字）。`*` 自身は Po なので含まれず、delimiter run の途中から誤マッチしない |
| `\*+` | アスタリスク列全体を greedy に捕捉。`*`（italic）・`**`（bold）・`***` に対応 |
| `\p{Ps}\p{Pi}` | 開き括弧類（`「（『【(` など）。opener の left-flanking を阻害する側 |
| `\p{Pe}\p{Pf}` | 閉じ括弧類（`」）』】)` など）。closer の right-flanking を阻害する側 |

変換例: `る**「` → `る **「`、`」**を` → `」** を`。挿入後は直前・直後が空白になるため flanking 条件を満たす。

### スコープを Ps/Pi・Pe/Pf に限定する理由

句読点全体（`\p{P}`）に広げると、Po に分類される `。` や `、` まで対象になり、以下の頻出する**正常な**パターンを破壊する。

- `**text**、次の文`（有効な closer の直後に `、`）
- `。**text**です`（有効な opener の直前に `。`）

逆に限定したことで `る**、text**を` や `**重要です。**次へ` は未対応のまま残るが、これは許容するトレードオフ（後述「残る制限」）。

### レビューで判明した問題と対応

| # | 問題 | 重要度 | 対応 |
| --- | --- | --- | --- |
| 1 | closer 側 regex が有効な opener を破壊: `」**text**を` → `」** text**を`（例: `「引用」**太字**です`）。破損 closer `**text」**を` と局所的に同形で、regex 単体では原理的に区別不可能 | 重大 | verify-first 設計で回避（後述） |
| 2 | opener 側 regex が有効な closer を破壊: `**太字**「引用」です` → `**太字 **「引用」です` | 中 | 同上 |
| 3 | コードブロック・インラインコード内のリテラル文字列（例: `` `る**「x」**を` ``）を書き換えてしまう | 中 | コードセグメント分割で回避（後述） |
| 4 | 当初の closer 側 regex の `(?<!\*)` ガードは冗長。`*` は Po であり lookbehind の `[\p{Pe}\p{Pf}]` に元々マッチしないため、ガード有無で全テスト結果が同一 | 軽微 | 削除済み |

## 設計方針

### verify-first（検証してから修正）

regex の false positive（問題1・2）は、正常なテキストには一切手を触れないことで回避する。

1. まず現行どおり marked でパースする
2. 出力 HTML の `<code>` / `<pre>` 以外のテキストノードに `**` が残っているか検査する
3. 残っていなければ（= 強調はすべて正常にペアされた）その結果をそのまま返す
4. 残っていれば（= 未ペアの delimiter が存在）ソースを修正して再パースする

検証済みの動作:

| 入力 | 判定 | 結果 |
| --- | --- | --- |
| `となる**「Kimi K3」の公開**を控え` | fix 実行 | `なる <strong>「Kimi K3」の公開</strong>を控え` |
| `**「text」**を` | fix 実行 | `<strong>「text」</strong> を` |
| `**text」**を` | fix 実行 | `<strong>text」</strong> を` |
| `**太字**「引用」です` | fix 不要 | `<strong>太字</strong>「引用」です`（正常を維持） |
| `「引用」**太字**です` | fix 不要 | `「引用」<strong>太字</strong>です`（問題1を回避） |
| インラインコード `` `a ** b` `` と正常な太字を含む文 | fix 不要 | code 内の `**` は検出対象外 |
| `\*\*not bold\*\*` | fix 実行 | regex はエスケープにマッチせず、再パース結果は同一（無害） |

### コードセグメントの保護

fix を実行する場合、ソースをコードセグメントと非コードセグメントに分割し、非コード部分にのみ regex を適用する。

```js
const MARKDOWN_CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
```

`String.split` で分割すると奇数インデックスがコードセグメントになるため、偶数インデックスのみ変換して再結合する。4スペースのインデントコードブロックは対象外とする（LLM 出力では稀）。

### ストリーミングとの整合

この拡張機能のストリーミングは以下の構造になっている。

- `service-worker.js` の `streamGenerateContent*` が受信チャンクを `chrome.storage.session` の `streamKey`（`streamContent_${resultIndex}`）に蓄積する
- UI 側（`popup.js` / `results.js`）が `setInterval` でポーリングし、蓄積済みの部分テキストで `convertMarkdownToHtml(streamContent, ...)` を毎ティック呼んで再描画する
- 完了後に別の呼び出し箇所で最終描画を1回行う

verify-first をストリーミング中に適用すると以下の問題があるため、**ストリーミング中は修正せず、完了時の最終描画でのみ修正する**。

1. 部分テキストは閉じ `**` が未到着で未ペアになるのが常態であり、検出が毎ティック発火して二重パースになる
2. タイプ途中のインラインコード（閉じバッククォート未到着）はコードセグメントとして認識できず、誤って本文扱いで修正が入る可能性がある
3. ストリーミング中の一時的な描画乱れ（未閉塞強調のリテラル表示）は現状でも発生しており、CJK 強調の破損が完了まで表示されることは同程度の妥協とみなせる

## 実装計画

### `extension/utils.js`

`UI helpers` セクションに、内部ヘルパー → エクスポートの順（bottom-up）で追加する。`convertMarkdownToHtml` の直前に配置する。

```js
const CJK_EMPHASIS_OPENER_PATTERN = /([^\s\p{P}\p{S}])(\*+)(?=[\p{Ps}\p{Pi}])/gu;
const CJK_EMPHASIS_CLOSER_PATTERN = /(?<=[\p{Pe}\p{Pf}])(\*+)([^\s\p{P}\p{S}])/gu;
const MARKDOWN_CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

const fixCjkEmphasisDelimiters = (text) => {
  return text
    .replace(CJK_EMPHASIS_OPENER_PATTERN, "$1 $2")
    .replace(CJK_EMPHASIS_CLOSER_PATTERN, "$1 $2");
};

const fixCjkEmphasisOutsideCodeSegments = (text) => {
  return text
    .split(MARKDOWN_CODE_SEGMENT_PATTERN)
    .map((segment, index) => (index % 2 === 1 ? segment : fixCjkEmphasisDelimiters(segment)))
    .join("");
};

const hasUnmatchedEmphasisMarkers = (container) => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = null;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest("code, pre")) {
      continue;
    }
    if (node.textContent.includes("**")) {
      return true;
    }
  }
  return false;
};
```

`convertMarkdownToHtml` に第4引数 `fixEmphasis = false` を追加する。

```js
export const convertMarkdownToHtml = (content, breaks, links, fixEmphasis = false) => {
  // ...現行のレンダリング（htmlDiv 構築まで）...

  if (fixEmphasis && hasUnmatchedEmphasisMarkers(htmlDiv)) {
    // ソース（markdownDiv.innerHTML = HTML エスケープ済みテキスト）を修正して再パース。
    // * ・ CJK 文字・括弧類は HTML エスケープの対象外なので regex はそのまま機能する。
    htmlDiv.innerHTML = DOMPurify.sanitize(
      marked.parse(fixCjkEmphasisOutsideCodeSegments(markdownDiv.innerHTML), { breaks, renderer })
    );
  }

  // ...以降は現行どおり（removeUnsafeMarkdownUrls 等の後処理）...
};
```

### 呼び出し箇所の変更

| ファイル:行 | タイミング | 変更 |
| --- | --- | --- |
| `popup.js:600` | ストリーミング中（setInterval） | 変更なし |
| `popup.js:639` | 最終描画 | 第4引数に `true` |
| `results.js:439` | ユーザーの質問文（LLM 出力ではない） | 変更なし |
| `results.js:685` | ストリーミング中（setInterval） | 変更なし |
| `results.js:703` | 最終描画 | 第4引数に `true` |
| `results.js:789` | ストリーミング中（setInterval） | 変更なし |
| `results.js:908` | キャッシュ読み込み時の描画 | 第4引数に `true` |
| `results.js:946` | フォローアップ回答の最終描画 | 第4引数に `true` |

### `test/dom/markdown.test.js`

既存の `renderMarkdown` ヘルパーを拡張（または第4引数対応のラッパー追加）し、以下のケースを追加する。

| 入力 | 期待 |
| --- | --- |
| `となる**「Kimi K3」の公開**を控え` | `<strong>「Kimi K3」の公開</strong>` を含む |
| 報告された原文全体 | 3 箇所すべて正しく `<strong>` になる |
| `**「text」**を` | `<strong>「text」</strong>` を含む |
| `**text」**を` | `<strong>text」</strong>` を含む |
| `**太字**「引用」です` | 修正されず `<strong>太字</strong>「引用」です` のまま |
| `「引用」**太字**です` | 修正されず `<strong>太字</strong>` のまま |
| `る**text**を` | 従来どおり `<strong>text</strong>` |
| `**text**、次` | 従来どおり `<strong>text</strong>` |
| インラインコード `` `a ** b` `` を含む正常文 | 修正が走らずコード内容が変わらない |
| 本文の破損 + フェンスコード内 `る**「x」**を` | 本文のみ修正されコード内容は変わらない |
| 第4引数省略 / `false` | 破損入力でも従来どおりの出力（後方互換） |

## 残る制限

- **混在テキスト**: 正常な `**太字**「引用」` と破損した強調が同一回答内に混在する場合、fix 実行時に正常側まで空白が挿入されて壊れる可能性が残る。完全に防ぐには「修正後の方が code 外の `**` 出現数が少ない場合のみ修正結果を採用する」比較ガードを追加する（必要になった時点で検討する）
- **単独 `*`（italic）の破損**: 検出は `**` のみを見るため、`*「text」*` のような italic の破損は修正されない（出現頻度が低いため許容）
- **Po 句読点に隣接する破損**: `る**、text**を` や `**重要です。**次へ` は対象外のまま（スコープ限定のトレードオフ）
- **インデントコードブロック**: 4スペースインデントのコードブロック内は分割対象外のため、そこに `**「` 等があると修正で空白が入る（LLM 出力では稀）

## 検証

1. `npm run lint` と `npm test` を実行し、既存テストを含めてすべて通ることを確認する
2. 上記テストケースが `test/dom/markdown.test.js` でパスすることを確認する
3. 手動確認（実際の拡張機能で要約を実行）:
   - ストリーミング ON: 生成中は CJK 強調が壊れた表示のまま流れ、完了時に正しい表示へ切り替わること
   - ストリーミング OFF: 初回描画から正しい表示であること
   - フォローアップ質問・キャッシュからの再表示でも正しい表示であること
4. 表示層のみの変更であり API 呼び出しには影響しないが、`apiProvider: "gemini"` と `apiProvider: "openai"` の両方で描画を確認する
