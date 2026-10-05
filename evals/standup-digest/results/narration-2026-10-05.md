# Narration measurements — 2026-10-05

Measured on the host by the goal-bus run, with real `claude` calls through
`pnpm digest:demo -- --mode preview`, which starts the mock GitHub API in-process on a free port and
runs the pipeline against it.

- date: 2026-10-05 (UTC)
- model requested: `sonnet` — resolved: `claude-sonnet-5` (the `modelUsage` keys of every call are
  `["claude-haiku-4-5-20251001","claude-sonnet-5"]`; the resolved model of the session is the first
  one the init event names, and the haiku entry is the CLI's own small-model usage)
- Claude Code: 2.1.233
- runs: 2 per setting, each into a **fresh** output directory so that no run could reuse another's
  accepted narrative
- the dollar figures are the CLI-reported `total_cost_usd` (API-equivalent, not money spent)

## The reuse (AC-46)

| run | outcome | wall clock | calls | usage.jsonl lines |
| --- | --- | --- | --- | --- |
| first, fresh directory | `narrative: accepted` | 11 s | 1 | 1 |
| second, same directory | `narrative: reused` | 1 s | 0 | 1 |

The second run made no call: the input hash matched the `narrative.sha` the first run had written,
which is written only when the guard has accepted.

The accepted call's `usage.jsonl` line, as written:

```json
{"date":"2026-10-05","attempt":1,"models":["claude-haiku-4-5-20251001","claude-sonnet-5"],"input":1,"cache_creation":1705,"cache_read":0,"output":469,"thinking":0,"duration_ms":9434,"total_cost_usd":0.019249,"outcome":"accepted"}
```

So the five narration calls of this run cost 0.019249 (this one) plus 0.0091205, 0.0096055, 0.0189190
and 0.0100855 (the four below) = **0.0670** USD, which is the figure the ledger quotes.

## Thinking off against the default (AC-47)

Two calls with the pipeline's default, which sets `MAX_THINKING_TOKENS=0` for that one process, and
two with `DIGEST_THINKING_TOKENS=default`, which leaves the variable unset.

| setting | call | output tokens | thinking tokens | cache creation | cache read | duration (ms) | cost (USD) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `MAX_THINKING_TOKENS=0` (default) | 1 | 441 | 0 | 0 | 1705 | 6904 | 0.0091205 |
| `MAX_THINKING_TOKENS=0` (default) | 2 | 475 | 0 | 0 | 1705 | 7080 | 0.0096055 |
| `DIGEST_THINKING_TOKENS=default` | 1 | 446 | 0 | 1705 | 0 | 7062 | 0.0189190 |
| `DIGEST_THINKING_TOKENS=default` | 2 | 507 | 0 | 0 | 1705 | 7712 | 0.0100855 |

All four calls were accepted by the guard on their first attempt.

**No conclusion is drawn from these four numbers, and none can be.** Two calls per setting cannot
separate a difference from the ordinary spread of one model's answers: the four output counts are
441, 475, 446 and 507, and the two groups overlap. The thinking count is 0 in all four, including the
two where the variable was left unset — on this prompt the model did not think whether or not it was
allowed to, which is consistent with fact F14's measurement on a trivial prompt and says nothing
about a longer one. The cost column moves with whether a call paid for a cache creation of 1,705
tokens or read one, not with the setting: exactly one of the four paid for a creation — the first
call with the variable left unset — and that one cost 0.0189 against 0.0091 to 0.0101 for the three
that read a cache. The reading that fits is that the two settings produce different requests and so
different cache entries, and the first call under the new setting had to create one; two calls per
setting cannot confirm even that.

## What the narration is for

The accepted narrative replaces the machine's fixed phrases and nothing else. With it, the page reads
`1. **#206 yui-kato ― このまま待つか催促するか**` over
`API のタイムアウト設定を見直す ｜ 待ち 20 日 ｜ 返答待ちが20日続いている`; without it,
`催促するか外すか` and `待ち状態のまま`. The seven decisions, their order and every day count are the
rules' in both cases.
