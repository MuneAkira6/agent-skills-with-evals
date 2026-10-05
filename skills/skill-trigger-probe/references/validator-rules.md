# The validator's rules

**A** is the Agent Skills specification (agentskills.io/specification), **C** is the Claude
documentation (platform.claude.com, Agent Skills overview). Every finding names its rule and its
source, so a reader can check the rule rather than trust the tool.

| Id | Error | Source |
| --- | --- | --- |
| V1 | `SKILL.md` missing, or no frontmatter | A |
| V2 | `name` missing or empty, longer than 64 characters, or not lowercase letters, digits and single hyphens (no leading, trailing or doubled hyphen); or different from the directory name | A, C |
| V3 | `name` contains `anthropic` or `claude` | C |
| V4 | `description` missing or empty, or longer than 1,024 characters | A, C |
| V5 | `description` contains an XML tag | C |
| V6 | `compatibility` longer than 500 characters; `metadata` not a map of strings to strings | A |

An XML tag here means `<` followed by a letter, `/`, `!` or `?`, up to the next `>`. Remember it when
you write a description: a placeholder like a bracketed directory name is an XML tag to this rule and
to the product that enforces it.

## Warnings, which never fail a skill

- `SKILL.md` longer than 500 lines — A's recommendation, not a limit.
- `allowed-tools` given as a list instead of A's space-separated string.
- A key outside the specification, listed as information: products add their own keys.

## The measured note on V4

A description longer than 1,024 characters also gets a note: the CLI versions measured for this
skill passed only the **first 1,536 characters** to the model, followed by an ellipsis. That is a
measurement of two versions, not a published limit, and it is the reason an over-long description is
worth fixing rather than tolerating — the exclusion clause at the end is exactly the part that does
not arrive.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | every skill valid; warnings allowed |
| 1 | at least one rule broken |
| 3 | a directory or file that cannot be read, or a frontmatter construct outside the supported subset |
