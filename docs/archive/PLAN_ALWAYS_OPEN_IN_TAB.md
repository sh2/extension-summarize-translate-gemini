# 要約を常に新しいタブで開くオプションの実装計画 (Issue #45)

## 背景・目的

現在、ポップアップで要約・翻訳を実行すると結果はポップアップ内に表示され、5秒以内に応答が得られない場合にのみ「Click here to view results in a new tab」リンクが表示される仕組みです（`extension/popup.js:447`）。

Issue #45 では、**常に**新しいタブで結果を開くオプションの追加が要望されています。これにより、ユーザーは要約の完了を待つことなく、即座に結果タブに移動できます。

本計画では、オプションページにチェックボックスを追加し、有効時はポップアップでの生成開始と同時に新しいタブを開き、ポップアップを閉じる仕組みを実装します。

## 設計決定の要約

| # | 項目 | 決定内容 |
| --- | --- | --- |
| 1 | オプション名（ストレージキー） | `openResultsInTab`（`autoSave`, `renderLinks` と同じ lowerCamel の boolean） |
| 2 | デフォルト値 | `false`（既存ユーザーの挙動を変えない） |
| 3 | 適用範囲 | キャッシュヒット・キャッシュミスの両方（初回ポップアップオープン時の `main(true)` および「Run again」ボタンの `main(false)` の両方） |
| 4 | ポップアップの挙動 | 新しいタブを開いた直後に `window.close()` でポップアップを閉じる。タブ作成失敗時は既存のポップアップ表示フローにフォールスルーする |
| 5 | キャッシュミス時の動作 | `chrome.runtime.sendMessage` 送信後に即座にタブを開く。service worker がバックグラウンドで生成を継続し、成功時も失敗時も `result_${resultIndex}` に終端結果を保存する。`results.html` の `waitForResult()` がポーリングで結果を取得 |
| 6 | ストリーミング表示 | ポップアップ側のストリーミングポーリングは開始しない。`results.html` 側の既存ストリーミングポーリング（`results.js:404-412`）が表示を担当 |
| 7 | `streamContent_${resultIndex}` の削除 | 生成開始前の削除は既存どおり producer 側で行い、生成完了後の削除は consumer 側で行う。ポップアップ内表示を継続する経路では `popup.js`、新規タブへ委譲する経路では `results.js` が削除を担当し、`service-worker.js` では削除しない |
| 8 | `results.js` の変更 | `initialize()` 末尾で `streamContent_${resultIndex}` を best-effort 削除し、`initialize()` で `autoSavePending_${resultIndex}` を一度だけ消費して、ポップアップ側でスキップした生成直後の自動保存を補完する |
| 9 | `service-worker.js` の変更 | `generate` ハンドラ全体を try/catch で包み、例外時も `result_${resultIndex}` にエラー結果を保存して results タブの無限待機を防ぐ。加えて `popup.js` 側で `responsePromise.catch` を付け、`sendMessage` の即時 reject 時（service worker 未登録・メッセージチャネル不能など）のみ results タブが無限待機しないようにする。遅延 reject（popup 閉鎖後の service worker 終了など）は popup コンテキスト消失で拾えず、ユーザーが結果タブを閉じる運用とする |
| 10 | オプションページの配置 | `autoSave` チェックボックス（`options.html:254-257`）の直後 |
| 11 | i18n キー | `options_open_results_in_tab`（全15ロケールに追加） |
| 12 | manifest.json / firefox/manifest.json | 変更不要 |

## 変更ファイル一覧

1. `extension/options.js` — オプションの読み書き処理に `openResultsInTab` を追加
1. `extension/options.html` — チェックボックス UI を追加
1. `extension/popup.js` — `main()` に新規タブ即時オープン処理と、popup が最終 consumer になる場合の `streamContent_${resultIndex}` 削除を追加
1. `extension/results.js` — `initialize()` 末尾での `streamContent_${resultIndex}` の best-effort 削除、`initialize()` に一回限りの auto-save pending フラグ消費処理を追加
1. `extension/service-worker.js` — `generate` ハンドラに例外時の終端結果保存を追加
1. `extension/_locales/*/messages.json`（15ファイル） — i18n 文字列を追加

`extension/results.html`, `extension/manifest.json`, `firefox/manifest.json` は変更しません。

## 詳細な実装手順

### 1. `extension/options.js`

`streaming` / `autoSave` / `renderLinks` と同じ4箇所のパターンで `openResultsInTab` を追加します。

#### 1.1 `INITIAL_OPTIONS` に追加（L39付近）

`streaming: false,` と `autoSave: false,` の近くに追加します。

```js
  streaming: false,
  renderLinks: false,
  autoSave: false,
  openResultsInTab: false,
  theme: "system",
```

#### 1.2 `getOptionsFromForm` に追加（L97付近）

```js
    streaming: document.getElementById("streaming").checked,
    renderLinks: document.getElementById("renderLinks").checked,
    autoSave: document.getElementById("autoSave").checked,
    openResultsInTab: document.getElementById("openResultsInTab").checked,
    theme: document.getElementById("theme").value,
```

#### 1.3 `setOptionsToForm` に追加（L141付近）

```js
  document.getElementById("streaming").checked = options.streaming;
  document.getElementById("renderLinks").checked = options.renderLinks;
  document.getElementById("autoSave").checked = options.autoSave;
  document.getElementById("openResultsInTab").checked = options.openResultsInTab;
  document.getElementById("theme").value = options.theme;
```

#### 1.4 `applyOptionsToForm` に追加（L298付近）

```js
  if (options.autoSave !== undefined) {
    document.getElementById("autoSave").checked = options.autoSave;
  }

  if (options.openResultsInTab !== undefined) {
    document.getElementById("openResultsInTab").checked = options.openResultsInTab;
  }

  if (options.theme) {
```

### 2. `extension/options.html`

`autoSave` セクション（L254-257）の直後、既存の `<hr>` の後に新しいチェックボックスを追加します。

```html
  <p>
    <input id="autoSave" type="checkbox">
    <label for="autoSave" data-i18n="options_auto_save">Automatically save results after generation</label>
  </p>

  <hr>

  <p>
    <input id="openResultsInTab" type="checkbox">
    <label for="openResultsInTab" data-i18n="options_open_results_in_tab">Always open results in a new tab</label>
  </p>

  <hr>
```

### 3. `extension/popup.js`

#### 3.1 `main()` の先頭で `openResultsInTab` を取得

`renderLinks` を取得している箇所（L338）に `openResultsInTab` と `autoSave` を追加し、`openedInTab` フラグ変数を宣言します。`autoSave` は、ポップアップを閉じる前に「今回の生成でポップアップ側の自動保存をスキップした」ことを session storage に記録するために使います。

```js
const main = async (useCache) => {
  const { renderLinks, openResultsInTab, autoSave } = await chrome.storage.local.get({
    renderLinks: false,
    openResultsInTab: false,
    autoSave: false
  });
  let displayIntervalId = 0;
  let responseContent;
  let modelVersion = "";
  let didGenerate = false;
  let openedInTab = false;
```

result index を進めた直後の stale data 削除に、streaming 用の一時データと pending フラグの削除も追加します。

```js
  await chrome.storage.session.remove(`result_${resultIndex}`);
  await chrome.storage.session.remove(`conversation_${resultIndex}`);
  await chrome.storage.session.remove(`streamContent_${resultIndex}`);
  await chrome.storage.session.remove(`autoSavePending_${resultIndex}`);
```

`streamContent_${resultIndex}` は既存の streaming ポーリングが参照する一時キーであり、result index を再利用した際に過去の途中経過が一瞬表示されるのを防ぐため、生成開始前に毎回削除します。`autoSavePending_${resultIndex}` は一回限りのフラグです。キャッシュミスかつ `openResultsInTab` と `autoSave` が両方有効な場合だけ設定し、results タブ側で保存後に削除します。

`streamContent_${resultIndex}` の**生成完了後の削除**は、ここでは行いません。どの画面が最終的な consumer になるかは `openResultsInTab` の有効/無効で変わるためです。ポップアップ内に表示を続ける経路では `popup.js` 側、即座に results タブへ委譲する経路では `results.js` 側が、読み終えた後に削除します。`service-worker.js` は producer であり、どちらの consumer がまだ読んでいるか判断できないため、完了後削除は担当しません。

#### 3.2 キャッシュヒット時に新規タブを開く

キャッシュヒット時の `chrome.storage.session.set`（L394-401）の直後に、`openResultsInTab` が有効ならタブを開いてポップアップを閉じます。

```js
    if (useCache && responseCache) {
      // Use the cached response
      const { requestApiContent, responseContent: cachedResponseContent } = responseCache.value;
      responseContent = cachedResponseContent;

      await chrome.storage.session.set({
        [`result_${resultIndex}`]: {
          requestApiContent,
          responseContent: cachedResponseContent,
          url: url,
          title: title
        }
      });

      if (openResultsInTab) {
        try {
          await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${resultIndex}`) });
          openedInTab = true;
          window.close();
          return;
        } catch (error) {
          console.error("Failed to open results tab:", error);
          // フォールスルー: 既存のポップアップ表示フローに戻る
        }
      }
    } else {
```

キャッシュヒット時は既に `result_${resultIndex}` への保存が完了しているため、新規タブは即座に結果を表示します。ここでは `autoSavePending_${resultIndex}` を設定しません。既存のポップアップ側 auto-save は `didGenerate` が `true` の場合だけ動作するため、キャッシュヒット時に results タブで自動保存すると既存挙動より保存範囲が広がってしまうためです。キャッシュヒット時は `autoSavePending_${resultIndex}` を設定しないため、タブ作成失敗時の catch でも削除は不要です。

#### 3.3 キャッシュミス時に新規タブを開く

`chrome.runtime.sendMessage` 送信後（L421の直後）、`openResultsInTab` が有効なら即座にタブを開いてポップアップを閉じます。`responsePromise` の完了を待ちません。

```js
      const responsePromise = chrome.runtime.sendMessage({
        message: "generate",
        actionType: actionType,
        mediaType: mediaType,
        taskInput: taskInput,
        languageModel: languageModel,
        languageCode: languageCode,
        streamKey: streamKey,
        resultIndex: resultIndex,
        url: url,
        title: title
      });

      console.log("Request:", {
        actionType: actionType,
        mediaType: mediaType,
        taskInput: taskInput,
        languageModel: languageModel,
        languageCode: languageCode,
        streamKey: streamKey,
        resultIndex: resultIndex,
        url: url,
        title: title
      });

      if (openResultsInTab) {
        if (autoSave) {
          await chrome.storage.session.set({ [`autoSavePending_${resultIndex}`]: true });
        }

        // sendMessage が即時 reject した場合（service worker 未登録、メッセージ
        // チャネルが開けないなど）、results タブが無限待機しないようエラー結果を
        // session storage に書き込む。通常経路では `await responsePromise` が
        // try/catch で捕まえるため、この `.catch` は `openResultsInTab` 有効時
        // だけ付ける。
        //
        // なお、popup が `window.close()` で破棄された後に発生する遅延 reject
        // （service worker が生成途中でブラウザに終了されたなど）は、popup
        // コンテキスト消失でこのハンドラも走らないため拾えない。この場合は
        // ユーザーが結果タブを閉じる運用とする（タイムアウトは設けない）。
        responsePromise.catch(async (error) => {
          console.error("sendMessage rejected:", error);

          try {
            await chrome.storage.session.remove(`autoSavePending_${resultIndex}`);
            await chrome.storage.session.set({
              [`result_${resultIndex}`]: {
                requestApiContent: [],
                responseContent: chrome.i18n.getMessage("response_unexpected_response"),
                url: url,
                title: title
              }
            });
          } catch {
            // popup コンテキストが既に破棄されている場合は何もできない
          }
        });

        try {
          await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${resultIndex}`) });
          openedInTab = true;
          window.close();
          return;
        } catch (error) {
          console.error("Failed to open results tab:", error);
          await chrome.storage.session.remove(`autoSavePending_${resultIndex}`);
          // フォールスルー: 既存のポップアップ表示フローに戻る
        }
      }

      if (streaming) {
```

この `return` により、以降のストリーミングポーリング（`setInterval`）、5秒タイムアウト（`setTimeout`）、`await responsePromise` はすべてスキップされます。service worker はバックグラウンドで生成を継続し、成功時も失敗時も `result_${resultIndex}` に終端結果を保存します。`results.html` の `waitForResult()`（`results.js:386-434`）が500ms間隔でポーリングし、結果を取得します。ストリーミング有効時は `results.html` 側の `streamContent_${resultIndex}` ポーリング（`results.js:404-412`）が経過表示を担当します。

タブ作成に失敗した場合は catch に落ち、`autoSavePending_${resultIndex}` を削除した上でフォールスルーします。以降のストリーミングポーリング・5秒タイムアウト・`await responsePromise`・`finally` ブロックは既存のポップアップ表示フローと同じ挙動で動作し、ポップアップ内に結果が表示されます。service worker は既に生成を開始しているため、フォールスルー後も `responsePromise` で結果を受け取れます。

#### 3.3a `responsePromise.catch` の責務範囲

`responsePromise.catch` は **即時 reject のみ** を救うためのものです。これは service worker が未登録、メッセージチャネルが開けない、`chrome.runtime.sendMessage` 自体が同期的に例外を投げるなどのケースで、`await chrome.tabs.create(...)` の解決より早く microtask で reject されるため、popup コンテキストが生きている間にハンドラが実行されます。

一方、service worker が生成途中でブラウザに終了されるなどの **遅延 reject** は、popup が `window.close()` で破棄された後に発生するため、このハンドラでは拾えません。この場合、results タブは `waitForResult()` で待機し続けますが、タイムアウトは設けずユーザーがタブを閉じて対応する運用とします。長時間の生成において service worker が終了するリスクは、`results.html` の既存 keepalive ping（`results.js:393-399`、20秒間隔）で軽減されています。

フォールスルー時（`chrome.tabs.create` 失敗）の相互作用は以下のとおりです。

- `responsePromise` が **resolve** した場合: `.catch` は走らず、通常どおり `await responsePromise` で結果を受け取ってポップアップに表示する。session storage にエラー結果は書き込まれない。
- `responsePromise` が **reject** した場合: `.catch` が走って `result_${resultIndex}` にエラー結果を書き込み、その後 `await` が throw して外側の try/catch が `content` にエラーメッセージをセットする。ポップアップにエラーが表示される。session storage のエラー結果は results タブが存在しないため誰も読まず、無害。

通常経路（`openResultsInTab` 無効）では `await responsePromise` が try/catch で捕まえるため、`.catch` を付けると二重処理になる。このため `.catch` は `openResultsInTab` 有効時のブロック内だけに付ける。

#### 3.4 ポップアップが最終 consumer になる場合に `streamContent_${resultIndex}` を削除

`openResultsInTab` が無効な通常経路では、popup が streaming の最終 consumer になります。この場合のみ、`await responsePromise` 完了後に `streamContent_${resultIndex}` を削除します。

追加箇所は、既存のストリーミング停止処理（`clearInterval(streamIntervalId);`）の直後です。既存コードには `streamKey` の削除処理は存在しないため、以下の `if (streaming) { ... }` ブロックは**新規追加**です。

```js
      // Stop streaming
      clearInterval(streamIntervalId);

      // 新規追加: popup が最終 consumer となる通常経路でのみ、
      // 読み終えた streamContent_${resultIndex} を削除する。
      // openResultsInTab 有効経路では前段の return で到達しないため、
      // この削除は results.js 側へ委譲される。
      if (streaming) {
        await chrome.storage.session.remove(streamKey);
      }
```

この削除は、**`openResultsInTab` が無効でポップアップが最後まで表示を担当する場合だけ**実行されます。`openResultsInTab` が有効な経路では前段の `return` によりこの箇所まで到達しないため、削除は `results.js` 側へ委譲されます。

#### 3.5 `finally` ブロックでポップアップ終了時の処理をスキップ

`openedInTab` が `true` の場合、ポップアップは閉じられるため、UI 更新・自動保存・コントロール有効化をスキップします。`displayIntervalId` のクリアのみ行います。`autoSave` と `openResultsInTab` の両方が有効なキャッシュミスでは、前述の `autoSavePending_${resultIndex}` により初回自動保存を `results.js` 側へ引き継ぎます。

**前提変更**: 現状 `popup.js` の `finally` ブロック内で `const { autoSave } = await chrome.storage.local.get({ autoSave: false });` を読み込んでいますが、3.1 で `main()` 先頭に `autoSave` を移動済みのため、**この `finally` 内の読み込みは削除**し、先頭で取得した変数を参照する形に変更します。具体的には、`finally` ブロック内から以下の行を削除してください。

```js
    // 削除対象: autoSave は main() 先頭で取得済みのため here では使用しない
    const { autoSave } = await chrome.storage.local.get({ autoSave: false });
```

**`finally` 内の `return` について**: JS では `finally` 内の `return` が try/catch の完了値や伝播中の例外を上書きする非慣用パターンです。本件では try に `return` がなく catch が例外を握りつぶすため実害はありませんが、レビュア指摘を避けるため `if (!openedInTab) { ... }` のガードで処理を囲む形とします。`displayIntervalId` のクリアだけは `openedInTab` の有無に関わらず実行します。

```js
  } finally {
    // Stop displaying the loading message
    clearInterval(displayIntervalId);

    if (!openedInTab) {
      // Convert the content from Markdown to HTML
      document.getElementById("content").innerHTML = convertMarkdownToHtml(content, false, renderLinks);

      if (autoSave && didGenerate) {
        try {
          saveContent();
        } catch (saveError) {
          console.error("Auto-save failed:", saveError);
        }
      }

      // Enable the buttons and input fields
      document.getElementById("status").textContent = modelVersion;
      setPopupControlsEnabled(true);
    }
  }
```

`!openedInTab` ガードを入れる理由:

- `content` が空文字のまま `convertMarkdownToHtml` に渡されるのを防ぐ
- `autoSave` が有効かつ `didGenerate` が `true`（キャッシュミス時）のとき、空のファイルが自動保存されるのを防ぐ。初回自動保存は `autoSavePending_${resultIndex}` 経由で `results.js` の `initialize()` に移譲する
- 閉じるポップアップのコントロールを有効化する無駄を省く

### 4. `extension/results.js`

#### 4.1 `initialize()` 末尾で `streamContent_${resultIndex}` を best-effort 削除

`openResultsInTab` が有効な経路では、results タブが streaming の最終 consumer になります。このため、`initialize()` で結果の取得と描画が完了した直後に `streamContent_${resultIndex}` を best-effort で削除します。

`initialize()` は `result_${resultIndex}` が既に存在する場合 `waitForResult()` をスキップして結果描画へ進みます（`results.js:487-512`）。そのため `waitForResult()` 内に削除を置くと、生成完了が速くて結果タブ初期化時点ですでに最終結果が入っていたケースで `streamContent_${resultIndex}` が誰にも削除されません。`initialize()` 末尾に置けば両経路を一本でカバーできます。

- **`waitForResult()` を経由する場合**（`result_${resultIndex}` がまだない）：`result_${resultIndex}` 出現 → `clearInterval(streamIntervalId)` でストリーミングポーリング停止 → `return result` → `initialize()` で結果描画 → 末尾の削除が `streamContent_${resultIndex}` を掃除
- **`waitForResult()` をスキップする場合**（`result_${resultIndex}` が既にある）：ストリーミングポーリングはそもそも始まっていない → 結果描画 → 末尾の削除が残留 `streamContent_${resultIndex}` を掃除

どちらも「consumer が読み終わった後」に削除が走るため、表示を壊しません。`streamContent_${resultIndex}` が末尾削除まで残っていても、`result_${resultIndex}` 出現後に `streamIntervalId` は `clearInterval` され、`initialize()` で `result.responseContent` が `#content` に描画されて最終結果で上書きされるため、誰も読まない残留は無害です。

追加箇所は、`initialize()` の会話復元ループの直後（関数末尾）です。

```js
  // ...existing code: 会話復元ループ...
  }

  // openResultsInTab 有効経路で results タブが streaming の最終 consumer に
  // なる場合の残留 streamContent_${resultIndex} を best-effort で掃除する。
  // waitForResult() 経由・スキップの両方を一本でカバーする。
  try {
    await chrome.storage.session.remove(`streamContent_${resultIndex}`);
  } catch {
    // best-effort: 削除失敗は無視
  }
};
```

この削除を `results.js` 側に置く理由は、`openResultsInTab` が有効な場合に popup 側は `responsePromise` もストリーミングポーリングも継続しないためです。逆に `openResultsInTab` が無効な通常経路では popup 側が最終 consumer となるため、`results.js` 側の削除に依存しません。

#### 4.2 `initialize()` で `autoSavePending_${resultIndex}` を一度だけ消費

`initialize()` で結果の取得と描画が完了した直後、`autoSavePending_${resultIndex}` が `true` の場合にだけ `saveContent()` を呼びます。これにより、ポップアップの `finally` ブロックをスキップしたキャッシュミス時でも、生成直後の自動保存が一度だけ維持されます。

追加箇所は、`result.responseContent` を `#content` に描画した直後です。

```js
  const { renderLinks } = await chrome.storage.local.get({ renderLinks: false });
  document.getElementById("content").innerHTML = convertMarkdownToHtml(result.responseContent, false, renderLinks);

  const autoSavePendingKey = `autoSavePending_${resultIndex}`;
  const autoSavePending = (await chrome.storage.session.get({ [autoSavePendingKey]: false }))[autoSavePendingKey];

  if (autoSavePending) {
    try {
      saveContent();
    } catch (saveError) {
      console.error("Auto-save failed:", saveError);
    } finally {
      await chrome.storage.session.remove(autoSavePendingKey);
    }
  }
```

この処理は以下の条件でのみ動きます。

- キャッシュミスかつ `openResultsInTab` と `autoSave` の両方が有効だった場合だけ、popup 側が `autoSavePending_${resultIndex}` を設定する
- キャッシュヒットでは `autoSavePending_${resultIndex}` を設定しないため、従来どおり自動保存されない
- `saveContent()` の成功・失敗に関わらず `autoSavePending_${resultIndex}` を削除するため、results タブの再読み込みや再表示で重複保存されない
- `try/catch` で囲み、既存の auto-save と同様に保存失敗で UI 全体を壊さない

**順序依存の前提**: この autoSavePending 消費は `initialize()` 内の会話復元ループの**前**（`#content` 描画直後）に実行されます。初回生成では `conversation` が空であるため `saveContent()` は本文のみを保存し、既存の popup 側 auto-save と同じ結果になります。会話復元ループの後に消費すると `conversation` が復元された状態で保存されてしまうため、挿入位置は必ず `#content` 描画直後としてください。この前提をコードコメントにも残すと保守性が上がります。

#### 4.3 `requestApiContent` が空の終端結果では follow-up を無効化

3.3 の `responsePromise.catch` が即時 reject を救う経路では、service worker が一度も起動していないため本来の `apiContents`（system + user）は一度も構築されず、`result_${resultIndex}` には `requestApiContent: []` でエラー結果が保存されます。

一方、`results.js` の follow-up は `result.requestApiContent` を初期コンテキストとして前提し、その後ろに `model` 発話を足して送信します（`results.js:289-297`）。そのため、`requestApiContent: []` の終端結果で開いた結果タブから follow-up すると、先頭が `model` になる壊れた会話配列を API へ送信してしまいます。

`apiContents` の構築に必要な `systemPrompt` は `service-worker.js` 内の `getSystemPrompt()` で組み立てられ、popup 側には渡ってきません。popup 側で再構築するには `getSystemPrompt()` を `utils.js` 経由で共有する必要があり、即時 reject 救済のためだけに大きく設計を動かすことになります。即時 reject は service worker が動いていない異常系であり、ユーザーが拡張機能アイコンをクリックしてポップアップを開き直すのが自然な復帰経路です（`openResultsInTab` 有効時はポップアップが即座に閉じるため「Run again」ボタンは存在しません）。このため、エラー結果タブで follow-up を試せる状態のまま残すより、follow-up UI を無効化する方針とします。

追加箇所は、`initialize()` で結果描画と auto-save pending 消費が完了した直後です。既存の `setResultControlsEnabled(false)` と同じ制御枠で `#text` と `#send` を無効化します。

```js
  // requestApiContent が空の終端結果（即時 reject 経路など）では
  // follow-up の初期コンテキストが存在しないため、入力を無効化する
  if (!Array.isArray(result.requestApiContent) || result.requestApiContent.length === 0) {
    document.getElementById("text").readOnly = true;
    document.getElementById("send").disabled = true;
  }
```

この処理は以下の条件でのみ動きます。

- `requestApiContent` が空配列または未定義の終端結果（3.3 の `responsePromise.catch` 経路、および 5. の service worker catch 経路のうち `apiContents` 構築前に例外が起きたケース）でのみ follow-up を無効化する
- 正常経路・キャッシュヒットでは `requestApiContent` が空でないため、従来どおり follow-up 可能
- 既存の `setResultControlsEnabled()` と同じ DOM 制御で済むため、`results.js` の変更範囲を最小に留める

### 5. `extension/service-worker.js`

`chrome.runtime.onMessage` の `generate` ハンドラで、**生成〜`result_${resultIndex}` 保存までを try/catch で包み、`sendResponse` とキャッシュ更新は catch の外で best-effort に行います**。これにより、`openResultsInTab` が有効で popup 側が `responsePromise` を待たない場合でも、results タブは既存の `waitForResult()` で必ず終端結果を受け取れます。同時に、生成後の `sendResponse` やキャッシュ更新で popup 切断などの例外が発生しても、正常結果がエラー結果で上書きされるのを防ぎます。

catch では以下を行います。

- `console.error(error)` で開発者向けの詳細を残す
- `chrome.storage.session.set` で `result_${resultIndex}` にエラー結果を保存する
- `responseContent` には `response_unexpected_response` を使い、`requestApiContent` は未構築の可能性があるため安全な既定値 `[]` を使う
- `sendResponse(...)` では既存の internal error code `1004` と `response_unexpected_response` を返そうとするが、これ自体も popup が閉じているなどで失敗しうるため別途 try/catch で包む

正常パスでは、`result_${resultIndex}` 保存後に以下を best-effort で行います。

- 成功時のキャッシュ更新（`responseCacheQueue`）
- `sendResponse(response)`

これらは popup が既に閉じている可能性があるため、`sendResponse` の失敗は無視して構いません。重要なのは **終端結果が `result_${resultIndex}` に保存されていること** だけです。

**`responseContent` の再利用**: try ブロック内で `const responseContent = getResponseContent(...)` を一度だけ呼び出し、`result_${resultIndex}` 保存とキャッシュ更新の両方で同じ変数を再利用します。キャッシュ更新で `getResponseContent()` を再呼び出ししないのは、無駄な再計算を避けるためと、`response` の状態によっては結果が変わるリスクを排除するためです。このため `responseContent` は try の外（IIFE 先頭）で `let responseContent;` 宣言し、try 内で代入します。

この変更でも、`streamContent_${resultIndex}` の完了後削除は `service-worker.js` では行いません。consumer が popup と results のどちらになるかは実行経路で変わるため、service worker は終端結果の保存だけを責務とします。

概略コードは以下です。

```js
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    if (request.message === "generate") {
      const { actionType, mediaType, taskInput, languageModel, languageCode, streamKey, resultIndex, url, title } = request;

      let apiContents;
      let response;
      let responseContent;

      try {
        // ...existing code: オプション読み取り、apiContents 構築、generateContent/streamGenerateContent 呼び出し...

        apiContents = ...;
        response = ...;

        responseContent = getResponseContent(response, Boolean(effectiveApiKey), apiProvider);

        await chrome.storage.session.set({
          [`result_${resultIndex}`]: {
            requestApiContent: apiContents,
            responseContent: responseContent,
            url: url,
            title: title
          }
        });
      } catch (error) {
        console.error("Failed to generate content:", error);

        await chrome.storage.session.set({
          [`result_${resultIndex}`]: {
            requestApiContent: apiContents ?? [],
            responseContent: chrome.i18n.getMessage("response_unexpected_response"),
            url: url,
            title: title
          }
        });

        try {
          sendResponse({
            ok: false,
            status: 1004,
            body: {
              error: {
                message: chrome.i18n.getMessage("response_unexpected_response")
              }
            }
          });
        } catch (sendError) {
          console.error("Failed to send error response:", sendError);
        }

        return;
      }

      // キャッシュ更新は best-effort
      if (response.ok) {
        try {
          const { responseCacheQueue } = await chrome.storage.session.get({ responseCacheQueue: [] });
          const responseCacheKey = JSON.stringify({ actionType, mediaType, taskInput, languageModel, languageCode, apiProvider });

          const updatedQueue = responseCacheQueue
            .filter(item => item.key !== responseCacheKey)
            .concat({
              key: responseCacheKey,
              value: {
                requestApiContent: apiContents,
                responseContent: responseContent
              }
            })
            .slice(-10);

          await chrome.storage.session.set({ responseCacheQueue: updatedQueue });
        } catch (cacheError) {
          console.error("Failed to update cache:", cacheError);
        }
      }

      // sendResponse は best-effort（popup は既に閉じている可能性あり）
      try {
        sendResponse(response);
      } catch (sendError) {
        console.error("Failed to send response:", sendError);
      }
    } else if (request.message === "keepalive") {
      sendResponse({ status: "alive" });
    }
  })();

  return true;
});
```

`1004` は既存の internal error code を service worker 内の未捕捉例外経路にも適用するものです。popup.js は変更せず、`getResponseContent()` が既存どおり `// A response error occurred` のルートに入り、popup には `Error: 1004` と `response_unexpected_response` が表示されます。results タブ側にも同じ `response_unexpected_response` を終端結果として保存するため、無限待機を防ぎつつ表示内容を揃えられます。

必要に応じて、ログ用途では `console.error(...)` に元の例外オブジェクトを渡し、ユーザー向けの表示文字列には詳細スタックを含めません。

この変更により、service worker 内の未捕捉例外が results タブ側の無限待機へ波及するのを防げ、かつ正常結果が事後処理の失敗で上書きされるリスクも抑えられます。

### 6. `extension/_locales/*/messages.json`（15ファイル）

`options_auto_save` の直後に `options_open_results_in_tab` キーを追加します。全15ロケールに翻訳を追加します（既存の `options_*` キーが全ロケールに翻訳されているため、同じ運用に従います）。

| ロケール | メッセージ |
| --- | --- |
| `ar` | `افتح النتائج دائمًا في علامة تبويب جديدة` |
| `bn` | `নতুন ট্যাবে সর্বদা ফলাফল খুলুন` |
| `de` | `Ergebnisse immer in einem neuen Tab öffnen` |
| `en` | `Always open results in a new tab` |
| `es` | `Abrir siempre los resultados en una nueva pestaña` |
| `fr` | `Toujours ouvrir les résultats dans un nouvel onglet` |
| `hi` | `परिणाम हमेशा नई टैब में खोलें` |
| `it` | `Apri sempre i risultati in una nuova scheda` |
| `ja` | `常に新しいタブで結果を開く` |
| `ko` | `항상 새 탭에서 결과 열기` |
| `pt_BR` | `Sempre abrir os resultados em uma nova aba` |
| `ru` | `Всегда открывать результаты в новой вкладке` |
| `vi` | `Luôn mở kết quả trong tab mới` |
| `zh_CN` | `始终在新标签页中打开结果` |
| `zh_TW` | `始終在新分頁中開啟結果` |

各 `messages.json` の `options_auto_save` エントリの直後に追加します。例（`en`）:

```json
    "options_auto_save": {
        "message": "Automatically save results after generation"
    },
    "options_open_results_in_tab": {
        "message": "Always open results in a new tab"
    },
```

## 動作確認項目

実装後、以下を確認します。

### 基本動作

#### 1. オプション無効時（デフォルト）

従来通りポップアップ内に結果が表示される。5秒後に
「Click here to view results in a new tab」リンクが表示される。
「Open results in a new tab」ボタンも機能する。

#### 2. オプション有効・キャッシュヒット時

ポップアップを開くと即座に新しいタブが開き、ポップアップが閉じる。
新しいタブにはキャッシュされた結果が即座に表示される。

#### 3. オプション有効・キャッシュミス時

ポップアップを開くと即座に新しいタブが開き、ポップアップが閉じる。
新しいタブではローディング表示の後、生成完了時に結果が表示される。

#### 4. オプション有効・「Run again」ボタン

ポップアップの「Run again」をクリックすると即座に新しいタブが開き、
ポップアップが閉じる。

#### 4a. オプション有効・タブ作成失敗時

`chrome.tabs.create` が失敗した場合、ポップアップは閉じずに既存の
ポップアップ表示フローにフォールスルーする。ストリーミングポーリング・
5秒タイムアウト・`await responsePromise`・`finally` ブロックが通常どおり
動作し、ポップアップ内に結果が表示される。キャッシュミスかつ `autoSave`
有効時は、catch で `autoSavePending_${resultIndex}` を削除するため、
results タブ側での重複保存は発生しない。

#### 5. `autoSave` と `openResultsInTab` の併用

両方を有効にしてキャッシュミスの初回生成を行うと、popup 側で
`autoSavePending_${resultIndex}` が設定され、結果タブの初期表示時に
`saveContent()` が一度だけ呼ばれる。保存後または保存失敗後に
`autoSavePending_${resultIndex}` が削除され、結果タブを再読み込みしても
重複保存されない。

キャッシュヒット時は `autoSavePending_${resultIndex}` が設定されず、
従来どおり自動保存されない。

#### 6. service worker 例外時

`generate` ハンドラ内部で例外が発生しても、results タブは無限待機せず
エラーメッセージ付きの結果を表示する。

#### 6a. `sendMessage` 即時 reject 時

service worker が未登録、メッセージチャネルが開けないなどで
`chrome.runtime.sendMessage` が即時 reject した場合、`responsePromise.catch`
が `result_${resultIndex}` にエラー結果を書き込むため、results タブは
無限待機せずエラーメッセージを表示する。このとき `requestApiContent` が
空配列で保存されるため、結果タブでは follow-up 入力欄と送信ボタンが
無効化される（4.3）。ユーザーは拡張機能アイコンをクリックしてポップアップを
開き直すことで再生成できる。

#### 6b. `sendMessage` 遅延 reject 時（運用受け入れ）

popup が `window.close()` で破棄された後に service worker がブラウザに
終了されるなどで reject した場合、`responsePromise.catch` は popup
コンテキスト消失で走らない。この場合 results タブは待機し続けるが、
タイムアウトは設けずユーザーがタブを閉じて対応する運用とする。

### ストリーミング

#### 7. オプション有効・ストリーミング有効時

新しいタブでストリーミング表示が逐次更新される
（`results.html` 側の `streamContent_${resultIndex}` ポーリングが機能する）。

生成完了後、`streamContent_${resultIndex}` が `initialize()` 末尾の
best-effort 削除で掃除され、result index 再利用時に古い途中経過が
再表示されない。`waitForResult()` 経由・スキップの両経路で削除される
ことを確認する。

### プロバイダ

#### 8. Gemini / OpenAI 両プロバイダ

`apiProvider` によらず上記1〜7の動作が同じになることを確認する。

### オプションページ

#### 9. オプションページ

チェックボックスのチェック状態が保存・復元される。
拡張再インストール後もデフォルト `false` で初期化される。

### Lint

#### 10. Lint

`npm run lint` がエラーなく通る。

## 注意事項・エッジケース

### ポップアップ UI へのアクセス

`openResultsInTab` 有効時、ポップアップは `main()` の開始直後に閉じるため、ポップアップ内の言語モデル・言語コードセレクタにアクセスできません。ユーザーは以下の代替手段で設定を変更できます:

- **言語モデル・言語コード**: オプションページ（`options.html`）で変更可能
- **フォローアップ時のモデル変更**: 結果ページ（`results.html`）の言語モデルドロップダウンで変更可能

これは「常に新しいタブで開く」という本オプションの字義通りの挙動であり、Issue #45 の要望に合致します。

### ポップアップを閉じた後の service worker 完走

ポップアップが `window.close()` で閉じられた後も、`chrome.runtime.onMessage` リスナー内の async IIFE（`service-worker.js:113`）は継続実行されます。成功時は既存どおり `result_${resultIndex}` が保存され、例外時も追加する catch でエラー結果が保存されます。`chrome.runtime.sendMessage` の返す Promise はポップアップの JS コンテキスト破棄と共に破棄されますが、`sendResponse` の失敗は service worker 側の終端結果保存に影響しません。

### service worker の寿命

長時間の生成において service worker が終了するリスクがありますが、`results.html` の keepalive ping（`results.js:393-399`、20秒間隔）が既存で存在するため追加対応は不要です。

ただし keepalive が効かず service worker が途中で終了した場合、`responsePromise` は遅延 reject します。popup は既に `window.close()` で破棄されているため `responsePromise.catch` も走らず、results タブは `waitForResult()` で待機し続けます。このケースはタイムアウトを設けず、ユーザーがタブを閉じて対応する運用とします（3.3a 節参照）。

### `chrome.tabs.create` のエラー

`chrome.tabs.create` は Promise 形式で `await` し、成功時のみ `openedInTab = true` にして `window.close()` + `return` します。失敗時は例外として catch に落ち、`autoSavePending_${resultIndex}` を削除した上で既存のポップアップ表示フローにフォールスルーします。これにより、タブ作成失敗時にポップアップが空表示かつ操作不能で残る復帰不能状態を防げます。

フォールスルー後は既存のストリーミングポーリング・5秒タイムアウト・`await responsePromise`・`finally` ブロックが通常どおり動作し、ポップアップ内に結果が表示されます。service worker は既に生成を開始しているため、`responsePromise` で結果を受け取れます。

`openedInTab` はタブ作成成功後にのみ `true` になるため、`finally` ブロックの `if (!openedInTab) { ... }` はタブ作成失敗時や通常経路でのみ処理を実行します。タブ作成に成功してポップアップが閉じられる場合は、不要な UI 更新・自動保存・コントロール有効化がスキップされます。

### `streamContent_${resultIndex}` の削除責務

`streamContent_${resultIndex}` は streaming 表示用の一時キーであり、producer / consumer の責務を分けて扱います。

- **生成開始前の削除**: 既存どおり producer 側（`utils.js` 内の `streamGenerateContent*()`）が行う
- **生成完了後の削除**: 最後まで読み切った consumer 側が行う
  - `openResultsInTab` が **無効**: `popup.js` が削除
  - `openResultsInTab` が **有効**: `results.js` が削除
- **`service-worker.js` では削除しない**: popup と results のどちらが最終 consumer かを判断できないため

この分担により、途中表示を壊さずに stale data の残留を防げます。

### `extractTaskInformation` の例外

`extractTaskInformation` が例外をスローした場合（コンテンツスクリプト注入失敗など）、catch ブロックに遷移し `content` にエラーメッセージが設定されます。この時点では `openedInTab` は `false` のため、finally ブロックは通常通りポップアップにエラーを表示します。新規タブは開かれません。これは適切な挙動です（抽出失敗時は生成の対象がないため）。

### YouTube 字幕取得の待ち時間

`extractTaskInformation` 内の YouTube 字幕取得（`popup.js:287-305`）は最大10秒かかる場合があります。この間ポップアップは開いたままです。`openResultsInTab` 有効時でも、タブは字幕取得完了後（`chrome.runtime.sendMessage` 送信後）に開かれます。これは避けられません — 字幕テキストがなければ生成リクエストを送信できないためです。

### 後方互換性

`openResultsInTab` が未設定の既存ユーザーは `INITIAL_OPTIONS` のデフォルト `false` が適用され、従来通りの挙動となります。`chrome.storage.local.get` のデフォルト値フォールバックにより、ストレージマイグレーションは不要です。

## 実装後の検証

変更後は必ず以下を実行してください。

```bash
npm run lint
```

`eslint` のエラーが出た場合は、本計画のコード例に従いつつ、既存コードのスタイル（必ずブレース `{}` を使用するなど）に合わせて修正します。

また、`apiProvider: "gemini"` および `apiProvider: "openai"` の両方で動作確認を行ってください。
