# save-bar ステータスメッセージのモバイル折り返し修正

## 背景

Android Firefox のモバイル表示（CSS viewport 幅 432px）で、オプション保存後の「保存しました」メッセージが Save ボタンの横ではなく下に表示される。

## 原因

`extension/css/options.css` の `.save-bar-inner` は `display: flex; flex-wrap: wrap` を使用している。`.save-status` の `flex-basis` が `16rem`（256px）に設定されているため、ボタン幅 + gap + flex-basis の合計がコンテナの利用可能幅を超え、折り返しが発生する。

### 計算（CSS viewport 432px の場合）

| 項目 | 幅 |
| --- | --- |
| `.save-bar-inner` 利用可能幅（432 - 2×1rem padding） | 400px |
| ボタン「オプションを保存する」（CJK 10文字 + padding） | ~186px |
| gap（0.75rem） | 12px |
| `.save-status` flex-basis（16rem） | 256px |
| **合計** | **~454px > 400px → 折り返し** |

### 該当箇所

`extension/css/options.css:231-237`:

```css
.save-status {
  flex: 1 1 16rem;
  min-width: 0;
  color: var(--nc-tx-2);
  font-size: .9em;
  overflow-wrap: anywhere;
}
```

## 変更方針

`flex-basis` を `16rem` から `10rem` に縮小する。

- `flex-grow: 1` は維持するため、同一行に収まる場合は空き領域を埋める挙動は変わらない。
- `10rem`（160px）は「保存しました」や英語の "Options saved." などの短いステータスメッセージが 1 行で収まる幅であり、かつボタン + gap と合計しても 400px 以内に収まる（~186 + 12 + 160 = 358px）。
- デスクトップ（max-width 900px コンテナ）では従来どおりボタン横に十分な幅で表示される。

代替案の `flex-basis: auto` は不採用とする。`auto` では折り返し判定がテキスト幅（フォントメトリクス）依存になり、中程度の長さのメッセージが 2 行目全体（ボタンの下）へ移動してしまうため、ステータスをボタンの右に表示し続ける本件の要件に合わない。固定 `rem` は折り返し閾値がロケール・フォントに依存せず決定的である。

## 対象ファイル

- `extension/css/options.css`

## 変更内容

```css
/* 変更前 */
.save-status {
  flex: 1 1 16rem;
  ...
}

/* 変更後 */
.save-status {
  flex: 1 1 10rem;
  ...
}
```

## 検証

1. `npm run lint` と `npm test` を実行し、既存テストが通ることを確認する。
2. 以下の viewport 幅で Save ボタンとステータスメッセージの表示を目視確認する:
   - 432px（Android Firefox、本事象の環境）: 同一行に表示されることを確認する（利用可能幅 400px > 358px）。
   - 375px（iPhone SE 相当）: 利用可能幅 343px < 358px のため同一行には収まらない。ステータスが 2 行目に折り返してもレイアウトが崩れない（ボタンが押し潰されない、オーバーフローしない）ことを確認する。
   - 720px（media query 境界）: 同一行に表示されることを確認する。
   - 1024px（デスクトップ）: 同一行に表示されることを確認する。
3. 長いステータスメッセージ（例: 永続警告 `options_save_required_for_host_permission`）が表示される場合も、2 行目以降に折り返してレイアウトが崩れないことを確認する。`#status`（一時表示）と `#persistentStatus`（永続警告）が同時に表示される場合も同様に確認する。
