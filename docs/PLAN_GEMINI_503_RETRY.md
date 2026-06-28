# Gemini API 503 エラー時の自動リトライ実装計画 (Issue #45)

## 背景・目的

Issue #45 の追加コメントで「常に新しいタブで結果を開く際、結果ページに再実行ボタンがない」ことが指摘された。しかしユーザーの真の不満は再実行ボタンの不在ではなく、**Gemini API が頻繁に 503 エラー（`This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.`）を返すこと**にある。

503 は一時的な需要スパイクが原因であり、数秒の待機で成功する可能性が高い。そのため、ユーザーに手動再実行を強いるのではなく、**生成層で自動リトライにより吸収する**方針とする。

本計画では `extension/utils.js` のフォールバック層に 503 リトライを追加し、リトライ状況をポップアップ／結果ページへ控えめにリアルタイム通知する仕組みを実装する。

## 設計決定の要約

| # | 項目 | 決定内容 |
| --- | --- | --- |
| 1 | リトライ実装層 | `generateContentWithFallback()` / `streamGenerateContentWithFallback()` 内。既存の 429 フォールバックと同じ層で拡張する |
| 2 | 対象ステータス | 503 のみ（最小案）。500/502/504/529 には拡張しない |
| 3 | 単独モデル時の挙動 | 503 で同一モデルを 2 回再試行（初回 + 2 回 = 最大 3 リクエスト）。待機は指数バックオフ `1s, 2s`。再試行上限に達したら `break` し、最終失敗としてエラーを返す |
| 4 | 複数モデル時の挙動 | 503 でも 429 でも**即次モデルへ移る**。モデルごとの 503 リトライは行わない。前のモデルには戻らない |
| 5 | ストリーミング早期チェック | `streamGenerateContentGemini()` で `fetch` 直後・`getReader()` 前に `response.ok` を判定し、503 ならリトライ対象として早期リターンする。これを必須化する |
| 6 | 通知経路 | `chrome.storage.session` の `retryStatus_${resultIndex}` キーに構造化データを保存。`sendMessage` ベースは使わない（popup 閉鎖後の受け手不在に弱いため） |
| 7 | 通知受信 | `popup.js` / `results.js` で `chrome.storage.onChanged` を監視。結果到達後に `removeListener` する |
| 8 | ローディング表示との競合解決 | 既存の `displayLoadingMessage()` のコアロジックを活かす。`#status` / `#send-status` への書き込み役は 1 つに統一し、500ms interval が「現在の状態（通常 loading or retry）を見て表示文言を決める」構造にする |
| 9 | 通知内容 | 構造化データのみ保存し、文言は UI 側で組み立てる。成功後の通知は行わない。最終失敗時も生 503 エラー文言のまま（再試行済み注記は見送り） |
| 10 | stale クリア | `popup.js` の生成開始時削除リストに `retryStatus_${resultIndex}` を追加 |
| 11 | OpenAI パス | `generateContent` / `streamGenerateContent` は `retryStatusKey` 引数を受け取るが、OpenAI 分岐では無視する |
| 12 | i18n キー | `status_retrying`（単独モデル用）と `status_fallback_retrying`（複数モデル用）を全15ロケールに追加 |
| 13 | manifest.json / firefox/manifest.json | 変更不要 |
| 14 | リトライログ | 503/429 発生時に `console.log` でリトライ状況を記録する。本番コードにも残す。`console.warn` は管理画面が汚れるため使わない |

## 変更ファイル一覧

1. `extension/utils.js` — 503 リトライロジック、ストリーミング早期チェック、reporter 引数の追加
1. `extension/service-worker.js` — `retryStatusKey` の導出と `generateContent` / `streamGenerateContent` への引き回し
1. `extension/popup.js` — stale 削除、`storage.onChanged` 監視とローディング表示の統一（`retryStatusKey` は送信しない。service worker 側で `resultIndex` から導出する）
1. `extension/results.js` — `storage.onChanged` 監視とローディング表示の統一、結果到達時の `removeListener`、フォローアップ質問（`askQuestion()`）での `retryStatusKey` 引数渡し
1. `extension/_locales/*/messages.json`（15ファイル） — i18n 文字列 `status_retrying` / `status_fallback_retrying` を追加

`extension/options.html`, `extension/options.js`, `extension/manifest.json`, `firefox/manifest.json` は変更しない。

## 詳細な実装手順

### 1. `extension/utils.js`

#### 1.1 リトライヘルパーを追加

`generateContentGemini` の直前あたりに、リトライ判定と待機のヘルパーを追加する。

```js
const isRetryableStatus = (status) => status === 503;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
```

#### 1.2 `generateContentWithFallback()` に 503 リトライを追加

現状:

```js
const generateContentWithFallback = async (apiKey, apiContents, modelConfigs, systemInstruction) => {
  let response = {
    ok: false,
    status: 1001,
    body: { error: { message: "No models available." } }
  };

  for (const modelConfig of modelConfigs) {
    response = await generateContentGemini(apiKey, apiContents, modelConfig, systemInstruction);

    if (response.ok || response.status !== 429) {
      break;
    }
  }

  return response;
};
```

変更後の要件:

- `modelConfigs.length === 1` のときだけ 503 リトライを行う
- リトライは最大 2 回（初回 + 2 回 = 最大 3 リクエスト）
- 待機は `1000ms, 2000ms` の指数バックオフ
- リトライ発生時は reporter に `retrying` 状態を通知
- 成功時またはリトライ上限到達で reporter をクリア
- 複数モデル時は 503 でも 429 でも即次モデルへ（reporter には `fallback` 状態を通知）

```js
const generateContentWithFallback = async (apiKey, apiContents, modelConfigs, systemInstruction, retryStatusKey) => {
  let response = {
    ok: false,
    status: 1001,
    body: { error: { message: "No models available." } }
  };

  const singleModel = modelConfigs.length === 1;
  const maxRetries = 2;
  const backoffMs = [1000, 2000];

  for (const modelConfig of modelConfigs) {
    if (singleModel) {
      // 単独モデル: 503 で同一モデルをリトライ
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        response = await generateContentGemini(apiKey, apiContents, modelConfig, systemInstruction);

        if (response.ok || !isRetryableStatus(response.status)) {
          break;
        }

        if (attempt < maxRetries) {
          console.log(`${response.status} retrying: model=${modelConfig.modelId}, attempt=${attempt + 1}/${maxRetries}, wait=${backoffMs[attempt]}ms`);
          await reportRetryStatus(retryStatusKey, {
            phase: "retrying",
            status: response.status,
            attempt: attempt + 1,
            maxAttempts: maxRetries,
            delayMs: backoffMs[attempt]
          });
          await sleep(backoffMs[attempt]);
        }
      }
    } else {
      // 複数モデル: 503/429 ともに即次モデルへ
      response = await generateContentGemini(apiKey, apiContents, modelConfig, systemInstruction);

      if (!response.ok && (response.status === 429 || isRetryableStatus(response.status))) {
        console.log(`${response.status} fallback: model=${modelConfig.modelId}, moving to next model`);
        await reportRetryStatus(retryStatusKey, {
          phase: "fallback",
          status: response.status
        });
        continue;
      }
    }

    await reportRetryStatus(retryStatusKey, null);
    break;
  }

  await reportRetryStatus(retryStatusKey, null);
  return response;
};
```

#### 1.3 `streamGenerateContentGemini()` に `response.ok` 早期チェックを追加

現状は `fetch` 直後に `response.body.getReader()` を呼んでいる。503 のときは body がエラー JSON であり、ストリーム解析ループが異常動作する恐れがあるため、`getReader()` 前に早期リターンを追加する。

```js
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: apiContents,
        systemInstruction: systemInstruction,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: generationConfig
      })
    });

    if (!response.ok) {
      const body = tryParseJson(await response.text());
      // ストリーミングエンドポイントは配列形式 [{"error": {...}}] でエラーを返すため、
      // 最初の要素を取り出して getResponseContent が期待する形式に合わせる。
      // 非ストリーミングエンドポイントはオブジェクト形式 {"error": {...}} なので、
      // generateContentGemini 側ではこの正規化は不要である。
      const normalizedBody = Array.isArray(body) ? body[0] ?? body : body;
      return {
        ok: false,
        status: response.status,
        body: normalizedBody
      };
    }

    const reader = response.body.getReader();
```

これにより、503 時は `*WithFallback` 側でリトライ判定できるようになる。また、ストリーミングエンドポイントのエラーレスポンスが配列形式の場合でも `getResponseContent` が `response.body.error.message` に安全にアクセスできる。

#### 1.3.1 `getResponseContent()` の防御的修正

早期チェックを追加したことで、ストリーミングエンドポイントのエラーレスポンスが `tryParseJson` を通って `getResponseContent` に渡される。配列正規化（§1.3）で主要なケースはカバーされるが、予期しない形式に対する安全網として `getResponseContent` のエラー分岐を防御的にする。

現状:

```js
    responseContent = `Error: ${response.status}\n\n${response.body.error.message}`;
```

変更後:

```js
    responseContent = `Error: ${response.status}\n\n${response.body?.error?.message ?? JSON.stringify(response.body)}`;
```

`response.body.error` が `undefined` でもクラッシュせず、ボディ全体を文字列化して表示する。

#### 1.4 `streamGenerateContentWithFallback()` に 503 リトライを追加

`generateContentWithFallback()` と同じ方針で 503 リトライを追加する。ストリーミング関数は冒頭で `chrome.storage.session.remove(streamKey)` を行うため、再呼び出し時に部分内容の混入がない点は既存設計で担保されている。

```js
const streamGenerateContentWithFallback = async (apiKey, apiContents, modelConfigs, streamKey, systemInstruction, retryStatusKey) => {
  let response = {
    ok: false,
    status: 1001,
    body: { error: { message: "No models available." } }
  };

  const singleModel = modelConfigs.length === 1;
  const maxRetries = 2;
  const backoffMs = [1000, 2000];

  for (const modelConfig of modelConfigs) {
    if (singleModel) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        response = await streamGenerateContentGemini(apiKey, apiContents, modelConfig, streamKey, systemInstruction);

        if (response.ok || !isRetryableStatus(response.status)) {
          break;
        }

        if (attempt < maxRetries) {
          console.log(`${response.status} retrying (stream): model=${modelConfig.modelId}, attempt=${attempt + 1}/${maxRetries}, wait=${backoffMs[attempt]}ms`);
          await reportRetryStatus(retryStatusKey, {
            phase: "retrying",
            status: response.status,
            attempt: attempt + 1,
            maxAttempts: maxRetries,
            delayMs: backoffMs[attempt]
          });
          await sleep(backoffMs[attempt]);
        }
      }
    } else {
      response = await streamGenerateContentGemini(apiKey, apiContents, modelConfig, streamKey, systemInstruction);

      if (!response.ok && (response.status === 429 || isRetryableStatus(response.status))) {
        console.log(`${response.status} fallback (stream): model=${modelConfig.modelId}, moving to next model`);
        await reportRetryStatus(retryStatusKey, {
          phase: "fallback",
          status: response.status
        });
        continue;
      }
    }

    await reportRetryStatus(retryStatusKey, null);
    break;
  }

  await reportRetryStatus(retryStatusKey, null);
  return response;
};
```

#### 1.5 `reportRetryStatus` ヘルパーを追加

`utils.js` 内で `chrome.storage.session` に状態を書き込むヘルパーを追加する。`retryStatusKey` が未指定（OpenAI パスなど）のときは何もしない。

```js
const reportRetryStatus = async (retryStatusKey, status) => {
  if (!retryStatusKey) {
    return;
  }

  try {
    if (status) {
      await chrome.storage.session.set({ [retryStatusKey]: status });
    } else {
      await chrome.storage.session.remove(retryStatusKey);
    }
  } catch (error) {
    // 通知失敗はリトライ本体に影響させない
    console.error("Failed to report retry status:", error);
  }
};
```

#### 1.6 `generateContent` / `streamGenerateContent` のシグネチャに `retryStatusKey` を追加

```js
export const generateContent = async (apiKey, apiContents, modelConfigs, apiProvider, openaiBaseUrl, retryStatusKey) => {
  if (apiProvider === "openai") {
    const openaiContents = convertToOpenAI(apiContents);
    return await generateContentOpenAI(apiKey, openaiBaseUrl, openaiContents, modelConfigs[0]);
  }

  const { systemInstruction, contents } = extractSystemInstruction(apiContents);
  return await generateContentWithFallback(apiKey, contents, modelConfigs, systemInstruction, retryStatusKey);
};
```

```js
export const streamGenerateContent = async (apiKey, apiContents, modelConfigs, streamKey, apiProvider, openaiBaseUrl, retryStatusKey) => {
  if (apiProvider === "openai") {
    const openaiContents = convertToOpenAI(apiContents);
    return await streamGenerateContentOpenAI(apiKey, openaiBaseUrl, openaiContents, modelConfigs[0], streamKey);
  }

  const { systemInstruction, contents } = extractSystemInstruction(apiContents);
  return await streamGenerateContentWithFallback(apiKey, contents, modelConfigs, streamKey, systemInstruction, retryStatusKey);
};
```

OpenAI 分岐では `retryStatusKey` を無視する（OpenAI 側にはリトライを入れない）。

### 2. `extension/service-worker.js`

#### 2.1 `retryStatusKey` を組み立てて渡す

`generate` ハンドラ内で `retryStatusKey` を `resultIndex` から導出する。`streamKey` は既存どおり popup からメッセージで受け取るため、service worker 側では新規導出しない。

```js
const { actionType, mediaType, taskInput, languageModel, languageCode, streamKey, resultIndex, url, title } = request;
// ... 既存どおり ...
const retryStatusKey = `retryStatus_${resultIndex}`;
```

`generateContent` / `streamGenerateContent` の呼び出しに `retryStatusKey` を渡す。

```js
if (streaming) {
  response = await streamGenerateContent(effectiveApiKey, apiContents, modelConfigs, streamKey, apiProvider, baseUrl, retryStatusKey);
} else {
  response = await generateContent(effectiveApiKey, apiContents, modelConfigs, apiProvider, baseUrl, retryStatusKey);
}
```

`service-worker.js` 側では reporter 関数を直接作らず、`utils.js` の `reportRetryStatus` に `retryStatusKey` を経由させる設計とする。

### 3. `extension/popup.js`

#### 3.1 生成開始時の stale 削除リストに `retryStatus_*` を追加

```js
  await chrome.storage.session.remove(`result_${resultIndex}`);
  await chrome.storage.session.remove(`conversation_${resultIndex}`);
  await chrome.storage.session.remove(`streamContent_${resultIndex}`);
  await chrome.storage.session.remove(`autoSavePending_${resultIndex}`);
  await chrome.storage.session.remove(`retryStatus_${resultIndex}`);
```

#### 3.2 `storage.onChanged` 監視とローディング表示の統一

`#status` への書き込み役を 1 つに統一する。`chrome.storage.onChanged` は現在の retry 状態をメモリ変数に反映するだけとし、500ms interval がその状態を見て `displayLoadingMessage()` に渡す文言を切り替える。

```js
let currentRetryStatus = null;
let retryStatusListener = null;

const startRetryStatusListener = (resultIndex) => {
  // 既にリスナが登録されている場合は先に解除する（多重登録防止）
  stopRetryStatusListener();

  const retryStatusKey = `retryStatus_${resultIndex}`;

  retryStatusListener = (changes, areaName) => {
    if (areaName !== "session") {
      return;
    }

    if (retryStatusKey in changes) {
      currentRetryStatus = changes[retryStatusKey].newValue ?? null;
    }
  };

  chrome.storage.onChanged.addListener(retryStatusListener);
};

// popup 側でも service worker が既に retryStatus を書いている可能性があるため、
// リスナ登録後に現在値を明示的に取得する。onChanged は登録後の変更しか通知しない。
// ただし popup は通常リスナ登録前に service worker への sendMessage を送るため、
// 取りこぼしリスクは results 側より低い。念のため取得しておく。
const ensureRetryStatusInitialized = async (resultIndex) => {
  const retryStatusKey = `retryStatus_${resultIndex}`;
  const initial = (await chrome.storage.session.get({ [retryStatusKey]: null }))[retryStatusKey];
  currentRetryStatus = initial ?? null;
};

const stopRetryStatusListener = () => {
  if (retryStatusListener) {
    chrome.storage.onChanged.removeListener(retryStatusListener);
    retryStatusListener = null;
  }

  currentRetryStatus = null;
};
```

`main()` 内で `displayIntervalId` を設定している箇所を、retry 状態を見て文言を切り替えるように変更する。

```js
  startRetryStatusListener(resultIndex);
  await ensureRetryStatusInitialized(resultIndex);

  displayIntervalId = setInterval(() => {
    const baseMessage = getLoadingMessage(actionType, mediaType);

    if (currentRetryStatus?.phase === "retrying") {
      displayLoadingMessage("status", chrome.i18n.getMessage("status_retrying"));
    } else if (currentRetryStatus?.phase === "fallback") {
      displayLoadingMessage("status", chrome.i18n.getMessage("status_fallback_retrying"));
    } else {
      displayLoadingMessage("status", baseMessage);
    }
  }, 500);
```

`finally` ブロックで `stopRetryStatusListener()` を呼ぶ。

```js
  } finally {
    clearInterval(displayIntervalId);
    stopRetryStatusListener();

    if (!openedInTab) {
      // ... 既存の後処理
    }
  }
```

### 4. `extension/results.js`

#### 4.1 `waitForResult()` で retry 状態を監視し表示に反映

`results.js` の `waitForResult()` では `#send-status` に `results_waiting_for_result` を表示している。これも popup と同じ方針で、retry 状態を見て文言を切り替える。

§4.2 で定義するモジュールスコープの `startRetryStatusListener()` / `stopRetryStatusListener()` を使う。`waitForResult()` の中にローカルなリスナは作らない。

```js
const waitForResult = async (resultIndex) => {
  const { streaming, renderLinks } = await chrome.storage.local.get({ streaming: false, renderLinks: false });
  const streamKey = `streamContent_${resultIndex}`;
  const resultKey = `result_${resultIndex}`;
  const contentElement = document.getElementById("content");

  // retry 状態の監視を開始（モジュールスコープの currentRetryStatus に反映される）
  startRetryStatusListener(resultIndex);

  // ... keepalive / streaming poll は既存どおり ...

  // Result poll: wait for the final result
  const result = await new Promise((resolve) => {
    const check = async () => {
      const storedResult = (await chrome.storage.session.get({ [resultKey]: "" }))[resultKey];

      if (storedResult) {
        resolve(storedResult);
      } else {
        setTimeout(check, 500);
      }
    };

    check();
  });

  // retry 状態の監視を終了
  stopRetryStatusListener();

  // ... 既存の後処理 ...
  return result;
};
```

`initialize()` の loading interval（`results.js:810`）も、popup と同じく `currentRetryStatus` を見て文言を切り替える。`initialize()` は `waitForResult()` を呼ぶ前に `displayIntervalId` を起動するため、`waitForResult()` の `startRetryStatusListener()` が状態を反映したら loading interval がそれを拾う。

#### 4.2 `#send-status` の所有権を確定する

結果ページには元から `#send-status` を書く経路が3つある:

1. `initialize()` の待機中 loading interval（`results.js:810`）
2. `askQuestion()` の待機中 loading interval（`results.js:543`）
3. 完了時の `document.getElementById("send-status").textContent = ...`（`results.js:648`, `results.js:833`）

ここに retry 状態の書き込みが加わると所有権が曖昧になるため、popup と同じ構造に揃えて書き込み役を1つに統一する:

- モジュールスコープに `let currentRetryStatus = null;` と `let retryStatusListener = null;` を置く
- `startRetryStatusListener(resultIndex)` / `stopRetryStatusListener()` を `results.js` にも定義する
- `startRetryStatusListener()` 内でリスナ登録後に現在値を取得し `currentRetryStatus` に反映する（Finding 1 参照）
- `waitForResult()` と `askQuestion()` の**両方**の loading interval が `currentRetryStatus` を見て文言を切り替える
- リスナは1つだけ立て、`waitForResult()` の終了時と `askQuestion()` の `finally` で `stopRetryStatusListener()` を呼ぶ
- `startRetryStatusListener()` の先頭で `stopRetryStatusListener()` を呼び、既存リスナを必ず解除してから新しいリスナを登録する（多重登録防止）。popup は `main()` が再呼び出しされうる、results は `waitForResult()` と `askQuestion()` の両方で使うため、再入時のリークを防ぐ必要がある

これで `#send-status` の書き込み役は常に「現在動いている loading interval 1つ」に統一される。

#### 4.3 フォローアップ質問（`askQuestion()`）での `retryStatusKey` 引数渡し

結果ページのフォローアップ質問は service worker を経由せず、`results.js` が直接 `streamGenerateContent` / `generateContent` を呼んでいる（`results.js:613`, `results.js:637`）。この経路に `retryStatusKey` を渡さないと、追質問中に 503 リトライが起きても `reportRetryStatus()` が `if (!retryStatusKey) return;` で何も書かず、再試行中表示が出ない。

`askQuestion()` でも `retryStatusKey` を組み立てて渡す:

```js
const streamKey = `streamContent_${resultIndex}`;
const retryStatusKey = `retryStatus_${resultIndex}`;

// ストリーミング
const responsePromise = streamGenerateContent(effectiveApiKey, apiContents, modelConfigs, streamKey, apiProvider, baseUrl, retryStatusKey);

// 非ストリーミング
response = await generateContent(effectiveApiKey, apiContents, modelConfigs, apiProvider, baseUrl, retryStatusKey);
```

`askQuestion()` の `displayIntervalId`（`results.js:543`）も、popup と同じく retry 状態を見て文言を切り替える。`askQuestion()` 開始時に `startRetryStatusListener(resultIndex)` を呼び、`finally` で `stopRetryStatusListener()` を呼ぶ。

現行コード:

```js
const displayIntervalId = setInterval(displayLoadingMessage, 500, "send-status", chrome.i18n.getMessage("results_waiting_response"));
```

変更後:

```js
startRetryStatusListener(resultIndex);

const displayIntervalId = setInterval(() => {
  if (currentRetryStatus?.phase === "retrying") {
    displayLoadingMessage("send-status", chrome.i18n.getMessage("status_retrying"));
  } else if (currentRetryStatus?.phase === "fallback") {
    displayLoadingMessage("send-status", chrome.i18n.getMessage("status_fallback_retrying"));
  } else {
    displayLoadingMessage("send-status", chrome.i18n.getMessage("results_waiting_response"));
  }
}, 500);
```

`finally` ブロックで `stopRetryStatusListener()` を呼ぶ:

```js
  } finally {
    clearInterval(displayIntervalId);
    stopRetryStatusListener();
    setResultControlsEnabled(true);
    // ... 既存の後処理 ...
  }
```

### 5. `extension/_locales/*/messages.json`（15ファイル）

`status_retrying` と `status_fallback_retrying` を追加する。

#### en

```json
    "status_retrying": {
        "message": "The server is busy. Retrying"
    },
    "status_fallback_retrying": {
        "message": "Trying another model"
    },
```

#### ja

```json
    "status_retrying": {
        "message": "サーバーが混雑しているため再試行しています"
    },
    "status_fallback_retrying": {
        "message": "別モデルで再試行しています"
    },
```

#### その他13ロケール

各ロケールの文脈に合わせて翻訳を追加する。挿入位置は `popup_taking_long` / `results_waiting_for_result` の近くが自然。

メッセージ末尾にピリオド（`...` など）を含めないこと。`displayLoadingMessage()` が末尾に `.` → `..` → `...` を追加してアニメーションするため、メッセージ側にピリオドがあると表示が `....` `.....` `......` と過剰になる。既存の `results_waiting_response` / `results_waiting_for_result` も末尾にピリオドを持たない。

`status_fallback_retrying` は 429（クォータ超過）と 503（サーバー過負荷）の両方で使われるため、原因を特定せず「別モデルで再試行している」ことだけを伝える。原因は最終エラー文言（`Error: 429\n\n...` / `Error: 503\n\n...`）で伝わる。`status_retrying`（単独モデル時）は 503 専用なので「サーバーが混雑しているため」のままでよい。

## 状態オブジェクトの仕様

`retryStatus_${resultIndex}` に保存する構造化データ:

```js
// 単独モデル時の再試行中
{
  phase: "retrying",
  status: 503,
  attempt: 1,        // 1 または 2
  maxAttempts: 2,
  delayMs: 1000      // 1000 または 2000
}

// 複数モデル時の次モデルへ移行中
{
  phase: "fallback",
  status: 503        // または 429
}
```

UI 側はこのデータを見て文言を組み立てる。`phase` が `retrying` なら `status_retrying`、`fallback` なら `status_fallback_retrying` を使う。`attempt` / `maxAttempts` は現時点では文言に含めない（控えめな通知の方針）。

## リトライ動作まとめ

### 単独モデル（`modelConfigs.length === 1`）

```text
1回目: 503 → 1s 待機 → 再試行
2回目: 503 → 2s 待機 → 再試行
3回目: 503 → リトライ上限、break、最終失敗
```

### 複数モデル（`modelConfigs.length >= 2`）

```text
モデルA: 503 → 即次モデルへ
モデルB: 503 → 即次モデルへ
モデルC: 503 → 即次モデルへ
... 最後のモデルで 503 → break、最終失敗
```

429 も従来どおり次モデルへ移る（挙動変更なし）。

## 検証項目

- `apiProvider: "gemini"` で 503 が返ったとき、単独モデルなら最大 3 リクエストまで再試行される
- `apiProvider: "gemini"` で 503 が返ったとき、複数モデルなら即次モデルへ移る
- `apiProvider: "openai"` ではリトライされない（`retryStatusKey` は無視される）
- 単独モデル時の再試行中、ポップアップの `#status` に `status_retrying` が表示される
- 複数モデル時のフォールバック中、ポップアップの `#status` に `status_fallback_retrying` が表示される
- `openResultsInTab` 有効時、結果タブの `#send-status` に再試行中文言が表示される
- 再試行中も `displayLoadingMessage()` のピリオドアニメーションが動く
- 再試行成功後は通常どおり結果が表示され、再試行文言は消える
- 最終失敗時は生 503 エラー文言が表示される（再試行済み注記なし）
- 503 リトライ発生時に service worker のコンソールに `503 retrying: ...` ログが出力される
- 429 フォールバック発生時に service worker のコンソールに `429 fallback: ...` ログが出力される
- ストリーミング時も同様に `503 retrying (stream): ...` / `429 fallback (stream): ...` ログが出力される
- ログのステータスコードは `response.status` から取得し、ハードコードしない
- スロット再利用時に前回の `retryStatus_*` が残らない
- `npm run lint` が通る
- `apiProvider: "gemini"` / `apiProvider: "openai"` 両方で動作する
- フォローアップ質問（`askQuestion()`）の非ストリーミングで 503 が起きたとき、`#send-status` に `status_retrying` が表示される
- フォローアップ質問（`askQuestion()`）のストリーミングで 503/429 が起きたとき、`#send-status` とログが期待どおり更新される
- フォローアップ質問時にも `retryStatus_*` が適切に set/remove される
- ストリーミングエンドポイントの 429/503 エラー時、`getResponseContent` がクラッシュせずエラー文言を表示する（配列形式ボディの正規化が効いている）

## 注意点

- 503 はモデルごとにリソース割り当てが異なり得るため、複数モデル時は即次モデルへ移る方針とした。単独モデル時のみ同一モデル再試行を行う。
- `streamGenerateContentGemini()` の `response.ok` 早期チェックは、503 リトライの前提条件である。これを忘れるとストリーム解析ループが異常動作する。
- ストリーミングエンドポイントのエラーレスポンスは配列形式 `[{"error": {...}}]` で返る。早期リターン時に配列の最初の要素を取り出して正規化しないと、`getResponseContent` で `response.body.error` が `undefined` になり `TypeError` が発生する。非ストリーミングエンドポイントはオブジェクト形式 `{"error": {...}}` なので `generateContentGemini` 側では正規化不要。
- `getResponseContent()` のエラー分岐は `response.body?.error?.message` を使い、`undefined` 時は `JSON.stringify(response.body)` にフォールバックすることで、予期しないボディ形式に対する安全網とする。
- `#status` / `#send-status` への書き込み役を複数作らないこと。`storage.onChanged` は状態をメモリに反映するだけとし、500ms interval が表示を担う。
- `storage.onChanged` はリスナ登録後の変更しか通知しない。結果ページは service worker が既に `retryStatus` を書いた後に開かれることがあるため、リスナ登録後に必ず `chrome.storage.session.get` で現在値を取得すること。
- フォローアップ質問（`askQuestion()`）でも `retryStatusKey` を渡すこと。この経路は service worker を経由しないため、`results.js` 側で `retryStatusKey` を組み立てる必要がある。
- `retryStatusKey` は service worker 側で `resultIndex` から導出する。popup からは送信しない（`resultIndex` は既に送信済みのため）。
- `retryStatus_*` の stale クリアを忘れると、スロット再利用時に前回の再試行表示が一瞬出る。
- OpenAI パスにはリトライを波及させない。`retryStatusKey` は受け取るが無視する。
- リトライログは `console.log` を使う。`console.warn` はブラウザの管理画面（`chrome://extensions` の Service Worker コンソール）が汚れるため使わない。ログは本番コードにも残す。
