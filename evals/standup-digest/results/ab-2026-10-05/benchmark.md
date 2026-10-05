# A/B benchmark — standup-digest

- date: 2026-10-05
- model requested: sonnet — resolved: claude-sonnet-5
- Claude Code: 2.1.233
- runs per arm: 2

| eval | arm | runs | mechanical | judgment | median duration | input | cache read | cache creation | output | cost (USD) | redactions | flags | runs agree |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| decisions-only-ja | with | 2 | 8/8 | 2/2 | 20 s | 16 | 256895 | 24510 | 2021 | 0.2560 | 0 | 0 | yes |
| decisions-only-ja | without | 2 | 4/8 | 0/2 | 88 s | 32 | 625873 | 52235 | 13889 | 0.7111 | 0 | 7 | no |
| preview-zh | with | 2 | 12/12 | 4/4 | 162 s | 16 | 257222 | 24618 | 2268 | 0.2604 | 0 | 0 | yes |
| preview-zh | without | 2 | 1/12 | 0/4 | 225 s | 18 | 285205 | 20863 | 2884 | 0.2556 | 0 | 2 | yes (empty: neither run produced one) |

The dollar figures are the CLI-reported `total_cost_usd` (API-equivalent, not money spent).
