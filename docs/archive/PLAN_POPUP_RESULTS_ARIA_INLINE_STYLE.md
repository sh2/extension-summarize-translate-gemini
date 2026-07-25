# popup / results ステータス要素の ARIA 属性追加とインラインスタイル移行

## 背景

[`PLAN_STATUS_MESSAGE_ARIA.md`](archive/PLAN_STATUS_MESSAGE_ARIA.md) の「対象外（別計画）」で言及された2タスクを本計画で扱う。

### 課題1: ARIA 属性の欠如

popup と results のステータス要素（計4箇所）には ARIA 属性がない。スクリーンリーダーユーザーに状態変化が通知されない。

| # | ページ | 要素 ID | HTML 位置 | 用途 |
| --- | --- | --- | --- | --- |
| 1 | popup | `#status` | `popup.html:37` | ローディングドット（500ms）、タブ移行通知、モデルバージョン表示 |
| 2 | popup | `#operation-status` | `popup.html:42` | コピー/保存の確認（1000ms 自動消去） |
| 3 | results | `#send-status` | `results.html:118` | ローディングドット（500ms）、一時通知（3000ms）、モデルバージョン表示 |
| 4 | results | `#operation-status` | `results.html:103` | コピー/保存の確認（1000ms 自動消去） |

`#status`（popup）と `#send-status`（results）は**マルチプレクス要素**であり、1つの要素が3種類のコンテンツを共有している:

1. **ローディングドットアニメーション**: `displayLoadingMessage()`（`utils.js`）が500ms 間隔で `. → .. → ...` を循環させる。
2. **意味のある状態メッセージ**: 「タブで開いています」「画像添付は未対応です」等の一時通知。
3. **モデルバージョン表示**: 生成完了後にモデルバージョン文字列を表示（メタデータ）。

一律に `role="status"` や `aria-live="polite"` を付与すると、500ms 間隔のドット変化がすべてスクリーンリーダーに読み上げられ、**読み上げ過剰**になる。

### 課題2: インラインスタイル `color: gray`

上記4要素すべてに `style="color: gray;"` がハードコードされている。`gray`（`#808080`）はテーマ変数を無視するため、ダークテーマ（背景 `#000000`）で低コントラストになる。コードベースの既存規約では、ミュートテキストに `var(--nc-tx-2)` を使用する（`options.css` の `.save-status`、`results.html` の `#page-source`）。

## 変更方針

### ARIA: 隠しライブリージョン分離方式

マルチプレクス要素（`#status`、`#send-status`）には ARIA 属性を**付与しない**。代わりに、視覚的に隠したライブリージョン要素を別途追加し、**意味のある状態変化のみ**を通知する。

- ドットアニメーション（500ms 更新）は視覚専用要素への書き込みのまま → 読み上げなし
- ローディング開始/終了、エラー通知、一時メッセージのみ隠しライブリージョンに書き込む → 読み上げあり
- モデルバージョン表示はメタデータであり通知不要 → 隠しライブリージョンには書き込まない

`#operation-status`（両ページ）はアニメーションを含まない単純な確認メッセージのみのため、HTML に `role="status"` を直接付与する。

### インラインスタイル: CSS クラス + テーマ変数

`style="color: gray;"` を `common.css` の `.status-text` クラス（`color: var(--nc-tx-2)`）に置換する。

## 対象ファイル

- `extension/popup.html`
- `extension/results.html`
- `extension/popup.js`
- `extension/results.js`
- `extension/css/common.css`
- `test/static/popup-results-structure.test.js`（新規）

## 変更内容

### 1. CSS 追加（`extension/css/common.css`）

```css
.status-text {
  color: var(--nc-tx-2);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

- `.status-text`: `color: gray` の代替。テーマ変数 `--nc-tx-2` を使用し、ライト/ダーク両テーマで適切なコントラストを確保する。
- `.visually-hidden`: 視覚的に隠すがスクリーンリーダーには読み上げられる標準パターン。

### 2. HTML 変更（`extension/popup.html`）

```html
<!-- 変更前 -->
<p id="status" style="color: gray;"></p>

<!-- 変更後 -->
<p id="status" class="status-text"></p>
<span id="status-live" class="visually-hidden" role="status"></span>
```

```html
<!-- 変更前 -->
<span id="operation-status" style="color: gray;"></span>

<!-- 変更後 -->
<span id="operation-status" class="status-text" role="status"></span>
```

- `#status`: インラインスタイルを `.status-text` に置換。ARIA 属性は付与しない（マルチプレクス要素）。直後に `#status-live`（隠しライブリージョン）を追加。
- `#operation-status`: インラインスタイルを `.status-text` に置換し、`role="status"` を付与。

### 3. HTML 変更（`extension/results.html`）

```html
<!-- 変更前 -->
<span id="operation-status" style="color: gray;"></span>

<!-- 変更後 -->
<span id="operation-status" class="status-text" role="status"></span>
```

```html
<!-- 変更前 -->
<span id="send-status" style="color: gray;"></span>

<!-- 変更後 -->
<span id="send-status" class="status-text"></span>
<span id="send-status-live" class="visually-hidden" role="status"></span>
```

- `#operation-status`: popup と同じ変更。
- `#send-status`: インラインスタイルを `.status-text` に置換。ARIA 属性は付与しない。直後に `#send-status-live`（隠しライブリージョン）を追加。

### 4. JS 変更（`extension/popup.js`）

隠しライブリージョン `#status-live` への書き込みを追加する。

#### 4a. ローディング開始時（`main` 内、`setInterval` 開始前）

```javascript
// 追加
document.getElementById("status-live").textContent =
  getRetryLoadingMessage(currentRetryStatus, getLoadingMessage(actionType, mediaType));
```

ローディング開始を1回だけ通知する。視覚表示と同じく `getRetryLoadingMessage()` でラップし、開始時点で既にリトライ状態が記録されている場合でも通知文言が視覚表示と一致する。ドットアニメーションの更新は通知しない。

#### 4b. ローディング終了時（`finally` ブロック内）

`main` 関数の冒頭に `let hasError = false;` を追加する。`finally` ブロック内の既存ガード `if (!openedInTab)` の内側に、`hasError` 条件付きでライブリージョンをクリアする。

```javascript
// 変更前（finally 内、if (!openedInTab) ブロックの末尾）
document.getElementById("status").textContent = modelVersion;
setPopupControlsEnabled(true);

// 変更後
document.getElementById("status").textContent = modelVersion;

if (!hasError) {
  document.getElementById("status-live").textContent = "";
}

setPopupControlsEnabled(true);
```

ローディング終了を通知する（空文字列でライブリージョンをリセット）。モデルバージョンは通知しない。エラー発生時（4e）は `hasError` が `true` のためクリアをスキップし、エラー通知が `finally` に上書きされることを防ぐ。

#### 4c. タブ移行通知（`closePopupWithNotice`）

```javascript
// 変更前
document.getElementById("status").textContent = chrome.i18n.getMessage("popup_opening_in_tab");

// 変更後
const openingMessage = chrome.i18n.getMessage("popup_opening_in_tab");
document.getElementById("status").textContent = openingMessage;
document.getElementById("status-live").textContent = openingMessage;
```

#### 4d. YouTube キャプション取得時（`extractTaskInformation` 内）

`main` の生成ローディングとは別に、YouTube キャプション取得中にも `#status` にドットアニメーションが表示される（`popup.js:361`）。この区間もライブリージョンで通知する。

```javascript
// 変更前
const displayIntervalId = setInterval(displayLoadingMessage, 500, "status", chrome.i18n.getMessage("popup_retrieving_captions"));

try {
  taskInput = (await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: getTranscript
  }))[0].result;
} catch (error) {
  console.log(error);
} finally {
  if (displayIntervalId) {
    // Stop displaying the loading message
    clearInterval(displayIntervalId);
  }
}

// 変更後
const captionsMessage = chrome.i18n.getMessage("popup_retrieving_captions");
document.getElementById("status-live").textContent = captionsMessage;

const displayIntervalId = setInterval(displayLoadingMessage, 500, "status", captionsMessage);

try {
  taskInput = (await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: getTranscript
  }))[0].result;
} catch (error) {
  console.log(error);
} finally {
  if (displayIntervalId) {
    // Stop displaying the loading message
    clearInterval(displayIntervalId);
  }

  document.getElementById("status-live").textContent = "";
}
```

キャプション取得開始を1回通知し、`finally` でライブリージョンをクリアする。取得後は `main` の 4a で生成ローディングの通知が上書きされる。

#### 4e. エラー発生時（`catch` ブロック内）

```javascript
// 変更前
} catch (error) {
  content = chrome.i18n.getMessage("popup_miscellaneous_error");
  console.error(error);
}

// 変更後
} catch (error) {
  hasError = true;
  content = chrome.i18n.getMessage("popup_miscellaneous_error");
  document.getElementById("status-live").textContent = content;
  console.error(error);
}
```

エラー発生をスクリーンリーダーに通知する。視覚的には `#content` にエラー文言が表示されるが、ライブリージョンにも同じ文言を設定することで、フォーカス位置に関係なく通知が届く。`hasError = true` により、直後の `finally`（4b）でライブリージョンがクリアされることを防ぐ。

#### 4f. `#operation-status` の変更なし

`role="status"` を HTML に付与したため、JS の変更は不要。`textContent` の変更が自動的にスクリーンリーダーに通知される。

### 5. JS 変更（`extension/results.js`）

隠しライブリージョン `#send-status-live` への書き込みを追加する。

#### 5a. ローディング開始時（`askQuestion` 内、`setInterval` 開始前）

```javascript
// 追加
document.getElementById("send-status-live").textContent =
  getRetryLoadingMessage(currentRetryStatus, responseWaitingMessage);
```

#### 5b. ローディング終了時（`askQuestion` の `finally` ブロック内）

`askQuestion` 関数の冒頭に `let hasError = false;` を追加する。`finally` ブロック内で `hasError` 条件付きでライブリージョンをクリアする。

```javascript
// 追加（clearInterval の後）
if (!hasError) {
  document.getElementById("send-status-live").textContent = "";
}
```

エラー発生時（5g）は `hasError` が `true` のためクリアをスキップし、エラー通知が `finally` に上書きされることを防ぐ。

#### 5c. 初期結果待ち（`initialize` 内、`beginWaitingForResult` 後）

```javascript
// 追加
document.getElementById("send-status-live").textContent =
  getRetryLoadingMessage(currentRetryStatus, waitingForResultMessage);
```

#### 5d. 初期結果到着時（`initialize` 内、`clearInterval` の後）

```javascript
// 変更前
document.getElementById("send-status").textContent = "";

// 変更後
document.getElementById("send-status").textContent = "";
document.getElementById("send-status-live").textContent = "";
```

#### 5e. 一時通知（`showTransientSendStatusMessage`）

```javascript
// 変更前
const showTransientSendStatusMessage = (message) => {
  clearSendStatusMessage();
  document.getElementById("send-status").textContent = message;

  sendStatusTimeoutId = setTimeout(() => {
    if (document.getElementById("send-status").textContent === message) {
      document.getElementById("send-status").textContent = "";
    }
  }, 3000);
};

// 変更後
const showTransientSendStatusMessage = (message) => {
  clearSendStatusMessage();
  document.getElementById("send-status").textContent = message;
  document.getElementById("send-status-live").textContent = message;

  sendStatusTimeoutId = setTimeout(() => {
    if (document.getElementById("send-status").textContent === message &&
        document.getElementById("send-status-live").textContent === message) {
      clearSendStatusMessage();
    }
  }, 3000);
};
```

タイマー経過後の消去は `clearSendStatusMessage()` を経由する（5h 参照）。ガード条件に `#send-status-live` も含めることで、ライブリージョンが別経路で更新された場合に古いタイマーが新しい通知を消すことを防ぐ。

#### 5f. モデルバージョン表示（`askQuestion` 内）

```javascript
// 変更なし（ライブリージョンには書き込まない）
if (languageModel.includes("/")) {
  document.getElementById("send-status").textContent = response.body?.modelVersion ?? "";
} else {
  document.getElementById("send-status").textContent = "";
}
```

モデルバージョンはメタデータであり、スクリーンリーダーへの通知は不要。

#### 5g. エラー発生時（`askQuestion` の `catch` ブロック内）

```javascript
// 変更前
} catch (error) {
  console.error("Unexpected failure while handling follow-up question:", error);

  if (streamIntervalId) {
    clearInterval(streamIntervalId);
  }

  // Display a friendly error message on the answer div
  formattedAnswerDiv.textContent = chrome.i18n.getMessage("response_unexpected_response");
  document.getElementById("send-status").textContent = "";
}

// 変更後
} catch (error) {
  console.error("Unexpected failure while handling follow-up question:", error);

  if (streamIntervalId) {
    clearInterval(streamIntervalId);
  }

  // Display a friendly error message on the answer div
  hasError = true;
  const errorMessage = chrome.i18n.getMessage("response_unexpected_response");
  formattedAnswerDiv.textContent = errorMessage;
  document.getElementById("send-status").textContent = "";
  document.getElementById("send-status-live").textContent = errorMessage;
}
```

エラー発生をスクリーンリーダーに通知する。視覚的には `formattedAnswerDiv` にエラー文言が表示されるが、ライブリージョンにも同じ文言を設定する。`hasError = true` により、直後の `finally`（5b）でライブリージョンがクリアされることを防ぐ。

#### 5h. `clearSendStatusMessage` の変更

```javascript
// 変更前
const clearSendStatusMessage = () => {
  clearTimeout(sendStatusTimeoutId);
  sendStatusTimeoutId = null;
  document.getElementById("send-status").textContent = "";
};

// 変更後
const clearSendStatusMessage = () => {
  clearTimeout(sendStatusTimeoutId);
  sendStatusTimeoutId = null;
  document.getElementById("send-status").textContent = "";
  document.getElementById("send-status-live").textContent = "";
};
```

`clearSendStatusMessage()` は `askQuestion` 冒頭（L574）や `showTransientSendStatusMessage` 内から呼ばれる。ライブリージョンのクリアをこの関数に集約することで、視覚表示と通知の状態が常に同期される。古い通知がライブリージョンに残ることを防ぐ。

#### 5i. `#operation-status` の変更なし

popup と同じ理由で JS 変更不要。

### 6. 構造テスト新設（`test/static/popup-results-structure.test.js`）

popup.html と results.html の構造検証を専用テストファイルとして新設する。`extension-integrity.test.js` は manifest/ロケールの整合性テストであり、DOM 構造の検証は `options-structure.test.js` と同じくページ専用の構造テストとして分離する。

#### テストケース

- **popup.html**:
  - `#status` が `class="status-text"` を持ち、`style` 属性と `role` 属性を持たないこと
  - `#status-live` が `class="visually-hidden"` と `role="status"` を持つこと
  - `#operation-status` が `class="status-text"` と `role="status"` を持ち、`style` 属性を持たないこと
  - `style="color: gray;"` を持つ要素が存在しないこと

- **results.html**:
  - `#send-status` が `class="status-text"` を持ち、`style` 属性と `role` 属性を持たないこと
  - `#send-status-live` が `class="visually-hidden"` と `role="status"` を持つこと
  - `#operation-status` が `class="status-text"` と `role="status"` を持ち、`style` 属性を持たないこと
  - `style="color: gray;"` を持つ要素が存在しないこと

## 設計判断

### 隠しライブリージョン分離方式を採用する理由

`#status`（popup）と `#send-status`（results）は、ドットアニメーション・一時メッセージ・モデルバージョンの3種類が1要素を共有するマルチプレクス構造である。

#### 却下した代替案: `aria-live` トグル方式

要素に `aria-live="polite"` を付与し、ローディング中に `aria-live="off"` に切り替える方式も検討した。しかし以下の問題がある:

- `displayLoadingMessage()`（`utils.js`）は `elementId` 文字列で要素を取得するため、ARIA 属性のトグルには追加の DOM 操作が必要になる。
- ローディング開始/終了のタイミングが `popup.js` と `results.js` の複数箇所に分散しており、トグル漏れのリスクがある。
- `aria-live` の動的変更は支援技術のサポートが不安定な環境がある。

#### 採用した方式: 隠しライブリージョン分離

- 視覚要素と通知要素を物理的に分離することで、ドットアニメーションが読み上げられるリスクを**構造的に排除**する。
- 通知の書き込みは意味のあるメッセージを設定する箇所（popup.js で6箇所、results.js で7箇所）に限定され、トグル管理が不要。
- `.visually-hidden` はスクリーンリーダー対応の標準パターンであり、支援技術のサポートが安定している。

### `#operation-status` に `role="status"` を直接付与する理由

`#operation-status` はコピー/保存の確認メッセージ（「Copied.」「Saved.」）のみを表示し、1000ms 後に自動消去する。アニメーションやマルチプレクスがないため、`role="status"` の直接付与で十分である。options ページの `#status` / `#persistentStatus` と同じパターン。

### ライブリージョン更新に直接代入を採用する理由

`PLAN_STATUS_MESSAGE_ARIA.md` では options ページの `hidden` 属性制御に伴い「unhide → 空にする → 次フレームで文言代入」の手順を採用した。本計画では次フレーム遅延を**採用しない**。理由は以下のとおり:

- 本計画のライブリージョンは `hidden` 属性を使わない `.visually-hidden`（常に表示状態）であり、`hidden` の解除と `textContent` 代入の競合問題が発生しない。
- `role="status"` は暗黙に `aria-atomic="true"` を含むため、`textContent` の変更が全体として再読み上げされる。
- 次フレーム遅延を導入すると `requestAnimationFrame` / `cancelAnimationFrame` の注入と状態管理が必要になり、popup.js / results.js の複数箇所に分散する書き込みの複雑さが増す。
- 同一文言の再通知（例: 連続して同じエラー）が読み上げられない可能性は許容する。ユーザーは視覚的に結果エリアのエラーを確認でき、ライブリージョンは補助的な通知手段である。

### リトライ・フォールバック遷移の通知方針

ローディング開始時の初回通知は `getRetryLoadingMessage()` でラップし、開始時点で既にリトライ状態が記録されている場合でも視覚表示と一致させる。ただし、処理中にリトライ状態へ遷移した際の通知は**行わない**。理由は以下のとおり:

- リトライ遷移は `retryStatusListener`（`chrome.storage.onChanged`）で検知可能だが、通知の追加はリスナーの責務を複雑にする。
- リトライは数秒以内に完了またはフォールバックするため、開始時の通知で「処理中であること」は伝わっている。
- 503 リトライの詳細は `console.log` で追跡可能であり、スクリーンリーダーユーザーへの逐次通知はノイズになる。

### モデルバージョンを通知しない理由

モデルバージョン（例: `gemini-2.5-flash`）は生成結果のメタデータであり、ユーザーがアクションを起こす必要のある状態変化ではない。スクリーンリーダーユーザーにとってノイズになるため、隠しライブリージョンには書き込まない。

### LLM API 応答エラーをライブリージョンで通知しない理由

LLM API の失敗（`{ ok: false, status, body }`）は例外ではなく通常の応答として処理され、`getResponseContent()` が返すエラー文言が**結果本文**（popup の `#content`、results の会話エリア）に描画される。スクリーンリーダーユーザーは結果を読むために本文へ移動するため、エラー文言は通常の読書フローの中で自然に発見される。

ライブリージョンの役割は「メインコンテンツの外で起きた状態変化を能動的に通知する」ことである。API 応答エラーはメインコンテンツそのものなので、ライブリージョンで重複通知すると二重読み上げになるリスクがある。そのため、ライブリージョン通知は `catch` ブロックで捕捉される予期しない内部エラー（4e / 5g）に限定する。

### 初期結果待ちの初回通知が視覚表示と一致しない可能性の許容

5c の初回通知は `initialize()` 内で `startRetryStatusListener()` より前に実行されるため、`currentRetryStatus` は初期値の `null` である。一方、視覚表示の interval は 500ms 後に実行され、その頃には `waitForResult()` 内のリスナーがリトライ状態を取得済みかもしれない。開始直後に既にリトライ状態がある稀なケースで、初回の読み上げと最初の視覚表示が一致しない可能性がある。

この不一致は**許容**する。理由は以下のとおり:

- 初期結果待ちは popup からの引き継ぎ直後であり、リトライ状態が既に記録されているケースは稀である。
- 不一致が生じても、読み上げは「待機中」の通常文言であり、ユーザーに誤解を与える内容ではない。
- 一致させるには `initialize()` 側でリスナーを開始する責務の再編成が必要になり、本計画の範囲を超える。

### インラインスタイル移行の対象範囲

本計画では `style="color: gray;"` の4箇所のみを移行する。以下のインラインスタイルは対象外:

| 対象外 | 理由 |
| --- | --- |
| ヘッダーレイアウト（popup 5箇所 + results 6箇所） | `padding`, `display: flex`, `margin-right` 等のレイアウト指定。popup/results で同一の重複コードだが、CSS 移行には視覚リグレッションテスト（目視確認）が別途必要 |
| `#results-link` の `display: none`（popup.html） | JS による表示切替（`style.display = "block"/"none"`）と連動。`hidden` 属性への移行は別途検討 |
| `#page-source` の `display: none; color: var(--nc-tx-2); opacity: 0.85; margin: 0 0 1rem 0;`（results.html） | 既にテーマ変数を使用。`display` 切替は JS と連動 |
| `#text` の `width: 100%; margin-bottom: 0;`（results.html） | テキストエリアのレイアウト指定 |
| `formattedQuestionDiv` のインラインスタイル（results.js L426-429） | JS による動的生成要素。CSS クラス化は別途検討 |

### CSS 変更なし（`new.min.css`）

`.status-text` と `.visually-hidden` は `common.css` に追加する。`new.min.css` はベンダーライブラリ（new.css）であり編集しない。

## 期待される効果

| 状態 | 変更前 | 変更後 |
| --- | --- | --- |
| ダークテーマのステータス文字色 | `gray`（`#808080`）固定、低コントラスト | `var(--nc-tx-2)`（`#EEEEEE`）、適切 |
| コピー/保存確認のスクリーンリーダー通知 | なし | `role="status"` で自動通知 |
| ローディング開始の通知 | なし | 隠しライブリージョンで1回通知 |
| ドットアニメーションの読み上げ | （ARIA なしで読み上げなし） | 読み上げなし（構造的に排除） |
| 一時メッセージの通知 | なし | 隠しライブリージョンで通知 |
| エラー発生の通知 | なし | 隠しライブリージョンで通知 |
| モデルバージョンの通知 | なし | なし（意図的） |

## 検証手順

1. `npm run lint` — ESLint エラーがないこと
2. `npm test` — 全テストが通過すること（構造テスト含む）
3. 手動確認:
   - popup で要約を実行し、ローディングドットが表示・消去されること
   - results でフォローアップ質問を送信し、ローディングドットが表示・消去されること
   - コピー/保存ボタンで確認メッセージが表示・消去されること
   - ライトテーマ/ダークテーマ両方でステータス文字が適切に表示されること
   - スクリーンリーダー（またはブラウザのアクセシビリティツール）で以下が通知されること:
     - ローディング開始メッセージ（YouTube キャプション取得含む）
     - コピー/保存確認メッセージ
     - 一時通知メッセージ（画像添付未対応等）
     - エラー発生メッセージ
   - ドットアニメーションが読み上げられないこと
