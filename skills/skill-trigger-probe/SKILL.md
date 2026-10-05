---
name: skill-trigger-probe
description: Validates a Claude Code skill's frontmatter against the published limits (name, description, compatibility, metadata) and measures how often a skill really triggers: it starts the CLI once per query, counts the runs where the skill fired, and reports a run it could not measure as broken instead of as a miss. Use it to check a SKILL.md before publishing, to measure or compare trigger rates, to find out why a skill never fires or which sibling wins instead, or to decide whether a description change helped. Also when the ask sounds like: SKILL.md のフロントマターを検証したい、スキルの起動率を測りたい、なぜスキルが起動しないのか調べたい、どのスキルが先に呼ばれたか知りたい; 校验 SKILL.md 前言、测量技能触发率、排查技能为何不触发、查明哪个技能被优先调用. Not for fetching an issue and its attachments from a tracker and saving them as Markdown — that is verifiable-fetch. Not for building a stand-up page from a GitHub milestone — that is standup-digest. This skill measures skills themselves; it does no work of its own on a repository.
license: MIT
---

# skill-trigger-probe

Two commands. One validates a skill's frontmatter against the published limits; the other starts the
real CLI and counts how often a skill actually fires. Both run with Node 24 and its built-in modules
only, so this directory works wherever it is copied.

## Validate a frontmatter

```
node .claude/skills/skill-trigger-probe/scripts/validate.ts [SKILL_DIR ...]
```

With no argument it validates every directory under `skills/` of the working directory. Exit 0 every
skill valid (warnings are allowed), 1 at least one rule broken, 3 a directory or file that cannot be
read, or a frontmatter construct the parser will not guess at.

Each finding carries its rule id and its source: **A** is the Agent Skills specification
(agentskills.io), **C** is the Claude documentation (platform.claude.com). The rules and the
warnings are listed in `references/validator-rules.md`; the YAML the parser accepts is listed in
`references/frontmatter-subset.md`.

## Measure a trigger rate

```
node .claude/skills/skill-trigger-probe/scripts/probe.ts \
  --skill SKILL_DIR [--sibling SKILL_DIR]... --queries QUERIES.json --runs N \
  --model MODEL --out RESULT.json [--concurrency K] [--timeout SECONDS] [--isolated-config]
```

`QUERIES.json` is a list of `{ "id", "query", "should_trigger" }`. The probe validates the skill
first, builds a temporary project that holds nothing but `.claude/skills/` for the skill and each
`--sibling`, runs every query there, writes `RESULT.json` and a `RESULT.md` beside it, and removes
the project. Exit 0 the measurement is complete, 2 at least one run was broken (the files are still
written and say so), 3 a usage error or a failing validation.

- `--model` is required. There is no default: a probe with a default model measures a model you did
  not choose.
- `--sibling` installs another skill beside the one under test. Overlapping descriptions are what
  make a skill lose, so measure it against the skills it will really live with.
- `--isolated-config` gives every run a fresh configuration directory, so no personal skill, setting,
  memory or MCP server is loaded. Authentication must then come from the environment.

## How to read the result

**A broken run is not a negative result.** `status` is `triggered`, `not-triggered` or `broken`, and
a broken run carries a reason: `spawn-error`, `timeout`, `no-init`, `no-result`, `auth`,
`not-loaded`. Rates are triggered divided by the **valid** runs, and a query with a broken run is
flagged `incomplete`. Neither the exit code nor the result's `subtype` can tell you this on its own:
a run that used a tool under `--max-turns 1` exits 1 and is perfectly valid, and a run with no
credentials exits 1 saying `subtype: "success"` and measured nothing at all.

**A rate near the threshold needs more runs.** With three runs you cannot tell 0.33 from 0.5. Such a
query is flagged `near-threshold`; re-measure it with `--runs 6` or more before you believe it.

**A zero has two causes that need opposite fixes.** Read `fired`. If it is empty, nothing recognised
the query: the description is missing the words a user would say. If it names another skill, a
sibling won: the description is missing what this skill is *not* for, and the near miss by name.

**Measure with the model you will use.** The resolved model is in the result, read from the session's
own init event, not from the alias you asked for; different models choose differently.

**A description beyond the limit is cut before the model sees it.** The published limit is 1,024
characters; the CLI versions measured here passed only the first 1,536 to the model, followed by an
ellipsis. An exclusion clause at the end of a long description may never arrive.

**A description change invalidates every earlier rate.** The rate belongs to one wording. Record
which version was measured, and measure again after you edit.

More in `references/reading-a-measurement.md`.
