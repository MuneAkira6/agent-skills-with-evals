# Trigger rates — verifiable-fetch

- date (UTC): 2026-10-05
- model requested: opus — resolved: claude-opus-5-5
- Claude Code: 2.1.289
- runs per query: 3
- isolated configuration: no
- siblings installed: standup-digest, skill-trigger-probe
- positives passed: 10/10
- negatives passed: 9/10
- broken runs: 3 (timeout 3)
- near-threshold queries: none
- siblings fired: anthropic-skills:pdf 3
- total cost reported by the CLI (USD, API-equivalent, not money spent): 5.4595
- measurement complete: no — at least one run was broken

| id | expectation | rate | valid runs | flags | siblings fired |
| --- | --- | --- | --- | --- | --- |
| pos-ja-save-with-attachments | trigger | 1.00 | 3/3 |  |  |
| pos-ja-url-to-docs | trigger | 1.00 | 3/3 |  |  |
| pos-en-archive-screenshots | trigger | 1.00 | 3/3 |  |  |
| pos-en-export-keep-attachments | trigger | 1.00 | 3/3 |  |  |
| pos-zh-download-with-attachments | trigger | 1.00 | 3/3 |  |  |
| pos-ja-check-every-image | trigger | 1.00 | 3/3 |  |  |
| pos-en-broken-pngs-last-time | trigger | 1.00 | 3/3 |  |  |
| pos-zh-archive-same-size | trigger | 1.00 | 3/3 |  |  |
| pos-ja-describe-screenshots | trigger | 1.00 | 3/3 |  |  |
| pos-en-journals-for-review | trigger | 1.00 | 3/3 |  |  |
| neg-en-download-a-pdf | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-polish-a-report | no trigger | 0.00 | 3/3 |  |  |
| neg-en-create-an-issue | no trigger | 0.00 | 3/3 |  |  |
| neg-zh-compare-trackers | no trigger | 0.00 | 3/3 |  |  |
| neg-ja-github-comment | no trigger | 0.00 | 3/3 |  |  |
| neg-en-scrape-images | no trigger | n/a | 0/3 | failed incomplete |  |
| neg-ja-convert-pngs | no trigger | 0.00 | 3/3 |  |  |
| neg-en-curl-403-question | no trigger | 0.00 | 3/3 |  |  |
| neg-zh-merge-markdown | no trigger | 0.00 | 3/3 |  | anthropic-skills:pdf 3 |
| neg-en-backup-redmine-db | no trigger | 0.00 | 3/3 |  |  |
