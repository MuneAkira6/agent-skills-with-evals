// The narration, through the fake CLI. G3 makes no live call: every assertion here reads the fake
// CLI's own log, and the guard above `withFakeNarration` refuses to spawn anything else.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT } from '../skills/standup-digest/scripts/narrate.ts'
import { NOW, runDigest, withFakeNarration } from './support/digest.ts'
import { readLog } from './support/fake.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'

let root: string
let seq = 0

beforeAll(() => {
  root = makeTempDir('g3-narration')
})

afterAll(() => {
  removeTempDir(root)
})

/** A narrative the guard accepts, for the decisions the rules really chose. */
const GOOD = {
  decisions: [
    { number: 206, stuck_on: '相手の返信を待っている', decision_needed: '催促するか待つか' },
    { number: 205, stuck_on: '確認の返事がない', decision_needed: '閉じるか続けるか' },
  ],
  one_liners: [{ number: 207, text: 'コメントだけ付いた' }],
  notes: [],
}

/** A narrative the guard rejects: a number the rules did not choose. */
const BAD = {
  decisions: [{ number: 999, stuck_on: 'どこかで止まっている', decision_needed: 'どうするか' }],
  one_liners: [],
  notes: [],
}

const plant = (name: string, value: unknown): string => {
  const path = join(root, `${name}.json`)
  writeFileSync(path, JSON.stringify(value))
  return path
}

type Preview = { code: number; lines: string[]; out: string; log: string }

const preview = async (
  name: string,
  narratives: string[],
  extraEnv: Record<string, string | undefined> = {},
  extraArgs: string[] = [],
): Promise<Preview> => {
  seq += 1
  const out = join(root, name)
  const log = join(root, `fake-${seq}.log`)
  const run = await withFakeNarration(
    { FAKE_LOG: log, FAKE_SCENARIO: 'narrate', FAKE_NARRATIVE: narratives.join(','), ...extraEnv },
    () => runDigest(['preview', '--now', NOW, '--out', out, '--model', 'sonnet', ...extraArgs]),
  )
  return { code: run.code, lines: run.lines, out, log }
}

describe('the narration call, as the fake CLI saw it', () => {
  it('carries the flags of SCOPE.md, the prompt on stdin and an empty working directory', async () => {
    const run = await preview('flags', [plant('good', GOOD)])
    expect(run.code).toBe(0)
    const entries = readLog(run.log)
    expect(entries).toHaveLength(1)
    const [entry] = entries
    expect(entry.argv).toEqual([
      '-p',
      '--system-prompt',
      SYSTEM_PROMPT,
      '--tools',
      '',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--model',
      'sonnet',
      '--output-format',
      'json',
    ])
    // one Japanese sentence, and the prompt is on stdin and in no argument
    expect(SYSTEM_PROMPT).toBe(
      '朝会用の短い日本語の文だけを書き、与えられた JSON にない事実は書かず、JSON だけを返す。',
    )
    expect(entry.stdin).toContain('以下の JSON は、規則が選んだ朝会の項目である。')
    expect(entry.stdin).toContain('"number": 206')
    expect(entry.argv.some((arg) => arg.includes('規則が選んだ'))).toBe(false)
    // a fresh empty directory under the OS temp area: no CLAUDE.md, nothing at all
    expect(entry.cwd.startsWith(join(tmpdir(), 'standup-digest-narrate-'))).toBe(true)
    expect(entry.projectEntries).toEqual([])
    expect(existsSync(entry.cwd)).toBe(false)
    expect(entry.claudecode).toBe('absent')
    expect(entry.claudeCallEnvFile).toBe('absent')
  })

  it('sets MAX_THINKING_TOKENS=0 for that process, and leaves it unset for DIGEST_THINKING_TOKENS=default', async () => {
    const off = await preview('thinking-off', [plant('good2', GOOD)])
    expect(readLog(off.log)[0].thinking).toBe('0')

    const asDefault = await preview('thinking-default', [plant('good3', GOOD)], {
      DIGEST_THINKING_TOKENS: 'default',
    })
    expect(readLog(asDefault.log)[0].thinking).toBe('absent')

    const explicit = await preview('thinking-512', [plant('good4', GOOD)], {
      DIGEST_THINKING_TOKENS: '512',
    })
    expect(readLog(explicit.log)[0].thinking).toBe('512')

    // the variable is never written into a settings file: this process's own environment is untouched
    expect(process.env.MAX_THINKING_TOKENS).toBeUndefined()
  })

  it('accepts a good answer, writes the narrative, its hash and one usage line', async () => {
    const run = await preview('accepted', [plant('good5', GOOD)])
    expect(run.code).toBe(0)
    expect(run.lines.at(-1)).toMatch(/\(narrative: accepted\)$/)
    const day = join(run.out, '2026-10-05')
    expect(existsSync(join(day, 'narrative.json'))).toBe(true)
    expect(existsSync(join(day, 'narrative.sha'))).toBe(true)
    expect(readFileSync(join(day, 'narrative.sha'), 'utf8').trim()).toMatch(/^[0-9a-f]{64}$/)
    expect(existsSync(join(run.out, 'narrate-input.json'))).toBe(true)
    expect(existsSync(join(run.out, 'prompt.md'))).toBe(true)

    const usage = readFileSync(join(run.out, 'usage.jsonl'), 'utf8').trim().split('\n')
    expect(usage).toHaveLength(1)
    const line = JSON.parse(usage[0]) as Record<string, unknown>
    expect(line.outcome).toBe('accepted')
    expect(line.date).toBe('2026-10-05')
    expect(line.attempt).toBe(1)
    expect(line.models).toEqual(['claude-sonnet-5'])
    expect(line.input).toBe(193)
    expect(line.output).toBe(128)
    expect(line.thinking).toBe(0)

    // the page carries the model's phrases instead of the machine's, and no degraded line
    const page = readFileSync(join(run.out, 'digest.md'), 'utf8')
    expect(page).toContain('1. **#206 yui-kato ― 催促するか待つか**')
    expect(page).toContain('相手の返信を待っている')
    expect(page).toContain('| #207 | guest-dev | 🔴 | コメントだけ付いた |')
    expect(page).not.toContain('本日は自動要約なし')
  })

  it('retries once after a rejection and accepts the second answer', async () => {
    const run = await preview('retry', [plant('bad1', BAD), plant('good6', GOOD)])
    expect(run.code).toBe(0)
    expect(readLog(run.log)).toHaveLength(2)
    expect(run.lines.join('\n')).toContain(
      'digest: narration attempt 1 rejected: #999 is not one of the decisions the rules chose',
    )
    expect(run.lines.at(-1)).toMatch(/\(narrative: accepted\)$/)
    const usage = readFileSync(join(run.out, 'usage.jsonl'), 'utf8').trim().split('\n')
    expect(usage.map((line) => (JSON.parse(line) as { outcome: string }).outcome)).toEqual([
      'rejected',
      'accepted',
    ])
  })

  it('two rejections give the degraded page, exit 0, and no narrative.sha at all', async () => {
    const run = await preview('degraded', [plant('bad2', BAD)])
    expect(run.code).toBe(0)
    expect(readLog(run.log)).toHaveLength(2)
    expect(run.lines.at(-1)).toContain('(narrative: none — ガードが 2 回とも拒否)')
    const page = readFileSync(join(run.out, 'digest.md'), 'utf8')
    expect(page).toContain('本日は自動要約なし（ガードが 2 回とも拒否）。以下は機械判定のみ。')
    // the machine's own phrases are back
    expect(page).toContain('1. **#206 yui-kato ― 催促するか外すか**')
    // a rejected run leaves no hash behind: the lesson of a day when one was reused for another input
    expect(existsSync(join(run.out, '2026-10-05', 'narrative.sha'))).toBe(false)
    expect(existsSync(join(run.out, '2026-10-05', 'narrative.json'))).toBe(false)
    const usage = readFileSync(join(run.out, 'usage.jsonl'), 'utf8').trim().split('\n')
    expect(usage.map((line) => (JSON.parse(line) as { outcome: string }).outcome)).toEqual([
      'rejected',
      'rejected',
    ])
  })

  it('an unchanged input is reused with no call at all', async () => {
    const out = join(root, 'reuse')
    const first = await withFakeNarration(
      {
        FAKE_LOG: join(root, 'reuse-1.log'),
        FAKE_SCENARIO: 'narrate',
        FAKE_NARRATIVE: plant('good7', GOOD),
      },
      () => runDigest(['preview', '--now', NOW, '--out', out, '--model', 'sonnet']),
    )
    expect(first.code).toBe(0)
    expect(first.lines.at(-1)).toMatch(/\(narrative: accepted\)$/)
    expect(readLog(join(root, 'reuse-1.log'))).toHaveLength(1)

    const secondLog = join(root, 'reuse-2.log')
    const second = await withFakeNarration(
      { FAKE_LOG: secondLog, FAKE_SCENARIO: 'narrate', FAKE_NARRATIVE: plant('good8', GOOD) },
      () => runDigest(['preview', '--now', NOW, '--out', out, '--model', 'sonnet']),
    )
    expect(second.code).toBe(0)
    expect(second.lines.at(-1)).toMatch(/\(narrative: reused\)$/)
    // no call was made, so the fake CLI never ran and wrote no log
    expect(existsSync(secondLog)).toBe(false)
    // and usage.jsonl gained no line
    expect(readFileSync(join(out, 'usage.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1)
    // the page is the narrated one both times
    expect(readFileSync(join(out, 'digest.md'), 'utf8')).toContain('相手の返信を待っている')
  })

  it('a changed input is not reused: the hash no longer matches', async () => {
    const out = join(root, 'changed')
    await withFakeNarration(
      {
        FAKE_LOG: join(root, 'changed-1.log'),
        FAKE_SCENARIO: 'narrate',
        FAKE_NARRATIVE: plant('good9', GOOD),
      },
      () => runDigest(['preview', '--now', NOW, '--out', out, '--model', 'sonnet']),
    )
    const secondLog = join(root, 'changed-2.log')
    // a different `now` means different day counts, so a different input hash
    const second = await withFakeNarration(
      {
        FAKE_LOG: secondLog,
        FAKE_SCENARIO: 'narrate',
        FAKE_NARRATIVE: plant('good10', GOOD),
      },
      () =>
        runDigest(['preview', '--now', '2026-10-05T23:30:00Z', '--out', out, '--model', 'sonnet']),
    )
    expect(second.lines.at(-1)).toMatch(/\(narrative: accepted\)$/)
    expect(readLog(secondLog)).toHaveLength(1)
  })
})
