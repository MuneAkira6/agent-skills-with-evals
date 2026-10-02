# Goal brief — agent-skills-with-evals

> This file is the worker's only entry point. Read all of it before you start.
> Contract: [SCOPE.md](SCOPE.md). Facts: [facts.md](facts.md). Ledger: [PROGRESS.md](PROGRESS.md).
> Human manual: [runbook.md](runbook.md). Source material: [materials/practice.md](materials/practice.md).

## Mission

Build three Claude Code skills from the author's practice, and measure them honestly: a probe that
validates a skill's frontmatter and measures how often a skill triggers — telling a broken run from a
negative one; a Redmine fetcher that counts an attachment as fetched only when its bytes match the
metadata; and a stand-up digest from a GitHub milestone where rules decide and a language model only
writes short sentences behind a guard. Each comes with an eval suite, and the evals are run for real at
the end: trigger rates, A/B runs with and without the skill, the narration's tokens.

| Goal | Scope | In one line |
|---|---|---|
| G0 | skeleton | toolchain, the environment and the nested CLI re-measured, the given files read, the contract frozen |
| G1 | skill-trigger-probe | the frontmatter parser and validator, the launcher and stream parser, the probe, the A/B runner, the skill |
| G2 | verifiable-fetch | the mock tracker, the fetcher with its checks, names and paths, the skill, the grader |
| G3 | standup-digest | the mock GitHub API, collection, activity, lanes, decisions, the page, narration and its guard, the skill, the grader |
| G4 | measurements | trigger rates of the three skills, the A/B runs, the narration and thinking measurements — live |
| G5 | finish | README, the reading guide, CI, PUBLISHING.md, the contract → AS-BUILT |

Every row is already listed in PROGRESS.md. Do not add or remove rows; to change a plan, write the
reason in PROGRESS.md first.

## Required reading

| Resource | Why |
|---|---|
| [SCOPE.md](SCOPE.md) | the only authority for the interfaces, formats, rules, exit codes, ports and the expected outcomes |
| [facts.md](facts.md) | what was measured before the run, with the commands; you append yours from F23 on |
| [materials/practice.md](materials/practice.md) | the rules and their reasons, and everything you may say about the author's practice |
| [PROGRESS.md](PROGRESS.md) | the rows you judge |

## Facts already verified — use them, do not re-investigate

Each has its entry in [facts.md](facts.md) with the command and the output.

- **F1–F3**: Ubuntu 20.04.6, 12 CPUs. Node `v24.19.0`; inside the repository pnpm is `11.28.0` (the
  global one is 11.22.0 and switches itself; corepack is not enabled here and stays so). The skeleton
  installs in about 1.4 s with no build script. `erasableSyntaxOnly` is on: erasable TypeScript only (no
  enums, namespaces or parameter properties); Node runs `.ts` directly; local imports carry `.ts`; types
  use `import type`. bash 5.0.17, git 2.25.1, jq 1.6; `rg` is on your `PATH`.
- **F4**: the CLI is Claude Code 2.1.233; every flag SCOPE.md uses exists. It is shared: never update it.
- **F5**: ports 18450–18459 are free; the mocks use 18451, 18452 and 18453 on 127.0.0.1.
- **F6**: the proxy variables are set and bypass 127.0.0.1, so local mocks are reached directly.
- **F7, F8**: how a trigger looks in stream-json; a run that used a tool under `--max-turns 1` exits 1
  and is valid; a run without credentials says `subtype: "success"` and is broken. The six samples in
  `fixtures/streams/` are real (redacted) and are your first test inputs.
- **F9, F10**: your tools do not have the CLI's credential; a nested `claude` authenticates through
  `CLAUDE_CALL_ENV_FILE`, sourced by the launcher in a child shell. An arm's tools see the proxy
  variables — hence the redaction.
- **F11, F12**: the published limits of a frontmatter, and the CLI cutting a description after 1,536
  characters.
- **F13**: on Windows the same code works (native `claude.exe`, prompt on stdin) — the author checks it
  after the run; keep the code portable by construction.
- **F14, F15**: the narration's flags; model aliases (`sonnet` → claude-sonnet-5, `opus` →
  claude-opus-5 here) and what calls cost.
- **F16–F19**: the real shapes of GitHub's lists, timelines and reviews, the `updated_at` trap, and
  Redmine's issue JSON and its 404 page. The mocks follow these shapes, not a format remembered from
  documentation.
- **F20**: the fixtures' sizes and checksums, and the digest's expected outcome computed independently.
- **F21, F22**: the Actions' SHAs; the skeleton on Windows.

Three rules of this machine, not measurements:

- The proxy comes from environment variables: **never unset or print them.**
- **Never open, print or copy the file `CLAUDE_CALL_ENV_FILE` names**, and never read the home
  directory's token or proxy files. The launcher sources the file in a child shell; that is the only
  way it is used.
- Every `claude` you start runs **outside this repository** (SCOPE.md, "Every `claude` this repository
  starts"): this repository holds the run's Stop hooks, and a session started inside it would meet them.

## Facts you measure

When you measure something a decision depends on (a stream detail, a cost, a shape the mocks must
copy), append it to facts.md as a new entry from F23 on, in the form of the entries above it: the date,
the exact command, the output as printed (no secret, no absolute path under the home directory; say what
you cut), what follows, and the decisions that depend on it. Quote the id in the PROGRESS row. When a
measurement contradicts an entry, add a "Superseded" box under that entry — never edit its text — and
record it under "Contract changes" if the contract depended on it.

## How to build this repository

- **The contract decides expectations, never the code.** A test expects what SCOPE.md says — the
  expected-outcome table of the digest above all. If the code disagrees, the code is wrong, unless the
  run proves the contract wrong — then it is a contract change, recorded with its reason first.
- **Nothing is guessed.** An input that cannot be read exactly is an error that names it.
- **Controls before greens.** Every check is seen to fail on a planted violation, in a real run: each
  validator rule, each broken reason, each guard rule, each grader assertion, the redaction, the API
  key's origin rule, the activity rule's exclusions, the ranking's discount. A control says it is one.
- **Real inputs.** The stream parser is tested on the six recorded samples first, the mocks copy the
  recorded shapes (F16–F19), the fixtures are the given ones.
- **The measurements are the product of G4.** Rates are computed on valid runs only; a broken run is
  reported with its reason, never counted as "not triggered". Judgment grades quote their evidence.
  Do not explain a number you did not measure, and do not draw a conclusion the runs cannot carry
  (one or two runs per arm).
- **Nobody tunes to the test.** `trigger.json` and `evals.json` are given and stay as they are. Write
  each description from the skill's purpose, before you look at its `trigger.json`; do not edit a
  description after G4 has measured it. A description edited for any other reason makes that
  measurement stale, and you say so.
- **Two runs agree.** A count, a pass or an output's bytes are quoted from two consecutive runs.

## Definition of done for each goal

1. **Read first.** Read the current state before changing a file.
2. **It runs.** `pnpm test`, `pnpm lint` and `pnpm typecheck` pass, and each goal's own commands as its
   rows require; paste the output.
3. **The build under test is pinned.** Once the goal's code is done and before its final verification,
   write one line under the goal's heading in PROGRESS.md:
   `Build under test: <commit> + tree <fingerprint>`, with the commit from `git rev-parse --short HEAD`
   and the fingerprint from
   `{ git rev-parse HEAD; git diff HEAD; git ls-files -o --exclude-standard -z | sort -z | xargs -0 -r sha256sum; } | sha256sum | cut -c1-12`.
   The goal's two final runs are made on that build; if anything changes after them, write the new line
   and run them again.
4. **Every row has a verdict** from the table below; nothing is left unexplained.
5. **The tally is written.** Under the goal's last table, one line:
   `Tally: <n> rows · <m> verdicts (PASS a · FAIL b · BLOCKED c · DEFERRED d)`. A split verdict counts
   once per arm, so m can exceed n; an annotated PASS counts as one PASS.
6. **PROGRESS.md first, report second.**
7. **Leave nothing behind.** Temporary files go to the OS temp directory and are removed; stop every
   process you started (no mock left listening on 18450–18459, no `claude` of yours still running —
   `pgrep -fa` for the run's temporary prefixes prints nothing) before the goal ends.

### Verdicts

| Verdict | Meaning | Required |
|---|---|---|
| PASS | you observed what the row describes | quote the observation (command output with the exit code, the lines of a file with their numbers) |
| FAIL | the observation contradicts the row | `expected "<X>" / actual "<Y>"`; if you cannot write that, it is not a FAIL |
| BLOCKED | you could not verify it | say what is missing; a result that needed the environment fixed by hand is BLOCKED too |
| DEFERRED | it depends on an open decision | name the decision |

Two forms are allowed:

- **Annotated PASS**: `PASS (note: <the condition>)` when it passed under a condition; the note stays in
  the row.
- **Split verdict**: when a row has two paths and only one could be verified, write both, verified arm
  first, for example `PASS (Linux) / BLOCKED (Windows)`, with the evidence of each arm in the evidence
  cell. Do not split a row just to avoid a FAIL.

The auxiliary words (N/A, INFO, INCONCLUSIVE) are not verdicts in this ledger; use them only inside the
evidence. "Works as expected", "no issues" and "looks fine" count as unverified. When in doubt, BLOCKED —
never round an uncertainty up to PASS. A measured rate below what you hoped for is not a FAIL of the
row: the row asks for the measurement, and the measurement is the result.

### The evidence gate is mechanical

`.claude/hooks/evidence-gate.sh` runs at the end of every turn while `goal-pack/.gate-armed` exists.
It blocks the turn when a PASS has empty evidence, a weasel phrase or no quotation mark; when a FAIL is
not "expected / actual"; when a BLOCKED or DEFERRED gives no reason; or when a verdict word is unknown.
It reads the file, not the conversation: **never invent a quotation to pass it.** After 5 blocks in a
row it lets the turn end to avoid a loop; say so plainly in your report. Never put a `|` inside a table
cell of PROGRESS.md: it splits the cell.

### Run things one at a time

One live measurement at a time: one probe, or one A/B `run`, or one narration — never two together,
never in the background. Wait for a long command with one blocking call (`timeout` up to 600000 ms on
the Bash tool); keep every single command under ten minutes and split a longer one — the A/B runner does
one arm of one eval per command for this reason.

## Red lines — stop and report if you are about to cross one

1. Do not create, switch or modify branches.
2. Do not commit or push; the human commits after the run.
3. **Read and write only inside this repository and the OS temp directory**, and run `rg` from your
   `PATH`. Do not open, list or search anything else on this machine — not the home directory, not
   other repositories, not the CLI's configuration directories, not the file `CLAUDE_CALL_ENV_FILE`
   names (you check that it exists, nothing more).
4. **The CLI only as SCOPE.md describes**: `claude` is started only by this repository's tools (the
   probe, the A/B runner, the digest's narration) and by the two calls of G0's E5; always outside this
   repository; never in the background; only the measurements SCOPE.md and PROGRESS.md list, with their
   runs, models and budgets. Never `claude update`, never `claude setup-token`, never a change to the
   CLI's configuration.
5. No secret in any file of the repository; dummy values only. Do not unset or print the proxy
   variables or any token; never write an arm's raw output anywhere before the runner's redaction.
6. Do not fix unrelated problems; record them under "Incidental findings". A defect **your own change**
   introduced is not unrelated: fix it in the same goal.
7. Do not edit the given files listed in SCOPE.md — `trigger.json` and `evals.json` above all.
8. Network: only `pnpm install`, the mocks on 127.0.0.1, and the live calls of the measurements (the
   CLI's own traffic). Nothing else reaches the network: no `curl` to the internet, no GitHub API, no
   redmine.org, no `npm view`, no `git fetch`. No `sudo`.
   **Nothing that installs or enables a tool outside this repository**: no `corepack enable`, no
   `npm install -g`, no `pnpm add -g`, no `apt`, no downloaded binaries. The Node installation and the
   CLI on this machine are shared. A CI workflow may contain setup steps; they run on CI only. Here,
   verify only the project's own commands.
9. No employer, product, customer, team or person names; no figures about the author's work. The
   README's signature line is required and is not a person name in this sense; the fixtures' fictional
   names are fine.
10. Do not tune a description to `trigger.json`, or an assertion to an arm's output.

### There is a bus above you

While `goal-pack/.bus-armed` exists, every turn you end meets the goal-bus Stop hook:
- **Inside a goal** it sends you back ("Continue Gn: N row(s)…"). The hook reads PROGRESS.md, not the
  conversation: a table where every row has a verdict is the only way out.
- **When you print `PROGRESS: <goal> COMPLETE`** it checks the table and the evidence, then wakes the
  bus. The bus answers PASS (the next goal's instructions) or REJECT (what to fix).
- **The bus sees every earlier goal** and re-runs checks itself. An invented quotation will not survive
  it; BLOCKED will.

## Turn rhythm and progress protocol

- Each turn closes at least one row end to end, including writing it to PROGRESS.md.
- End the turn with: `PROGRESS: <goal> ac_done=X/Y pass=a fail=c blocked=d deferred=e`
- When every row of the goal has a verdict and PROGRESS.md is written: `PROGRESS: <goal> COMPLETE`
- When you are blocked: `PROGRESS: <goal> BLOCKED <reason>` — goal name first.
- The numbers must match PROGRESS.md.

**A turn must end on one of these lines. This is not formatting; it is what keeps the chain alive.**
The hooks run only when a turn ends, and they recognise you and your boundary by this line. End on
anything else and nobody is woken: your process ends and the chain stops silently. It follows that
starting a long task in the background and ending the turn throws its result away, and that a long task
is awaited with **one blocking call**, anchored on its output.

## After context compaction

1. Read PROGRESS.md and take the next empty verdict of the current goal.
2. If this brief is no longer in your context, read it again, completely, then SCOPE.md.
3. Check that SCOPE.md still says FROZEN (or AS-BUILT after G5).
4. Check that nothing of yours is still running (no listener on 18450–18459; no `claude` started from
   the run's temporary directories), and run `pnpm test` once before going on.
