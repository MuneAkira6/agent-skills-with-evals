# Trigger rates — skill-trigger-probe

- date (UTC): 2026-10-05
- model requested: opus — resolved: claude-opus-5
- Claude Code: 2.1.233
- runs per query: 3
- isolated configuration: yes
- siblings installed: verifiable-fetch, standup-digest
- positives passed: 8/10
- negatives passed: 10/10
- broken runs: 0
- near-threshold queries: pos-en-twenty-queries, pos-en-zero-on-windows, pos-ja-description-limit, pos-zh-which-skill-fired, pos-en-before-shipping
- siblings fired: update-config 3
- total cost reported by the CLI (USD, API-equivalent, not money spent): 5.1671
- measurement complete: yes

| id | expectation | rate | valid runs | flags | siblings fired |
| --- | --- | --- | --- | --- | --- |
| pos-ja-measure-rate | trigger | 1.00 | 3/3 |  |  |
| pos-en-twenty-queries | trigger | 0.67 | 3/3 | near-threshold |  |
| pos-zh-pos-neg-after-edit | trigger | 1.00 | 3/3 |  |  |
| pos-en-zero-on-windows | trigger | 0.33 | 3/3 | failed near-threshold |  |
| pos-ja-description-limit | trigger | 0.67 | 3/3 | near-threshold |  |
| pos-en-validate-frontmatter | trigger | 0.00 | 3/3 | failed |  |
| pos-zh-which-skill-fired | trigger | 0.67 | 3/3 | near-threshold |  |
| pos-ja-033-verdict | trigger | 1.00 | 3/3 |  |  |
| pos-en-before-shipping | trigger | 0.67 | 3/3 | near-threshold |  |
| pos-ja-stopped-triggering | trigger | 1.00 | 3/3 |  |  |
| neg-en-write-a-skill | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-output-quality-ab | no trigger | 0.00 | 3/3 |  |  |
| neg-zh-unit-test | no trigger | 0.00 | 3/3 |  |  |
| neg-en-skill-vs-command | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-yaml-to-json | no trigger | 0.00 | 3/3 |  |  |
| neg-en-hooks-on-windows | no trigger | 0.00 | 3/3 |  | update-config 3 |
| neg-zh-count-lines | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-prompt-ab | no trigger | 0.00 | 3/3 |  |  |
| neg-en-api-latency | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-mcp-config | no trigger | 0.00 | 3/3 |  |  |
