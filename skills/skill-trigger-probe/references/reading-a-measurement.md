# Reading a measurement

The result is a JSON file and a Markdown file beside it. The Markdown is the summary; the JSON holds
every run. Only query **ids** are written, never the query texts: a result file is committed, and a
committed query is a question somebody will tune a description to.

## The fields that decide

| Field | What it means |
| --- | --- |
| `status` | `triggered`, `not-triggered` or `broken` |
| `reason` | why a broken run was broken, one of `spawn-error`, `timeout`, `no-init`, `no-result`, `auth`, `not-loaded` |
| `fired` | every skill a `Skill` tool call invoked, in order — the skill under test or a sibling |
| `valid` | the runs of a query that were not broken |
| `rate` | triggered divided by `valid`; null when no run was valid |
| `passed` | a positive passes at a rate of 0.5 or more, a negative below 0.5; a null rate never passes |
| `incomplete` | fewer valid runs than runs asked for |
| `near-threshold` | a rate between 0.25 and 0.75 with fewer than six valid runs |

## Why broken is its own answer

A measuring instrument fails silently. A probe that reads the exit code alone, or the result's
`subtype` alone, reports a session that never reached a model as a skill that did not fire — and then
somebody rewrites a description that was never the problem. Two shapes to know:

- a run that used any tool under `--max-turns 1` ends with `subtype: "error_max_turns"` and **exit
  1**, and is a valid measurement;
- a run without credentials ends with `subtype: "success"`, `is_error: true` and
  `terminal_reason: "api_error"`, and measured nothing.

So: a rate is computed over `valid` runs, broken runs are counted by reason, and a measurement with
any broken run says `incomplete` and exits 2.

## What to do with a number

- **Rate 1.0 on the positives, 0.0 on the negatives.** Nothing to do.
- **A positive at 0.33 with three runs.** Re-measure with six or more runs first. The flag is there
  because three runs cannot separate a third from a half.
- **A positive at 0, `fired` empty.** The description lacks the words a user would say. Add them, in
  every language your users write in.
- **A positive at 0, `fired` naming a sibling.** The sibling's description overlaps. Say what this
  skill is *not* for and name the sibling; then measure both.
- **A negative above 0.5.** The description claims too much. Narrow it, and keep the near miss named.
- **Any broken run.** Fix the instrument and measure again. Do not report the rate.

## What a measurement does not survive

Editing the description. The rate belongs to one wording, one model and one set of siblings; change
any of them and the number is a number about something else. Keep the result file, record the
version it measured, and measure again.
