# Issue #47 関連: Firefox で `permissions.request` が user input handler エラーになるリグレッション

## 概要

**関連 Issue:** [Firefox: Host permission request fails for OpenAI-compatible Base URLs with a port #47](https://github.com/sh2/extension-summarize-translate-gemini/issues/47)

**関連ファイル（Issue #47 の3原因層）:**

- [`ISSUE-47-HOST-PERMISSION-PORT.md`](ISSUE-47-HOST-PERMISSION-PORT.md) — 権限パターンにポートが含まれる問題
- 本ファイル — `permissions.request` の呼び出しタイミング問題
- [`ISSUE-47-CSP-UPGRADE.md`](ISSUE-47-CSP-UPGRADE.md) — CSP による `http://` → `https://` アップグレード問題

**環境:** Firefox / 拡張機能 v1.8.10 / ローカル OpenAI 互換サーバー（http://）

**現象:** ポートなしの Base URL でも以下のエラーが発生し、保存に失敗する。以前は Firefox で同一設定が保存できていたため、最近の変更によるリグレッション。

```text
Failed to request host permission: Error: permissions.request may only be called from a user input handler
    ensureHostPermission moz-extension://.../utils.js:225
    saveWithHostPermission moz-extension://.../options.js:701
    saveIfInitialized moz-extension://.../options.js:311
    handleSaveClick moz-extension://.../options.js:315
```

*スタックトレースの行番号は修正前の実機ログ。現在コードでは行番号が異なる。*

---

## 原因

[MDN `permissions.request()`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request#user_actions)
では「The extension can only make the request inside the handler for a
[user action](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/User_actions)」
とある。Firefox は `chrome.permissions.request()` がユーザー入力ハンドラの
**同期呼び出しスタック** 上で呼ばれることを厳格に要求する。`await` を挟むと
「ユーザー入力ハンドラ」のコンテキストが切れて例外になる（Chrome は許容）。

### 検証結果（2026-07-22）

`ensureHostPermission()` から `await chrome.permissions.contains()` を除去し、
`chrome.permissions.request()` を直接呼び出す最小変更で Firefox 実機試験を実施した。

**結果: 保存成功。**

→ **`await chrome.permissions.contains()` が user input handler を切断していたことが確認された。**

---

## 履歴調査

| コミット | 内容 | 影響 |
| --- | --- | --- |
| `419d2bd` | 初期実装。`ensureHostPermission` 内で `await chrome.permissions.contains()` の後に `chrome.permissions.request()` を呼ぶ。 | 当時は Firefox で動作していた（報告ベース）。 |
| `f1ee855` | リファクタで `createHostPermissionSaveGuard` / `saveWithHostPermission` / `saveIfInitialized` を導入。 | 呼び出し構造は変わったが、根本原因は `contains()` の `await` であることが検証で判明。 |

### 根本原因（検証済み）

`ensureHostPermission()` 内の `await chrome.permissions.contains()` が、
`chrome.permissions.request()` を呼ぶ前に user input handler のコンテキストを切断していた。

```text
handleSaveClick (click ハンドラ)
  → ... → ensureHostPermission()
    → await chrome.permissions.contains()  ← ここで user input handler 切れ
    → chrome.permissions.request()         ← エラー発生
```

### 修正内容（検証済み・2026-07-22）

`ensureHostPermission()` から `await chrome.permissions.contains()` を除去し、
`chrome.permissions.request()` を同期スタック内で直接呼び出す。既に権限がある場合、
ブラウザ側が静かに許可するためプロンプトは表示されない
（MDN: "Unless the browser can grant all the requested permissions silently,
it prompts the user to grant them."）。

```js
// 修正後（extension/utils.js）
const permissionGranted = await chrome.permissions.request({ origins: [origin] });
```

**Firefox 実機で保存成功を確認済み。**

#### 検討した代替案

| 案 | 内容 | 評価 |
| --- | --- | --- |
| **採用** | `contains()` を除去し `request()` を直接呼ぶ | 最小変更。Firefox 実機で検証済み |
| A | `ensureHostPermission` を click ハンドラ内で直接呼ぶ | `contains()` の `await` が残るため根本解決にならない |
| C | `contains()` の後にラッパー経由で `request()` する | `contains` と `request` の間に `await` が入るため不可 |

---

## 実装計画

### 1. `extension/utils.js` の修正（完了）

`ensureHostPermission()` から `await chrome.permissions.contains()` を除去。
`chrome.permissions.request()` を直接呼び出す。

### 2. テスト更新（完了）

**ファイル:** `test/unit/utils.test.js`

`contains` モックに依存していたテストを `request` モックのみに更新。
全 85 テストがパス。

---

## 検証

- [x] Firefox でポートなしの Base URL を保存できること（2026-07-22 確認済み）
- [x] Firefox でポート付きの Base URL を保存できること（`url.hostname` 修正＋CSP 修正後、2026-07-23 確認済み）
- [x] `npm test` がパスすること（85/85）
- [x] `npm run lint` がパスすること

---

## 参考リンク

- [MDN - permissions.request()](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request)
- [MDN - User actions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/User_actions)
- [Issue #47](https://github.com/sh2/extension-summarize-translate-gemini/issues/47)
