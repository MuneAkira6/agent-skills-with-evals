---
name: standup-digest
description: Builds a stand-up page from a GitHub repository's current milestone: rules decide the lanes, what has to be decided today and in which order, from the timeline of each item rather than from updated_at, which a planning session moves for everything at once. A language model only writes the short sentences, behind a guard, and an unchanged input reuses yesterday's accepted text without a call. Use it to prepare a daily stand-up or a sprint check from issues and pull requests, to find what is stuck waiting or waiting for review, or to see who is blocked and what nobody needs to talk about. Also when the ask sounds like: 朝会用のまとめを作りたい、今日決めることを洗い出したい、レビュー待ちや待ち状態の課題を知りたい、動きのない課題を見つけたい; 生成每日站会摘要、找出今天要决定的事项、查出等待评审或被阻塞的任务. Not for validating a SKILL.md or measuring how often a skill triggers — that is skill-trigger-probe. Not for saving a tracker issue and its attachments as Markdown — that is verifiable-fetch. It reads a repository and writes a page; it changes nothing.
license: MIT
---

# standup-digest

One page for the stand-up, written from the rules. **The table is the product.** A language model
fills in short phrases when it can, and the page reads the same when it cannot.

## 1. Run the pipeline

```
node .claude/skills/standup-digest/scripts/digest.ts preview --repo owner/name
```

```
node .claude/skills/standup-digest/scripts/digest.ts collect-only --repo owner/name
```

`collect-only` makes no model call at all: use it to check the rules, in a review or in CI.
`preview` adds the narration — one call, behind a guard, reused when the input has not changed.

Other options: `--api URL` for another GitHub endpoint, `--milestone N` to pick the milestone
yourself, `--now ISO` to ask what the page looked like at a moment, `--out DIR`, `--config FILE`,
`--model MODEL`, `--feedback-issue N` for the issue whose comments are yesterday's instructions.

Exit 0 a page was written (the last line names it), 2 the collection failed and no page exists,
3 a usage error. `GITHUB_TOKEN`, when set, is sent and never printed.

It writes `facts.json` (everything the rules decided), `digest.md` (the page), and in `preview` also
`narrate-input.json`, `prompt.md`, `usage.jsonl` and `DATE/narrative.json` with its hash.

## 2. Read the page, then talk

- **今日決めること** is the only part that asks for a decision. Its order is the score, not an
  opinion, and its length is whatever the rules gave — a day with nothing to decide says so.
- **それ以外の未完了** is for awareness: 🔴 waiting, 🚧 in progress, 💤 stale.
- **発言不要** is permission to stay silent. An item with nothing new is named and skipped.
- **⏸️ 14 日以上動きなし** is a list of numbers on purpose. An item nobody has touched for two weeks
  does not belong in a five-minute conversation; it belongs in a separate decision about the backlog.
- **⚠️ 不備** is for the board, not the people: an item with no assignee, or with two labels that
  contradict each other.

## 3. What you may and may not change

The comment window of `--feedback-issue` is where tomorrow's instructions go. **You may change how
the page is written; you may not change what it says.** A request to leave an item out, to raise one
up the list or to soften a day count is a request to change the rules — bring it to the
configuration, not to the narration.

## Why the rules are what they are

**`updated_at` is not activity.** A planning session moves every leftover at once, and every
`updated_at` with it. An item nobody has touched for three weeks then looks fresh. So activity is
read from the timeline: comments, commits, reviews, state changes, status labels — and not milestone
moves, assignments or any other label.

**A model that writes the table writes a different table every day.** The value of a stand-up page
is that the same data gives the same page. So the rules decide and the model only phrases, behind a
guard that drops a sentence carrying a number nobody can find, a link, a handle or anything secret.

**The same stall is not counted twice.** An item waiting for an answer *and* for a review is one
stall measured two ways; the score takes the larger, not the sum. An item that has been waiting for
two months is discounted, because the stand-up has had many chances at it already.

**A person who is not at the stand-up cannot decide.** An item assigned outside the members list
stays in the table and out of the decisions.

Details in `references/rules.md` and `references/page-format.md`.
