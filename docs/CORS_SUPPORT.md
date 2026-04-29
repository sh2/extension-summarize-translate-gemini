# CORS Support — 動的ホストパーミッション実装計画

## 背景

拡張機能は OpenAI Compatible API（ユーザー設定のカスタム Base URL）に対応している。多くのプロバイダの API サーバーは CORS ヘッダーで `chrome-extension://` を許可しておらず、`fetch()` 呼び出しが失敗する。

Manifest V3 では manifest に `optional_host_permissions` を宣言したうえで、`chrome.permissions.request({ origins: [...] })` によって実行時にホスト権限を要求できる。これにより、最小権限の原則を守りつつ、ユーザーが設定した Base URL へのクロスオリジンリクエストを許可する。

- `host_permissions` を取得すると、拡張機能ページ（`results.html`）と Service Worker の両方からの `fetch()` で CORS チェックがバイパスされる。
- デフォルトの `https://api.openai.com/v1` はサーバー側で拡張機能オリジンを許可しているため、権限要求は不要。

## 意思決定サマリー

| # | 項目 | 決定 |
| --- | ------ | ------ |
| 1 | CORS 失敗の発生箇所 | Service Worker + results ページの両方をカバー |
| 2 | 古いパーミッションの扱い | 放置（削除しない）。新 URL のみ要求 |
| 3 | オリジンパターン | 正規化済み Base URL からオリジンを抽出し `"https://host/*"` 形式で要求 |
| 4 | `http://` の扱い | 許可する（Ollama 等のローカルサーバー対応）。`"http://host/*"` で要求 |
| 5 | デフォルト URL の除外 | 正規化方式。`normalizeBaseUrl()` で canonical URL に揃えてから `EXCLUDED_BASE_URLS` と比較する |
| 6 | UX | `chrome.permissions.request()` は Save ボタンのクリック時にのみ呼ぶ。Import/Restore は必要なら Save を促す |
| 7 | 実装場所 | `extension/utils.js` に `normalizeBaseUrl()`、`needsHostPermissionPrompt()`、`ensureHostPermission()`、`buildOpenAIApiUrl()` を追加し、`extension/options.js` と OpenAI リクエスト処理の両方から共通利用する |
| 8 | 拒否時の挙動 | 設定は保存する。警告なし。CORS エラーでユーザーが気づく |
| 9 | 権限要求のタイミング | `chrome.permissions.request()` は Save ボタンのクリック時のみ。Import/Restore は `chrome.permissions.contains()` ベースの判定のみ |
| 10 | manifest.json | `extension/manifest.json` と `firefox/manifest.json` の両方に `optional_host_permissions` を追加する |
| 11 | ユーザージェスチャー | 権限ダイアログを Save ボタンに限定するため、Import/Restore でのジェスチャー維持は考慮しない |

## 実装手順

### 1. manifest に `optional_host_permissions` を追加

`extension/manifest.json` と `firefox/manifest.json` に、実行時要求の対象となるホストパターンを追加する。

```json
{
  "permissions": [
    "activeTab",
    "contextMenus",
    "scripting",
    "storage"
  ],
  "optional_host_permissions": [
    "https://*/*",
    "http://*/*"
  ]
}
```

- `https://*/*`: 一般的な OpenAI Compatible API サーバー用
- `http://*/*`: Ollama などのローカルサーバー用
- `chrome.permissions.request({ origins })` で要求できるオリジンは、ここで宣言したパターンのサブセットである必要がある

### 2. Base URL 正規化・判定・URL 組み立て helper の作成

`extension/utils.js` に以下の関数を named export として追加する。

```js
// 正規化済み canonical URL で管理する
const EXCLUDED_BASE_URLS = new Set([
  "https://api.openai.com/v1"
]);

export const normalizeBaseUrl = (baseUrl) => {
  const trimmedBaseUrl = baseUrl.trim();
  const url = new URL(trimmedBaseUrl);

  // Base URL 比較では search/hash を使わない
  url.search = "";
  url.hash = "";

  // 末尾スラッシュを除去して canonical 化する
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
};

const tryNormalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) {
    return "";
  }

  try {
    return normalizeBaseUrl(baseUrl);
  } catch {
    return null;
  }
};

const isExcludedBaseUrl = (normalizedBaseUrl) => {
  return EXCLUDED_BASE_URLS.has(normalizedBaseUrl);
};

const getOriginPatternFromNormalizedBaseUrl = (normalizedBaseUrl) => {
  const url = new URL(normalizedBaseUrl);
  return `${url.protocol}//${url.host}/*`;
};

export const buildOpenAIApiUrl = (baseUrl, endpointPath) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedEndpointPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  return `${normalizedBaseUrl}${normalizedEndpointPath}`;
};

/**
 * 指定された baseUrl が新たな host permission prompt を必要とするか判定する。
 * @param {string} baseUrl - API ベースURL (例: "https://api.example.com/v1")
 * @returns {Promise<boolean>} prompt が必要な場合 true
 */
export const needsHostPermissionPrompt = async (baseUrl) => {
  const normalizedBaseUrl = tryNormalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl || isExcludedBaseUrl(normalizedBaseUrl)) {
    return false;
  }

  try {
    const origin = getOriginPatternFromNormalizedBaseUrl(normalizedBaseUrl);
    return !(await chrome.permissions.contains({ origins: [origin] }));
  } catch {
    return false;
  }
};

/**
 * 指定された baseUrl のオリジンに対するホストパーミッションが
 * 存在するか確認し、なければ chrome.permissions.request() で要求する。
 * ユーザーが拒否した場合でもエラーは投げず、後続処理は継続する。
 * @param {string} baseUrl - API ベースURL (例: "https://api.example.com/v1")
 * @returns {Promise<boolean>} パーミッションが許可された場合 true
 */
export const ensureHostPermission = async (baseUrl) => {
  const normalizedBaseUrl = tryNormalizeBaseUrl(baseUrl);

  if (!normalizedBaseUrl || isExcludedBaseUrl(normalizedBaseUrl)) {
    return true;
  }

  try {
    const origin = getOriginPatternFromNormalizedBaseUrl(normalizedBaseUrl);

    // 既に権限があるか確認
    const hasPermission = await chrome.permissions.contains({ origins: [origin] });
    if (hasPermission) {
      return true;
    }

    // 権限を要求
    const granted = await chrome.permissions.request({ origins: [origin] });
    return granted;
  } catch {
    // URL パース失敗時や permissions API 未対応環境では何もしない
    return false;
  }
};
```

### 3. `options.js` の import 更新

`extension/options.js` の import 文に `normalizeBaseUrl`、`ensureHostPermission`、`needsHostPermissionPrompt` を追加する。

```js
import {
  DEFAULT_LANGUAGE_MODEL,
  applyTheme,
  applyFontSize,
  loadTemplate,
  createContextMenus,
  normalizeBaseUrl,
  ensureHostPermission,
  needsHostPermissionPrompt
} from "./utils.js";
```

### 4. Save 保留メッセージを追加

Import/Restore で新たな host permission が必要だった場合に、即保存せず Save を促すメッセージが必要になる。`extension/_locales/*/messages.json` に以下のキーを追加する。

```json
{
  "options_save_required_for_host_permission": {
    "message": "Settings loaded. Click Save to apply and grant access to the configured host."
  }
}
```

### 5. `saveOptions()` は保存専用ヘルパーのまま維持

`extension/options.js` の `saveOptions()` には権限チェックを入れず、ストレージ保存と UI 更新だけを担当させる。ただし有効な OpenAI Base URL は保存前に canonical 化する。

```js
const saveOptions = async () => {
  const options = getOptionsFromForm(true);

  if (options.apiProvider === "openai" && options.openaiBaseUrl) {
    try {
      options.openaiBaseUrl = normalizeBaseUrl(options.openaiBaseUrl);
      document.getElementById("openaiBaseUrl").value = options.openaiBaseUrl;
    } catch {
      // 無効な URL は生の値をそのまま保存する
    }
  }

  await chrome.storage.local.set(options);
  await chrome.storage.session.set({ responseCacheQueue: [] });

  await createContextMenus(
    options.contextMenus,
    // ... (既存コードそのまま)
  );

  applyTheme((await chrome.storage.local.get({ theme: "system" })).theme);
  applyFontSize((await chrome.storage.local.get({ fontSize: "medium" })).fontSize);
};
```

これにより、`https://api.openai.com/v1/` や前後空白付きの入力も `https://api.openai.com/v1` に揃えて保存できる。

### 6. OpenAI API URL 組み立ての修正

`extension/utils.js` の OpenAI リクエスト処理では、`"${baseUrl}/chat/completions"` の単純連結をやめて `buildOpenAIApiUrl()` を使う。

```js
const response = await fetch(buildOpenAIApiUrl(baseUrl, "/chat/completions"), {
  method: "POST",
  // ...
});
```

対象箇所は少なくとも以下の 2 つ。

1. `generateContentOpenAI()`
2. `streamGenerateContentOpenAI()`

これにより、末尾スラッシュ付きの Base URL でも `//chat/completions` のような不正な URL 組み立てを避けられる。

### 7. Save ボタンクリックハンドラの修正

`extension/options.js` の Save ボタンのクリックハンドラで、`saveOptions()` の前に権限要求を行う。

```js
document.getElementById("save").addEventListener("click", async () => {
  const options = getOptionsFromForm(true);

  if (options.apiProvider === "openai" && options.openaiBaseUrl) {
    await ensureHostPermission(options.openaiBaseUrl);
  }

  await saveOptions();
  showStatusMessage(chrome.i18n.getMessage("options_saved"), 1000);
});
```

これにより、権限ダイアログは実際に API 設定を保存しようとした明示的なユーザー操作にだけ紐づく。`exportOptionsToFile()` や `syncOptionsToCloud()` が内部で `saveOptions()` を呼んでも、不要な権限要求は発生しない。

### 8. ファイルインポートハンドラの修正

`extension/options.js` の `importOptionsFromFile()` 内の `change` イベントハンドラでは、設定をフォームに反映したあと、追加の host permission prompt が必要かだけを判定する。新規権限が不要ならそのまま保存し、必要なら保存を保留して Save を促す。

```js
const importOptionsFromFile = async () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.addEventListener("change", async () => {
    const file = input.files[0];
    const text = await file.text();
    let options = {};

    try {
      options = JSON.parse(text);

      applyOptionsToForm(options);

      const currentOptions = getOptionsFromForm(true);
      const needsPrompt = currentOptions.apiProvider === "openai"
        && await needsHostPermissionPrompt(currentOptions.openaiBaseUrl);

      if (needsPrompt) {
        showStatusMessage(chrome.i18n.getMessage("options_save_required_for_host_permission"), 3000);
        return;
      }

      await saveOptions();
      showStatusMessage(chrome.i18n.getMessage("options_import_succeeded"), 1000);
    } catch (error) {
      showStatusMessage(chrome.i18n.getMessage("options_import_failed"), 3000);
      console.log(error);
    }
  });

  input.click();
};
```

### 9. クラウド復元ハンドラの修正

`extension/options.js` の `restoreOptionsFromCloud()` でも同じロジックを使う。設定をフォームに反映したあと、追加の host permission prompt が不要なら保存し、必要なら Save を促して終了する。

```js
const restoreOptionsFromCloud = async () => {
  const options = await chrome.storage.sync.get();

  applyOptionsToForm(options);

  const currentOptions = getOptionsFromForm(true);
  const needsPrompt = currentOptions.apiProvider === "openai"
    && await needsHostPermissionPrompt(currentOptions.openaiBaseUrl);

  if (needsPrompt) {
    showStatusMessage(chrome.i18n.getMessage("options_save_required_for_host_permission"), 3000);
    return;
  }

  await saveOptions();
  showStatusMessage(chrome.i18n.getMessage("options_restore_cloud_succeeded"), 1000);
};
```

### 10. 権限要求を Save に集約する理由

`saveOptions()` は Save 以外にも Export と Cloud Sync から呼ばれている。ここに `ensureHostPermission()` を入れると、API 通信を伴わない操作でも権限ダイアログが出る可能性がある。

そのため、`chrome.permissions.request()` は Save ボタンに集約する。

Import/Restore は以下の 2 段階に分ける。

1. 設定をフォームに反映する
2. 新規権限が不要なら保存し、必要なら Save を促す

結果として、権限ダイアログが出る導線は以下の 1 つだけになる。

1. Save ボタンのクリック

一方で、以下の操作では権限要求を行わない。

1. ファイルエクスポート
2. クラウド同期
3. ファイルインポート
4. クラウド復元

## 影響範囲

| ファイル | 変更内容 |
| ---------- | ---------- |
| `extension/utils.js` | `EXCLUDED_BASE_URLS` を canonical URL の Set として定義し、`normalizeBaseUrl()`、`buildOpenAIApiUrl()`、`needsHostPermissionPrompt()`、`ensureHostPermission()` を追加 |
| `extension/options.js` | `normalizeBaseUrl`、`ensureHostPermission`、`needsHostPermissionPrompt` の import を追加。Save ボタンのクリックハンドラで `ensureHostPermission()` を呼ぶ。`saveOptions()` は有効な Base URL を canonical 化して保存する。`importOptionsFromFile()` と `restoreOptionsFromCloud()` は事前判定のみ行い、必要なら Save を促す |
| `extension/_locales/*/messages.json` | `options_save_required_for_host_permission` メッセージを追加 |
| `extension/manifest.json` | `optional_host_permissions` に `https://*/*` と `http://*/*` を追加 |
| `firefox/manifest.json` | `optional_host_permissions` に `https://*/*` と `http://*/*` を追加 |

## エッジケース

1. **無効なURL**：`normalizeBaseUrl()` が失敗した場合、権限判定では `false` を返す。`saveOptions()` では raw 値をそのまま保存し、設定保存は続行される。
2. **`permissions` API 非対応環境**：`catch` ブロックで `false` を返す。設定保存は続行される。
3. **権限拒否**：`request()` が `false` を返した場合、そのまま後続処理に進む（設定は保存される）。初回 API 呼び出し時に CORS エラーが発生し、ユーザーがオプションに戻って再保存することで再要求される。
4. **`http` スキーム**：`normalizeBaseUrl("http://localhost:11434/v1/")` → `"http://localhost:11434/v1"` に canonical 化され、オリジン `"http://localhost:11434/*"` で問題なく要求可能。
5. **デフォルト URL (`https://api.openai.com/v1`)**：`https://api.openai.com/v1/` や前後空白付き入力も canonical 化後に `EXCLUDED_BASE_URLS` と一致し、権限要求なし。
6. **末尾スラッシュ付き Base URL**：`buildOpenAIApiUrl()` により `//chat/completions` は生成されない。
7. **Base URL 未設定**：`ensureHostPermission()` は早期リターン。
8. **`apiProvider` が `"gemini"`**：Gemini は Google 固定 URL で CORS が許可されているため、権限要求しない。
9. **ファイルインポート/クラウド復元 + 新規権限が必要な URL**：フォームには反映するが自動保存しない。Save ボタンでの明示的な権限許可に委譲する。
10. **ファイルエクスポート**：`exportOptionsToFile()` は設定保存のために `saveOptions()` を呼ぶが、権限要求は Save に集約するため、エクスポート操作ではダイアログを出さない。
11. **クラウド同期（`syncOptionsToCloud`）**：`chrome.storage.sync` への保存のみで、実際の API 呼び出しは発生しない。`saveOptions()` を使っても権限要求は発生しない構成にする。
12. **Firefox 互換性**：Firefox でも `optional_host_permissions` を manifest に宣言してから `permissions.request()` を使う必要がある。`chrome.permissions` がそのまま使える前提で進めるなら manifest 側の宣言も Chrome と揃えて追加する。

## テスト項目

1. 保存ボタンクリック → 初回カスタム Base URL 設定 → `chrome.permissions.request()` ダイアログ表示 → 許可 → 設定保存成功
2. 保存ボタンクリック → 初回カスタム Base URL 設定 → ダイアログ拒否 → 設定保存成功（CORS エラーは後続のAPI呼び出しで発生）
3. 既に許可済みの URL で再保存 → ダイアログ表示なし → 設定保存成功
4. `https://api.openai.com/v1` 使用時 → ダイアログ表示なし
5. ファイルインポート → カスタム Base URL 含む JSON かつ新規権限が必要 → ダイアログ表示なし → フォーム反映のみ → Save を促すメッセージ表示
6. クラウド復元 → カスタム Base URL 含む設定 かつ新規権限が必要 → ダイアログ表示なし → フォーム反映のみ → Save を促すメッセージ表示
7. インポート後に Save ボタンをクリック → `chrome.permissions.request()` ダイアログ表示 → 許可 → 設定保存成功
8. 復元後に Save ボタンをクリック → `chrome.permissions.request()` ダイアログ表示 → 許可 → 設定保存成功
9. ファイルインポート → デフォルト URL または許可済み URL → ダイアログ表示なし → 設定保存成功
10. クラウド復元 → デフォルト URL または許可済み URL → ダイアログ表示なし → 設定保存成功
11. ファイルエクスポート → ダイアログ表示なし
12. クラウド同期 → ダイアログ表示なし
13. `https://api.openai.com/v1/` を入力して Save → ダイアログ表示なし → `https://api.openai.com/v1` として保存
14. ` https://api.openai.com/v1 ` を入力して Save → ダイアログ表示なし → `https://api.openai.com/v1` として保存
15. `https://api.example.com/v1/` を入力して Save → 権限判定は `https://api.example.com/v1` ベースで行われ、保存値も末尾スラッシュなしになる
16. OpenAI リクエスト送信時 → `https://api.example.com/v1/` 由来の入力でも `//chat/completions` が生成されない
17. `http://localhost:11434/v1` など非 HTTPS URL → Save ボタンクリック時に正常に権限要求
18. 無効な URL 文字列 → 設定保存成功（エラーなし）
19. `apiProvider` が `"gemini"` の場合 → 権限要求スキップ
20. `openaiBaseUrl` が空文字 → 権限要求スキップ（早期リターン）
