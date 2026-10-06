# agent-skills-with-evals — scope and contract

**Contract status: FROZEN 2026-10-05; AS-BUILT section appended 2026-10-05.** Frozen in G0 (content unchanged, date added); the contract text that follows is unchanged, and every difference the build has from it is recorded in the `# AS-BUILT — 2026-10-05` section at the end of this file.

Three Claude Code skills from the author's practice, each rebuilt so that a reader can run it, and each
with an eval suite whose numbers come from real runs of the CLI:

| Skill | In one line |
|---|---|
| `skills/skill-trigger-probe/` | validates a skill's frontmatter against the published limits, and measures how often a skill triggers on positive and near-miss queries — telling a broken run from a negative one, on Windows as on Linux |
| `skills/verifiable-fetch/` | saves a Redmine issue as Markdown with its attachments, where an attachment counts as fetched only when the bytes on disk match the size in the metadata and the type matches the content |
| `skills/standup-digest/` | a stand-up page from a GitHub repository's current milestone: rules choose the lanes, the decisions and their order; a language model writes only short sentences, behind a guard; an unchanged input reuses the last accepted text without a call |

The rules come from the author's practice, summarised in [materials/practice.md](materials/practice.md).
The measured facts are in [facts.md](facts.md) (F1–F22 by the author); the run appends its own from F23
on. The example product is **Acme Tasks**, a fictional task board; every name in the fixtures is
fictional.

## Deliverables

| Path | Content |
|---|---|
| `skills/skill-trigger-probe/SKILL.md`, `references/*.md` | the skill |
| `skills/skill-trigger-probe/scripts/validate.ts` | the frontmatter validator (`pnpm skills:validate`) |
| `skills/skill-trigger-probe/scripts/probe.ts` | the trigger probe (`pnpm probe`) |
| `skills/skill-trigger-probe/scripts/lib/*.ts` | the launcher, the stream parser, the frontmatter parser, redaction |
| `skills/verifiable-fetch/SKILL.md`, `references/*.md`, `scripts/*.ts` | the skill and its fetcher (`pnpm fetch-issue`) |
| `skills/standup-digest/SKILL.md`, `references/*.md`, `scripts/*.ts`, `digest.config.json` | the skill, its pipeline (`pnpm digest`) and the example configuration |
| `harness/mocks/tracker.ts`, `harness/mocks/tracker-cli.ts` | the mock Redmine and its media host (`pnpm mock:tracker`) |
| `harness/mocks/github.ts`, `harness/mocks/github-cli.ts` | the mock GitHub REST API (`pnpm mock:github`) |
| `harness/fetch-demo.ts`, `harness/digest-demo.ts` | each skill's script run against its mock in one process (`pnpm fetch:demo`, `pnpm digest:demo`) |
| `harness/ab.ts` and its modules | the A/B runner (`pnpm eval`) |
| `evals/<skill>/grade.ts` | the mechanical grader of each A/B suite (verifiable-fetch, standup-digest) |
| `evals/<skill>/results/` | the measurements of G4 (JSON and Markdown) |
| `test/**/*.test.ts` | Vitest tests; `test/fake-claude/` is the fake CLI the tests use |
| `docs/reading-evals.md` | how to read these evals (Japanese) |
| `README.md`, `PUBLISHING.md`, `.github/workflows/ci.yml`, `pnpm-lock.yaml` | as described below |

**Given and not to be changed**: `LICENSE`, `.gitattributes`, `.gitignore`, `package.json`,
`pnpm-workspace.yaml`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, everything under `fixtures/`,
`evals/*/trigger.json`, `evals/*/evals.json`, entries F1–F22 of `goal-pack/facts.md`, and everything under
`goal-pack/materials/`. The trigger queries and the A/B evals were written by the author before the
skills existed; nobody tunes them, and nobody tunes a description to them (section "Descriptions"). If a
given file really has to change, record the reason under "Contract changes" in PROGRESS.md first.

`package.json` fixes the script names and their entry files; the layout above follows from them.

## Shared rules

- **A skill directory stands alone.** Everything under `skills/<name>/` runs with Node 24 and its
  built-in modules only — no npm package, no import from outside its own directory — so that copying the
  directory into another repository's `.claude/skills/` is the whole installation. The scripts are
  TypeScript run directly by `node` (F2): erasable syntax only, local imports with the `.ts` suffix,
  `import type` for types. The harness and the tests may import from the skills, never the reverse.
- **Paths** are built with `node:path`, never by string concatenation; programs are started with
  `spawn` / `spawnSync` and an argument array, never through a shell (`shell: true` appears nowhere).
- **Nothing is guessed.** An input the code cannot read exactly is an error with a message that names
  it; it is never repaired silently.
- **Two runs agree.** Every output file that does not carry a measurement (a duration, a cost) is
  byte-identical when produced twice from the same inputs.
- **Ports** (all on `127.0.0.1`): **18451** the mock tracker, **18452** its media host, **18453** the mock
  GitHub API — used by the A/B runs, the demos' defaults and manual runs. Tests listen on port 0 (any
  free port). Nothing listens on anything but `127.0.0.1`.

### Every `claude` this repository starts

Three places start the real CLI: the probe's runs, the A/B arms and the digest's narration. All of them:

- run in a working directory **in the OS temporary directory**, never inside a repository: this
  repository's `.claude/settings.local.json` holds the run's Stop hooks, and a session started inside it
  would be gated by them (the evidence gate does not tell sessions apart);
- take the prompt **on standard input**, never as an argument (no quoting of user text on any platform,
  F13), and capture stdout and stderr (nothing is inherited);
- remove `CLAUDECODE` from the child's environment (the author's practice: a nested session is a
  separate session);
- honour **`CLAUDE_CALL_ENV_FILE`**: when it is set, the call becomes
  `bash <wrapper> <file> <overrides…> <claude> <args…>`, where the wrapper sources the file, then
  `exec env` applies the caller's overrides (`NAME=value`, and `-u NAME` for each name to remove — always
  `CLAUDE_CALL_ENV_FILE` itself) and runs the CLI. The overrides come after the file so that the file
  cannot undo them. This exists because the CLI does not pass its own credential to the tools of the
  session that runs this code (F9); the wrapper is how a nested call authenticates on such a machine
  (F10). Without the variable the call is spawned directly with the overrides applied;
- use **`CLAUDE_BIN`** when it is set: the executable to run instead of `claude`; a path ending in `.ts`,
  `.js` or `.mjs` is run as `node <path>` (`process.execPath`) — this is how the tests substitute the
  fake CLI;
- on a timeout, kill the process and its children (POSIX: the process group, started `detached`;
  Windows: `taskkill /pid <pid> /T /F`) and report `timedOut`;
- never print, log or write the value of an environment variable.

The probe and the A/B runner share one launcher (`skills/skill-trigger-probe/scripts/lib/claude.ts`);
the digest has its own, smaller one inside its own directory (a skill stands alone).

---

## skill-trigger-probe

### The frontmatter parser — `scripts/lib/frontmatter.ts`

Reads the YAML frontmatter at the top of a `SKILL.md` (a first line `---`, a closing `---`). Supported,
exactly: top-level `key: value` with a plain scalar (ending at ` #` or the end of the line; a plain
scalar may continue on more-indented lines, folded with single spaces), a double-quoted scalar (escapes
`\"`, `\\`, `\n`, `\t`, `\uXXXX`), a single-quoted scalar (`''` for a quote), a block scalar (`|`, `|-`,
`>`, `>-`), a list of scalars (`- item` lines under the key), and one level of `key: value` pairs under
`metadata:`. Comment lines and blank lines are skipped. A duplicated key, a tab used for indentation, or
any other construct (anchors, tags, flow `{}` / `[]`, deeper nesting) is an error naming the line —
the parser never guesses.

### The validator — `pnpm skills:validate [<skill-dir>...]`

With no argument it validates every directory under `skills/`. Each rule has an id and cites its
source (F12): **A** = the Agent Skills specification (agentskills.io), **C** = the Claude documentation
(platform.claude.com).

| Id | Error | Source |
|---|---|---|
| V1 | `SKILL.md` missing, or no frontmatter | A |
| V2 | `name` missing or empty, longer than 64 characters, or not lowercase letters, digits and single hyphens (no leading, trailing or doubled hyphen) — A, C; or different from the directory name — A | A, C |
| V3 | `name` contains `anthropic` or `claude` | C |
| V4 | `description` missing or empty, or longer than 1,024 characters | A, C |
| V5 | `description` contains an XML tag (`<` followed by a letter, `/`, `!` or `?`, up to `>`) | C |
| V6 | `compatibility` longer than 500 characters; `metadata` not a map of strings to strings | A |

Warnings (never an error): `SKILL.md` longer than 500 lines (A's recommendation); `allowed-tools` given
as a list instead of A's space-separated string; a key outside the specification (listed as
information: products add their own keys). A description longer than 1,024 characters also gets the
measured note: the CLI versions measured here passed only its first 1,536 characters to the model,
followed by `…` (F11).

Output: per skill `ok <name> (description <n> characters)` or `FAIL <name>` followed by one line per
finding (`V4 description: 1,563 characters (limit 1,024, A, C)`), then a summary line. Exit `0` every
skill valid (warnings allowed), `1` at least one error, `3` a directory or file that cannot be read, or a
frontmatter construct outside the supported subset.

### The stream parser — `scripts/lib/stream.ts`

Reads the stdout of `claude -p --output-format stream-json --verbose`: lines that start with `{` are
JSON events; other lines are counted and ignored. From the recorded samples in `fixtures/streams/`
(F7, F8, F13), a run is classified, in this order:

1. **broken**, with a reason: `spawn-error`; `timeout`; `no-init` (no `system`/`init` event);
   `no-result` (no `result` event); `auth` (an `assistant` event carrying an `error` field, such as
   `authentication_failed`, or a result with `terminal_reason: "api_error"` — such a result says
   `subtype: "success"`, F8); `not-loaded` (the skill under test is not in the init event's `skills`);
2. otherwise **triggered** when an `assistant` event holds a `tool_use` named `Skill` whose
   `input.skill` equals the skill's name (or ends in `:<name>` for a plugin's skill), or a `tool_use`
   named `Read` whose `file_path` (with `\` read as `/`) ends in `/<name>/SKILL.md`;
3. otherwise **not-triggered**.

The exit code never decides alone: a run that used any tool under `--max-turns 1` exits 1 with
`subtype: "error_max_turns"` (F7), and that is a valid run. The parser also returns `fired` (every
skill name invoked, in order), the init's `model` and `claude_code_version`, the result's
`total_cost_usd`, `duration_ms` and `usage` (with `output_tokens_details.thinking_tokens`).

### The probe — `pnpm probe -- …`

```
pnpm probe -- --skill <skill-dir> [--sibling <skill-dir>]... --queries <trigger.json> --runs <n>
              --model <model> --out <file.json> [--concurrency <k>] [--timeout <seconds>] [--isolated-config]
```

- `--model` is required: there is no default model (the author's earlier probe defined one and never
  passed it to the CLI).
- The skill is validated first; a failing validation stops the probe (exit 3).
- The probe builds a temporary project in the OS temporary directory holding only
  `.claude/skills/<name>/` for the skill and for each `--sibling` (copies), and uses it as the working
  directory of every run. The project is removed at the end, also on failure.
- Each run: `claude -p --model <model> --output-format stream-json --verbose --max-turns 1
  --no-session-persistence --strict-mcp-config`, the query on stdin. Defaults: concurrency 4, timeout
  240 s.
- `--isolated-config`: every run gets a fresh `CLAUDE_CONFIG_DIR` under the probe's temporary directory
  (so no user-level skill, setting, memory or MCP server is loaded); authentication must then come from
  the environment — through `CLAUDE_CALL_ENV_FILE` where the tools do not inherit it (F9, F10). Without
  it the caller's own configuration applies and its skills appear as siblings (F13).
- `trigger.json` is a list of `{ "id", "query", "should_trigger" }`.
- Per run: query id, run index, status (`triggered` / `not-triggered` / `broken`), the broken reason,
  `fired`, duration, the init's model and CLI version, the CLI-reported cost.
- Per query: valid runs (not broken), triggered runs, **rate = triggered ÷ valid** (null with no valid
  run), and `passed` (positives: rate ≥ 0.5; negatives: rate < 0.5; false when the rate is null). Flags:
  `incomplete` (valid < runs) and `near-threshold` (0.25 ≤ rate ≤ 0.75 with fewer than 6 valid runs —
  three runs cannot tell 0.33 from 0.5; re-measure such a query with `--runs 6` or more).
- Summary: positives passed / positives, negatives passed / negatives, broken runs by reason, the
  near-threshold queries, the siblings that fired (name → count), the requested and the resolved model,
  the CLI version, the date (UTC), runs per query, the total CLI-reported cost.
- Output: `<file>.json` with all of the above and `<file>.md` beside it (the summary and one row per
  query: id, expectation, rate, valid runs, flags, siblings fired).
- Exit `0` the measurement is complete (no broken run), `2` at least one broken run (the files are still
  written and say `incomplete`), `3` a usage error or a failed validation.

### The skill itself — `skills/skill-trigger-probe/SKILL.md`

What it is for, how to run both commands from the skill's own directory
(`node .claude/skills/skill-trigger-probe/scripts/probe.ts …`), and how to read the result:
a broken run is not a negative result; a rate near the threshold needs more runs; a zero can mean
"nothing fired" or "a sibling won", which call for opposite fixes — read `fired`; measure with the model
you will use; a description beyond the limit is cut before the model sees it (F11); a change to a
description invalidates earlier rates. Details in `references/` (one level deep).

---

## The A/B runner — `pnpm eval -- …`

```
pnpm eval -- run --skill <name> --eval <id> --arm with|without --run <k> --model <model> --out <dir>
             [--raw <dir>] [--timeout <seconds>] [--budget <usd>]
pnpm eval -- report --skill <name> --out <dir>
```

One `run` is one arm of one eval, once — so that every command stays under ten minutes (defaults:
timeout 540 s, budget 3 USD). `report` reads every run under `<dir>` and writes the benchmark.

**`run`**, for `evals/<skill>/evals.json` entry `<id>`:

1. A fresh temporary directory with `ws/` (the working directory), `home/` and `cfg/`. `ws/` gets the
   eval's `workspace.dirs`; the `with` arm also gets `ws/.claude/skills/<skill>/`, a copy of
   `skills/<skill>/`. Nothing else is in `ws/`.
2. The eval's `mocks` are started on their fixed ports with fresh state (`tracker` → 18451 and 18452;
   `github` → 18453), and stopped at the end of the run.
3. The arm: `claude -p --model <model> --output-format stream-json --verbose --no-session-persistence
   --strict-mcp-config --permission-mode bypassPermissions --max-budget-usd <budget> --disallowedTools
   WebFetch WebSearch "Bash(sudo:*)" "Bash(docker:*)" "Bash(git push:*)" --append-system-prompt "<notice>"`,
   the eval's prompt on stdin, the overrides `HOME=<tmp>/home`, `CLAUDE_CONFIG_DIR=<tmp>/cfg`, and
   `-u CLAUDE_CALL_ENV_FILE -u GOALBUS_ENV_FILE`. The notice is exactly:
   `You are running inside an evaluation sandbox. Work only inside the current working directory. Do not read, list or search anything outside it. The services the task names are on 127.0.0.1; use no other network service. Do not print environment variables.`
   Both arms are identical apart from the skill's directory. Inside an arm, a nested `claude` — the
   digest's narration — has no credential: the runner removes `CLAUDE_CALL_ENV_FILE`, and the CLI does
   not pass its own token to the arm's tools (F9, F10). The digest then writes its degraded page. That
   is expected and is reported as such in the results; it is not "fixed" by handing an arm any
   credential.
4. **Redaction before anything is written.** Every line of the arm's stdout and stderr is redacted
   before it reaches a file: each exact value of the proxy variables (`HTTP_PROXY`, `HTTPS_PROXY`,
   `http_proxy`, `https_proxy`) and of every variable whose name contains `TOKEN`, `SECRET`, `PASSWORD`
   or `KEY` (values of 8 characters or more) in the runner's own environment, and the patterns
   `sk-ant-` followed by a key, `gh[pousr]_` and `github_pa[t]_` followed by a token, a URL's
   `user:password@`, and the values of the query parameters
   `token`, `signature`, `sig`, `expires` and `X-Amz-*`. Each replacement is counted. The arm's
   `.claude.json` and transcript never leave its temporary directory, which is removed at the end.
5. Written to `<out>/<eval>/<arm>/run-<k>/`, before the temporary directory is removed:
   `outputs.json` (every file the arm left in `ws/` outside `.claude/`: its path relative to `ws/`, size,
   sha256 and its first 64 bytes in base64), `outputs/` (those files of 1 MB or less, copied; a larger
   one is listed in `outputs.json` only), `transcript.md` (one line per tool call — name and a redacted
   input of at most 160 characters — then the final reply), `run.json` (status and broken reason, the
   absolute path `ws/` had, duration, turns, model, CLI version, tokens, CLI-reported cost, the redaction
   count, the mock log summary — requests by method and path, the tokens the media host issued — the
   contamination flags, and the path of the raw transcript) and `grading.json`. The redacted stream
   itself, `transcript.jsonl`, goes to `<raw>/<skill>/<eval>/<arm>/run-<k>/` (default `evals/.runs`,
   git-ignored; tests pass a temporary directory).
6. Grading: `evals/<skill>/grade.ts` exports `grade(evalId, runDir, context)` and returns, for every
   assertion of the eval, `{ id, kind, passed, evidence }`, reading `outputs.json`, `outputs/`, the final
   reply and `run.json` (never the arm's temporary directory, which is gone); mechanical assertions are
   decided by the grader, judgment assertions are written with `passed: null` and empty evidence, to be
   graded by a reader who quotes the evidence (file and line, or the reply's words). It also exports
   `agreementKey(evalId, runDir)`, the string two runs of one arm are compared on: for standup-digest
   the decision list (the numbers the grader reads for M2 or M1), for verifiable-fetch the sorted sha256
   of the non-Markdown files in `outputs.json`.
7. Contamination flags: a tool call that names a path outside the arm's temporary directory; in the
   `without` arm, any mention of the skill's directory; a URL in a command whose host is not `127.0.0.1`
   or `localhost`.

Exit of `run`: `0` the arm ran to its end (whatever the grades; an arm stopped by its budget or its
turns has ended, and `run.json` says so), `2` the arm broke (timeout, authentication, crash — the reason
is in `run.json`; the same classification as the stream parser's), `3` a usage error.

**`report`** writes `<out>/benchmark.json` and `benchmark.md`: per eval and arm, the runs, mechanical
passed / total, judgment passed / total (or "pending"), median duration, tokens (input, cache read, cache
creation, output), CLI-reported cost, redactions, flags; for an arm with two runs or more, whether the
runs agree (for standup-digest: the decision lists). It changes no run directory.

---

## verifiable-fetch

### The fetcher

```
node .claude/skills/verifiable-fetch/scripts/fetch.ts --base <url> --issue <id> --out <dir> [--max-path <n>]
```

(In this repository: `pnpm fetch-issue -- …`.) `REDMINE_API_KEY`, when set, is sent as
`X-Redmine-API-Key` **only to requests whose origin is the origin of `--base`** — never to a redirect
target elsewhere — and is never printed.

1. `GET <base>/issues/<id>.json?include=attachments,journals` (shapes: F19). Anything but 200 → exit 2
   (`issue <id>: HTTP <status>`), nothing written.
2. Before any download: if `<abs out>/attachments/<id>/` plus 20 characters exceeds `--max-path`
   (default 240), exit 3 (`output directory too deep for --max-path <n>`).
3. Each attachment: `GET content_url`, following at most 5 redirects by hand (the key only to the
   tracker's origin). The body streams to a temporary file in the target directory while its bytes are
   counted. It is **fetched** only when the status is 200, the byte count equals `filesize`, and the
   content matches the type: `image/png` starts with `89 50 4E 47 0D 0A 1A 0A`, `image/jpeg` with
   `FF D8 FF`, `image/gif` with `GIF8`, `application/pdf` with `%PDF-`, `application/zip` with
   `50 4B 03 04`; for any type other than `text/html`, a body that begins (after whitespace) with
   `<!doctype html` or `<html` (any case) is refused. Then the temporary file is renamed to its final
   name; otherwise it is deleted and the attachment is **failed** with one reason: `HTTP <status>`,
   `size <got> != <filesize>`, `type <content_type>: signature mismatch`, `type <content_type>: got HTML`,
   `too many redirects`, `network: <code>`.
4. Names: `<out>/attachments/<id>/<name>`, where `<name>` is the attachment's file name with `/`, `\`,
   `<`, `>`, `:`, `"`, `|`, `?`, `*` and control characters replaced by `_`, a Windows device name
   (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) prefixed with `_`, and a name taken twice
   suffixed with `-<attachment id>` before the extension. When the absolute path would exceed
   `--max-path`, the stem is cut and `-<first 8 hex of sha256(original name)>` added so that it fits;
   the extension is kept.
5. `<out>/<id>.md`, in this order: `## Title` (`#<id>: <subject>`); `## Meta` (a table: Project,
   Tracker, Status, Priority, Author, Assignee when there is one, Created and Updated as `YYYY-MM-DD`, URL
   `<base>/issues/<id>`); `## Description` (the text as it is, except that a line starting with one to
   five `#` and a space gets one more `#`); `## Journals` (oldest first: `### <user> — <YYYY-MM-DD HH:MM>
   UTC`, the notes, then one `- <name>: <old> → <new>` line per detail; a journal with neither notes nor
   details is left out; `（なし）` when nothing is left); `## Attachments` (a table: File (the original
   name), Size (from the metadata), Saved as, Result — `OK` or `取得失敗: <reason>`), then for each image
   fetched a `### <original name>` heading, the image link and the line `（説明なし）`.
6. stdout: one line per attachment, `OK <saved name> <bytes>` or `FAIL <original name>: <reason>`, every
   URL in any message redacted (the query values of `token`, `signature`, `sig`, `expires`, `key` and
   `X-Amz-*`), then `fetched #<id>: <n> attachments, <ok> ok, <failed> failed`.

Exit `0` every attachment fetched, `1` at least one failed (the Markdown is still written), `2` the issue
could not be fetched, `3` a usage error or an output directory too deep.

**The skill** (`SKILL.md`) tells the agent to run the fetcher, then to open every image it saved and
replace each `（説明なし）` with one or two sentences saying what the image shows, and to report the
failed attachments with their reasons. It says why the rules exist (a gateway's error page is also a
plausible file; a signed URL is a credential; a long path breaks the archive for Windows tools).

### The mock tracker — `harness/mocks/tracker.ts`

`startTracker({ trackerPort, mediaPort, requireKey }) → { trackerUrl, mediaUrl, log(), issuedTokens(),
close() }`, serving `fixtures/tracker/issues.json` (four Redmine-shaped issues; `{tracker}` in each
`content_url` becomes the tracker's origin; `x-mock` is never served):

- `GET /issues/<id>.json[?include=…]` → `{ "issue": … }`; the `attachments` and `journals` keys appear only
  when named in `include` (as Redmine does); an unknown id → 404 with an empty body (F19);
- `GET /attachments/<id>.json` → `{ "attachment": … }`;
- `GET /attachments/download/<id>/<name>` (the name is ignored, as Redmine does), by the attachment's
  `x-mock.mode`: `direct` → 200 with the file's bytes; `signed` → 302 to the media host
  `/media/<id>?token=<32 hex, random per redirect>&expires=<epoch + 300>`, where the media host answers
  200 with the bytes for a valid, unexpired token and 403 otherwise; `blocked` → 302 to the media host,
  which answers 403 `text/html` with a gateway's "Access denied" page; `login-page` → 200 `text/html`
  with a sign-in page; `truncated` → 200 chunked with only the first half of the file; `missing` → 404
  `text/html`;
- the archive of attachment 304 is generated: the bytes `50 4B 03 04`, then for each following byte one
  step of xorshift32 (`s ^= s << 13; s ^= s >>> 17; s ^= s << 5`, unsigned 32-bit, seed `0x2545F491`) and
  its low 8 bits, 3,145,728 bytes in all (sha256 in F20);
- `requireKey`: the tracker answers 401 without the right `X-Redmine-API-Key`; the media host never
  needs it;
- every request is logged: server (`tracker` / `media`), method, path, the names of the query
  parameters, whether an API key header was present (never its value), the status;
- anything but GET → 405, logged. `tracker-cli.ts` starts it on 18451/18452 and writes the log as JSON
  lines.

`pnpm fetch:demo -- --issue <id> --out <dir> [--max-path <n>]` starts the mock in-process on free ports,
runs the fetcher against it and stops the mock.

### The grader — `evals/verifiable-fetch/grade.ts`

Implements M1–M5 of the three evals exactly as `evals.json` words them, from the run's `outputs.json`,
`outputs/`, the final reply and `run.json` (the mock log, the workspace's absolute path). Each check is
tested on a planted good output (passes) and on a planted violation of that check alone (fails).

---

## standup-digest

### The configuration — `skills/standup-digest/digest.config.json`

```json
{
  "repo": "acme/tasks",
  "timezone": "Asia/Tokyo",
  "waitingLabels": ["status: waiting"],
  "inProgressLabels": ["status: in progress"],
  "members": ["aoi-tanaka", "ren-suzuki", "mei-mori", "kai-ito", "yui-kato"],
  "thresholds": { "silentDays": 14, "staleDays": 5, "waitingDecisionDays": 5, "reviewDecisionDays": 2,
                  "capDays": 30, "chronicDays": 60, "maxNarrated": 12 }
}
```

`--config <file>` replaces it. The members are the people in the stand-up.

### The pipeline

```
node .claude/skills/standup-digest/scripts/digest.ts preview|collect-only [--repo <owner/name>]
     [--api <url>] [--milestone <number>] [--now <ISO 8601>] [--out <dir>] [--config <file>]
     [--model <model>] [--feedback-issue <number>]
```

(In this repository: `pnpm digest -- …`.) Defaults: `--repo` the configuration's `repo`, `--api
https://api.github.com`, `--now` the current time, `--out <OS temp>/standup-digest`, `--model sonnet`
(the practice's choice). `GITHUB_TOKEN`,
when set, is sent as `Authorization: Bearer …` and never printed. Every request carries
`Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28` and `User-Agent:
standup-digest`. Pages are followed through `Link: <…>; rel="next"` only — never by counting (F16).

**Collect** (shapes: F16, F17):

1. `GET /repos/<repo>/milestones?state=all&per_page=100`. The **current** milestone is `--milestone`, or
   the open one with the earliest non-null `due_on`; none → exit 2 (`no current milestone`). The
   **previous** milestone is the closed one with the latest non-null `due_on` (none: no carry-over).
2. `GET /repos/<repo>/issues?milestone=<current>&state=all&per_page=100` → the items (issues and pull
   requests; a pull request carries `pull_request` and `draft`).
3. `GET /repos/<repo>/issues?milestone=<previous>&state=open&per_page=100` → the **carry-over** items
   (open, still in a closed milestone; an issue has one milestone at most).
4. For every open item: `GET /repos/<repo>/issues/<n>/timeline?per_page=100`.
5. Every open pull request involved — an item that is a pull request, or one linked to an open item —
   gets `GET /repos/<repo>/pulls/<n>/reviews?per_page=100`; a linked one that is not an item also gets
   `GET /repos/<repo>/pulls/<n>` (for `draft`) and its timeline (for `ready_for_review`).
6. `--feedback-issue <n>`: `GET /repos/<repo>/issues/<n>/comments?since=<now − 7 days>&per_page=100`.

A response 403 or 429 with `X-RateLimit-Remaining: 0` → exit 2 with the reset time in the configured
timezone; a 5xx → two more tries (after 1 s and 2 s), then exit 2; any other non-2xx → exit 2. **No page
is written from partial data.** The number of requests is printed and kept in `facts.json`.

**Time.** `today` is the date of `now` in the configured timezone. A number of days is
`floor((now − t) ÷ 24 h)`. `updated_at` is never used for anything (F18).

**Activity** — the evidence that someone worked on the item: the item's creation, and these timeline
events: `commented` (`created_at`), `committed` (`committer.date`; it has no `created_at`, F17),
`reviewed` (`submitted_at`), `closed`, `reopened`, `renamed`, `referenced`, `ready_for_review`,
`convert_to_draft`, `merged`, `head_ref_force_pushed`; `cross-referenced` only when its source is a pull
request of the same repository (`source.issue.pull_request` present and
`source.issue.repository.full_name` equal to the repository); `labeled` / `unlabeled` only for a waiting
or in-progress label. Everything else — `milestoned`, `demilestoned`, `assigned`, `unassigned`,
`review_requested`, `mentioned`, `subscribed`, other labels, and any event name not listed here — is
planning or noise, not activity. `idle_days` = days since the latest activity.

**Pull requests.** An item's linked pull requests are the sources of its qualifying `cross-referenced`
events; an item that is itself a pull request is linked to itself. A pull request is **approved** when,
taking each reviewer's latest review whose state is `APPROVED` or `CHANGES_REQUESTED`, at least one is
`APPROVED` and none is `CHANGES_REQUESTED`. A pull request is **waiting for review** when it is open,
not a draft and not approved; since its latest `ready_for_review` event, or its creation. For an item:
`review_days` = the largest number of days any of its waiting pull requests has waited (0 if none).

**Waiting.** When the item carries a waiting label, `waiting_days` = days since the latest `labeled`
event for a waiting label it still carries (its creation if there is none); otherwise 0.

**Lanes** (each open item gets one, in this order):

| Lane | Condition |
|---|---|
| ⏸️ silent | `idle_days` ≥ 14 |
| 🔴 waiting | a waiting label, or a pull request waiting for review |
| 🚧 in progress | an in-progress label, or an open draft pull request (itself or linked) |
| 💤 stale | `idle_days` ≥ 5 |
| 🙊 quiet | everything else |

**Decisions.** For an item that is not silent, a trigger fires when:

| Trigger | Condition | The question it asks (Japanese, fixed) |
|---|---|---|
| `carryover` | it is a carry-over item | 今のマイルストーンに入れるか閉じるか |
| `waiting` | `waiting_days` ≥ 5 | 催促するか外すか |
| `review` | `review_days` ≥ 2 | 誰がいつレビューするか |
| `unassigned` | no assignee | 担当を決めるか外すか |

An item is a **decision** when at least one trigger fires and it has no assignee or at least one
assignee among the members. The number of decisions is whatever the rules give — there is no fixed
"top 3"; none at all is a correct result.

**Order** — descending score, ties by older creation, then lower number:

```
age   = max(3 × min(waiting_days, cap), 2 × min(review_days, cap))      the same stall is not counted twice
age   = age × 0.5   when max(waiting_days, review_days) ≥ chronicDays    the stand-up has had many chances already
score = age + 5 (a pull request waiting for review) + 2 (issue_dependencies_summary.blocked_by > 0)
            + min(idle_days, cap) ÷ 5
```

**Hygiene** (for people to fix; never a lane): open items with no assignee; open items carrying both a
waiting and an in-progress label.

### The page — `digest.md` (Japanese)

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
- ⏸️ 14 日以上動きなし（<n>）：#…（a carry-over item is followed by （前マイルストーン残））
- ⚠️ 不備：担当なし <n>（#…）・ラベル矛盾 <n>（#…）

---
計測 <ISO 8601> ／ <repo> ／ facts <first 8 hex of the sha256 of facts.json> ／ 自動生成。判断は人が行う
```

- `残り <n> 日` = the due date in the configured timezone minus `today`. `未完了` counts the current
  milestone; `前マイルストーン残` the carry-over items.
- The decisions come in score order. `<facts>` are machine-made: `待ち <d> 日`, `PR #<n> レビュー待ち
  <d> 日`, `前マイルストーンから持ち越し`, `担当なし`, `依存 <k> 件未完了`, joined with `・`.
  `<question>` and `<what it is waiting for>` come from the accepted narrative; without one, the
  question of the first trigger in the order carryover → waiting → review → unassigned, and that
  trigger's fixed phrase, which does not repeat the facts: carryover `前マイルストーンで終わらなかった`,
  waiting `待ち状態のまま`, review `レビューの結論待ち`, unassigned `担当者が決まっていない`.
- No decision: the line `今日決めることはない。` under the heading.
- The table holds the open items that are neither decisions, quiet nor silent: 🔴, then 🚧, then 💤, by
  number within a lane. `直近の動き` is the narrative's one-liner, or the machine's (the kind and date of
  the latest activity, e.g. `コメント 10/03`). 発言不要 lists the quiet items that are not decisions; ⏸️
  the silent ones.
- **Every open tracked item appears exactly once** among the decisions, the table, 発言不要 and ⏸️. The ✅
  line lists events and the ⚠️ line hygiene; they may repeat a number. A line with nothing to say is left
  out.
- "Since yesterday" = the 24 hours before `now`, or the 72 hours on a Monday (in the configured
  timezone); 🆕 lists the items created in that window, ✅ the items closed in it.
- With feedback comments, a section `💬 前日までのコメント` before the rule: up to five comments, then
  each accepted note as `（AI）<note>`.
- Degraded mode (no accepted narrative): under the decisions' heading the line
  `本日は自動要約なし（<reason>）。以下は機械判定のみ。`.

### Narration

- `narrate-input.json`: the milestone (title, due date, days left); every decision (number, title cut to
  60 characters, assignees, triggers, the day counts, linked pull requests, and its latest three
  activities — kind, date, and a comment's first 120 characters); then the table's items (number, title,
  lane, latest activity) up to `maxNarrated` items in all; and the feedback comments (author, date, the
  first 300 characters). Canonical JSON (keys sorted, no whitespace); its sha256 is the **input hash**.
- `prompt.md`: the instruction (Japanese) and the JSON: one entry per decision (`stuck_on`, 60 characters
  at most: what it is waiting for, from the facts in the JSON only; `decision_needed`, 40 at most: one
  "A or B" question); optional one-liners for the table's items (50 at most); answers to feedback in
  `notes` (3 at most, 120 characters each); no number, URL or `@` mention that is not in the JSON; the
  JSON only, no preface. The system prompt is one Japanese sentence.
- **Reuse.** If any `<out>/<date>/narrative.sha` holds the input hash, that day's `narrative.json` is
  used and no call is made. `narrative.sha` is written **only when the guard accepted** the narrative —
  a rejected run never leaves one (the practice's lesson: a rejected run once reused an earlier accepted
  narrative for a different input).
- **The call** (preview mode only): `claude -p --system-prompt <sentence> --tools "" --strict-mcp-config
  --no-session-persistence --model <model> --output-format json`, the prompt on stdin, in a fresh empty
  directory under the OS temporary directory, with `MAX_THINKING_TOKENS=0` set for that process only (set
  `DIGEST_THINKING_TOKENS` to another value, or to `default` to leave the variable unset), a 420-second
  timeout, at most two attempts. The flags are those of F14.
- `usage.jsonl` in `<out>`: one line per call — date, attempt, the models of `modelUsage`, input, cache
  creation, cache read, output and thinking tokens, duration, the CLI-reported `total_cost_usd`, and the
  outcome (`accepted`, `rejected`, `error`).

### The guard — `scripts/guard.ts`

Accepts `{ "decisions": [{ "number", "stuck_on", "decision_needed" }], "one_liners": [{ "number", "text" }],
"notes": [string] }` from the CLI's JSON (`result`) or a bare JSON file (a fenced block is unwrapped; the
outermost `{…}` is parsed). It rejects, listing every reason: decision numbers outside the rule-selected
decisions; a duplicate; `stuck_on` over 80 or `decision_needed` over 50 characters; a one-liner for an
item that is not in the table's input, or over 60 characters; more than 3 notes, or one over 120; any
`#<n>` whose number does not occur anywhere in `narrate-input.json`; and anywhere, `http://`, `https://`,
`www.`, an `@` mention (`@` + a login at the start or after a space), `sk-ant-`, `gh[pousr]_`, `github_pa[t]_`,
`password`, `パスワード`. A decision entry with a missing or empty field is dropped (the page fills it from
the triggers), not rejected. Rejected → the next attempt, then degraded mode. The guard has negative
self-tests: each rule broken on its own is rejected with that reason.

Exit of the pipeline: `0` a page was written (the last line of stdout:
`digest: <path> (narrative: accepted|reused|none — <reason>)`), `2` the collection failed (no page), `3`
a usage error.

### The mock GitHub API — `harness/mocks/github.ts`

`startGithub({ port, scenario, maxPerPage, rateLimitAfter, fail5xxOnce }) → { url, log(), close() }`,
serving `fixtures/github/scenario.json` in the shapes of F16 and F17:

- issues: `number`, `title`, `state`, `state_reason`, `user`, `assignee`, `assignees`, `labels`
  (`{ name, color }`), `milestone` (`{ number, title, state, due_on }`), `comments` (the number of
  `commented` events), `created_at`, `updated_at` (**the latest of every event, planning ones
  included**, as GitHub does, F18), `closed_at`, `body`, `issue_dependencies_summary`, `html_url`, `url`,
  `id`, `node_id`; a pull request also `pull_request` (`url`, `html_url`, `diff_url`, `patch_url`,
  `merged_at`) and `draft`; users as `{ login, id, type: "User" }`;
- the issue list filters by `milestone` and `state`, sorts by creation, newest first (GitHub's default);
- timeline events in their real shapes: `committed` with `author` / `committer` dates and no
  `created_at`; `reviewed` with `submitted_at` and a lower-case `state`; `cross-referenced` with
  `source: { type: "issue", issue: { …, repository: { full_name }, pull_request? } }`;
  `labeled` with `label: { name, color }`; `milestoned` with `milestone: { title }`; `assigned` with
  `assignee`; `review_requested` with `requested_reviewer`;
- `/pulls/<n>`: `number`, `state`, `draft`, `created_at`, `user`, `head: { ref }`,
  `requested_reviewers`, `merged_at`; `/pulls/<n>/reviews` derived from the `reviewed` events with
  upper-case states; `/issues/<n>/comments?since=` filters on the comment's time;
- pagination with `Link` (`rel="next"`, `rel="last"`) honouring `per_page` up to `maxPerPage`;
  `X-RateLimit-Limit`, `-Remaining`, `-Used`, `-Reset` on every response; after `rateLimitAfter`
  requests, 403 with `X-RateLimit-Remaining: 0` and a message naming `192.0.2.1`; `fail5xxOnce` makes the
  first request to a matching path answer 502;
- anything but GET → 405, logged; an unknown path → 404 `{"message":"Not Found"}`.

`github-cli.ts` starts it on 18453. `pnpm digest:demo -- [--mode preview|collect-only] [--now <ISO>]
[--out <dir>] [--feedback]` starts the mock in-process on a free port and runs the pipeline against it
(default `--now 2026-10-04T23:30:00Z`).

### The expected outcome for the scenario

For `now = 2026-10-04T23:30:00Z` (Monday 2026-10-05 08:30 in Asia/Tokyo) and the given configuration,
the author computed this independently of any implementation (F20). The tests assert it.

- Current milestone Sprint 13 (#13), due 10/9, 4 days left; previous Sprint 12 (#12). The current
  milestone has 15 items, 13 of them open; 2 carry-over items (#190, #191). #192 (moved to Sprint 14) and
  #230 are never tracked.

| # | Kind | idle | waiting | review | Lane | Triggers | Decision | Score |
|---|---|---|---|---|---|---|---|---|
| 190 | issue, carry-over | 2 | 0 | 0 | 🙊 | carryover | yes | 0.4 |
| 191 | issue, carry-over | 22 | 0 | 0 | ⏸️ | — | no (silent) | — |
| 201 | issue, linked PR #221 | 2 | 0 | 3 | 🔴 | review | yes | 11.4 |
| 202 | issue, blocked by 1 | 3 | 7 | 0 | 🔴 | waiting | yes | 23.6 |
| 203 | issue, linked draft PR #223 | 1 | 0 | 0 | 🚧 | — | no | — |
| 204 | issue, unassigned | 2 | 0 | 0 | 🙊 | unassigned | yes | 0.4 |
| 205 | issue | 4 | 71 | 0 | 🔴 | waiting | yes | 45.8 (90.8 without the chronic discount) |
| 206 | issue | 2 | 20 | 0 | 🔴 | waiting | yes | 60.4 |
| 207 | issue, assignee not a member | 1 | 14 | 0 | 🔴 | waiting | no (member rule) | — |
| 208 | issue, `updated_at` 3 days ago | 24 | 0 | 0 | ⏸️ | — | no (silent) | — |
| 209 | issue | 6 | 0 | 0 | 💤 | — | no | — |
| 210 | PR, approved | 0 | 0 | 0 | 🙊 | — | no | — |
| 211 | PR, changes requested after an approval | 2 | 0 | 5 | 🔴 | review | yes | 15.4 |
| 212 | issue | 0 | 0 | 0 | 🙊 | — | no | — |
| 215 | issue, waiting and in-progress labels | 1 | 1 | 0 | 🔴 | — | no | — |

- Decisions, in order: **#206, #205, #202, #211, #201, #190, #204** (#190 before #204: equal scores, older
  creation).
- The table: #207 🔴, #215 🔴, #203 🚧, #209 💤. 発言不要: #210, #212. ⏸️: #191（前マイルストーン残）, #208.
- Since yesterday (72 hours, a Monday): ✅ #213; 🆕 #204, #210. #214 closed earlier and is not listed.
- 不備: 担当なし 1 (#204); ラベル矛盾 1 (#215).
- With `maxPerPage` 100 the collection makes 26 requests: milestones 1, current items 1, carry-over 1,
  timelines of the 15 open items, reviews of #210, #211, #221 and #223, and for the linked #221 and #223
  their pull request and their timeline.
- With `--feedback-issue 300`, the comment of 10/03 reaches `narrate-input.json` and the one of 09/24
  (more than 7 days earlier) does not; the facts do not change.

### The grader — `evals/standup-digest/grade.ts`

Implements the mechanical assertions of both evals exactly as `evals.json` words them, from the run's
`outputs.json`, `outputs/`, the final reply and `run.json` (the duration, the mock log). Each check is
tested on a planted good output and on a planted violation of that check alone.

---

## Descriptions

Each `SKILL.md` description says what the skill does, when to use it (with the words a user would say,
in Japanese, English and Chinese), and what it is **not** for, naming the other two skills where they are
the near miss. It stays within 1,024 characters. It is written from the skill's purpose, without
reading `trigger.json`, and not edited after the measurement to raise a rate; a description changed for
any reason after a measurement makes that measurement stale, and the README says which version was
measured.

## The measurements (G4)

All with real `claude` calls on this host (F15 for the costs), authenticated through
`CLAUDE_CALL_ENV_FILE` (F9, F10):

- **Trigger rates**: for each skill, `pnpm probe -- --skill skills/<s> --sibling skills/<other>
  --sibling skills/<other> --queries evals/<s>/trigger.json --runs 3 --model opus --isolated-config
  --out evals/<s>/results/trigger-<YYYY-MM-DD>-linux.json`.
- **A/B**: verifiable-fetch, its three evals × two arms × one run; standup-digest, its two evals × two
  arms × two runs; model `sonnet` for both arms (the practice's choice: the same model in both arms, and
  a smaller bill); into `evals/<s>/results/ab-<YYYY-MM-DD>/`; then `report`. Judgment assertions are graded
  in `grading.json` with the quoted evidence before `report` runs.
- **Narration**: `pnpm digest:demo -- --mode preview --out <tmp>` once, then again into the same
  directory (the second must reuse with no call); and the thinking comparison: two calls with the default
  (`MAX_THINKING_TOKENS=0`) and two with `DIGEST_THINKING_TOKENS=default`, each into a fresh directory, the
  `usage.jsonl` lines kept in `evals/standup-digest/results/narration-<YYYY-MM-DD>.md`.

Every committed result says its date, model (requested and resolved), CLI version, runs, and that the
dollar figures are the CLI's `total_cost_usd` (API-equivalent, not money spent).

## README.md — sections

The English summary (three to five lines), then exactly these seven sections, in this order and with
these names:

1. 何を示すか
2. 背景
3. 設計
4. 動かし方
5. 結果
6. 制約・既知の限界
7. 作り方

and, as the last line of the file, exactly:

```
設計・レビュー・検証：So Ryo ／ 実装：AI エージェント（Claude Code）との協働
```

That line is the author's signature and is required; the rule against person names (red line 9) does
not apply to it.

- 「背景」 links the case study:
  https://github.com/MuneAkira6/engineering-case-studies/blob/main/06-ai-in-daily-engineering.md
- 「設計」, per skill: what the practice did and what this repository adds (materials, section 9), and why
  the rules exist.
- 「動かし方」: `pnpm i && pnpm test` first (offline, no `claude`); then how to install a skill into
  another repository, the demos, and the commands that call `claude` (they cost usage).
- 「結果」 quotes this repository's own runs only: the test counts, the validation, the trigger tables,
  the A/B benchmark with its reading (what differs, why, what it does not show), the narration's tokens
  and the reuse. The work figures are in the case study; link it, do not copy them.
- 「制約・既知の限界」 includes: the mocks are not the real services (their shapes were checked against
  real responses on the date of F16–F19); the A/B runs are few (one or two per arm) and the judgment
  grades come from the run's own agent with quoted evidence, not from people; several assertions encode
  the skill's own rules (materials, section 5: fixtures and skill from the same knowledge); the measured
  CLI behaviour belongs to the versions measured; GitHub's unauthenticated limit (F16).
- 「作り方」 says the repository was built by an unattended goal-bus run and links `goal-pack/`.

`docs/reading-evals.md` (Japanese): the lessons on reading evals from the practice (materials, section 5),
each followed by where this repository shows or guards against it.

## CI — `.github/workflows/ci.yml`

`permissions: contents: read`; every `uses:` pinned to a SHA of F21 with its version as a comment; pnpm
from `pnpm/action-setup` (never `corepack enable`); Node 24 from `actions/setup-node`.

| Job | Runner | Steps |
|---|---|---|
| `checks` | ubuntu-24.04 | install; lint; typecheck; test; `pnpm skills:validate`; `pnpm fetch:demo -- --issue 101 --out out/fetch`; `pnpm digest:demo -- --mode collect-only --out out/digest` |
| `windows` | windows-latest | install; test; `pnpm skills:validate` |

Nothing in CI calls the real `claude`. Run here every command of it that can run here, and say which
cannot and why (the Windows job).

## PUBLISHING.md

A suggested GitHub description and topics, and the checklist before publishing (leak scan, the README's
links, every action still pinned, no transcript under `evals/.runs/` committed).

## Rules for the content

- Japanese (です・ます調): `README.md` and `docs/reading-evals.md`. Japanese without politeness markers:
  the page the digest writes and its narration prompt. English: the `SKILL.md` files and their
  `references/` (agents read them; the descriptions carry Japanese and Chinese trigger words), code,
  comments, test titles, tool output and the files under `goal-pack/`.
- No figures about the author's work; no employer, product, customer, team or person names (the
  signature line excepted; the fictional names of the fixtures are fine); nothing about the host beyond
  what facts.md records.
- **No literal token prefix anywhere in the repository.** The publication's leak scan looks for the
  literal prefixes of real tokens, and a test that plants one would make every scan noisy. Write the
  patterns as character classes (`gh[pousr]_`, `github_pa[t]_`), and build every planted token, key or
  password of the tests at run time by joining parts (`['gh', 'p_', 'x'.repeat(36)].join('')`).

## Out of scope

Publishing to a wiki or posting to GitHub; GitHub Projects (its API needs authentication); a real
Redmine; other trackers; Windows during the run (the author's step afterwards: the probe on Windows,
the tests on Windows); grading by people.

---

# AS-BUILT — 2026-10-05

Everything above is the contract as frozen in G0. This section is the record of **what was built
instead, where it differs, and why**. The contract text above is deliberately not edited: the value of
a frozen contract is that it still says what was agreed, so that a difference is visible as a
difference rather than as a contract that always said so.

Eleven differences. Two of them are also in the Contract changes table of `PROGRESS.md`, because they
change what a committed artefact says; the other nine are refinements inside clauses the contract left
open, or readings forced by a measured fact. Nothing in this list is a dropped requirement: every
acceptance row of `PROGRESS.md` has a verdict, and the three that could not be satisfied literally
(AC-26, the `not-loaded` rule, `decisions-only-ja` M1) are annotated there with the fact that forced
the reading.

## 1. `checkLoaded: false` in the A/B runner, with `skillInInit` as the replacement signal

**Contract:** "The stream parser" rule 1 and "The A/B runner" — the `not-loaded` reason classifies a
run as broken when the init event does not list the skill.

**As built:** `harness/ab.ts` passes `checkLoaded: false`, so `not-loaded` is switched off for **both**
A/B arms, and `run.json` carries a boolean `skillInInit` computed from the init event's `skills` list
instead.

**Why:** the `without` arm has no skill installed **by design**. Under the frozen rule every `without`
arm would be a broken run and no A/B comparison could ever be made. Switching the check off for only
the `with` arm was rejected deliberately: if the CLI's init event did not list a project skill under
the arm's flags, every live arm of G4 would have become a breakage, and that would only have been
discovered while spending live calls. So the signal is **recorded rather than judged** — G4 reads
`skillInInit` on every `with` arm before any A/B number is believed, and all 7 `with` runs read `true`
against all 7 `without` runs `false`. The probe keeps the frozen rule unchanged; it installs the skill
itself, which is the case F7 describes. Also in the Contract changes table.

## 2. `agreementTrivial` beside `runsAgree`

**Contract:** "**`report`** writes … whether the runs agree".

**As built:** `benchmark.json` carries `agreementTrivial` beside `runsAgree`, and the column of
`benchmark.md` reads `yes (empty: neither run produced one)` when every run of an arm produced an
empty agreement key.

**Why:** `runsAgree` is `new Set(keys).size === 1`, so two runs that produced **no page at all** have
the same (empty) key and the column said `yes` — true of the keys, false about the runs.
`preview-zh/without` is exactly that case: 1/12 mechanical, and neither run wrote a page. The clause
the contract fixes is "whether the runs agree", and this reports it more precisely rather than
differently; `runsAgree` itself is unchanged for anything reading the JSON. Also in the Contract
changes table. No measurement was touched — `report` makes no live call.

## 3. `run.json` records `claudeArgs`, not the launcher's command line

**Contract:** `run.json` records the arguments the CLI was launched with.

**As built:** `harness/ab.ts` builds `claudeArgs` (the CLI's own arguments, from `-p` onwards) and
writes **that**, never the resolved `argv` of the spawned process.

**Why:** under `CLAUDE_CALL_ENV_FILE` the spawned process is
`bash <repo>/skills/.../call-env.sh <env file> … claude -p …`, so the resolved `argv` contains an
absolute path from the host — and the path of the environment file. A committed result must not carry
either. Redacting `argv` was rejected as the fix: the fix is **not to write it**. A test with a control
proves the point, asserting that the old field would have carried `homedir()`. This was a bus REJECT of
G1 and is the reason the field exists under this name.

## 4. `rawTranscript` and `generatedFrom` relativised; the probe's `queriesFile` and `skill.dir` too

**Contract:** the result files record where the transcript, the queries file and the skill directory
are.

**As built:** all four are written **relative to the working directory**, through a `pathForRecord`
helper (`harness/ab.ts:304`, `skills/skill-trigger-probe/scripts/probe.ts:39`).

**Why:** the same reason as 3 — no home path may reach a committed result. `skill.dir` and
`queriesFile` were found absolute **after** three probes had already been run live; the probes were
re-run and the absolute-path results discarded ($16.11 of the 17.7966 discarded figure). The paths are
still unambiguous for a reader, because every command in the ledger is quoted from the repository root.

## 5. The environment file is sourced with the real `HOME`; overrides are applied only afterwards, through `env`

**Contract:** the nested-CLI rules already say the environment file is **sourced** — "the file is only
sourced, by the launcher and by G0's two calls".

**As built:** both launchers (`skills/skill-trigger-probe/scripts/lib/claude.ts`,
`skills/standup-digest/scripts/claude.ts`) apply `opts.env` overrides **only through `exec env` after
the file has been sourced**, never by setting them in the shell that sources it:

```
bash call-env.sh <file> <env-args…> <cmd>     # sources <file>, then: exec env <env-args…> <cmd>
```

**Why:** this is not a change to the contract — it is the contract's reading, and it had to be measured
to be found. The first A/B arm of G4 came back `broken (auth)` in 3 seconds. A direct control showed
why: sourcing the file with no overrides gives `result=PONG`; sourcing it in a shell where `HOME` and
`CLAUDE_CONFIG_DIR` are already overridden gives `Not logged in · Please run /login`. The file
authenticates **relative to the real `HOME`**. Recorded as **F26**. Six arms were re-run
($1.4289 discarded). The clause is listed here because a reader of the contract would not know that the
order matters, and the next person to write a launcher needs to.

## 6. `run.json` is written **before** the grader runs

**Contract:** the runner writes `run.json` and grades the run.

**As built:** `harness/ab.ts:312` writes `run.json`, then calls `grade()` at :324, then rewrites the
file at :337 with the grades added.

**Why:** the contract fixes no order, and the obvious one (grade, then write) is wrong. The grader's
contract is `grade(evalId, runDir, context)` — it reads the run **from disk**, including the mock
request log and `wsPath`. With `run.json` written afterwards, every assertion that reads it answered
"cannot be decided", and six arms had to be re-run. The double write is deliberate and cheap.

## 7. The `standup-digest` grader reads `PR #n` as a pull request, not an issue number

**Contract:** the expected-outcome table's `decisions-only-ja` M1 counts the issue numbers a reply
quotes; `preview-zh` M2 likewise.

**As built:** `evals/standup-digest/grade.ts` uses `decisionNumbersIn`, which skips a number written as
`PR #n`.

**Why:** a **correct** reply to `decisions-only-ja` necessarily quotes `PR #221`, because the waiting
pull request is why one of the decisions is a decision. Counting it as an issue number made M1
unsatisfiable by a perfect answer — the assertion, not the answer, was wrong. Recorded as **F27**; two
arms were re-run ($0.2584 discarded). The same reading had already been forced in G3 by `preview-zh`
M2, where the **given** eval corrected the page.

## 8. `requireKey?: string | false` on the tracker mock

**Contract:** the Redmine-shaped mock requires an API key.

**As built:** `harness/mocks/tracker.ts:37` types the option as `string | false`, and `false` serves
the API without a key.

**Why:** the fetcher's own failure tests need a server that answers 200 without a key, so that the
assertion under test is the one that fails and not the authentication. A separate mock would have
duplicated the whole server for one branch. `undefined` could not be used for "no key required",
because that is the default and the default must require one.

## 9. `facts.requests` is normalised for the identity checks

**Contract:** "The number of requests is printed and **kept in `facts.json`**", and AC-26 asks that
"the facts are identical (sha256 of both `facts.json`)".

**As built:** the field is kept, and the two identity checks compare the files with
`"requests": <n>` substituted (`test/digest-rules.test.ts:111`, `test/digest-page.test.ts:163`).

**Why:** both clauses cannot hold literally. Following `Link` with a smaller page costs more HTTP
requests — measured at 26 against 49 — so the one field the contract requires the file to carry is the
one field that must differ. Everything the page and the grader read is identical: the items, the lanes,
the day counts, the decisions and their order, and the hashes match once the count is normalised.
Dropping the field would break the contract clause outright; keeping it serves a reader of a committed
result who wants to know how many calls it took. Recorded as **F25**. A consequence worth stating:
the page's footer hash is of `facts.json` **as written**, so it moves with the API's page size. Two
runs at the same page size still give the same page (AC-37), but **the footer hash is not a content
fingerprint** — the README says so too.

## 10. Redaction and the launcher are deliberately duplicated

**Contract:** "a skill directory stands alone … may not import from another skill".

**As built:** `skills/verifiable-fetch/scripts/redact-url.ts` (844 bytes) restates the parts of
`skills/skill-trigger-probe/scripts/lib/redact.ts` (3,130 bytes) that it needs, and
`skills/standup-digest/scripts/claude.ts` (4,883 bytes) restates
`skills/skill-trigger-probe/scripts/lib/claude.ts` (5,797 bytes).

**Why:** this is the contract being **kept**, not bent, and it is listed here because duplication looks
like an oversight and a future reader will try to remove it. The condition is that copying one
directory into another repository's `.claude/skills/` makes the skill work. A shared module would make
`verifiable-fetch` depend on `skill-trigger-probe` being installed too. The duplication is not
verbatim: each copy carries only what its skill needs (`redact-url.ts` adds `key` to its name list for
signed URLs; `standup-digest`'s launcher has no `checkLoaded` path, because it never loads a skill).
The cost is accepted: a fix to the redaction rules must be applied twice, and the tests of both are
separate for that reason.

## 11. `scoreOf`'s two switches are the evaluation's, and they stay — documented, not moved

**Contract:** `scoreOf` computes `max(3·min(w,cap), 2·min(r,cap))`, halved when chronic, with the
waiting/blocked/idle additions. It specifies no parameters beyond the config.

**As built:** `scoreOf` takes an optional third argument with `chronicDiscount` and `sumInsteadOfMax`.
The decision taken in G5 was to **document them as the evaluation's own switches** rather than remove
them, in `skills/standup-digest/references/rules.md` under "The two switches in `scoreOf`, and what
they are not".

**Why both parts of that decision:** they exist so that the two deliberate choices of the formula can
be **shown** to matter — a test turns the discount off and watches #205 score 90.8 instead of 45.8 and
take first place, and turns the `max` into a sum and watches one stall counted twice (35 becomes 55).
That is the practice's own finding (materials, section 7: the ranking double-counted the same stall)
demonstrated rather than asserted. Removing them would have deleted the evidence for AC-29, which is
already judged and whose evidence quotes `scoreOf(..., { chronicDiscount: false })`. What makes them
safe to keep is stated in the reference where someone would look: **nothing in the pipeline passes
them** — `rules.ts:415` is the only non-test call site and it passes two arguments — and
`digest.config.json` has no key for either. The configuration is `capDays` and `chronicDays`; the shape
of the formula is not configuration.

## Not differences, but worth recording

- **The pin comment of G4** said "all three fixes" where six pin moves are listed. Corrected to "all
  six fixes" in G5. The hashes it asserts are unchanged.
- **The `Deliverables digest:` command was widened** in G5 from `skills harness test evals` to
  `skills harness test evals docs .github`, because `docs/reading-evals.md` and
  `.github/workflows/ci.yml` are deliverables of this goal. The widening is stated in the comment
  beside the pin, so that a digest from an earlier goal is not compared with a digest from this one.
- **Windows was not run.** The contract already puts it out of scope ("Windows during the run"). F13
  and F22 are observations from the author's Windows PC on 2026-10-02 — evidence that this skeleton is
  portable by construction, **not** evidence that this version was run there. The `windows` job of
  `.github/workflows/ci.yml` exists to run it.
- **The contamination scanner's absolute-path pattern has a known false positive** (an API route
  written as prose is read as a filesystem path): 3 of this run's 14 flags. It was **not** fixed, on
  purpose — changing the scanner after the measurement would mean re-measuring. Recorded as incidental
  finding 4 of `PROGRESS.md` with two candidate fixes named for afterwards.

## The one human intervention during the run

At 10:25:04 the bus's review of G2 was cut off at the hook's limit for one review (1740 s): the bus was
re-running the tests and starting the mocks itself (`BUS-LOG.md`, "waking the bus failed", rc=124, 33
turns, a CLI-reported `total_cost_usd` of 7.0735 that the kit's tally does not count). The worker
stopped with it. The author raised the review limit to 2700 s and the relay hook's timeout to 3480 s in
the run copy's `.claude/` (ignored by git), checked that `--status` reported the hook timeout as ok, and
resumed the same worker at 10:27 with the instruction to report G2 again and to say that it was a
re-report after a cut-off review. No file of the repository was touched. The review of G2 then took
about three minutes (review #4, PASS).

## Changes after the run

Made by a human on 2026-10-05, after the bus had answered DONE; not reviewed by the bus.

1. **Redaction.** The run recorded the host's user name (in G1's check for paths of this machine) and
   the names of other users' files and processes in the shared `/tmp` (in G5's check that nothing of
   the run was left). Both are replaced in `PROGRESS.md` (`<the host's user name>`, and a sentence
   saying the names were removed); nothing else in that file changed.
2. **Windows, where the run could not go, showed defects that Linux cannot show.** All fixed, each seen
   red before the fix and green after (`pnpm test` on Windows before: 8 or 9 of 226 tests failing in
   three runs, the count moving with the 5-second limit below):
   - **The A/B runner could not grade on Windows.** It imported `evals/<skill>/grade.ts` and the mock
     modules by their path, and Windows reads the `c:` of `C:\…` as a URL scheme. The import error was
     swallowed into `no grade() in …`, so every arm would have been recorded as ungraded, and `report`
     then printed `yes (empty: neither run produced one)` for two runs nobody had graded, because
     `[].every(…)` is true. Both are imported through a file URL now; a failure to load is recorded as
     `cannot load evals/<skill>/grade.ts (<error code>)` (the code only: the message carries the
     machine's absolute path), `report` prints it, and without a key for every run the agreement is
     `n/a` (`runsAgree` and `agreementTrivial` both `null`). New test: `a grade.ts that cannot be
     loaded is reported as that, and agreement as n/a` (red with the run's `harness/ab.ts`, green now).
   - **Relative paths were written with `\` on Windows**: `rawTranscript` in `run.json` and the probe's
     `queriesFile` and `skill.dir`. Both `pathForRecord` functions write `/` on every OS now.
   - **Tests assumed POSIX**: four assertions on `/` in paths (`test/ab.test.ts`, `test/probe.test.ts`)
     and one on `SIGKILL` after a timeout (`test/launcher.test.ts`). On Windows `taskkill /T /F` ends
     the tree and Node reports an exit code and no signal; this contract asks for `timedOut` only.
   - **Tests assumed a fast start and a checkout under the home directory.** The three timeout tests
     gave the fake CLI 0.6 s, and on a loaded Windows machine a Node start alone can outlast that, so
     the child was killed before it wrote its log (`existsSync(log)` false in two of three full runs);
     they give it 3 s now, against a sleep of 8 s. The control of `run.json records the CLI own
     arguments only` asserted that the old command line contained `homedir()`, which holds only when
     the checkout is under it: it failed in a fresh tree under `/tmp` on the host. It asserts the
     repository's own path now, and the run.json assertions compare paths in their JSON-escaped form
     (on Windows the raw form, with single backslashes, could never match).
   - **The end-to-end tests outlived Vitest's 5-second default on Windows**: they start the fake CLI a
     dozen times, and under the whole suite's parallel load one took 8 s. `vitest.config.ts` sets
     `testTimeout` to 30 s.
   - **The probe lost a whole measurement when it could not remove its temporary project.** Found with
     the real CLI (item 4): after 60 runs of standup-digest, `rmSync` in the `finally` of `probe()`
     threw `EPERM` (a CLI that had just exited still held the directory; a minute later it could be
     removed), the error left `probe()` before the results were built, and the probe exited 3 with no
     file written. `removeProject` retries (`maxRetries: 10`), and if the directory still cannot go it
     prints `probe: could not remove <dir> (<code>); the results are written, remove it by hand` and
     the results are written all the same. Two new tests (red with the run's `probe.ts`, which has no
     such function; green now), and the measurement taken again with the fix: exit 0, nothing left in
     the OS temp directory.
   After the fixes, on Windows 11 (Git Bash, Node v24.15.0, pnpm 11.28.0): `pnpm test` `Tests  229
   passed (229)` three times, `pnpm lint` 61 files, `pnpm typecheck`, `pnpm skills:validate` `3 ok, 0
   failed, 0 warnings`, and both offline demos (`fetched #101: 2 attachments, 2 ok, 0 failed`;
   `digest: 26 requests`).
3. **README corrections.** 「結果」 said every measurement used `sonnet`; the trigger rates used `opus`
   (as "The measurements (G4)" above says). Two of the three commands under 「`claude` を呼ぶコマンド」
   did not run as written: `pnpm probe` without the required `--model` and `--out` exits 3, and there
   is no `pnpm ab` (the runner is `pnpm eval -- run|report`, and the eval file named did not exist).
   They now use this contract's forms, and each was run once on Windows against the fake CLI
   (`CLAUDE_BIN`): probe exit 0, both arms `completed` with the grader loaded, `report` exit 0. The
   README also records the run (「作り方」) and what is listed here.
4. **Trigger rates on Windows**, measured by the author on 2026-10-05 on the Windows PC (Windows 11, Node
   v24.15.0, Claude Code 2.1.289, `--model opus` resolved to `claude-opus-5-5`), with the author's own
   configuration (no `--isolated-config`: the author's personal and plugin skills are siblings too),
   the same queries and three runs each: `evals/<skill>/results/trigger-2026-10-05-windows.{json,md}`.
   verifiable-fetch positives 10/10, negatives 9/10, broken 3 (`neg-en-scrape-images` timed out at 240
   s three times; exit 2); standup-digest 10/10 and 10/10 (measured again after the removal fix above;
   the first attempt wrote nothing and its cost is not known); skill-trigger-probe 10/10 and 10/10.
   The CLI version, the resolved model and the configuration all differ from the Linux measurement, so
   the two are not comparable; the README says so beside the table. The files name only the skills
   that fired, and the ones that won a negative have generic names (`xlsx`, `code-review`, `dataviz`,
   `update-config` and three plugin skills); nothing in them was renamed.
5. **Verified again from a fresh tree on the run's host**, the working tree with every change above
   unpacked into a new directory under `/tmp`: `pnpm install --frozen-lockfile`, `pnpm test` (`Tests
   229 passed (229)`, twice), `pnpm lint` (61 files), `pnpm typecheck`, `pnpm skills:validate` (3 ok),
   `pnpm fetch:demo` (`2 ok, 0 failed`) and `pnpm digest:demo -- --mode collect-only` (`26 requests`);
   afterwards no listener on 18450-18459 and no temporary directory with one of the repository's
   prefixes. The first attempt of this check is how the `homedir()` control above was found.
6. **CI on GitHub** (2026-10-06). The repository was pushed to GitHub, and the workflow ran there for
   the first time on the push of `e44d605`: the Linux job passed and the Windows job failed one test,
   `prints no environment value` in `test/launcher.test.ts`. It expected the fake CLI to log `home` as
   `outside-os-temp`; the runner's shell (pwsh) sets no `HOME`, so the fake logged `unset`. Nothing
   leaked; the test had assumed a `HOME`, as the tests of item 2 had assumed a checkout under it. It now
   expects `unset` where `HOME` is unset or empty and `outside-os-temp` otherwise. On Windows the run's
   test failed under `env -u HOME` exactly as on the runner and the new one passes with and without
   `HOME`; `pnpm test` `Tests  229 passed (229)` twice (once without `HOME`), `pnpm lint` 61 files,
   `pnpm typecheck`. On GitHub the push of `e7de52e` passed both jobs, each `Tests  229 passed (229)`.
   README「制約・既知の限界」no longer says that CI has not run on GitHub.
