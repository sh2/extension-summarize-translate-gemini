# ポップアップのリサイズループ修正

## 背景

最新の Chrome で拡張機能のポップアップを開くと、ウィンドウが小刻みにリサイズを繰り返し、操作不能な状態に陥る。`@media (max-width: 639px)` のメディアクエリーが契機になっていると報告された。

また、Firefox for Android ではポップアップが画面の横幅に収まらず、左右にスワイプしないと本文が読めない状態になった。

## 原因

`extension/css/common.css` に以下のルールが存在した。

```css
body {
  width: 640px;
}

@media (max-width: 639px) {
  body {
    width: 84%;
  }
}
```

Chrome のポップアップはコンテンツ幅に合わせて自動リサイズされる。このため、ビューポート幅に依存するパーセント幅（`width: 84%`）が正のフィードバックループを引き起こす。

### ループのメカニズム

1. `body { width: 640px }` によりポップアップが 640px 幅で開く。
2. コンテンツが縦に長いと縦スクロールバーが出現し、ビューポート幅が 640px 未満（例: 625px）になる。
3. `max-width: 639px` のメディアクエリーが発動し、`body` がビューポート幅の 84% に縮む。
4. ポップアップが縮んだ `body` に合わせて自動リサイズされ、ビューポート幅がさらに縮む。
5. 縮んだビューポートでもメディアクエリーは発動し続けるため、`body` がさらに 84% に縮む。
6. 以降 4〜5 を繰り返し、ウィンドウが小刻みに縮み続けて操作不能になる。

### 旧実装との違い

コミット `e2ee3b0` 以前は `adjustLayoutForScreenSize()` が `header.clientWidth < 640` を判定して `body.narrow` クラスを付与する方式だった。JS による一度きりの判定のため、縮んでも安定していた。一方、メディアクエリーはブラウザが継続的に評価するため、ループが止まらない。

## 原因（Firefox Android の横あふれ）

`new.min.css` は `body { padding: 2rem; }` を指定するが、`box-sizing` は `button` / `input` / `select` / `textarea` にのみ個別適用され、`body` には適用されない（`box-sizing: content-box` のまま）。

`extension/css/common.css` の `body` は以下だった。

```css
body {
  width: 640px;       /* コンテンツ幅 */
  max-width: 100%;    /* コンテンツ幅をビューポート幅でキャップ */
  padding: 2rem;      /* 32px × 2 = 64px が上乗せ */
}
```

`content-box` では `width` / `max-width` はコンテンツ幅を指すため、総幅は `min(640px, 100%) + 64px` になる。

Firefox for Android ではポップアップは「ブラウザウィンドウを覆うオーバーレイ」として開き、`<meta name="viewport" content="width=device-width">` によりレイアウトビューポートは端末幅（例: 432px）になる。すると `max-width: 100%` はコンテンツ幅を 432px にキャップするが、パディング 64px が加算されて総幅が 496px になり、ビューポートを 64px はみ出す。`margin: 0 auto` で中央寄せのため左右 32px ずつ画面外に出て、左右にスワイプしないと本文が読めなくなる。

`box-sizing: border-box` を指定すると `width` / `max-width` がパディング込みの総幅を指すようになり、`min(640px, 100%)` がそのまま総幅になるため、横あふれが解消される。この方針は `extension/css/options.css` の `body` が `box-sizing: border-box` を使用して Android で正常動作している実績に一致する。

## 変更方針

ループの真因は「パーセント幅（`width: 84%`）」である。ポップアップ自身のビューポート幅に比例して縮む指定は、自動リサイズと組み合わさると発散する。

一方、`max-width: 100%` は「固定幅だがビューポートより広くしない」という収束する制約のため、ループしない。デスクトップでは固定幅を維持し、Firefox for Android など画面幅が固定幅未満の環境では横あふれを防ぐ。

さらに、`box-sizing: border-box` を `body` に指定し、`width` / `max-width` をパディング込みの総幅として扱う。これにより `min(704px, 100%)` がそのまま総幅となり、Firefox for Android の狭い画面でも横あふれしない。

最終的な幅は、popup と results の両方で「コンテンツ幅 640px」を揃えるため、総幅 704px（コンテンツ 640px + 左右パディング 64px）とした。

- `extension/popup.html` / `extension/results.html` の `@media (max-width: 639px)` 内の `display: block` のみの指定は幅を変えないため安全であり、狭幅時のボタン縦積み用として維持する。
- `extension/results.html` はタブで開くページのため自動リサイズされず、`width: calc(84% + 4rem)` のメディアクエリーは従来どおり安全である。

## 対象ファイル

- `extension/css/common.css`
- `extension/popup.html`
- `extension/results.html`

## 変更内容

### `extension/css/common.css`

```css
/* 変更前 */
body {
  width: 640px;
}

@media (max-width: 639px) {
  body {
    width: 84%;
  }
}

/* 変更後 */
body {
  /* 640px content + 2rem (64px) horizontal padding = 704px total (border-box) */
  width: 704px;
  max-width: 100%;
  box-sizing: border-box;
}
```

`box-sizing: border-box` により `width` はパディング込みの総幅を指す。`704px` は「コンテンツ幅 640px + 左右パディング 64px」で、popup と results の両方に適用される。

### `extension/results.html`

タブで開くページのため、既存のメディアクエリーでモバイル時の表示幅を維持する。`box-sizing: border-box` のまま最初のバージョンと同じ「コンテンツ幅 = ビューポートの 84%」を実現するため、`width: calc(84% + 4rem)`（4rem = 左右パディング合計 64px）を使用する。

```css
@media (max-width: 639px) {
  body {
    /* border-box: 84% content + 4rem horizontal padding = total width */
    width: calc(84% + 4rem);
  }

  body select,
  body #clear,
  body #copy,
  body #attach-image-button,
  body #send {
    display: block;
  }
}
```

### `extension/popup.html`

`common.css` の `body { width: 704px }` をそのまま使用するため、ポップアップ専用の幅上書きは行わない（一時的に 800px に拡大した上書きは、ユーザビリティ試験後に削除）。

```html
<style>
  @media (max-width: 639px) {

    body select,
    body #copy,
    body #results {
      display: block;
    }
  }
</style>
```

`display: block` のみのメディアクエリー（`select` / `#copy` / `#results`）は幅を変えないためループに影響しない。

## 検証

1. `npm run lint` と `npm test` を実行し、既存テストが通ることを確認する。
2. 以下の環境で目視確認する:
   - 最新 Chrome: 長い要約結果・大きいフォントでポップアップを開き、幅が連続的に変わらないこと。
   - Firefox Desktop: 同条件で幅が安定すること。
   - Firefox Android: 横スクロールせず、画面幅に収まること。
   - results の narrow 表示: 最初のバージョンと同じ左右余白（ビューポートの 8%）になること。

## 参考

- MDN Popups（Popup resizing）: Firefox のポップアップはコンテンツに合わせて自動リサイズされるが、「画面に収まる場合に限り」最大 800x600 まで。
- `docs/archive/PLAN_SAVE_STATUS_MOBILE_WRAP.md`: Android Firefox の CSS viewport 幅（432px）の記録。
- コミット `e2ee3b0`: `adjustLayoutForScreenSize` の削除とメディアクエリーへの置き換え。
