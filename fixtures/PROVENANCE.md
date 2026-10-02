# Where the fixtures come from

Every name in these fixtures is fictional, and so is the product (Acme Tasks). Nothing here comes from
a real tracker or repository; the shapes do (goal-pack/facts.md F7, F8, F13, F16–F19).

## `streams/` — recorded output of `claude -p --output-format stream-json --verbose --max-turns 1`

| File | Recorded on | What it shows |
|---|---|---|
| `host-cli-2.1.233/trigger.jsonl` | Linux host, Claude Code 2.1.233, sonnet | the skill `tea-timer` triggered: a `Skill` tool call, then `error_max_turns` (exit 1) |
| `host-cli-2.1.233/no-trigger.jsonl` | same | an unrelated question answered with no tool (exit 0) |
| `host-cli-2.1.233/sibling.jsonl` | same | a request that made the model call `ToolSearch` first; no skill fired |
| `host-cli-2.1.233/no-credentials.jsonl` | same, without credentials | `subtype: "success"`, `is_error: true`, `terminal_reason: "api_error"` |
| `windows-cli-2.1.287/trigger.jsonl` | the author's Windows PC, Claude Code 2.1.287, sonnet | as the host's trigger |
| `windows-cli-2.1.287/no-trigger.jsonl` | same | as the host's non-trigger |

All were recorded on 2026-10-02 in a temporary project holding two skills, `tea-timer` and `long-desc`
(goal-pack/facts.md F7, F11). They were then redacted by a script kept outside this repository; the
changes are exactly these, and nothing else was edited:

- the temporary project path became `<project>`, the configuration directory `<config>` (also inside
  `memory_paths` and the skill's "Base directory" line), and `messaging_socket_path` `<socket>`;
- each `rate_limit_event` keeps only `status` and `rateLimitType` of its `rate_limit_info`;
- in the two Windows samples, the init event's `skills`, `slash_commands` and `agents` keep only the
  names the host's init event also lists (the CLI's own) plus the two project skills, and `plugins`
  became `[]`: the rest described the author's personal configuration.

## `tracker/` — the mock Redmine

- `issues.json`: four issues (101–104) in the shape of Redmine's REST JSON with
  `include=attachments,journals` (facts F19), written by a script kept outside this repository.
  `{tracker}` in each `content_url` is replaced by the mock with its own origin. `x-mock` tells the mock
  how to serve each attachment (`direct`, `signed`, `blocked`, `login-page`, `truncated`, `missing`) and
  is never served. Issue 105 does not exist on purpose.
- `files/*.png`: synthetic screenshots made of flat shapes, so that a model can say what they show. They
  were generated once (RGB, 8 bits, zlib level 9) and are committed as they are, because PNG bytes depend
  on the zlib build. Their sizes are the `filesize` of the metadata.

| File | Bytes | sha256 | What it shows |
|---|---:|---|---|
| `board-before.png` | 812 | `39ae80397eed9d46b448385be587018fcc0a31b4b2de2e05ae198b4645e95627` | three cards stacked on grey: blue, yellow, red |
| `board-after.png` | 812 | `99b66246758c34aa8a99d79ab8e6dadcfbadd21148daf03a9c73f6df2a40ed8f` | the same three cards: red, blue, yellow |
| `export-dialog.png` | 617 | `4d4b1b73790b4d26a4fe423b5373c6d3842383c4e9047402b57f2b3274ff4c10` | a white dialog with a dark title bar and a progress bar about 40 % green |
| `notice.png` | 739 | `9c3acf9da6d30444d64fef71d04c6c5222808c55f1edc254e48cd35e19b8ef9b` | one orange disc on white |
| `wording.png` | 316 | `a398ab8aca6a272e160dead7cf8e4904b1acd4ccbf60e192d0b18fa841780871` | two bands, teal above sand |
| `partial.png` | 548 | `3d7e1ddc34f99e9edcfcaa7dc2e1f19945aac2ed909202de9a185b7d45bca058` | a purple rectangle on white (the mock serves only its first 274 bytes) |

- `export-log.zip` (attachment 304) is not a file here: the mock generates it — the four bytes of a zip
  local header, then xorshift32 (seed `0x2545F491`) one low byte per step, 3,145,728 bytes in all,
  sha256 `02e34249abc54aba2c06c3b8b35b7f4fc78ba9b10df5371e7d8372f50adbf44c`. It only needs the zip
  signature; it is not a valid archive.
- `gateway-screenshot.png` (305), `settings.png` (306) and `missing.png` (309) have no bytes anywhere: the
  mock never delivers them (a gateway's 403 page, a sign-in page, a 404).

## `github/scenario.json` — the mock GitHub repository `acme/tasks`

Four milestones and 22 issues and pull requests with their timeline events, written by a script kept
outside this repository. The mock serves them in GitHub's REST shapes (facts F16–F18). The expected
outcome for `now = 2026-10-04T23:30:00Z` is the table in goal-pack/SCOPE.md, computed by the author with
a reference implementation of the rules that is not part of this repository (facts F20).
