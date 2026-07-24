# options ステータスメッセージの ARIA 属性・表示制御の統一

## 背景

options ページの save-bar には `#status`（一時フィードバック）と `#persistentStatus`（永続警告）の2つのステータス要素がある。調査の結果、以下の問題が判明した。

1. **レイアウト問題**: `#status` は `textContent = ""` で消去されるが、`hidden` にならないため、空のまま `flex: 1 1 16rem` のスロットを占有し続ける。`#persistentStatus` が表示されると、Save ボタンとの間に不要な隙間が生じる。
2. **ARIA 属性の不統一**: `#status` は `aria-live="polite"` のみ、`#persistentStatus` は `role="status"` を使用。同じ種類のステータスメッセージなのに異なる ARIA パターンが混在している。

## 変更方針

- **`role="status"` で統一**: `#status` に `role="status"` を付与し、`aria-live="polite"` を削除する。`role="status"` が暗黙に `aria-live="polite"` + `aria-atomic="true"` を含むため。
- **`hidden` 属性で表示制御**: `#status` を `hidden` 属性で制御し、`#persistentStatus` と一貫させる。CSS の `:empty` 等の間接的な方法には頼らない。
- **次フレーム遅延で読み上げを確実にする**: `hidden` を外すことと `textContent` 代入を同一タスクで行うと、スクリーンリーダーが変化を検知できない環境がある。`createPersistentStatusUpdater` と同じ「unhide → 空にする → 次フレームで文言代入」の手順を踏む。

## 対象ファイル

- `extension/options.html`
- `extension/options.js`
- `test/helpers/options-dom.js`
- `test/dom/options-transient-status.test.js`（新規）
- `test/static/options-structure.test.js`

## 変更内容

### 1. HTML 変更（`extension/options.html`）

```html
<!-- 変更前 -->
<span id="status" class="save-status" aria-live="polite"></span>

<!-- 変更後 -->
<span id="status" class="save-status" role="status" hidden></span>
```

- `aria-live="polite"` を削除し、`role="status"` に置換する。
- 初期状態を `hidden` にする（`#persistentStatus` と同じ）。

### 2. JS 変更（`extension/options.js`）

`showStatusMessage()` を `createTransientStatusUpdater()` factory に置き換える。`createPersistentStatusUpdater()` と同じパターン（引数注入型 factory、次フレーム遅延、予約キャンセル）を使用する。

```javascript
// 変更前
const showStatusMessage = (statusElement, message, duration) => {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;

  setTimeout(() => {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, duration);
};

// 変更後
export const createTransientStatusUpdater = (statusElement, requestFrame, cancelFrame) => {
  let pendingFrameId = null;
  let timeoutId = null;

  const cancelPending = () => {
    if (pendingFrameId !== null) {
      cancelFrame(pendingFrameId);
      pendingFrameId = null;
    }

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return {
    showStatus(message, duration) {
      cancelPending();
      statusElement.hidden = false;
      statusElement.textContent = "";

      pendingFrameId = requestFrame(() => {
        pendingFrameId = null;
        statusElement.textContent = message;

        timeoutId = setTimeout(() => {
          timeoutId = null;

          if (statusElement.textContent === message) {
            statusElement.textContent = "";
            statusElement.hidden = true;
          }
        }, duration);
      });
    }
  };
};
```

#### 配線変更（`handleDomContentLoaded` 内）

```javascript
// 変更前
showStatus: (message, duration) => {
  showStatusMessage(statusElement, message, duration);
},

// 変更後
const { showStatus } = createTransientStatusUpdater(statusElement, requestFrame, cancelFrame);
// ...
showStatus,
```

`requestFrame` / `cancelFrame` は `createPersistentStatusUpdater` と同じものを再利用する。

### 3. テスト DOM 変更（`test/helpers/options-dom.js`）

`#status` 要素をテスト DOM に追加し、`getStatusElement()` アクセサを追加する。

```html
<!-- 追加 -->
<span id="status" role="status" hidden></span>
```

### 4. 新規テスト（`test/dom/options-transient-status.test.js`）

`createTransientStatusUpdater()` を直接テストする。`test/dom/options-persistent-status.test.js` と同じパターンで、手動 `requestFrame` / `cancelFrame` と fake timer を使用する。

テストケース:

- **表示**: unhide → 空 → 次フレームで文言設定
- **タイマー経過後の自動消去**: 文言クリア + `hidden = true`
- **連打**: 2回目の `showStatus()` が1回目のフレーム予約とタイマーをキャンセルする
- **タイマーガード**: 文言が置き換わった場合、古いタイマーは消去しない

### 5. 構造テスト変更（`test/static/options-structure.test.js`）

`#status` と `#persistentStatus` の ARIA 属性を検証する。

- `#status` が `role="status"` と `hidden` を持つこと
- `#persistentStatus` が `role="status"` と `hidden` を持つこと
- `#status` に `aria-live` 属性がないこと

## 設計判断

### 次フレーム遅延を採用する理由

`createPersistentStatusUpdater` が「unhide → 空にする → 次フレームで文言代入」の手順を踏むのは、ライブリージョンの読み上げを確実にするためである。`hidden` を外すことと `textContent` 代入を同一タスクで行うと、支援技術が「表示された時点で既に中身がある＝変化していない」と解釈し、読み上げをスキップする環境がある。

`#status` の一時フィードバック（"Saved." 等）は読み逃しても致命的ではないが、`hidden` 制御を導入する以上、同じパターンで確実に読み上げられるべきである。

### factory パターンを採用する理由

- `createPersistentStatusUpdater` と同じ引数注入型 factory にすることで、テスト可能性と一貫性を保つ。
- 連打時のフレーム予約・タイマーのキャンセルを内部状態として管理できる。
- `showStatusMessage` のままでは、次フレーム遅延に必要な `requestFrame` / `cancelFrame` の注入と、キャンセル状態の管理が困難。

### CSS 変更なし

`hidden` 属性は UA スタイルシートで `display: none` が既定のため、`.save-status` の `flex: 1 1 16rem` は `hidden` 時に無効化される。追加の CSS は不要。

### 連打時の挙動

Save を1秒以内に2回押すと、2回目の `showStatus()` が1回目のフレーム予約とタイマーをキャンセルし、2回目のメッセージだけが表示・消去される。現行コードの `textContent === message` ガードと同等の保護を、より確実なキャンセル機構で実現する。

## 期待されるレイアウト変化

| 状態 | 変更前 | 変更後 |
| --- | --- | --- |
| 初期表示（両方空） | 空の status が不可視のまま幅だけ占有 | status がレイアウトから消える |
| "Saved." 表示中 | ボタンの隣に表示 | 変わりなし |
| 1秒後に消去 | 空になっても幅だけ残り続ける（隙間の原因） | レイアウトから消えて隙間がなくなる |
| persistentStatus のみ表示 | `[Save] ── 空の占有 ── [文言]` | `[Save] [文言]` |
| 両方同時表示（稀） | 残り幅を 1:1 で分け合う | 変わりなし（空でないので通常ルール） |

## 対象外（別計画）

以下は本計画の対象外とし、別途計画する。

- **popup / results の ARIA 属性追加**: popup と results のステータス要素（計4箇所）には ARIA 属性がない。ただし、ローディング中のドットアニメーション（500ms 更新）やモデルバージョン表示が同じ要素に含まれるため、一律の `role="status"` 付与は読み上げ過剰のリスクがある。要素ごとに用途を分析し、視覚的なアニメーションと意味のある状態変化を分離する設計が必要。
- **popup / results のインラインスタイル移行**: `style="color: gray;"` を CSS クラス + テーマ変数へ移行する。視覚的なリグレッションテスト（目視確認）が必要なため、ARIA 属性の統一とは独立したタスクとする。

## 検証手順

1. `npm run lint` — ESLint エラーがないこと
2. `npm test` — 全テストが通過すること（新規テスト含む）
3. 手動確認:
   - options ページで Save を押し、"Saved." が1秒表示されて消えること
   - 消去後に persistentStatus の文言が Save ボタンの直後に表示されること（隙間がないこと）
   - OpenAI provider + 有効な Base URL で host permission を拒否し、persistentStatus が表示されること
   - その後 Save を成功させ、persistentStatus が消え "Saved." が表示されること
   - スクリーンリーダー（またはブラウザのアクセシビリティツール）で "Saved." が通知されること
