# Issue #47 関連: Firefox の CSP が `http://` を `https://` にアップグレードする

## 概要

**関連 Issue:** [Firefox: Host permission request fails for OpenAI-compatible Base URLs with a port #47](https://github.com/sh2/extension-summarize-translate-gemini/issues/47)

**関連ファイル（Issue #47 の3原因層）:**

- [`ISSUE-47-HOST-PERMISSION-PORT.md`](ISSUE-47-HOST-PERMISSION-PORT.md) — 権限パターンにポートが含まれる問題
- [`ISSUE-47-USER-INPUT-HANDLER.md`](ISSUE-47-USER-INPUT-HANDLER.md) — `permissions.request` の呼び出しタイミング問題
- 本ファイル — CSP による `http://` → `https://` アップグレード問題

**環境:** Firefox / 拡張機能 v1.8.10 / ローカル OpenAI 互換サーバー（`http://`）

**現象:** 権限問題・呼び出しタイミング問題を修正した後でも、`http://` の Base URL への API リクエストが CORS エラー（ステータスコード `(null)`）で失敗する。エラーメッセージでは `http://` で指定した URL が `https://` に化けて報告される。

---

## 現象の切り分け

`fetch()` 直前にデバッグログを仕込み、実際に渡される URL を確認した（調査用の一時コードで既に削除済み）。

```
[Issue47][stream] baseUrl= http://vermeer:11434/v1  requestUrl= http://vermeer:11434/v1/chat/completions  protocol= http:  host= vermeer:11434
```

**拡張機能のコードは正しく `http://` のまま `fetch()` に渡していた**（`protocol= http:`）。

しかしその直後に Firefox が CSP によってアップグレードしていた:

```
⚠ Content-Security-Policy: 安全でない要求 'http://vermeer:11434/v1/chat/completions' をアップグレードして 'https://' を使用します
```

→ 拡張機能のコードではなく、**CSP の `upgrade-insecure-requests` ディレクティブ**がプロトコルを書き換えていた。

---

## 原因

Firefox の Manifest V3 拡張機能にはデフォルトの CSP が適用され、そこに `upgrade-insecure-requests` が含まれる。このディレクティブは、拡張機能コンテキスト（extension pages / background）から発信される `http://` のリクエストを `https://` に自動アップグレードする。

- ローカル / セルフホストの OpenAI 互換サーバーは `https://` を提供しない（または自己署名証明書）ため、アップグレード後の接続が失敗する。
- 失敗は CORS エラー（ステータスコード `(null)`）として報告される。
- **Chrome の MV3 デフォルト CSP には `upgrade-insecure-requests` が含まれない**ため、Chrome ではこの問題は発生しない。

> 補足: これは `about:config` の HTTPS-First Mode (`dom.security.https_first`) とは**別のメカニズム**。HTTPS-First を無効化しても本現象は解消しなかった。

---

## 修正方針

Firefox 用マニフェスト（`firefox/manifest.json`）の**み**に明示的な CSP を設定し、`upgrade-insecure-requests` を含めないようにする。Chrome 用マニフェスト（`extension/manifest.json`）は変更しない。

理由:

- Chrome のデフォルト MV3 CSP には `upgrade-insecure-requests` が含まれないため、Chrome 側ではそもそも本問題は発生せず、明示設定は不要。
- 本問題は Firefox 固有であり、AGENTS.md の「Firefox 固有の変更は `firefox/` に留める」方針に合致する。
- Chrome 用マニフェストに無関係な CSP を加えると、Chrome Web Store 審査で「なぜ CSP を触ったのか」という不要な確認を招き得る。

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

### デフォルトとの差分（Firefox）

| ディレクティブ | Firefox MV3 デフォルト | 今回の設定 | 差分 |
|---|---|---|---|
| `script-src` | `'self'` | `'self'` | なし |
| `object-src` | `'self'` | `'self'` | なし |
| `upgrade-insecure-requests` | 付与される | **含めない** | ここだけ意図的に除外 |

ベースの CSP はデフォルトと**同一**で、外したのは `http://` を `https://` に書き換えていた `upgrade-insecure-requests` のみ。`unsafe-eval` / `unsafe-inline` / リモートスクリプト許可といった**緩和は一切行っていない**。

### 適用範囲

`extension_pages` の CSP は、Firefox では background コンテキスト（`service-worker.js` / background scripts）にも効く。`fetch()` のアップグレードが止まったのはこのためで意図通り。

---

## ストア審査への影響

**悪影響の可能性は低い。** 理由は「CSP を緩和していない」ため。

- **Mozilla Add-ons (AMO)** が問題視するのは CSP を**緩める**変更（`unsafe-eval`、`unsafe-inline`、外部スクリプト許可など）。今回の変更はこれに該当しない。MV3 の `script-src` 制約（`'self'` / `'none'` / `'wasm-unsafe-eval'` のみ）も満たす。
- **Chrome Web Store** は本修正の対象外。Chrome 用マニフェストは変更しておらず、Chrome のデフォルト MV3 CSP には元々 `upgrade-insecure-requests` が含まれないため、CSP に関する審査上の懸念は生じない。

### 唯一の理論上の懸念

`upgrade-insecure-requests` を意図的に外すことは、厳密には「Mixed Content 保護を一段弱める」と解釈され得る。手動レビューで「なぜ外したのか」を問われる可能性はゼロではない。ただし:

- 対象は拡張機能コンテキストからの `fetch()` であり、一般ウェブページの Mixed Content 保護とは別レイヤー。
- セルフホスト / ローカルの OpenAI 互換 API（`http://`）をサポートするという**正当な理由**がある。

### 審査備考の文言例

心配を完全に潰すなら、審査提出時に備考欄へ一言添えると安全:

> Self-hosted / local OpenAI-compatible endpoints over `http://` をサポートするため、デフォルト CSP から `upgrade-insecure-requests` のみを除外しています。`script-src` / `object-src` はデフォルトと同一で、緩和は行っていません。

---

## 実装計画

### 1. マニフェスト修正（完了）

**ファイル:** `firefox/manifest.json` のみ

`optional_host_permissions` の直後に `content_security_policy` を追加。Chrome 用 `extension/manifest.json` は変更しない（デフォルトで問題がなく、Firefox 固有の修正のため）。

---

## 検証

- [x] Firefox で `http://` のポート付き Base URL への API リクエストが成功すること（2026-07-23 確認済み）
- [x] CSP アップグレード警告が出なくなること
- [x] Chrome 用マニフェストは変更していないため挙動変化なし（CSP 変更の影響を受けない）
- [x] `npm run lint` / `npm test` がパスすること

---

## 参考リンク

- [MDN - content_security_policy](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_security_policy)
- [MDN - Content Security Policy (拡張機能)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy)
- [Issue #47](https://github.com/sh2/extension-summarize-translate-gemini/issues/47)
