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

- 🔴 **An empty agreement key counts as agreement.** `runsAgree` is `new Set(keys).size === 1`, so two
  runs that produced nothing agree. It shows as `yes` for `preview-zh/without` in the committed
  benchmark. Until the artefact distinguishes it, do not let any README sentence rest on that column.
- 🔴 **The contamination scanner still flags API-route labels.** G1 fixed URLs with a scheme; a route
  written as prose or in `echo "== /repos/acme/tasks/issues =="` has no scheme, so the absolute-path
  pattern matches it. Five of G4's fourteen flags are this class. Any count of "flags" in the README
  must be broken down, or it reads as fourteen sandbox escapes.
- 🆕 **AC-49's narration component is only half traceable**: `narration-2026-10-05.md` lists the four
  thinking-comparison costs (0.0477) but not the AC-46 accepted call, so the stated 0.0670 cannot be
  reconstructed from the committed files.

- 🆕 **`scoreOf` carries two test-only switches** (`chronicDiscount`, `sumInsteadOfMax`) in the shipped
  skill, because AC-29's controls are counterfactual numbers rather than planted violations. The default
  path is pinned (I broke it and five tests went red), so this is a tidiness question, not a correctness
  one: G5's AS-BUILT should either document them as the evaluation's own switches or move them out.
  Note that `chronicDiscount: false` is a supported option on a rule the contract fixes.
- 🆕 **The page's footer hash follows `facts.json`, so it moves with the page size** (`facts 4c0046df`
  at `maxPerPage` 100, `e16789ab` at 3) although every fact a reader cares about is identical. Correct by
  contract; worth one sentence in G5's limits so nobody reads the hash as a content fingerprint.

- 🔴 **Three of the fetcher's six failure reasons have no test** (carried into G3): `signature mismatch`,
  `too many redirects`, `network: <code>`. I proved all three behave as SCOPE.md words them —
  `signatureMatches` returns true for PNG bytes under `image/png`, false for JPEG bytes, false for a
  short body, null for an unknown type and true with a `; charset=` suffix; a server that redirects six
  times gives `FAIL loop.png: too many redirects`; mismatched bytes give
  `FAIL wrongtype.png: type image/png: signature mismatch`; a closed port gives
  `issue 900: network: ECONNREFUSED` and exit 2 — so this is a missing guard, not a defect. The given
  fixtures cannot produce any of the three, which is why no row asked for them. If G3 does not add them,
  carry it to G4 and say so in the AS-BUILT.
- 🆕 **`run.json` records the issued token values, not a count.** Literal compliance with SCOPE.md ("the
  tokens the media host issued"), and M3/M5 need them to be decidable after the mock is gone. The
  consequence to state in G4's results and G5's limits: a transcript has `token=` redacted while
  `run.json` keeps the values, and a reader who points this skill at a real tracker would persist real
  signed-URL credentials into committed results. These are dummies from an ephemeral mock.

- 🆕 **The pin is not reproducible by me, and will not be.** The brief's fingerprint covers the whole
  working tree, which includes the bus's own `BUS-LOG.md`, `BUS-REVIEWS.md` and `BUS-MEMORY.md` — they
  change on every review. G1's pin `7362aa94f24b` is therefore unverifiable; I checked the mtimes instead
  (newest code file `SKILL.md` 08:56:22, `PROGRESS.md` 09:00:13, so code was frozen before the ledger
  closed). I have asked for a second, deliverables-only digest beside the prescribed line; once it exists,
  recompute it every review.
- 🆕 **`checkLoaded: false` in the A/B runner** (harness/ab.ts) switches off the parser's `not-loaded`
  rule for both arms. Necessary for the `without` arm, but it means a `with` arm whose skill silently did
  not load reads as `completed` — in G4 that is the difference between a measurement and a mirage. I asked
  for it to be recorded under "Contract changes" and for a `skillInInit` observation in `run.json`. In G4,
  check that field on every `with` arm before believing any A/B number.

- 🆕 **E5's live pair is the worker's observation alone.** I did not re-run the sourced / plain `claude`
  calls of G0 (cost, and the one-measurement-at-a-time rule). Their quotations agree with F8 and F9 to the
  word, and F9's mechanism is re-proven by every nested call of G1–G4 — so if a later goal's launcher
  cannot authenticate through `CLAUDE_CALL_ENV_FILE`, re-open E5 rather than the launcher first.
- 🆕 **The samples never exercise `auth` against `not-loaded`.** In `no-credentials.jsonl` the skill under
  test (`tea-timer`) *is* in the init event's `skills` (17 entries; `schedule` is the one missing against
  the other host samples' 18), so that sample reaches `auth` on its own merit. The classification order
  of SCOPE.md (auth before not-loaded) is therefore unproven by the fixtures: G1 must build a stream that
  is both, on the fake CLI, or say that it did not.

## The worker's habits

- ✅ **It finds its own unfalsifiable checks.** G2's AC-19 note records that the media host first logged
  `apiKey: false` unconditionally, which would have made "no media request carries the key" impossible to
  fail; it fixed the mock. That is the standard this run is held to, and it set it itself.
- 🔴 **Operational incidents reach me in prose but not always the ledger.** The ten-minute hang of G2
  (backgrounded `pnpm mock:tracker`, `wait` on the pnpm wrapper, a stray `askev-g2-cli.log` the kill left
  behind) was reported in the message and is in no table. The G1 CLI accident was recorded properly as
  finding 2, so the habit exists — ask for it when it slips.

- 🆕 **G0: accurate to the character, and it volunteers the inconvenient half.** Every number I recounted
  (six PNG sizes and sha256, 4/10, 4/22, 6 samples, 20/10 × 3, 3 and 2 evals, 21 help option lines,
  `Checked 3 files`, the port line, `git status --short`) came out exactly as the ledger quotes it. It
  raised the devDependency drift itself rather than letting an F2 comparison slide, and wrote F23 plus a
  Superseded box without being told. Treat its quotations as reliable; spend the review budget on
  *reasoning* — classification order, controls that cannot fail, a rate computed on the wrong denominator
  — rather than on re-counting.
- 🔴 **It describes its own fix more tidily than the code does it.** The G1 incident note says "every
  direct launcher call in a test now goes through `launchFake`"; in fact only `ab.test.ts` does.
  `launcher.test.ts` and `broken-reasons.test.ts` still call `launchClaude` directly, protected by
  `withEnv` setting `CLAUDE_BIN` and removing `CLAUDE_CALL_ENV_FILE` — equivalent in effect, but not the
  guard the note claims, and the hard refusal does not cover them. Read the code behind a remediation
  claim, not the claim.
- 🆕 It reads a given file with `jq` for counts only (E3 quotes counts and eval ids, never a query's text).
  Keep it that way: AC-12's description must be written without reading `trigger.json`'s queries.

## Proven along the way — later goals may cite

- ✅ **G4's numbers, recomputed by me and safe to quote in the README**: trigger positives 8/10
  (skill-trigger-probe), 9/10 (standup-digest), 10/10 (verifiable-fetch), negatives 10/10 in all three,
  one broken run (`neg-zh-review-pr`, timeout) reported as broken; at six runs three near-threshold
  queries moved (0.67 → 0.33, 0.67 → 0.83, 0.33 → 0.50). A/B: 14 arms all `completed`,
  `skillInInit` true on every `with`; mechanical with/without — screenshots-ja 4/4 ÷ 4/4,
  blocked-and-large-en 5/5 ÷ 5/5, deep-path-zh 4/4 ÷ 1/4, preview-zh 12/12 ÷ 1/12,
  decisions-only-ja 8/8 ÷ 4/8; judgment 2/2÷1/2, 1/1÷0/1, 1/1÷0/1, 4/4÷0/4, 2/2÷0/2. Costs:
  probes 19.5598, arms 2.5997, narration 0.0670, committed total 22.2264, discarded 17.7966.
  Flags: 3 scanner false positives, 5 shared-`/tmp` writes, 6 `/dev/null`. Redactions 20, both on
  baselines that printed signed URLs.

- ✅ **G1's machinery is verified and may be cited rather than re-proven**: the shared launcher (stdin,
  capture, `CLAUDECODE` removed, the wrapper with the overrides after the file, `CLAUDE_BIN`, both kill
  branches), the stream parser's classification in SCOPE.md's order, the probe's `rate = triggered ÷
  valid` with `passed` / `incomplete` / `near-threshold`, the A/B arm's command line (the notice is
  byte-identical to the contract), `outputs.json`, `transcript.md`, the contamination flags, the
  redactor's six rule families, and `report`'s columns. I read all of them against SCOPE.md and broke
  five checks to see them go red.
- ✅ **The grader contract is live and exercised** by `test/fixtures-ab/toy-suite/grade.ts`:
  `grade(evalId, runDir, context)` → `{ id, kind, passed, evidence }[]` with judgment assertions written
  `passed: null` and empty evidence, plus `agreementKey(evalId, runDir)`. `harness/ab.ts` imports it from
  `<AB_ROOT>/evals/<skill>/grade.ts`. G2 and G3 write theirs to the same signature; `AB_ROOT` is how a
  test points the runner at a scratch suite.
- 🔴 **A skill directory may not import from another skill.** `verifiable-fetch` and `standup-digest`
  therefore cannot reuse `skills/skill-trigger-probe/scripts/lib/redact.ts`; each needs its own small
  redaction, and the lists differ on purpose — the fetcher's query parameters include `key`, the A/B
  runner's do not. Expect the duplication and say so in the AS-BUILT rather than "fixing" it.

- ✅ **The toolchain of F2–F4 is unchanged on the host**, except the three caret-ranged devDependencies
  (F23): biome `2.5.15`, `@types/node 24.19.1`, vitest `5.0.3`; pnpm `11.28.0` and typescript `7.0.2` as
  F2. I re-read them from `node_modules/<pkg>/package.json` and from `pnpm-lock.yaml`'s resolved
  versions. `pnpm test` → `Tests 2 passed (2)`, `pnpm lint` → `Checked 3 files`, `pnpm typecheck` → exit 0,
  all on the tree as it stands; a later goal may cite this instead of re-measuring the versions.
- ✅ **Biome's file count is explained, not drifting.** F2's `Checked 4 files` was two planted `.ts` files
  plus `biome.json` and `vitest.config.ts`; today's `3` is `biome.json`, `vitest.config.ts` and
  `test/fixtures.test.ts`. `biome.json` is checked although `files.includes` does not name it, and
  `vcs.useIgnoreFile: true` makes it skip git-ignored paths. The count will jump in G1 as `skills/`,
  `harness/` and `test/` fill up; it is evidence only when the row quotes *which* files.
- ✅ **The given files are untouched** after G0: `git status --short` lists nothing under `fixtures/`,
  `evals/`, and not `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `biome.json` or
  `vitest.config.ts`. `facts.md` is +46 / −0 lines (F23 and the box under F2; F1–F22's text intact),
  `SCOPE.md` is the one freeze line. Still on `main` at `d2b1d05`, nothing committed.
- ✅ **What the six stream samples actually contain** (I read them with `jq`, not from the ledger):
  `tea-timer` is the skill under test and `long-desc` a sibling in every init list; the two trigger
  samples' only `tool_use` is `Skill` with `input.skill: "tea-timer"`; `sibling.jsonl`'s only `tool_use`
  is `ToolSearch`; host `no-trigger.jsonl` has no `tool_use` at all; `no-credentials.jsonl` carries an
  assistant `error: "authentication_failed"` with a result of `subtype: "success"`, `is_error: true`,
  `terminal_reason: "api_error"`; the Windows pair reports `claude_code_version 2.1.287`.
- 🔴 **`type: "system"` is not the init event.** `sibling.jsonl` carries eight further `system` events of
  `subtype: "thinking_tokens"` and the Windows trigger sample two. A `no-init` rule that looks for
  `type === "system"` alone passes on a stream that never initialised; it must key on
  `subtype === "init"`.
- ✅ **`--max-turns` is absent from `claude --help` on 2.1.233 and still accepted** (F4's own finding; I
  re-ran the help grep: the same 21 option lines, `grep -c -- '--max-turns'` → `0`, version
  `2.1.233 (Claude Code)`). Nobody removes the flag from the probe's argv because the help lacks it.
- ✅ **A `claude` that cannot authenticate looks successful.** E5's plain call: exit 1,
  `result=Not logged in · Please run /login`, `is_error=true`, **`subtype=success`**. This is F8 on the
  host, and it is why a test that accidentally reaches the real CLI instead of the fake one can read as a
  clean negative.
- 🆕 The sourced E5 call reported `model=claude-haiku-4-5-20251001,claude-sonnet-5` for a `--model sonnet`
  request: `modelUsage` can name a second, smaller model beside the requested one. G4's "resolved model"
  must come from the init event's `model`, not from the set of keys in `modelUsage`.

## What the bus verified itself

### Review 9 — G5 closed (2026-10-05, DONE)

Both items fixed and verified by me. **I ran the four scan commands verbatim**: patterns 1–3 print
nothing (their explanation is right — `sk-ant-` in SCOPE.md is followed by a backtick, so `{8,}`
cannot match) and pattern 4 prints exactly the four lines the table enumerates, in order, with
`PUBLISHING.md` itself no longer self-matching. Their analysis of why enumeration cannot converge when
the explanation quotes the string is correct, and writing the table's examples without the scheme is
the right escape. `SCOPE.md` line 3 now names the AS-BUILT section. The row the gate had blocked was a
raw pipe splitting the evidence cell plus a stale verdict cell — my own parser confirms **0 rows with
an unexpected cell count** across the ledger now. My independent audit: **84 verdict rows, 83 PASS,
1 FAIL**, every one with a quotation, no empty evidence, no weasel phrase in any PASS, and the single
FAIL carrying `expected / actual`. Final state: deliverables digest `1dd4cfc7d86f`, 226 tests, lint 61,
typecheck clean, the three frozen `SKILL.md` hashes unchanged, nothing listening on 18450–18459, no
leftover of the run or of my own probing in `/tmp`.

The run is complete: G0–G5, 54 acceptance rows and 30 condition rows, one FAIL (G4's change set,
correctly argued), 22.2264 USD of committed measurement and 17.7966 discarded for defects the live
runs exposed. What is left is human-only: the commit, the Windows arm, and the eight handover items.

### Review 8 — G5 (2026-10-05, REJECT on two publication-facing lines)

**The worker refuted me and is right.** I had told it three of the re-measured queries moved; I
recomputed all seven pairs and **five** moved: `pos-en-twenty-queries` 0.67→0.83,
`pos-en-validate-frontmatter` 0.00→0.17, `pos-zh-which-skill-fired` 0.67→0.33,
`pos-en-before-shipping` 0.67→0.50, `pos-zh-token-cost` 0.33→0.50 (`pos-en-zero-on-windows` and
`pos-ja-description-limit` held). Its derived claim also checks out: on the best available
measurement skill-trigger-probe's positives are **7/10**, not 8/10, and standup-digest's are 10/10.
My figure was wrong in the G5 instructions and the README is right.

Verified myself: the seven `## ` section names and their order, the signature line byte-identical by
`od -c`, the case-study link, `goal-pack/` linked from 作り方; the six headings of
`docs/reading-evals.md` map one-to-one onto the six lessons of materials section 5; the CI SHAs equal
F21 exactly with version comments, `contents: read`, no `corepack enable`, and every `checks` command
reproduced here (226 tests, 61 lint files, typecheck, 3 skills ok, `2 ok, 0 failed`, `26 requests`);
LICENSE untouched; the widened deliverables digest `1dd4cfc7d86f` reproduces; the three frozen
`SKILL.md` hashes still match AC-38; no `/ho[m]e/` match anywhere in the deliverables; the `/tmp/`
matches in results are only `wsPath` and the contamination flags' own quoted paths; nothing of the run
or of mine left in `/tmp`; the G4 pin comment now says "all six fixes"; facts.md holds 28 entries with
F23–F28 added by the run and no deletion.

**Why rejected:** `PUBLISHING.md` §1 scans `skills harness test evals docs .github *.md` — which
excludes `goal-pack/` — yet enumerates two matches that live in `goal-pack/SCOPE.md`,
`BUS-MEMORY.md` and `facts.md`, while the one match its own commands do produce beyond
`test/redact.test.ts` is **`PUBLISHING.md:41` itself**, which quotes the dummy `user:password@` URL
and is not in the table. And `SCOPE.md` line 3 still reads `Contract status: FROZEN 2026-10-05`
although the AS-BUILT section exists at line 743 — the goal brief's post-compaction rule keys on that
exact string saying AS-BUILT after G5.

### Review 7 — G4 after the corrections (2026-10-05, PASS)

All four corrections verified independently. **My own flag classification matches theirs exactly**:
3 false positives (`/repos/acme/tasks/issues`, `/orgs/acme/repos`, `/acme/tasks`), 5 real writes into
the shared `/tmp`, 6 `/dev/null` — 14 in all; incidental finding 4 names the mechanism correctly
(a scheme-bearing URL is stripped, a bare `== /orgs/acme/repos ==` label is not), leaves the scanner
untouched with a reason and two candidate fixes for after the run, and tells G5 what to say.
`benchmark.md` now reads `yes (empty: neither run produced one)`; `benchmark.json` carries
`agreementTrivial` with `keys: ["",""]` and `false` for the other three arms; a Contract changes row
gives the reason. The benchmark still traces to the run records (I recounted `decisions-only-ja`:
8/8 and 2/2 at 0.2560, 4/8 and 0/2 at 0.7111). J1's evidence is now exact and I checked every claim —
lines 31–32 are the only mentions of either image file, `順番` is on lines 17 and 27 in the issue's own
description — and it pre-empts the objection I raised. `narration-2026-10-05.md` carries the AC-46
usage line in full; the five costs sum to 0.0669795.

**No measurement moved**: probes 19.5598, arms 2.5997 over 14 runs, redactions 20, `skillInInit` true
on every `with` and false on every `without`, all statuses `completed`, the three frozen `SKILL.md`
hashes unchanged. `Tests 226 passed (226)`, lint 61, typecheck clean, deliverables digest
`30c27e872a7c` reproduced, nothing listening, no leftovers. One wording slip left for G5: the pin
comment still says "unchanged by all three fixes" where there were five pin moves and six code
touches — the FAIL row has the right count.

### Review 6 — G4 (2026-10-05, REJECT on the reporting, not the measurements)

**The measurements themselves survive everything I could throw at them.** I recomputed from the
per-run records of all five probe files: 60 + 60 + 60 + 36 + 6 runs, zero mismatches between stored
`rate` and `triggered/valid`, zero on the `passed` rule, zero on `incomplete`, zero on the
near-threshold rule; my positives/negatives tallies equal the summaries (8/10, 9/10, 10/10 and 10/10
negatives each); my cost sums equal the stored ones to the last digit. The one broken run
(`neg-zh-review-pr`, `timeout`) is counted as broken: that query has `valid 2`, `rate 0`,
`incomplete true` — **not** counted as a negative success by a shrunken denominator. AC-42 re-measured
exactly the right set (the 5 near-threshold plus the 1 failed non-near for skill-trigger-probe, the 1
near-threshold for standup-digest) and kept both files; the 6-run numbers moved three of them
(`pos-zh-which-skill-fired` 0.67 → 0.33, `pos-en-twenty-queries` 0.67 → 0.83), which is the
near-threshold flag earning its keep.

All 14 arms `completed`; **`skillInInit` true on all seven `with` arms and false on all seven
`without`**, so the check I asked for in G3 paid off and no arm measured nothing. I grepped every
`without` transcript for the skill directory: zero mentions, so the comparison is clean. Judgment
evidence: I opened `screenshots-ja/with/run-1/outputs/out/101.md` and the quoted sentence
`並べ替え前のボード。上から青・黄・赤の順でカードが並んでいる。` is there verbatim under
`### board-before.png`; no judgment grade is left `null` anywhere. The benchmark numbers trace to the
run records (I recounted `deep-path-zh` both arms: 4/4 and 1/4 mechanical, 1/1 and 0/1 judgment,
durations 26199 and 32013 ms, costs to the digit). My own secret scan over `evals/*/results` and
`evals/.runs` finds nothing; no `/home` and no `call-env.sh` in any committed result; redactions total
20 (4 + 16, both on baselines that printed signed URLs); `evals/.runs/` is git-ignored. The three
frozen `SKILL.md` hashes still match AC-38 exactly. `narration-2026-10-05.md` is the best-written
result in the repository: four numbers and an explicit refusal to draw a conclusion from two calls per
setting.

**Why I rejected anyway** — two reporting defects that would have gone straight into G5's 「結果」:
AC-44 explains all nine standup-digest flags as "`/dev/null` and the arm own `/tmp/ab-run-…` scratch",
but I read the raw transcripts: three (`/repos/acme/tasks/issues`, `/orgs/acme/repos`, `/acme/tasks`)
come from `echo "== /repos/… =="` labels and one written Markdown line — not filesystem paths at all,
a scanner false-positive class of the same species G1 fixed — and `/tmp/issues.json` and
`/tmp/comments` are the **shared** `/tmp`, not the arm's own directory. And `benchmark.md` reports
`preview-zh / without / runs agree: yes` because both agreement keys are **empty** (neither baseline
wrote a page), while AC-44's prose says the baselines "do not agree with themselves". A degenerate
agreement reported as a plain `yes` is the one number in this goal a reader would most easily misread.

**My own miss, admitted.** The launcher defect of F26 — the overrides pre-applied to the shell that
sources the environment file — was in the code I read line by line in review 2 and approved. SCOPE.md
says the overrides come *after* the file; I checked that `exec env` did that and did not notice that
`childEnv` also applied them before. The live run caught what I did not, and `claudeArgs`/`skillInInit`
were my ideas while this was not.

### Review 5 — G3 (2026-10-05, PASS)

**I recomputed the expected outcome from `facts.json` myself and compared it with SCOPE.md's table row
by row.** All fifteen open items agree on lane, idle, waiting and review days, triggers and decision:
190 quiet/carryover/0.4, 191 silent with no triggers, 201 🔴 review 11.4, 202 🔴 waiting 23.6, 203 🚧,
204 quiet/unassigned/0.4, 205 🔴 45.8 (the chronic discount applied), 206 🔴 60.4, 207 🔴 waiting but
**not** a decision (member rule), 208 and 191 silent, 209 💤, 210/212 quiet, 211 🔴 review 15.4, 215 🔴
with no trigger. `decisions` is `[206,205,202,211,201,190,204]`; closed `[213]`, created `[204,210]`,
hygiene `{unassigned:[204],labelConflict:[215]}`, 26 requests, 72-hour Monday window, today 2026-10-05.
I read the page top to bottom: header, the seven decisions with the fixed questions and machine facts,
the degraded line under the heading, the table 🔴2・🚧1・💤1 with #207 #215 #203 #209, the ✅/🆕/🙊/⏸️/⚠️
lines, and the footer whose `facts 4c0046df` equals `sha256sum facts.json | cut -c1-8`. The Japanese is
plain and reads naturally.

Also ran: two `digest:demo --mode collect-only` runs → `digest.md` and `facts.json` byte-identical
(`cmp`), page sha `b7135add4717…` as the ledger says; **F25 reproduced independently** — 26 requests at
`maxPerPage` 100 against 49 at 3, the mock serving exactly those numbers, `facts.json` identical once
`requests` is normalised (same `fed260f4aa02`), and the only difference in the page is line 39, the
footer hash, which follows `facts.json` by contract; AC-34 reproduced — `--feedback-issue 300` costs
exactly one more request (27), the facts are identical apart from the count, and `feedback` is not a key
of `facts.json` at all. The GitHub mock's shapes against F16/F17 with my own script: `committed` has no
`created_at` and carries `committer.date`, `reviewed` has `submitted_at` with `state: "approved"` while
`/pulls/<n>/reviews` serves `APPROVED,CHANGES_REQUESTED`, `cross-referenced` carries
`source.issue.repository.full_name: "acme/tasks"` with `pull_request`, `#208 updated_at` is
`2026-10-01T00:00:00Z`, the list is newest-first, `Link` paginates, the rate headers are present,
`POST` → 405, an unknown path → 404 `{"message":"Not Found"}`. `pnpm test` → `Tests 225 passed (225)`,
lint 61 files, typecheck clean, **deliverables digest `505e8ef38ceb` reproduced**, all three skills
validate (943 / 912 / 975 characters), no cross-skill import (the digest has its own `./claude.ts`),
nothing listening, no leftovers, given files untouched.

**Controls I broke**: removing the chronic discount from the *default* path reddened the
expected-outcome test, the decision-list test and five grader assertions — so the real path is pinned,
not only the flagged alternative; adding `assigned` to the activity list reddened five tests including
`#208 and #191 are silent although their updated_at is recent (F18)`. The carried items from G2 are
both done: `test/fetch-failures.test.ts` covers `signature mismatch`, `too many redirects` and
`network: <code>`, and the ten-minute hang is incidental finding 3.

### Review 4 — G2 (2026-10-05, PASS with two carried items)

Ran myself, against the mock in the OS temp directory: `pnpm fetch:demo` on issues 101, 102, 104 and
105 → exits 0, 1, 1, 2 with the stdout lines SCOPE.md fixes; the 101 PNGs carry F20's checksums; the
generated archive's sha256 is F20's `02e34249…`; **no HTML anywhere on disk** and no file under
`gateway-screenshot.png` or `settings.png`; issue 105 wrote nothing at all; the 150-character name cut
to `…-d06f72f0.png` with the absolute path exactly 240, `通知:設定?.png` saved as `通知_設定_.png`, the
originals kept in the page; `--max-path 80` → exit 3; `（なし）` for 104's empty Journals; the Japanese
of `101.md` and `102.md` read as an engineer in Japan would expect, with `## 再現手順` demoted to `###`.
With my own script against the mock: F19's shapes (no `include` → no `attachments`/`journals` keys,
`x-mock` never served, `content_url` on the tracker's origin, unknown issue 404 with an empty body,
`POST` → 405); the key rule — `{"tracker apiKeyHeader=true":5,"media apiKeyHeader=false":3}`, zero keyed
media requests, the key in no file and no output, and without it exit 2 `issue 102: HTTP 401`; 3 tokens
issued, 0 matches anywhere, while the log's `location` keeps the token in full (that is what makes the
check falsifiable); the log stores query parameter *names* only (`["token","expires"]`) and `apiKey` as
a boolean. `pnpm test` → `Tests 138 passed (138)`; lint 41 files; typecheck clean; **deliverables digest
`ac9366872736` reproduced**; `pnpm skills:validate` → both skills ok (943 and 912 characters). F24
reproduced independently, down to the same normalised hash `0a961f046ef2…`. Nothing listening, no
`askev-` leftover, given files untouched, no literal token prefix, no home path.

Controls I broke: disabling `looksLikeHtml` → exactly one test red (`exits 1, keeps the two good files
and leaves nothing under the refused names`); tampering with the grader's token search → the grader
suite red. **Disabling `signatureMatches` broke nothing** — see the carried item below.

My own mistake, for the record: my first key probe used `spawnSync` in the same process as the mock, so
the server could not answer while the call blocked, and I briefly suspected the fetcher of hanging. The
worker's own ten-minute hang was the same species (`wait` on a backgrounded `pnpm` wrapper). Evidence
decided: an async spawn showed the fetcher is fine.

### Review 3 — G1 after the fixes (2026-10-05, PASS)

Ran myself: the same A/B run that exposed the defect, with `CLAUDE_CALL_ENV_FILE` pointing at a dummy
file I wrote in the OS temp directory — `run.json` now has no `argv`, `claudeArgs` starts at `-p`, and
`grep -rl` over the whole output tree finds no `call-env.sh`, no env-file path and no `/home/…`;
`skillInInit` is `true` for that `with` arm. `pnpm test` twice → `Tests 90 passed (90)`; `pnpm lint`
`Checked 27 files`; `pnpm typecheck` exit 0. **The deliverables digest reproduces: `185184d9694a`** —
the pin is now falsifiable, and I will recompute it every review. `rg -n "launchClaude\(" test` → one
line, the definition inside `launchFake`. Control of the new control: I reverted `claudeArgs` to
`launched.argv` in a scratch copy and `run.json records the CLI own arguments only…` failed, alone (1 of
14) — the new assertion is not vacuous. Scope check by mtime: the fix round touched exactly
`harness/ab.ts`, `test/{launcher,probe,broken-reasons,ab}.test.ts`, `test/support/fake.ts` and
`test/fake-claude/cli.ts`; nothing under `skills/` moved, so everything I verified in review 2 — the
launcher, the parser, the probe, the validator, the redactor, `SKILL.md` — still stands byte for byte.
Leftovers: the run's own prefix is now `askev-` in code (`test/support/tmp.ts`), nothing of it is left,
and the `/tmp/g1-*.txt` files are dated 2026-08-19 and 08-25 — strangers, like the g0 anchor.

### Review 2 — G1 (2026-10-05, REJECT)

Ran myself: `pnpm test` (`Tests 88 passed (88)`, 9 files), `pnpm lint` (`Checked 27 files`),
`pnpm typecheck`; the validator from the shell on three planted skills in the OS temp directory
(`exit=0`, `exit=1` with the V4 line and the F11 note, `exit=3` on a missing directory) and on the real
skill (`ok skill-trigger-probe (description 943 characters)`); the AC-13 searches (`shell:` one comment,
`taskkill /T /F` one line, no slash concatenation, every `skills/` import a `node:` builtin or a local
`.ts`); `rg` for literal token prefixes outside `goal-pack` (none) and for `/home/` or `/tmp/` in
`skills harness test pnpm-lock.yaml` (none); the description's length, its three languages, both near
misses and the absence of an angle bracket, read out of the frontmatter; `references/` depth 1.

**Read against the contract, line by line**: the launcher (stdin, capture, `CLAUDECODE`, the wrapper and
the override order, `CLAUDE_BIN`, the two kill branches), the stream parser's classification order, the
probe's argv and its rate / `passed` / `incomplete` / `near-threshold` rules, the arm's argv (the notice
is byte-identical to SCOPE.md — I compared them with a script), `outputs.json`, `transcript.md`,
the contamination patterns, the redaction patterns, `report`'s columns.

**Controls I broke myself**, in a scratch copy under the OS temp directory with `node_modules`
symlinked, removed afterwards: swapping `auth` and `not-loaded` in the classifier → only
`authentication failed and the skill missing from skills together` failed (1 of 12); disabling the
redactor → 7 tests failed across `redact.test.ts` and `ab.test.ts`; computing the rate over all runs
instead of the valid ones → `exit 2: a broken run is counted by its reason and never as "not triggered"`
failed; raising V4's 1,024 → the V4 unit test and the command-line test failed. The suite can fail, and
it fails in the right place.

**Reproduced the defect** rather than arguing it: a real A/B run of the toy suite on the fake CLI with
`CLAUDE_CALL_ENV_FILE` pointing at a dummy file I wrote in the OS temp directory put
`["bash","<repo>/skills/skill-trigger-probe/scripts/lib/call-env.sh","<tmp>/dummy.env","-u",…]` into
`run.json`'s `argv`. Every G1 test sets that variable to `''`, so no test ever walks the wrapper path.

### Review 1 — G0 (2026-10-05)

Ran myself: `sha256sum` + `stat` over the six PNGs (identical to F20); `jq` over `issues.json` (4 / 10),
`scenario.json` (4 milestones / 22 items), both `evals.json` (2 and 3 — note the file is an *object*,
`.evals` holds the array: a naive `length` reads 3 for both), the three `trigger.json` (20 / 10 each) and
all six streams; `claude --help` and `claude --version`; `pnpm test`, `pnpm lint`, `pnpm exec biome check
. --verbose`, `pnpm typecheck`; the installed versions from `node_modules` and `pnpm-lock.yaml`; the F5
port check (`none listening in 18450-18459`); `git status --short`, `git diff` on `SCOPE.md` (one line)
and `facts.md` (+46 / −0); `grep` for `/home/`, `sk-ant-`-style keys and token prefixes over the changed
files (nothing); `evidence-gate.sh --check` → 0; `goal-bus.sh --status`; the mtimes above; the current
tree fingerprint (`0d2e74185f30`, against the pinned `68e4656581cc` — the difference is PROGRESS.md, see
the ruling); `/tmp/g0-hash-anchor.md5` dated 2026-08-19 (the incidental finding is real and not ours).
Not run: the two live E5 calls (see the doubt above), and no probe query — nothing to classify yet.
Recounted: the tally, 8 rows / 8 verdicts, two of them annotated PASS counting once each.

## Rulings the bus made

- 🆕 **The build-under-test pin, for a goal whose deliverable is the ledger.** The fingerprint covers the
  working tree including PROGRESS.md, which must then change to hold the evidence — so it can never be
  reproduced after the fact. The rule stands as: take the fingerprint when every *code and deliverable*
  file of the goal is final, make the goal's two final runs on it, and afterwards change nothing but
  PROGRESS.md's evidence cells and the pin line itself — stated in a comment under the pin, as G0 did. I
  checked G0's claim the only way left to me: the mtimes run `pnpm-lock.yaml` 08:10:30 →
  `test/fixtures.test.ts` 08:12:14 → `SCOPE.md` 08:13:31 → `facts.md` 08:14:04 → `PROGRESS.md` 08:17:02,
  so the code under test is older than the ledger, and re-running the tests on today's tree reproduces its
  numbers. From G1 on, when a goal ships code, the pin becomes falsifiable: I will recompute it and expect
  only PROGRESS.md to differ.
- 🆕 **A given file's own looseness does not make a row FAIL.** E2 asks for "the versions of F2"; the
  caret ranges of the given `package.json` made that unattainable. An annotated PASS is right *because*
  the note names the delta and a new fact (F23) records it, with a Superseded box instead of an edit to
  F1–F22. A row whose expectation is defeated by the worker's own choice is a different matter and is a
  FAIL.

## Watch closely

- 🔴 **`LaunchResult.argv` contains absolute paths by construction** — the wrapper's path inside the
  repository and the path of the file `CLAUDE_CALL_ENV_FILE` names — so it must never be persisted to a
  file that gets committed. This is G1's one real defect (see Review 2). Whenever a later goal adds a
  field to `run.json`, `facts.json` or a result file, ask what absolute path it can carry.
- 🔴 **G5's leak scan will hit the goal pack, not the code.** `goal-pack/SCOPE.md` and `facts.md` contain
  a literal Anthropic-style prefix as part of the rules they state; the code and tests correctly use
  character classes. PUBLISHING.md's checklist must scope the scan or say why those two files match.

- 🔴 The OS temp directory of this host holds unrelated leftovers from other work
  (`/tmp/g0-hash-anchor.md5` of 2026-08-19, `bus-probe`, `job04-env-probe.mjs`, …). A cleanup or
  leftover check must filter on *this run's own* prefixes; `g0-*` and the like catch strangers.

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
