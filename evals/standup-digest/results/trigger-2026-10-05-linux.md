# Trigger rates — standup-digest

- date (UTC): 2026-10-05
- model requested: opus — resolved: claude-opus-5
- Claude Code: 2.1.233
- runs per query: 3
- isolated configuration: yes
- siblings installed: skill-trigger-probe, verifiable-fetch
- positives passed: 9/10
- negatives passed: 10/10
- broken runs: 1 (timeout 1)
- near-threshold queries: pos-zh-token-cost
- siblings fired: code-review 3
- total cost reported by the CLI (USD, API-equivalent, not money spent): 5.4781
- measurement complete: no — at least one run was broken

| id | expectation | rate | valid runs | flags | siblings fired |
| --- | --- | --- | --- | --- | --- |
| pos-ja-tomorrow-milestone | trigger | 1.00 | 3/3 |  |  |
| pos-zh-where-stuck | trigger | 1.00 | 3/3 |  |  |
| pos-en-digest-no-post | trigger | 1.00 | 3/3 |  |  |
| pos-ja-decisions-only | trigger | 1.00 | 3/3 |  |  |
| pos-en-waiting-longest | trigger | 1.00 | 3/3 |  |  |
| pos-zh-who-decides | trigger | 1.00 | 3/3 |  |  |
| pos-ja-one-screen | trigger | 1.00 | 3/3 |  |  |
| pos-en-scrum-runs-long | trigger | 1.00 | 3/3 |  |  |
| pos-ja-tune-ranking | trigger | 1.00 | 3/3 |  |  |
| pos-zh-token-cost | trigger | 0.33 | 3/3 | failed near-threshold |  |
| neg-en-release-notes | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-weekly-report | no trigger | 0.00 | 3/3 |  |  |
| neg-zh-review-pr | no trigger | 0.00 | 2/3 | incomplete | code-review 3 |
| neg-en-create-milestone | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-retro | no trigger | 0.00 | 3/3 |  |  |
| neg-en-summarize-thread | no trigger | 0.00 | 3/3 |  |  |
| neg-zh-jira-to-excel | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-actions-cron | no trigger | 0.00 | 3/3 |  |  |
| neg-en-burndown | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-minutes-template | no trigger | 0.00 | 3/3 |  |  |
