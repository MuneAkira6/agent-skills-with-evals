---
name: verifiable-fetch
description: Saves a tracker issue as Markdown together with its attachments, and counts an attachment as fetched only when the bytes on disk match the size in the metadata and the content matches its declared type — so a gateway's error page or a sign-in page is never archived under a screenshot's name. Use it to archive a Redmine issue and its images for offline reading or a report, to re-download attachments that may be broken, or to check whether a saved archive is complete and say which files failed and why. Also when the ask sounds like: Redmine のチケットを添付ファイルごと Markdown で保存したい、添付が壊れていないか確かめたい、チケットと画像を手元に残したい; 把 Redmine 工单连同附件保存为 Markdown、校验附件是否完整、离线归档工单和截图. Not for measuring how often a skill triggers or validating a SKILL.md — that is skill-trigger-probe. Not for building a stand-up page from a GitHub milestone — that is standup-digest. It fetches and verifies; it decides nothing about the issue's content.
license: MIT
---

# verifiable-fetch

Save an issue and its attachments, then say what the images show. The script does the fetching and
the verification; you do the describing and the reporting.

## 1. Run the fetcher

```
node .claude/skills/verifiable-fetch/scripts/fetch.ts --base URL --issue ID --out DIR [--max-path N]
```

It writes `DIR/ID.md` and `DIR/attachments/ID/`, prints one line per attachment and ends with a
count. Exit 0 every attachment fetched, 1 at least one failed (the Markdown is still written),
2 the issue could not be read at all, 3 a usage error or an output directory too deep.

`REDMINE_API_KEY`, when set, is sent only to the origin of `--base` — never to a redirect target
somewhere else — and never printed. Every URL in every message has its signed parameters hidden.

## 2. Describe every image

The page has one `（説明なし）` under each image it saved. **Open each of those images and replace
that line with one or two sentences saying what the image shows** — the state on screen, the numbers,
the difference from the other screenshot. Do not describe what you cannot see; if an image will not
open, say so instead.

A link alone is of no use to the person who searches this archive in six months. A sentence is.

## 3. Report the failures

Every attachment the fetcher refused is in the Attachments table as `取得失敗: <reason>`. Repeat those
lines in your answer, with the reason as it stands, and do not retry silently: a refusal is a fact
about the tracker, not a transport hiccup.

| Reason | What it means |
| --- | --- |
| `HTTP 403`, `HTTP 404` | the download was refused or the file is gone |
| `size N != M` | the body ended early; what arrived is not the file |
| `type T: got HTML` | a web page arrived under a file's type — a sign-in or error page |
| `type T: signature mismatch` | the first bytes are not those of the declared type |
| `too many redirects` | more than five hops; something is looping |
| `network: CODE` | the connection itself failed |

## Why these rules exist

**A gateway's error page is also a plausible file.** A 403 page is a few hundred bytes of HTML. Saved
under `screenshot.png`, it has a name, a size and a date, and nothing looks wrong until somebody
opens the archive. The only honest test is the one the metadata allows: the byte count must match,
and the first bytes must be those of the type.

**A signed URL is a credential.** The link a tracker redirects to carries a token that grants the
file to whoever holds it. It is never written into the page, into a log or into an answer.

**A long path breaks the archive for Windows tools.** Past the path limit, some directory tools
return an empty result with no error — the files are there and the archive reads as empty. So the
saved paths stay short: long names are cut and given a hash of the original, and the original name
stays in the page.

Details in `references/verification-rules.md` and `references/naming-and-paths.md`.
