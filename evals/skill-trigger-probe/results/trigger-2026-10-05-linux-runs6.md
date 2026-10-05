# Trigger rates — skill-trigger-probe

- date (UTC): 2026-10-05
- model requested: opus — resolved: claude-opus-5
- Claude Code: 2.1.233
- runs per query: 6
- isolated configuration: yes
- siblings installed: verifiable-fetch, standup-digest
- positives passed: 3/6
- negatives passed: 0/0
- broken runs: 0
- near-threshold queries: none
- siblings fired: none
- total cost reported by the CLI (USD, API-equivalent, not money spent): 2.9856
- measurement complete: yes

| id | expectation | rate | valid runs | flags | siblings fired |
| --- | --- | --- | --- | --- | --- |
| pos-en-twenty-queries | trigger | 0.83 | 6/6 |  |  |
| pos-en-zero-on-windows | trigger | 0.33 | 6/6 | failed |  |
| pos-ja-description-limit | trigger | 0.67 | 6/6 |  |  |
| pos-en-validate-frontmatter | trigger | 0.17 | 6/6 | failed |  |
| pos-zh-which-skill-fired | trigger | 0.33 | 6/6 | failed |  |
| pos-en-before-shipping | trigger | 0.50 | 6/6 |  |  |
