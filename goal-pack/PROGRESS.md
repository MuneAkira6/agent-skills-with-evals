# agent-skills-with-evals — progress ledger

<!-- Structure the hooks rely on: goals are h2 sections; machine-checked tables have a "Verdict" column
     and an "Evidence" column; the environment table uses "Proof" and the change ledger has no Verdict
     column, so the gate leaves them alone. An empty verdict means "not done yet". -->

**Status: not started.**

Verdicts: PASS / FAIL / BLOCKED / DEFERRED (defined in goal-brief.md). The "Plan" column is fixed before
the run; to change a plan, write the reason here first. "measure" means run it and quote the output,
including the exit code where the row is about one. A "control" is a planted violation that must turn
the check red. "live" means a real `claude` call (it costs usage; F15).

## Environment (filled in G0; every row with the command and its output)

| Item | Value | Proof |
| --- | --- | --- |
| Node | | |
| pnpm (selected by packageManager) | | |
| bash, git, jq | | |
| Claude Code CLI | | |
| CLAUDE_CALL_ENV_FILE (presence only) | | |

## Environment change ledger (before → change → restored)

| # | Goal | Object | Before | Change | Restored |
| --- | --- | --- | --- | --- | --- |

## Contract changes (frozen in G0; any later rename or reshape goes here)

| Date | Entry | Content |
| --- | --- | --- |

---

## G0 — toolchain, the environment re-measured, the given files read, the contract frozen

| Condition | Verdict | Evidence |
| --- | --- | --- |
| E1 Node, pnpm (11.28.0 inside the repository), bash, git, jq and `claude --version` recorded with the commands' output, and compared with F2–F4 | | |
| E2 `pnpm install` succeeds with pnpm-workspace.yaml unchanged and no build script; the installed devDependencies are the versions of F2 | | |
| E3 the given fixtures read as facts.md says: the six PNG sizes and sha256 of F20; `fixtures/tracker/issues.json` has 4 issues and 10 attachments; `fixtures/github/scenario.json` has 4 milestones and 22 items; `fixtures/streams/` has 6 samples; each `trigger.json` has 20 queries (10 `should_trigger: true`); `evals.json` has 3 evals (verifiable-fetch) and 2 (standup-digest) — one `jq` command each | | |
| E4 ports 18450–18459 are free (the `ss` check of F5) | | |
| E5 the CLI's flags of F4 are in `claude --help`; `CLAUDE_CALL_ENV_FILE` is set and names an existing file (`[ -f … ]`, never opened); live: from a temporary directory, a `claude -p` through `bash -c '. "$CLAUDE_CALL_ENV_FILE" && exec claude …'` answers PONG, and the same call without it says "Not logged in" (F9) | | |
| E6 a first Vitest test passes, and `pnpm lint` and `pnpm typecheck` are clean over every directory that holds code (quote Biome's file count and the files it covers) | | |
| E7 SCOPE.md marked FROZEN with the date, its content otherwise unchanged | | |
| E8 the change set is limited to `pnpm-lock.yaml`, the first test and this ledger (`git status --short`) | | |

## G1 — skill-trigger-probe and the A/B runner

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-1 | the frontmatter parser reads every supported construct (plain, folded plain, both quotings with escapes, the four block scalars, a list, `metadata`) and refuses the unsupported ones and a duplicate key with the line number (quote the test names and two refusal messages) | measure | | |
| AC-2 | the validator: each of V1–V6 broken on its own in a planted skill fails with that id and its source, and nothing else (quote the six findings); the warnings (500 lines, `allowed-tools` as a list, an unknown key) do not fail | measure | | |
| AC-3 | the validator from the command line: a valid skill exits 0, a 1,563-character description exits 1 with the V4 line and the 1,536 note of F11, an unreadable directory exits 3 (three real runs, quoted with their exit codes) | measure | | |
| AC-4 | the stream parser on the six committed samples: host trigger → triggered (`tea-timer`); host no-trigger → not-triggered; host sibling → not-triggered with `ToolSearch` and nothing fired; host no-credentials → broken (`auth`) although its subtype is `success`; the two Windows samples → triggered and not-triggered (quote the six classifications) | measure | | |
| AC-5 | the other broken reasons, each produced through the fake CLI: `timeout`, `no-init`, `no-result`, `not-loaded`, `spawn-error`; and a valid run that exits 1 with `error_max_turns` stays valid (quote each) | measure | | |
| AC-6 | the launcher, observed through the fake CLI's own log: the prompt arrives on stdin and is in no argument; `CLAUDE_BIN` ending in `.ts` runs with node; `CLAUDECODE` is removed; with `CLAUDE_CALL_ENV_FILE` the file is sourced, the caller's overrides win over it and the variable is gone from the child; a timeout kills the child and reports `timedOut`; no environment value is printed | measure | | |
| AC-7 | the probe end to end on the fake CLI: the temporary project holds exactly the skill and its siblings and is gone afterwards; rates use valid runs only; `near-threshold` and `incomplete` flags; siblings counted; JSON and Markdown written; exit codes 0, 2 and 3 each produced by a real run (quote the three) | measure | | |
| AC-8 | `--isolated-config`: each run sees a fresh `CLAUDE_CONFIG_DIR` under the probe's temporary directory, removed afterwards; without it the inherited value (from the fake CLI's log) | measure | | |
| AC-9 | redaction: planted values, built at run time from parts (a proxy URL with credentials in the runner's environment, an Anthropic-style key, a GitHub-style token, a signed URL's `token=` and `X-Amz-Signature=`) printed by a fake arm never reach `transcript.jsonl`, `transcript.md` or `run.json`, and the redaction count says how many were replaced (control: the same output written without redaction contains them) | measure | | |
| AC-10 | the A/B runner on a toy eval kept under `test/` (never in `evals/`), fake CLI: the `with` workspace has the skill and the `without` one does not; the argv carries the budget, the disallowed tools and the notice; `HOME` and `CLAUDE_CONFIG_DIR` point into the run's temporary directory; `CLAUDE_CALL_ENV_FILE` and `GOALBUS_ENV_FILE` are not in the arm's environment; outputs copied; `run.json`, `transcript.md` and `grading.json` written; `report` builds `benchmark.md` | measure | | |
| AC-11 | contamination flags: a fake arm that names a path outside its temporary directory, one that mentions the skill's directory in the `without` arm, and one that runs `curl` to a non-local host are each flagged; a clean arm is not | measure | | |
| AC-12 | `skills/skill-trigger-probe/SKILL.md`: valid (`pnpm skills:validate skills/skill-trigger-probe`, exit 0, the description's length); the description says what, when and what not, naming the two other skills (quote it); the body covers both commands and the reading rules of SCOPE.md (quote the headings); `references/` one level deep | read + quote | | |
| AC-13 | portability: no `shell: true` and no shell string anywhere (`rg -n "shell:" skills harness`); the Windows branch of the kill uses `taskkill /T /F` (quote the lines); every path is built with `node:path` (quote a search for a string concatenated with `'/'` over `skills` and `harness`, expected empty) | read + quote | | |

### G1 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test` passes (quote the count), twice in a row with the same count | | |
| `pnpm lint` and `pnpm typecheck` are clean | | |
| No absolute path of this machine and no `/tmp/` path in any committed file of the goal (`grep -rn` over the changed files) | | |
| The change set is limited to the deliverables and this ledger (`git status --short`) | | |

## G2 — verifiable-fetch

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-14 | the mock tracker serves the scenario: an issue without `include` has no `attachments` or `journals` key and with it has both (quote the keys); `content_url` carries the tracker's origin and the encoded name of attachment 308; issue 105 is a 404 with an empty body; anything but GET is 405 | measure | | |
| AC-15 | the mock's attachment modes, each requested directly: `direct` 200 with the bytes; `signed` 302 to the media host with a token, the token valid once used within its time and refused when altered (403); `blocked` 403 HTML; `login-page` 200 HTML; `truncated` 200 with 274 bytes; `missing` 404 HTML; the generated archive's sha256 equals F20 (quote each status and size) | measure | | |
| AC-16 | issue 101: exit 0; `101.md` has the five sections in order (quote the headings), the description's `## 再現手順` demoted to `###`, both journals; both PNGs saved with the sha256 of F20 (quote both) | measure | | |
| AC-17 | issue 102: exit 1; `export-dialog.png` and the archive fetched (sizes and sha256 quoted); `gateway-screenshot.png` FAIL with `HTTP 403` and `settings.png` FAIL with `type image/png: got HTML` (quote the stdout lines); no file under either name is left on disk (`find`); the archive is not in the Markdown (its size quoted) | measure | | |
| AC-18 | issue 104: `missing.png` FAIL `HTTP 404`, `partial.png` FAIL `size 274 != 548`, exit 1; issue 105: exit 2 and nothing written (quote both runs) | measure | | |
| AC-19 | the API key: with the mock's `requireKey`, every tracker request carries it and no media-host request does (quote the mock log's counts); the key's value appears in no output and no file (`grep -rc` for it, 0); control: a fetch without the key gets 401 and exits 2 | measure | | |
| AC-20 | signed URLs: none of the tokens the media host issued during the run appears in stdout, stderr or any written file (compare against the mock's `issuedTokens()`; quote the count of tokens and of matches, 0); control: the token is present in the raw redirect the mock logged | measure | | |
| AC-21 | names and paths: issue 103 into a directory deep enough that the 150-character name must be cut — the saved name and its absolute path length ≤ 240 quoted, the Markdown keeps the original name; `通知:設定?.png` saved as a name without `:` or `?`; with an output directory too deep for `--max-path`, exit 3 and the mock log shows no download | measure | | |
| AC-22 | `skills/verifiable-fetch/SKILL.md`: valid (exit 0, length); the description says what, when and what not, naming the near misses (quote it); the body has the fetcher's command, the rule for `（説明なし）`, the reasons for the rules (quote the headings) | read + quote | | |
| AC-23 | `evals/verifiable-fetch/grade.ts`: each mechanical assertion of the three evals passes on a planted good output and fails on a planted violation of itself alone (quote the test names and counts); `agreementKey` tested | measure | | |
| AC-24 | `pnpm fetch:demo -- --issue 101 --out <tmp>` exits 0; run twice into two directories, the Markdown and the files are byte-identical (`sha256sum` of both trees) | measure | | |

### G2 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test` passes (quote the count), twice in a row with the same count | | |
| `pnpm lint` and `pnpm typecheck` are clean | | |
| Nothing listens on 18450–18459 after the goal (`ss`), and no temporary directory of the goal is left (`ls` of the OS temp directory filtered by the goal's prefixes) | | |
| The change set is limited to the deliverables and this ledger (`git status --short`) | | |

## G3 — standup-digest

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-25 | the mock GitHub API's shapes against F16 and F17: an issue's keys, a pull request's `pull_request` and `draft`, a `committed` event without `created_at`, a `reviewed` event with `submitted_at` and a lower-case state, a cross-reference's `source.issue.repository.full_name`, upper-case review states from `/reviews`; `updated_at` of #208 is 2026-10-01T00:00:00Z (its latest event, a planning one) | measure | | |
| AC-26 | the collection on the scenario: exactly 26 requests (listed) with `maxPerPage` 100; with `maxPerPage` 3 every page is followed through `Link` and the facts are identical (sha256 of both `facts.json`); current milestone 13, previous 12; #192 and #230 never tracked | measure | | |
| AC-27 | activity: the idle days of the 15 open items equal SCOPE.md's table (quote them from `facts.json`); #208 and #191 are silent although their `updated_at` is recent; one test per non-activity event kind (`milestoned`, `demilestoned`, `assigned`, `unassigned`, `review_requested`, `mentioned`, `subscribed`, a non-status label, a cross-reference from an issue, a pull request of another repository) shows it does not count | measure | | |
| AC-28 | lanes and triggers of the 15 open items equal SCOPE.md's table; #207 has a `waiting` trigger and is not a decision (member rule); #215 is 🔴 and listed under ラベル矛盾 | measure | | |
| AC-29 | decisions exactly #206, #205, #202, #211, #201, #190, #204 with the scores 60.4, 45.8, 23.6, 15.4, 11.4, 0.4, 0.4; controls: without the chronic discount #205 ranks first (90.8); with a sum instead of the max, a constructed item with both a waiting label and a waiting pull request scores higher than the rule allows (quote both) | measure | | |
| AC-30 | the page: sections and lines in SCOPE.md's order (quote the page from `digest.md` in collect-only mode); every open tracked item exactly once among the four placements (a test counts them); ✅ #213, 🆕 #204 #210 (72 hours, Monday); a second test with `now` on a Tuesday uses 24 hours; no decision at all prints `今日決めることはない。`; degraded mode prints its line | measure | | |
| AC-31 | the guard: a valid narrative accepted; each rejection rule broken on its own is rejected with its reason (unknown `#n`, a decision the rules did not choose, a duplicate, the four length limits, more than 3 notes, `https://`, `www.`, an `@` mention, an Anthropic-style key, a GitHub-style token, `password`); an entry with an empty field is dropped, not rejected (quote the test names) | measure | | |
| AC-32 | narration through the fake CLI (its log quoted): the flags of SCOPE.md, the prompt on stdin, a working directory under the OS temp directory with no `CLAUDE.md`, `MAX_THINKING_TOKENS=0` in that process only (and absent with `DIGEST_THINKING_TOKENS=default`); a rejected first answer retried once; two rejections → degraded page, exit 0; an unchanged input → reused with zero calls; a rejected run leaves no `narrative.sha`; `usage.jsonl` written | measure | | |
| AC-33 | failures: a rate limit (403, remaining 0) → exit 2, the reset time printed, no `digest.md`; a 502 once → retried and the page is written; an unknown repository → exit 2; a bad `--now` → exit 3 (quote the four runs) | measure | | |
| AC-34 | `--feedback-issue 300`: the comment of 10/03 is in `narrate-input.json`, the one of 09/24 is not; the facts are identical with and without it (sha256 of `facts.json`) | measure | | |
| AC-35 | `skills/standup-digest/SKILL.md` and `references/`: valid (exit 0, length); the description says what, when and what not, naming the near misses (quote it); the references hold the lane, trigger and score rules and the page format exactly as SCOPE.md (quote the formula) | read + quote | | |
| AC-36 | `evals/standup-digest/grade.ts`: each mechanical assertion of both evals passes on a planted good output and fails on a planted violation of itself alone (quote the test names and counts); `agreementKey` tested | measure | | |
| AC-37 | `pnpm digest:demo -- --mode collect-only --out <tmp>` exits 0; run twice into two directories, `facts.json` and `digest.md` are byte-identical | measure | | |

### G3 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test` passes (quote the count), twice in a row with the same count | | |
| `pnpm lint` and `pnpm typecheck` are clean | | |
| Nothing listens on 18450–18459 after the goal, and no temporary directory of the goal is left | | |
| The change set is limited to the deliverables and this ledger (`git status --short`) | | |

## G4 — the measurements

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-38 | `pnpm skills:validate` on all three skills: exit 0, the description lengths quoted; the `sha256sum` of the three `SKILL.md` files quoted — the descriptions measured below are these, and they do not change for the rest of the run | measure | | |
| AC-39 | trigger rates, skill-trigger-probe (live): the command of SCOPE.md, exit code, positives passed /10, negatives passed /10, broken runs 0 (or each one with its reason), near-threshold queries, siblings fired, resolved model, CLI version, cost; the result files committed | live | | |
| AC-40 | trigger rates, verifiable-fetch (live): as AC-39 | live | | |
| AC-41 | trigger rates, standup-digest (live): as AC-39 | live | | |
| AC-42 | a query near the threshold or failed is re-measured with `--runs 6` and both measurements are kept; or there is none, said with the files that show it | live | | |
| AC-43 | A/B verifiable-fetch (live): 3 evals × 2 arms × 1 run, each `run` exit 0 (or the broken reason); the mechanical grades; every judgment assertion graded in `grading.json` with a quotation; contamination flags (none, or each explained); redaction counts | live | | |
| AC-44 | A/B standup-digest (live): 2 evals × 2 arms × 2 runs, as AC-43; for each arm, whether its two runs agree (the decision lists) | live | | |
| AC-45 | `report` for both skills: `benchmark.md` quoted; every number in it traced to a `run.json` (spot-check two) | measure | | |
| AC-46 | narration (live): `pnpm digest:demo -- --mode preview` — the narrative accepted or rejected (with the guard's reasons), the tokens from `usage.jsonl`; run again into the same directory: `narrative: reused`, and `usage.jsonl` gained no line | live | | |
| AC-47 | thinking (live): two calls with `MAX_THINKING_TOKENS=0` and two with `DIGEST_THINKING_TOKENS=default`, each into a fresh directory: output and thinking tokens of the four quoted, kept in `evals/standup-digest/results/narration-<date>.md`; no conclusion beyond the four numbers | live | | |
| AC-48 | no secret in any result: one `rg -n` each for an Anthropic-style key, the GitHub token prefixes (as character classes) and a URL carrying `user:password@`, over `evals/*/results` and `evals/.runs`, prints nothing; the sum of the redaction counts quoted | measure | | |
| AC-49 | the cost of the goal: the sum of the CLI-reported `total_cost_usd` of every live call of G4 (probe, arms, narration), with the token totals beside it | measure | | |

### G4 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| `pnpm test`, `pnpm lint` and `pnpm typecheck` pass | | |
| Every result file names its date, model (requested and resolved), CLI version and runs | | |
| Nothing listens on 18450–18459, and no temporary directory of the goal is left | | |
| The change set is limited to the results, the graded `grading.json` files and this ledger (`git status --short`) | | |

## G5 — README, CI and closing

| AC | Item | Plan | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| AC-50 | README.md: the English summary; the seven sections with exactly the names of SCOPE.md, in order (quote `grep -n '^## '`); the signature line exactly, as the last line (quote `tail -n 1`); 「背景」 links case study 06; 「設計」 separates 実務で実施した点 and デモで追加した点 per skill; 「結果」 quotes only this repository's runs, with the reading of the A/B and of the trigger rates | read + quote | | |
| AC-51 | `docs/reading-evals.md`: each lesson of materials section 5, followed by where this repository shows or guards against it (quote the headings) | read + quote | | |
| AC-52 | `.github/workflows/ci.yml` has the jobs of SCOPE.md; every `uses:` is a SHA of F21 with its version comment; `permissions: contents: read`; no `corepack enable`; every command of it that can run here was run and is quoted, the Windows job named as not runnable here | measure | | |
| AC-53 | PUBLISHING.md has a description, topics and the checklist; LICENSE is unchanged (`git diff --stat -- LICENSE` empty) | measure + read | | |
| AC-54 | the README's first command line (`pnpm i && pnpm test`) from a clean `node_modules` exits 0 (quote the last lines of each step) | measure | | |

### G5 closing

| Condition | Verdict | Evidence |
| --- | --- | --- |
| SCOPE.md rewritten as AS-BUILT, every difference from the frozen contract marked with a reason | | |
| Change list, and one proposed commit message per goal (G0–G5) | | |
| Nothing temporary left in the repository (`git status --short` shows deliverables only; `out/` and `evals/.runs/` are ignored) | | |
| Nothing of the run left: no listener on 18450–18459, no temporary directory of the run in the OS temp directory | | |
| The three `SKILL.md` files still have the sha256 quoted in AC-38: the published descriptions are the measured ones | | |
| No unexplained empty verdict anywhere | | |

---

## Handover (filled at the end; each item = fact, impact, the decision needed)

## Incidental findings (recorded, not fixed)

| # | Finding | Where | Note |
| --- | --- | --- | --- |
