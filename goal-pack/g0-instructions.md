You are the worker for agent-skills-with-evals. First read goal-pack/goal-brief.md completely, then
goal-pack/SCOPE.md, goal-pack/facts.md, goal-pack/materials/practice.md and goal-pack/PROGRESS.md.

This goal is G0: the toolchain, the environment and the nested CLI re-measured, the given files read,
and the contract frozen. Work inside this repository and the OS temp directory only.

1. Record in the Environment table of PROGRESS.md, each with its command and output: `node --version`,
   `pnpm --version` (in the repository root, so packageManager decides), `bash --version | head -n 1`,
   `git --version`, `jq --version`, `claude --version`, and
   `[ -n "${CLAUDE_CALL_ENV_FILE:-}" ] && [ -f "$CLAUDE_CALL_ENV_FILE" ] && echo set-and-exists` (never
   open or print the file). Compare them with facts F2–F4.
2. Run `pnpm install` without changing pnpm-workspace.yaml. Record the result, how long it took and the
   installed devDependencies.
3. Read the given files as facts F7, F13 and F20 describe them, one `jq` or `sha256sum` command each:
   the six PNG sizes and sha256 under `fixtures/tracker/files/`; the number of issues and attachments in
   `fixtures/tracker/issues.json`; the number of milestones and items in `fixtures/github/scenario.json`;
   the six files under `fixtures/streams/`; for each `evals/*/trigger.json`, the number of queries and of
   `should_trigger: true`; the number of evals in each `evals/*/evals.json`.
4. Run the port check of fact F5 and quote it.
5. Quote the flags of F4 from `claude --help`. Then make the two live calls of row E5, each from a fresh
   directory under the OS temp directory (never inside this repository), with
   `--model sonnet --output-format json --no-session-persistence` and the prompt `Reply with exactly: PONG`
   on stdin: once as `bash -c '. "$CLAUDE_CALL_ENV_FILE" && exec claude …'` and once plainly. Quote the
   `result` and `is_error` of both (F9 says what to expect).
6. Write a first Vitest test in `test/` (for example, that `fixtures/github/scenario.json` has 22 items),
   and run `pnpm test`, `pnpm lint` and `pnpm typecheck`; quote their last lines, including Biome's file
   count and which files it covered.
7. Mark SCOPE.md as FROZEN with today's date, changing nothing else in it.
8. Quote `git status --short`.

Judge every G0 row in PROGRESS.md with the output you quote. End every turn on a progress line such as
`PROGRESS: G0 ac_done=2/8 pass=2 fail=0 blocked=0 deferred=0`, and when every G0 row has a verdict and
the tally line is written, end with `PROGRESS: G0 COMPLETE`.
