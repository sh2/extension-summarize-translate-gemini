# Readability.js 抽出フォールバック実装計画

## 1. 目的

Reddit などの掲示板ページで `Readability.js` がページ全体ではなく、一部のコメントや本文断片だけを抽出する問題を防ぐ。

`Readability.parse()` が結果を返しても、抽出文字数がライブラリ自身の成功判定基準を満たさない場合は、抽出結果を採用せず `document.body.innerText` を入力として使用する。要約・翻訳・カスタムアクションに共通する本文取得経路を対象とし、欠落よりも多少のノイズを許容する Recall 重視の設計とする。

## 2. 背景と根拠

### 2.1 Reddit での失敗

`Readability.js` はニュース記事向けのヒューリスティックを使用しており、`comment`、`commentarea` などをノイズ候補として扱う。Reddit ではコメントが本文の大部分を占めるため、複数コメントからなるスレッドが 1 コメントの断片として抽出されることがある。

再現例では、ページ内のコメント本文が約 1,661 文字あるにもかかわらず、Readability の結果は 411 文字のコメント 1 件だけだった。

### 2.2 `DEFAULT_CHAR_THRESHOLD` の利用

`@mozilla/readability` v0.6.0 の `DEFAULT_CHAR_THRESHOLD` は `500` である。上流 README では、記事結果を返すために必要な文字数として説明されている。

Readability は抽出結果が `500` 文字未満の場合、次の順序でフラグを解除して再試行する。

1. `STRIP_UNLIKELYS`
2. `WEIGHT_CLASSES`
3. `CLEAN_CONDITIONALLY`

全試行でも閾値に達しない場合、ライブラリは試行結果のうち最長のものを返す。そのため、`parse()` が `null` ではなくても、短い不完全な断片が正常な戻り値として返る。

## 3. 採用する設計方針

### 3.1 出力側を検証する

ドメインや CSS クラス名の対象リストを先に判定するのではなく、`Readability.parse()` の出力を検証する。これにより、Reddit に限らず未知の掲示板や、別の理由で本文が断片化するページにも適用できる。

### 3.2 Readability の閾値を流用する

新しいマジックナンバーを作らず、`DEFAULT_CHAR_THRESHOLD` と同じ `500` 文字を判定に使用する。上流ライブラリの成功基準を再利用するため、閾値の説明可能性と保守性を確保できる。

判定文字数は、Readability 内部の `_getInnerText(articleContent, true).length` に近づけるため、連続する空白を 1 個に折りたたんでから `trim().length` を計算する。

### 3.3 Recall を優先する(fail-open)

判定結果が `500` 文字未満なら、ページ全体の `document.body.innerText` にフォールバックする。

短い正当な記事でもナビゲーションやボタン文言が混入する可能性はあるが、LLM による要約ではノイズを無視できる。一方、断片化による欠落は LLM が復元できないため、要約用途では Recall を優先する。

## 4. 実装内容

### 4.1 本文抽出処理を変更する

**対象:** `extension/popup.js` の `getWholeText()`

現在は次の条件でのみフォールバックしている。

- `Readability.parse()` が `null` の場合 → `document.body.innerText`
- それ以外の場合 → `article.textContent`

これを次の条件に変更する。

- `article` が存在し、空白を正規化した `article.textContent` が 500 文字以上 → `article.textContent`
- `article` が `null`、`textContent` が空、または正規化後の文字数が 500 文字未満 → `document.body.innerText`

実装時の注意:

- `getWholeText()` は `chrome.scripting.executeScript` に渡す関数のため、判定ロジックを関数内で自己完結させる。
- 関数外の定数や import に依存しない。
- コメントはプロジェクト規約に従い英語で記述する。
- 既存のフォールバックログは `console.log` のままにする。これはユーザー環境で発生し得る通常のフォールバックであり、`console.error` にはしない。
- `document.body` が存在しない場合や `innerText` が空の場合も、既存の空入力処理と矛盾しないようにする。

### 4.2 フォールバック理由のログ

既存メッセージ `"Failed to parse the article. Using document.body.innerText instead."` は `article === null` 時には正確だが、パース成功・文字数不足のケースでは誤解を招くため、文字数を含む形に更新する。

```js
console.log(`Failed to extract enough text (${length} chars). Using document.body.innerText instead.`);
```

- `console.log` のままにする(AGENTS.md のロギング方針に従い、通常利用で起こりうるフォールバックは `console.error` にしない)。
- ログには文字数のみを含め、ページ本文そのものや個人情報、API キー、リクエストヘッダーなどの機密情報は出力しない。

### 4.3 サイト別セレクタとオプション設定

今回の初回実装では、次を行わない。

- Reddit や掲示板のホスト名リストを本文抽出の主条件にする
- ユーザーにサイトごとのセレクタを設定させるオプションを追加する
- `Readability.min.js` を変更する
- Reddit JSON API に依存する

`500` 文字未満のフォールバックは未知のサイトにも適用できるため、v1 の安全網として優先する。1 コメントが 500 文字を超える場合や、長いが誤った候補を抽出する場合は検出できないため、必要になった時点で Reddit 専用抽出器を v2 として検討する。

## 5. テスト計画

### 5.1 回帰テスト

**候補:** `test/dom/popup-content-extraction.test.js`

`getWholeText()` は `chrome.scripting.executeScript` に渡すため自己完結しており、関数外のヘルパーを参照できない。このため「判定ヘルパーを切り出して公開する」方式は、ヘルパーを関数内に置く(単体テスト不可)かロジックを重複させる(ドリフト)かのどちらかに陥るため採用しない。

既存の `test/helpers/dom-markdown.js` が確立している「ベンダーライブラリを jsdom に eval して読み込む」パターンに合わせ、次の方式を採用する。

1. `popup.js` から `getWholeText()` の関数定義テキストを抽出する。
2. `extension/lib/Readability.min.js` を jsdom に eval して読み込む。
3. 抽出した関数を jsdom 上で評価し、`document.body.innerText` と `article.textContent` の分岐を検証する。

`getWholeText()` は自己完結なので、この方式でそのまま実行できる。過度なテスト専用 API は追加しない。

### 5.2 必須ケース

| ケース | Readability 結果 | 本文全体 | 期待する入力 |
| --- | --- | --- | --- |
| A | `null` | 任意 | `document.body.innerText` |
| B | 411 文字 | 約 1,661 文字 | `document.body.innerText` |
| C | 300 文字 | 800 文字 | `document.body.innerText`(Recall 重視の仕様) |
| D | 500 文字以上 | 任意 | `article.textContent` |
| E | 空文字 | 任意 | `document.body.innerText` |
| F | 改行・インデントを含む | 正規化後 500 文字未満 | `document.body.innerText` |
| G | ちょうど 500 文字 | 任意 | `article.textContent`(境界値) |

ケース B は今回の Reddit 回帰を直接固定する。ケース C は、`rawText > 1500` 条件を採用しないことを明示する。ケース F は、Readability と同様に空白を折りたたんで判定することを確認する。ケース G は `>= 500` の境界を固定する。

**fixture:** リポジトリには Reddit の実 HTML が存在しないため、`e2e/fixtures/article.html` の前例に合わせ、小さな合成 fixture(例: `test/fixtures/reddit-thread.html`)を追加する。`.comment` / `.commentarea` 構造で 411 文字相当の断片が再現されることを確認する。Wayback の実 HTML を丸ごとコミットするのはサイズ・保守性の面で不向き。

### 5.3 既存機能への影響確認

本文取得経路を共有する次の操作について、フォールバック後も入力が空にならないことを確認する。

- ページ要約
- ページ翻訳
- 選択範囲がない場合のカスタムアクション
- 抽出結果が空の場合の画像フォールバック
- YouTube 字幕取得経路(字幕が取得できた場合は本文抽出を行わない)

## 6. 検証手順

実装後、次の順序で検証する。

1. `npm run lint` を実行する。
2. `npm test` を実行する。
3. VS Code の Problems で、変更した JavaScript と Markdown の診断を確認する。
4. 合成 fixture(`test/fixtures/reddit-thread.html`)で、411 文字相当の断片が `document.body.innerText` に置き換わることを確認する。
5. 通常の長文記事で、Readability の抽出結果がそのまま維持されることを確認する。
6. 短い正当な記事で、Recall 重視のため `document.body.innerText` が採用されることを確認する。
7. 必要に応じて `npm run test:e2e` を実行する。これは通常の変更で必須ではなく、main ブランチまたはリリース前の確認とする。

## 7. リスクと将来対応

### 7.1 短い記事へのノイズ混入

500 文字未満の正当な記事でもページ全体にフォールバックするため、ナビゲーション・広告・ボタン文言が混入する可能性がある。今回は要約用途での欠落防止を優先する。翻訳結果でノイズが問題になった場合は、操作種別ごとに閾値方針を分けることを再検討する。

### 7.2 500 文字以上の誤抽出

1 コメントが 500 文字を超える場合や、Readability が長いサイドバーを選んだ場合、文字数だけでは異常を検出できない。将来的には次を検討する。

- Reddit 専用セレクタによる投稿本文・コメント抽出
- 小さなホスト名ルーティング表
- 抽出結果と `document.body.innerText` の比率を補助指標として利用
- 実ページ fixture を増やした検出精度の評価

ただし、これらは v1 の必須スコープには含めない。

### 7.3 パフォーマンス

`document.body.innerText` はレイアウト計算を強制するため、巨大なスレッドでは Readability より遅くなる可能性がある。ただし既存フォールバック経路の再利用であり、新規リスクはない。

## 8. 完了条件

- `extension/popup.js` の本文抽出が `article === null` 以外の短い断片にもフォールバックする。
- Readability の文字数判定と同じ考え方で、正規化後 500 文字を境界にする。
- Reddit 再現ケースを含む回帰テストが追加され、フォールバック結果を検証できる。
- `npm run lint` と `npm test` が成功する。
- Markdown の診断エラーがない。
- `extension/lib/Readability.min.js`、ロケール、manifest の不要な変更がない。
