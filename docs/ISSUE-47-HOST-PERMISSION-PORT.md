# Issue #47: Firefox でポート付き Base URL のホスト権限リクエストが失敗する

## 概要

**Issue:** [Firefox: Host permission request fails for OpenAI-compatible Base URLs with a port #47](https://github.com/sh2/extension-summarize-translate-gemini/issues/47)

**報告者:** HarakaraSite

**環境:** Firefox / 拡張機能 v1.8.10 / ローカル OpenAI 互換サーバー（http://）

**現象:** ポート付きの OpenAI 互換 Base URL（例: `http://127.0.0.1:8081/v1`）をオプションページで保存しようとすると、「Unable to request host access. Please try again.」と表示され保存に失敗する。

> **関連ファイル（Issue #47 の3原因層）:**
>
> - 本ファイル — 権限パターンにポートが含まれる問題
> - [`ISSUE-47-USER-INPUT-HANDLER.md`](ISSUE-47-USER-INPUT-HANDLER.md) — `permissions.request` の呼び出しタイミング問題
> - [`ISSUE-47-CSP-UPGRADE.md`](ISSUE-47-CSP-UPGRADE.md) — CSP による `http://` → `https://` アップグレード問題

---

## 根本原因

`extension/utils.js` の `getOriginPatternFromNormalizedBaseUrl()` が `url.host`（ポートを含む）を使って権限パターンを生成している。

```js
const getOriginPatternFromNormalizedBaseUrl = (normalizedBaseUrl) => {
  const url = new URL(normalizedBaseUrl);
  return `${url.protocol}//${url.host}/*`;
};
```

`http://127.0.0.1:8081/v1` に対して生成されるパターン:

```text
http://127.0.0.1:8081/*
```

**Firefox の WebExtension Match patterns はホスト部のポート番号をサポートしていない**（Chrome はサポート）。

参考: [MDN - Match patterns#host](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns#host)

> Note: Firefox doesn't support the inclusion of a port number due to ([Firefox bug 1362809](https://bugzil.la/1362809)) and ([Firefox bug 1468162](https://bugzil.la/1468162)).

MDN の例にも明記:

> `https://mozilla.org:8080/` — Match all HTTPS URLs that are hosted on "mozilla.org" on port 8080. Note: Ports are supported in Chrome, not in Firefox.

そのため Firefox で `chrome.permissions.request({ origins: ["http://127.0.0.1:8081/*"] })` が失敗し、`ensureHostPermission()` が `{ status: "error" }` を返す。`options.js` の `createHostPermissionSaveGuard` が保存をブロックする。

---

## 影響範囲

`getOriginPatternFromNormalizedBaseUrl` の呼び出し箇所（`extension/utils.js`）:

| 関数 | 行 | 用途 |
| --- | --- | --- |
| `needsHostPermissionPrompt()` | 203 | 保存前に権限プロンプトが必要か判定 |
| `ensureHostPermission()` | 218 | 保存時に権限をリクエスト |

これらは `extension/options.js` の保存フロー（`createHostPermissionSaveGuard`）から呼ばれる。

---

## 修正方針

`url.host` → `url.hostname` に変更し、ポートを含まないパターンを生成する。

```diff
 const getOriginPatternFromNormalizedBaseUrl = (normalizedBaseUrl) => {
   const url = new URL(normalizedBaseUrl);
-  return `${url.protocol}//${url.host}/*`;
+  return `${url.protocol}//${url.hostname}/*`;
 };
```

生成されるパターン: `http://127.0.0.1/*`（Firefox/Chrome 両方で有効）

**実際の API リクエスト URL は影響を受けない。** `buildOpenAIApiUrl()`（`extension/utils.js:358`）は `normalizeBaseUrl()` を使用しており、ポートを保持したまま `http://127.0.0.1:8081/v1/chat/completions` を生成する。

### 代替案の検討

| 案 | 内容 | 評価 |
| --- | --- | --- |
| A（採用） | `url.hostname` を使用 | シンプル。Firefox/Chrome 両方で一貫動作 |
| B | Firefox のみ `url.hostname`、Chrome は `url.host` | ブラウザ分岐が必要で複雑化。保守コストが高い |
| C | ポート付きパターンを試し、失敗したらフォールバック | `permissions.request` の失敗理由が不透明で実装が困難 |

---

## セキュリティ影響

### 権限スコープの変更

| ブラウザ | 修正前 | 修正後 |
| --- | --- | --- |
| Firefox | ❌ 権限リクエスト失敗（無効なパターン） | ✅ 権限付与（全ポート） |
| Chrome | ✅ 権限付与（ポート限定） | ✅ 権限付与（全ポート） |

Chrome では権限スコープが「ポート限定」→「全ポート」に**緩和**される。

### リスク評価

- ローカルホスト・プライベート IP では別サービスが動作している可能性がある
- ただし、OpenAI 互換 API の Base URL はユーザー自身が明示的に設定するものであり、悪意のある URL を設定する動機は通常ない
- Firefox でポート付きパターンが無効である以上、代替案は限られる
- `optional_host_permissions` にはすでに `https://*/*` と `http://*/*` が含まれており、全ポート許可は既存の権限モデルの範囲内

**結論:** 実用上のリスクは低い。案 A を採用する。

---

## 実装計画

### 1. コード修正（完了）

**ファイル:** `extension/utils.js`

`getOriginPatternFromNormalizedBaseUrl()` の `url.host` を `url.hostname` に変更。

```js
// 修正後
const getOriginPatternFromNormalizedBaseUrl = (normalizedBaseUrl) => {
  const url = new URL(normalizedBaseUrl);

  // Use hostname (without port) because Firefox does not support port numbers
  // in WebExtension match patterns. The actual API request URL retains the port.
  return `${url.protocol}//${url.hostname}/*`;
};
```

### 2. ユニットテスト追加（完了）

**ファイル:** `test/unit/utils.test.js`

ポート付き Base URL に対する権限パターン生成を検証するテストを追加。

```js
it("generates a port-free origin pattern for Firefox compatibility", async () => {
  let requestedPattern;

  chrome.permissions.request = async ({ origins }) => {
    requestedPattern = origins[0];
    return true;
  };

  await ensureHostPermission("http://127.0.0.1:8081/v1");

  expect(requestedPattern).toBe("http://127.0.0.1/*");
});
```

### 4. リリースノート

Chrome でホスト権限のスコープがポート限定から全ポートに変更される旨を記載する。

---

## 検証

- [x] `npm run lint` — Lint エラーなし
- [x] `npm test` — 全 86 テストがパス
- [x] Firefox でポート付き Base URL（例: `http://127.0.0.1:8081/v1`）の保存が成功すること（2026-07-23 確認済み）
- [x] Firefox でポート付き Base URL への API リクエストが成功すること（CSP 修正後、2026-07-23 確認済み）
- [x] 実際の API リクエスト URL がポートを保持していること（`http://127.0.0.1:8081/v1/chat/completions`）

---

## 参考リンク

- [MDN - Match patterns#host](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns#host)
- [Firefox bug 1362809](https://bugzil.la/1362809)
- [Firefox bug 1468162](https://bugzil.la/1468162)
- [Issue #47](https://github.com/sh2/extension-summarize-translate-gemini/issues/47)
