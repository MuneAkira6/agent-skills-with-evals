# Trigger rates — skill-trigger-probe

- date (UTC): 2026-10-05
- model requested: opus — resolved: claude-opus-5-5
- Claude Code: 2.1.289
- runs per query: 3
- isolated configuration: no
- siblings installed: verifiable-fetch, standup-digest
- positives passed: 10/10
- negatives passed: 10/10
- broken runs: 0
- near-threshold queries: none
- siblings fired: skill-creator:skill-creator 6, update-config 3
- total cost reported by the CLI (USD, API-equivalent, not money spent): 5.1480
- measurement complete: yes

| id | expectation | rate | valid runs | flags | siblings fired |
| --- | --- | --- | --- | --- | --- |
| pos-ja-measure-rate | trigger | 1.00 | 3/3 |  |  |
| pos-en-twenty-queries | trigger | 1.00 | 3/3 |  |  |
| pos-zh-pos-neg-after-edit | trigger | 1.00 | 3/3 |  |  |
| pos-en-zero-on-windows | trigger | 1.00 | 3/3 |  |  |
| pos-ja-description-limit | trigger | 1.00 | 3/3 |  |  |
| pos-en-validate-frontmatter | trigger | 1.00 | 3/3 |  |  |
| pos-zh-which-skill-fired | trigger | 1.00 | 3/3 |  |  |
| pos-ja-033-verdict | trigger | 1.00 | 3/3 |  |  |
| pos-en-before-shipping | trigger | 1.00 | 3/3 |  |  |
| pos-ja-stopped-triggering | trigger | 1.00 | 3/3 |  |  |
| neg-en-write-a-skill | no trigger | 0.00 | 3/3 |  | skill-creator:skill-creator 3 |
| neg-ja-output-quality-ab | no trigger | 0.00 | 3/3 |  | skill-creator:skill-creator 3 |
| neg-zh-unit-test | no trigger | 0.00 | 3/3 |  |  |
| neg-en-skill-vs-command | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-yaml-to-json | no trigger | 0.00 | 3/3 |  |  |
| neg-en-hooks-on-windows | no trigger | 0.00 | 3/3 |  | update-config 3 |
| neg-zh-count-lines | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-prompt-ab | no trigger | 0.00 | 3/3 |  |  |
| neg-en-api-latency | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-mcp-config | no trigger | 0.00 | 3/3 |  |  |
