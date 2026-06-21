# 常に新しいタブで開く機能の改善計画

## 背景・目的

`docs/PLAN_ALWAYS_OPEN_IN_TAB.md` で実装した「常に新しいタブで結果を開く」オプション（`openResultsInTab`）について、手動テストとレビューを通じて以下の改善課題が見つかった。

1. **結果スロットの再利用衝突**: 結果スロット数が10のままのため、11回目以降の生成で古い結果タブが新しい結果で上書きされ、表示が壊れる。本オプション有効時は毎回タブが開くため、衝突頻度が従来より高い。
2. **ポップアップが即座に閉じる**: service worker へメッセージ送信後ただちに `window.close()` するため、ユーザーが何が起きたか認識できない。
3. **タブがフォアグラウンドで開く**: 本オプション有効時はバックグラウンドで開き、ユーザーがポップアップ操作を継続できる方が自然。手動で「新しいタブで結果を開く」場合は引き続きフォアグラウンドが適切。

本計画では、これら3点を最小限の実装量で解決する。

## 設計決定の要約

| # | 項目 | 決定内容 |
| --- | --- | --- |
| 1 | 結果スロット数 | 10 → 20 に増加。`popup.js` の `% 10` を `% 20` に変更する1箇所のみ |
| 2 | スロット再利用時の古いタブクローズ | タブを作成する直前（`openResultsInTab` 有効時の自動オープン両パス、および手動の「新しいタブで結果を開く」ボタン・5秒タイムアウトのリンク）、セッションストレージに保存したタブIDを `chrome.tabs.remove` で閉じる。`chrome.tabs.query({ url })` は `"tabs"` 権限を要求するため使用せず、代わりにタブ作成時の戻り値 `Tab.id` をセッションストレージの単一キー `resultTabIds`（`{ [index]: tabId }` 形式）に保存して追跡する。追加権限不要（`chrome.tabs.remove(tabId)` は `"tabs"` 権限なしで利用可能） |
| 3 | ポップアップ自動クローズの猶予 | タブ作成成功後、`window.close()` の前に1秒の猶予を設ける。その間ポップアップの `#status` 要素に「結果を新しいタブで開いています。このポップアップはまもなく閉じます。」というメッセージを表示する |
| 4 | バックグラウンドタブオープン | `openResultsInTab` 有効時の自動タブ作成は `chrome.tabs.create({ url, active: false })` でバックグラウンド開。手動の「新しいタブで結果を開く」ボタン（`#results`）および5秒タイムアウトのリンク（`#results-link`）は従来どおりフォアグラウンド（`active` 省略＝デフォルト `true`） |
| 5 | i18n キー | `popup_opening_in_tab`（全15ロケールに追加） |
| 6 | manifest.json / firefox/manifest.json | 変更不要（追加権限なし） |

## 変更ファイル一覧

1. `extension/popup.js` — スロット数変更、古いタブクローズ処理、バックグラウンドタブオープン、ポップアップ自動クローズの猶予・メッセージ表示
1. `extension/_locales/*/messages.json`（15ファイル） — i18n 文字列 `popup_opening_in_tab` を追加

`extension/options.js`, `extension/options.html`, `extension/results.js`, `extension/service-worker.js`, `extension/manifest.json`, `firefox/manifest.json` は変更しない。

## 詳細な実装手順

### 1. `extension/popup.js`

#### 1.1 結果スロット数を 10 → 20 に変更（L357付近）

```js
  resultIndex = (resultIndex + 1) % 20;
```

`responseCacheQueue` の `.slice(-10)`（`service-worker.js:238`）はAPI応答キャッシュの件数制限であり、結果スロットのID管理とは独立している。結果スロットを20に増やしても連動させる必要はない。なお、セッションストレージ容量は両者で共有されるが、キャッシュキュー10件の占める割合は `result_*` / `conversation_*` 20件に比べて小さく、スロット増加分の容量インパクトが支配的であるため、今回は変更しない。必要に応じて `.slice(-5)` に削減することも検討可能。

#### 1.2 古いタブを閉じるヘルパー関数とタブID記憶ヘルパー関数を追加

`main()` の前に、以下の2つのヘルパーを追加する。自動オープン両パス（キャッシュヒット・キャッシュミス）および手動オープン（`#results` / `#results-link`）の全経路で共通利用する。

セッションストレージの単一キー `resultTabIds`（`{ [index]: tabId }` 形式のオブジェクト）に、各スロットが最後に開いたタブのIDを保持する。スロット数分のキーを増やさず、1つのオブジェクトに集約する。

```js
const closeStaleResultTab = async (index) => {
  const { resultTabIds = {} } = await chrome.storage.session.get({ resultTabIds: {} });
  const oldTabId = resultTabIds[index];

  if (oldTabId !== undefined) {
    try {
      await chrome.tabs.remove(oldTabId);
    } catch {
      // ユーザーが手動でタブを閉じている場合は無視
    }

    delete resultTabIds[index];
    await chrome.storage.session.set({ resultTabIds });
  }
};

const rememberResultTab = async (index, tabId) => {
  const { resultTabIds = {} } = await chrome.storage.session.get({ resultTabIds: {} });
  resultTabIds[index] = tabId;
  await chrome.storage.session.set({ resultTabIds });
};
```

`chrome.tabs.query({ url })` は `"tabs"` 権限を要求するため使用しない。代わりに `chrome.tabs.create()` の戻り値 `Tab.id` を `resultTabIds` に保存し、次回同じスロットを使う際に `chrome.tabs.remove(tabId)` で閉じる。`chrome.tabs.remove(tabId)` は `"tabs"` 権限なしで利用可能。ユーザーが手動でタブを閉じた後の `remove` エラーは try/catch で吸収し、`resultTabIds` からの削除だけ実行する。

#### 1.3 ポップアップ自動クローズの猶予付きヘルパー関数を追加

タブ作成成功後にメッセージを表示し、1秒後に `window.close()` するヘルパーを追加する。両パスで共通利用する。

```js
const closePopupWithNotice = () => {
  document.getElementById("status").textContent = chrome.i18n.getMessage("popup_opening_in_tab");
  setTimeout(() => {
    window.close();
  }, 1000);
};
```

#### 1.4 キャッシュヒット時のタブオープン処理を変更（L411付近）

`openResultsInTab` ブロックを以下のように変更する。

```js
      if (openResultsInTab) {
        try {
          await closeStaleResultTab(resultIndex);
          const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${resultIndex}`), active: false });
          await rememberResultTab(resultIndex, tab.id);
          openedInTab = true;
          closePopupWithNotice();
          return;
        } catch (error) {
          console.error("Failed to open results tab:", error);
        }
      }
```

変更点:

- `closeStaleResultTab(resultIndex)` で同じスロットの古いタブを閉じる
- `chrome.tabs.create()` の戻り値 `tab.id` を `rememberResultTab()` で `resultTabIds` に保存
- `active: false` でバックグラウンド開
- `window.close()` を `closePopupWithNotice()` に置き換え

#### 1.5 キャッシュミス時のタブオープン処理を変更（L477付近）

`openResultsInTab` ブロックの `chrome.tabs.create` 部分を以下のように変更する。

```js
        try {
          await closeStaleResultTab(resultIndex);
          const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${resultIndex}`), active: false });
          await rememberResultTab(resultIndex, tab.id);
          openedInTab = true;
          closePopupWithNotice();
          return;
        } catch (error) {
          console.error("Failed to open results tab:", error);
          await chrome.storage.session.remove(`autoSavePending_${resultIndex}`);
        }
```

変更点はキャッシュヒット時と同じ4点。

#### 1.6 手動の「新しいタブで結果を開く」ボタンも古いタブを閉じる

`#results` ボタン（L623付近）と `#results-link`（L629付近）のクリックハンドラは、従来どおりフォアグラウンド（`active` 省略）でタブを開き、即座に `window.close()` する。これらはユーザーが明示的に操作したものであり、フォアグラウンドで開くのは自然なため変更しない。ただし、スロット再利用時の衝突は手動オープンでも発生するため、タブ作成前に `closeStaleResultTab(resultIndex)` を呼び出して同じスロットの古いタブを閉じ、作成後に `rememberResultTab(resultIndex, tab.id)` でタブIDを保存する。

```js
document.getElementById("results").addEventListener("click", async () => {
  await closeStaleResultTab(resultIndex);
  chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${resultIndex}`) }, async (tab) => {
    if (tab && tab.id !== undefined) {
      await rememberResultTab(resultIndex, tab.id);
    }
    window.close();
  });
});

document.getElementById("results-link").addEventListener("click", async () => {
  await closeStaleResultTab(resultIndex);
  chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?i=${resultIndex}`) }, async (tab) => {
    if (tab && tab.id !== undefined) {
      await rememberResultTab(resultIndex, tab.id);
    }
    window.close();
  });
});
```

変更点:

- `closeStaleResultTab(resultIndex)` で同じスロットの古いタブを閉じる
- `chrome.tabs.create()` のコールバックで `tab.id` を `rememberResultTab()` に保存
- `active` は省略（フォアグラウンド）のまま変更しない
- `window.close()` の即時実行も変更しない

### 2. `extension/_locales/*/messages.json`（15ファイル）

`popup_taking_long` の直後に `popup_opening_in_tab` を追加する。

#### en

```json
    "popup_opening_in_tab": {
        "message": "Opening results in a new tab. This popup will close shortly."
    },
```

#### ja

```json
    "popup_opening_in_tab": {
        "message": "結果を新しいタブで開いています。このポップアップはまもなく閉じます。"
    },
```

#### その他13ロケール

各ロケールの文脈に合わせて翻訳を追加する。翻訳は AI コーディングエージェントが行い、各 `messages.json` の `popup_taking_long` の直後に挿入する。

## 検証項目

- `openResultsInTab` 無効時は従来どおりポップアップ内に結果が表示される
- `openResultsInTab` 有効・キャッシュヒット時、バックグラウンドでタブが開き、ポップアップにメッセージが表示された後1秒で閉じる
- `openResultsInTab` 有効・キャッシュミス時、バックグラウンドでタブが開き、ポップアップにメッセージが表示された後1秒で閉じる。結果タブは `waitForResult()` で結果を待機し、service worker が完了次第表示する
- スロットが再利用される際（21回目以降の新規生成、または手動で同じスロットのタブを開く場合）、自動・手動のどちらでも古い結果タブが閉じられてから新しいタブが開く
- 手動の「新しいタブで結果を開く」ボタンはフォアグラウンドで開く
- 5秒タイムアウトのリンクもフォアグラウンドで開く
- `npm run lint` が通る
- `apiProvider: "gemini"` / `apiProvider: "openai"` 両方で動作する
