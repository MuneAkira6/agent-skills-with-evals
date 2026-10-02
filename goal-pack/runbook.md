# Runbook — agent-skills-with-evals

<!-- For the human operator. The worker never needs this file. This run goes to a Linux host with its
     own CLAUDE_CONFIG_DIR and GOALBUS_ENV_FILE, launched with setsid nohup (see goal-bus-kit's
     examples/toy-run/README.md). -->

## 0. Before arming

- [ ] You created the branch yourself (no mechanical guard exists for this) and `git status` is clean.
- [ ] Both selftests are green **on the machine that will run the hooks**:
      `bash .claude/hooks/goal-bus.sh --selftest && bash .claude/hooks/evidence-gate.sh --selftest`
- [ ] `.claude/settings.local.json` has the permissions and hooks from `settings.hooks.json`, and
      `bash .claude/hooks/goal-bus.sh --status` reports the hook timeout as ok.
- [ ] Nothing else uses the same environment: no other armed pack in any working tree or on any
      machine, and nobody testing by hand. Check again right before launch.
- [ ] Caps are calibrated: one run (6 goals, about 7 reviews, 84 rows) is below MAX_REVIEWS / MAX_TURNS.
- [ ] The usage budget for this run is available: besides the worker and the bus, G4 makes live calls
      (about 180 probe runs, 14 A/B arms with a budget cap each, a few narration calls; facts F15).
- [ ] On a shared host: the run has its own `CLAUDE_CONFIG_DIR`, so the account's MCP servers, skills
      and memory stay out. The CLI authenticates with an environment token, so set `GOALBUS_ENV_FILE`
      (see `bus.config.sh`) and prove it with one real call made from an environment that lacks the
      token.
- [ ] The environment file also exports **`CLAUDE_CALL_ENV_FILE` naming itself**, so that the nested
      calls of this repository authenticate (facts F9, F10); it puts the run's `bin` directory on `PATH`
      and sets the Bash tool's timeouts (a 5-minute default, a 10-minute ceiling).
- [ ] Ports 18450–18459 are free (F5).

## 1. Seed the bus

```bash
bash .claude/hooks/goal-bus.sh --seed      # starts a session that reads the pack, records its id
```

## 2. Arm and launch

```bash
touch goal-pack/.gate-armed goal-pack/.bus-armed
bash .claude/hooks/bin/start-worker.sh --file goal-pack/g0-instructions.md   # add --detach to background it
```

## 3. Watch

```bash
bash .claude/hooks/bin/watch.sh            # events only; it never reads transcripts for protocol text
bash .claude/hooks/goal-bus.sh --status    # where the run is, what was actually reviewed, cost
```

## 4. The goals

### G0 — toolchain, the environment re-measured, the contract frozen
- Instructions for the worker: `goal-pack/g0-instructions.md`
- After the bus's PASS, check yourself: nothing was installed outside the repository; the given files
  are unchanged (`git status --short fixtures evals`). · Commit: `Install the skeleton and freeze the contract`

### G1 — skill-trigger-probe and the A/B runner
- Step for the bus to adapt into instructions: the frontmatter parser and validator, the launcher and
  the stream parser on the recorded samples, the probe, the A/B runner with its sandbox and redaction,
  the skill.
- Check yourself: the six samples classify as SCOPE.md says; the redaction control really leaked
  without redaction. · Commit: `Add the trigger probe, the frontmatter validator and the A/B runner`

### G2 — verifiable-fetch
- Step for the bus to adapt into instructions: the mock tracker, the fetcher's checks, names and paths,
  the API key's origin rule, the skill, the grader.
- Check yourself: no HTML is ever saved under an image's name; no token in any output.
  · Commit: `Add the Redmine fetcher that verifies every attachment, with its mock and grader`

### G3 — standup-digest (look at the page in person)
- Step for the bus to adapt into instructions: the mock GitHub API, collection, activity, lanes,
  decisions, the page, narration and the guard, the skill, the grader.
- Check yourself: the decision list is the one of SCOPE.md; the page reads well in Japanese.
  · Commit: `Add the stand-up digest from a GitHub milestone, with its mock and grader`

### G4 — the measurements (live)
- Step for the bus to adapt into instructions: the three trigger measurements, the A/B runs one arm
  at a time, the judgment grades with quotes, the reports, the narration and thinking measurements, the
  secret search, the cost.
- Check yourself: open two arms' outputs and compare with their grades; read the benchmark's caveats.
  · Commit: `Measure the trigger rates, the A/B runs and the narration on the host`

### G5 — README, CI and closing
- Step for the bus to adapt into instructions: the README in the seven sections with the signature, the
  reading guide, the CI, PUBLISHING.md, SCOPE.md → AS-BUILT.
- Check yourself: the leak scan (human only), then the README top to bottom.
  · Commit: `Add the README, the reading guide, CI and publishing notes`

## 5. When the relay stops

| Situation | What you see | What to do |
|---|---|---|
| Usage limit | BUS-LOG: "stopped by a usage or rate limit", or G4's live calls broken with a limit message | wait for the reset, then `start-worker.sh --resume <worker-id> "continue"`; never retry in a loop |
| ESCALATE | a systemMessage and a BUS-LOG entry | write the ruling into BUS-MEMORY.md, then `goal-bus.sh --notify "<ruling>"`, then resume the worker with `--next` |
| Planned pause | `.bus-paused` exists | when ready: `start-worker.sh --resume <worker-id> --file goal-pack/.bus-next` |
| Lost or unparsed verdict | BUS-LOG "UNPARSED" or a failed wake-up | `goal-bus.sh --recover`, then hand the NEXT block to the worker; do not pay for the review twice |
| Crash or stale lock | `--status` shows the lock held | make sure nothing is half-written, `goal-bus.sh --reset`, resume |
| Turn cap or reject cap | a systemMessage | read BUS-LOG; split the goal or change the approach rather than raising the cap |
| The worker ended silently | `watch.sh` prints `[ended]` or `[stall?]` | read the end of `goal-pack/.worker-log`; resume with a corrective instruction |

Never retype the command that wakes the bus: `--notify` is the one way to talk to it.

## 6. Rubber-stamp audit (the one hole no mechanism closes)

Read `BUS-REVIEWS.md` after the first PASS, after every high-risk goal and before the final commit.
Treat a verdict as suspect when two or more of these hold:

1. no first-person verification (I read, I ran, I queried);
2. every fact traces back to the worker's own report;
3. a PASS without any caveat, risk, debt or new question;
4. a REJECT without ordered steps, a completion criterion, a turn budget or a way out;
5. the same instructions as last time, nothing adapted to what was found;
6. the worker's counts or lists accepted without a recount;
7. BLOCKED versus DEFERRED never questioned;
8. no context figure or environment state, so the verdict cannot be tied to a moment.

## 7. After the run

- Commit, checking every commit message against the change it describes.
- Disarm: `rm goal-pack/.bus-armed goal-pack/.gate-armed`
- Keep BUS-LOG.md, BUS-REVIEWS.md, BUS-MEMORY.md, BUS-HANDOFF.md and PROGRESS.md in the repository;
  they are the evidence that makes the run auditable later. Keep `evals/.runs/` out of git.
- What the run cannot do, done by the human: `pnpm test` and `pnpm skills:validate` on Windows; the
  trigger probe on Windows (with the author's own configuration, its skills as siblings, or isolated
  with an environment token), the result added beside the Linux one; the README's results and limits
  updated, recorded under "Changes after the run" in SCOPE.md.
