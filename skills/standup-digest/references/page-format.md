# The page

Japanese without politeness markers: it is read aloud, standing up.

```
**<milestone>（<M/D>まで・残り <n> 日）｜ 未完了 <open>/<all> ｜ 前マイルストーン残 <k> ｜ <MM/DD HH:MM> 計測**

## 今日決めること（<N>）
1. **#<n> <assignees or 担当なし> ― <question>**
   <title, 40 characters at most> ｜ <facts> ｜ <what it is waiting for>

## それ以外の未完了（<M>）
🔴 <a> ・ 🚧 <b> ・ 💤 <c>
| # | 担当 | 状態 | 直近の動き |
|---|---|---|---|

- ✅ 昨日から完了 <n>：#… ／ 🆕 追加 <n>：#…
- 🙊 発言不要（<n>）：#…
- ⏸️ 14 日以上動きなし（<n>）：#…（前マイルストーン残）
- ⚠️ 不備：担当なし <n>（#…）・ラベル矛盾 <n>（#…）

---
計測 <ISO 8601> ／ <repo> ／ facts <first 8 hex of the sha256 of facts.json> ／ 自動生成。判断は人が行う
```

## The rules of the page

- `残り <n> 日` is the due date in the configured zone minus `today`. `未完了` counts the current
  milestone; `前マイルストーン残` the carry-over items.
- The decisions come in score order. `<facts>` are machine-made and joined with `・`:
  `待ち <d> 日`, `PR #<n> レビュー待ち <d> 日`, `前マイルストーンから持ち越し`, `担当なし`,
  `依存 <k> 件未完了`.
- `<question>` and `<what it is waiting for>` come from the accepted narrative. Without one, the
  question of the first trigger in the order carryover → waiting → review → unassigned, and that
  trigger's fixed phrase, which does not repeat the facts: `前マイルストーンで終わらなかった`,
  `待ち状態のまま`, `レビューの結論待ち`, `担当者が決まっていない`.
- No decision at all: the line `今日決めることはない。` under the heading.
- The table holds the open items that are neither decisions, quiet nor silent: 🔴, then 🚧, then 💤,
  by number within a lane. `直近の動き` is the narrative's one-liner, or the machine's — the kind and
  date of the latest activity, for example `コメント 10/03`.
- 発言不要 lists the quiet items that are not decisions; ⏸️ the silent ones, a carry-over item
  followed by `（前マイルストーン残）`.
- **Every open tracked item appears exactly once** among the decisions, the table, 発言不要 and ⏸️.
  The ✅ line lists events and the ⚠️ line hygiene; those may repeat a number.
- A line with nothing to say is left out.
- "Since yesterday" is the 24 hours before `now`, or 72 hours on a Monday, in the configured zone.
  🆕 lists the items created in that window, ✅ the items closed in it.
- With feedback comments, a section `💬 前日までのコメント` before the rule: up to five comments, then
  each accepted note as `（AI）<note>`.
- Degraded mode, meaning no accepted narrative: under the decisions' heading the line
  `本日は自動要約なし（<reason>）。以下は機械判定のみ。`
