# A/B benchmark — verifiable-fetch

- date: 2026-10-05
- model requested: sonnet — resolved: claude-sonnet-5
- Claude Code: 2.1.233
- runs per arm: 1

| eval | arm | runs | mechanical | judgment | median duration | input | cache read | cache creation | output | cost (USD) | redactions | flags | runs agree |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| blocked-and-large-en | with | 1 | 5/5 | 1/1 | 27 s | 12 | 199400 | 12046 | 1070 | 0.1488 | 0 | 0 | n/a |
| blocked-and-large-en | without | 1 | 5/5 | 0/1 | 129 s | 22 | 389952 | 16496 | 4178 | 0.2794 | 16 | 3 | n/a |
| deep-path-zh | with | 1 | 4/4 | 1/1 | 26 s | 14 | 237375 | 13081 | 1871 | 0.1785 | 0 | 0 | n/a |
| deep-path-zh | without | 1 | 1/4 | 0/1 | 32 s | 14 | 234047 | 12319 | 1813 | 0.1720 | 0 | 1 | n/a |
| screenshots-ja | with | 1 | 4/4 | 2/2 | 17 s | 12 | 199677 | 12346 | 1060 | 0.1506 | 0 | 0 | n/a |
| screenshots-ja | without | 1 | 4/4 | 1/2 | 33 s | 16 | 268461 | 12620 | 2016 | 0.1872 | 4 | 1 | n/a |

The dollar figures are the CLI-reported `total_cost_usd` (API-equivalent, not money spent).
