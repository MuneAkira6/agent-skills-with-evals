import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildNarrateInput } from '../skills/standup-digest/scripts/narrate.ts'
import { CONFIG, gather, NOW, runDigest } from './support/digest.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'

let root: string

beforeAll(() => {
  root = makeTempDir('g3-page')
})

afterAll(() => {
  removeTempDir(root)
})

const collectOnly = async (
  name: string,
  extra: string[] = [],
): Promise<{ code: number; lines: string[]; out: string; page: string }> => {
  const out = join(root, name)
  const run = await runDigest(['collect-only', '--now', NOW, '--out', out, ...extra])
  return {
    code: run.code,
    lines: run.lines,
    out,
    page: existsSync(join(out, 'digest.md')) ? readFileSync(join(out, 'digest.md'), 'utf8') : '',
  }
}

describe('the page the rules write alone', () => {
  it('has the sections and the lines in the order SCOPE.md fixes', async () => {
    const { code, lines, page } = await collectOnly('order')
    expect(code).toBe(0)
    expect(lines.at(-1)).toMatch(/^digest: .*digest\.md \(narrative: none — collect-only\)$/)

    const text = page.split('\n')
    expect(text[0]).toBe(
      '**Sprint 13（10/9まで・残り 4 日）｜ 未完了 13/15 ｜ 前マイルストーン残 2 ｜ 10/05 08:30 計測**',
    )
    expect(text.filter((line) => line.startsWith('## '))).toEqual([
      '## 今日決めること（7）',
      '## それ以外の未完了（4）',
    ])
    // the degraded line sits under the decisions' heading
    expect(text[text.indexOf('## 今日決めること（7）') + 2]).toBe(
      '本日は自動要約なし（collect-only）。以下は機械判定のみ。',
    )
    // the decisions, in score order, with the machine's facts and the trigger's fixed phrase
    expect(page).toContain('1. **#206 yui-kato ― 催促するか外すか**')
    expect(page).toContain('   API のタイムアウト設定を見直す ｜ 待ち 20 日 ｜ 待ち状態のまま')
    expect(page).toContain('3. **#202 ren-suzuki ― 催促するか外すか**')
    expect(page).toContain(
      '   CSV エクスポートが途中で止まる ｜ 待ち 7 日・依存 1 件未完了 ｜ 待ち状態のまま',
    )
    expect(page).toContain('5. **#201 aoi-tanaka ― 誰がいつレビューするか**')
    expect(page).toContain('PR #221 レビュー待ち 3 日 ｜ レビューの結論待ち')
    expect(page).toContain('6. **#190 ren-suzuki ― 今のマイルストーンに入れるか閉じるか**')
    expect(page).toContain('前マイルストーンから持ち越し ｜ 前マイルストーンで終わらなかった')
    expect(page).toContain('7. **#204 担当なし ― 担当を決めるか外すか**')
    expect(page).toContain('担当なし ｜ 担当者が決まっていない')

    // the lane counts and the table, 🔴 then 🚧 then 💤, by number within a lane
    expect(page).toContain('🔴 2 ・ 🚧 1 ・ 💤 1')
    const rows = text.filter((line) => /^\| #\d+ \|/.test(line))
    expect(rows).toEqual([
      '| #207 | guest-dev | 🔴 | コメント 10/03 |',
      '| #215 | kai-ito | 🔴 | コメント 10/03 |',
      '| #203 | mei-mori | 🚧 | コメント 10/03 |',
      '| #209 | ren-suzuki | 💤 | コメント 09/28 |',
    ])
    expect(text).toContain('| # | 担当 | 状態 | 直近の動き |')

    // the four summary lines
    expect(page).toContain('- ✅ 昨日から完了 1：#213 ／ 🆕 追加 2：#204、#210')
    expect(page).toContain('- 🙊 発言不要（2）：#210、#212')
    expect(page).toContain('- ⏸️ 14 日以上動きなし（2）：#191（前マイルストーン残）、#208')
    expect(page).toContain('- ⚠️ 不備：担当なし 1（#204）・ラベル矛盾 1（#215）')

    // the footer: the rule and the line on consecutive lines, with the facts hash
    const factsSha = createHash('sha256')
      .update(readFileSync(join(root, 'order', 'facts.json')))
      .digest('hex')
    expect(text.at(-3)).toBe('---')
    expect(text.at(-2)).toBe(
      `計測 2026-10-04T23:30:00.000Z ／ acme/tasks ／ facts ${factsSha.slice(0, 8)} ／ 自動生成。判断は人が行う`,
    )
  })

  it('places every open tracked item exactly once', async () => {
    const { page } = await collectOnly('once')
    const { facts } = await gather()
    const placed: number[] = []
    for (const line of page.split('\n')) {
      if (/^\d+\. \*\*#\d+/.test(line)) placed.push(Number(/#(\d+)/.exec(line)?.[1]))
      else if (/^\| #\d+ \|/.test(line)) placed.push(Number(/#(\d+)/.exec(line)?.[1]))
      else if (line.startsWith('- 🙊') || line.startsWith('- ⏸️')) {
        for (const match of line.matchAll(/#(\d+)/g)) placed.push(Number(match[1]))
      }
    }
    const open = facts.items.map((item) => item.number).sort((a, b) => a - b)
    expect([...placed].sort((a, b) => a - b)).toEqual(open)
    expect(new Set(placed).size).toBe(placed.length)
    expect(placed).toHaveLength(15)
  })

  it('counts 72 hours on a Monday and 24 on a Tuesday', async () => {
    const monday = await gather()
    expect(monday.facts.since.weekday).toBe('Monday')
    expect(monday.facts.since.hours).toBe(72)
    expect(monday.facts.closedSinceYesterday).toEqual([213])
    expect(monday.facts.createdSinceYesterday).toEqual([204, 210])

    // 2026-10-05T23:30:00Z is Tuesday 2026-10-06 08:30 in Asia/Tokyo
    const tuesday = await gather({ now: '2026-10-05T23:30:00Z' })
    expect(tuesday.facts.since.weekday).toBe('Tuesday')
    expect(tuesday.facts.since.hours).toBe(24)
    expect(tuesday.facts.since.from).toBe('2026-10-04T23:30:00.000Z')
    // nothing was closed or created in those 24 hours
    expect(tuesday.facts.closedSinceYesterday).toEqual([])
    expect(tuesday.facts.createdSinceYesterday).toEqual([])
  })

  it('prints 今日決めることはない。 when no item is a decision', async () => {
    // two months on, every item is silent, so no trigger can fire
    const { code, page } = await collectOnly('nodecision', ['--now', '2026-12-01T00:00:00Z'])
    expect(code).toBe(0)
    expect(page).toContain('## 今日決めること（0）')
    expect(page).toContain('今日決めることはない。')
    expect(page).not.toMatch(/^1\. \*\*#/m)
    expect(page).toContain('## それ以外の未完了（0）')
    expect(page).toContain('- ⏸️ 14 日以上動きなし（15）')
  })

  it('leaves out a line that has nothing to say', async () => {
    const { page } = await collectOnly('empty-lines', ['--now', '2026-12-01T00:00:00Z'])
    // nothing was closed or created, and nothing is quiet, so those lines are absent
    expect(page).not.toContain('✅ 昨日から完了')
    expect(page).not.toContain('🆕 追加')
    expect(page).not.toContain('🙊 発言不要')
    // the hygiene line still has something to say
    expect(page).toContain('- ⚠️ 不備：担当なし 1（#204）・ラベル矛盾 1（#215）')
  })
})

describe('the feedback comments', () => {
  it('reach narrate-input.json without changing the facts', async () => {
    const without = await gather()
    const with300 = await gather({ feedbackIssue: 300 })

    // the window is seven days: the comment of 10/03 is in, the one of 09/24 is out
    expect(with300.feedback.map((comment) => comment.date)).toEqual(['10/03'])
    expect(with300.collected.feedback).toHaveLength(1)
    const input = buildNarrateInput(with300.facts, CONFIG, with300.feedback)
    expect(input.feedback).toHaveLength(1)
    expect(input.feedback[0].date).toBe('10/03')
    expect(input.feedback[0].author).toBe('aoi-tanaka')
    expect(JSON.stringify(input.feedback)).not.toContain('09/24')

    // the facts do not change; only the request count does, which F25 records
    const strip = (json: string): string => json.replace(/"requests": \d+/, '"requests": <n>')
    const sha = (text: string): string => createHash('sha256').update(text).digest('hex')
    expect(sha(strip(with300.json))).toBe(sha(strip(without.json)))
    expect(with300.collected.requests).toBe(without.collected.requests + 1)
    // and no feedback key exists in the facts at all
    expect(Object.keys(with300.facts)).not.toContain('feedback')
  })

  it('appear on the page under their own heading', async () => {
    const out = join(root, 'feedback-page')
    const run = await runDigest([
      'collect-only',
      '--now',
      NOW,
      '--out',
      out,
      '--feedback-issue',
      '300',
    ])
    expect(run.code).toBe(0)
    const page = readFileSync(join(out, 'digest.md'), 'utf8')
    expect(page).toContain('## 💬 前日までのコメント')
    expect(page).toContain('- 10/03 aoi-tanaka：')
    // the section sits before the rule
    expect(page.indexOf('## 💬 前日までのコメント')).toBeLessThan(page.lastIndexOf('---'))
  })
})

describe('the pipeline refuses to write a page from partial data', () => {
  it('a rate limit exits 2, names the reset time and writes nothing', async () => {
    const out = join(root, 'ratelimited')
    const run = await runDigest(['collect-only', '--now', NOW, '--out', out], {
      mock: { rateLimitAfter: 2 },
    })
    expect(run.code).toBe(2)
    const message = run.lines.join('\n')
    expect(message).toContain('rate limit reached; it resets at')
    expect(message).toContain('Asia/Tokyo')
    expect(existsSync(join(out, 'digest.md'))).toBe(false)
    expect(existsSync(join(out, 'facts.json'))).toBe(false)
  })

  it('a 502 once is retried and the page is written', async () => {
    const out = join(root, 'flaky')
    const run = await runDigest(['collect-only', '--now', NOW, '--out', out], {
      // the retries wait 1 s and 2 s; one 502 costs one wait
      mock: { fail5xxOnce: '/issues/201/timeline' },
    })
    expect(run.code).toBe(0)
    expect(existsSync(join(out, 'digest.md'))).toBe(true)
    // the retry is one more request than the 26 of a clean run
    expect(run.lines[0]).toBe('digest: 27 requests')
  }, 20_000)

  it('an unknown repository exits 2 with the status, and a bad --now exits 3', async () => {
    const out = join(root, 'unknown')
    const run = await runDigest([
      'collect-only',
      '--now',
      NOW,
      '--out',
      out,
      '--repo',
      'nobody/nothing',
    ])
    expect(run.code).toBe(2)
    expect(run.lines.join('\n')).toContain('HTTP 404')
    expect(existsSync(join(out, 'digest.md'))).toBe(false)

    const bad = await runDigest(['collect-only', '--now', 'yesterday', '--out', join(root, 'bad')])
    expect(bad.code).toBe(3)
    expect(bad.lines[0]).toBe('digest: --now is not a date: "yesterday"')

    const noMode = await runDigest(['--now', NOW])
    expect(noMode.code).toBe(3)
    expect(noMode.lines[0]).toContain('the first argument must be "preview" or "collect-only"')
  })
})
