# Bus memory — agent-skills-with-evals

**This is a complement, not a summary.** Anything in PROGRESS.md, BUS-LOG.md or the goal brief does not
belong here. When a later measurement corrects an entry, come back and rewrite it. Marks: 🆕 new ·
✅ verified · 🔴 warning · ~~struck~~ no longer true.

## Environment facts across goals

- 🆕 Measured while the pack was written (2026-10-02; facts.md F1–F22): Node `v24.19.0`; pnpm
  `11.28.0` selected by `packageManager` (global 11.22.0, corepack not enabled); bash 5.0.17, git 2.25.1,
  jq 1.6; `rg` on the run's `PATH`; Claude Code 2.1.233 (shared, never updated).
- 🆕 Ports 18450–18459 were free; the mocks use 18451–18453 on 127.0.0.1. Other services listen on this
  machine and must not be touched.
- 🆕 The proxy variables are set and bypass 127.0.0.1. Nobody unsets or prints them. An arm's tools see
  them (F10), which is why the A/B runner redacts their values.
- 🆕 The CLI does not pass its credential to the tools of a session (F9): every nested `claude` of this
  run authenticates through `CLAUDE_CALL_ENV_FILE`, which only the launcher sources, in a child shell.
  Nobody opens that file.
- 🆕 The run uses its own Claude configuration directory, so no user-level skills, memory or MCP servers
  are loaded. The CLI's own skills are always listed (F7) and are siblings in every probe.

## Doubts to re-check

## The worker's habits

## Proven along the way — later goals may cite

## What the bus verified itself

## Rulings the bus made

## Watch closely

- 🔴 A broken run is not a negative result. The no-credentials sample says `subtype: "success"` (F8);
  a classifier that trusts `subtype` or the exit code turns a broken measurement into "the skill never
  triggers" — the failure the author's practice met.
- 🔴 Every `claude` runs outside the repository: this repository holds the run's Stop hooks, and the
  evidence gate does not tell sessions apart.
- 🔴 Nobody tunes to the test: `trigger.json` and `evals.json` are given; descriptions are written from
  the skill's purpose and frozen once measured (sha256 in AC-38).
- 🔴 The mocks follow the recorded shapes (F16–F19), not documentation from memory: `committed` has no
  `created_at`, `reviewed` has `submitted_at` and a lower-case state, `updated_at` moves with planning.
- 🔴 The digest's expected outcome is the table of SCOPE.md, computed independently (F20). A test that
  expects what the code happens to produce is the wrong way round.
- 🔴 Several A/B assertions encode the skills' own rules; the README must say what a difference shows
  and what it does not, and must not claim more than one or two runs per arm can carry.
- 🔴 Live calls cost usage: one measurement at a time, only those listed; at most one live probe query
  per review for the bus.
