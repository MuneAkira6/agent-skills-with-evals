import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ParsedRun } from '../skills/skill-trigger-probe/scripts/lib/stream.ts'
import { parseStream } from '../skills/skill-trigger-probe/scripts/lib/stream.ts'
import { launchFake, readLog } from './support/fake.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'

const STREAM_ARGS = ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', '1']

let root: string
let seq = 0

beforeAll(() => {
  root = makeTempDir('g1-broken')
})

afterAll(() => {
  removeTempDir(root)
})

const run = async (
  scenario: string,
  opts: { sleepMs?: number; timeoutMs?: number; bin?: string } = {},
): Promise<{ parsed: ParsedRun; code: number | null; log: string }> => {
  seq += 1
  const log = join(root, `fake-${seq}.log`)
  const launched = await launchFake(
    {
      args: STREAM_ARGS,
      prompt: 'How long should I steep green tea?',
      cwd: root,
      timeoutMs: opts.timeoutMs ?? 20_000,
      env: {
        FAKE_LOG: log,
        FAKE_SCENARIO: scenario,
        FAKE_SKILL: 'tea-timer',
        FAKE_SIBLINGS: 'long-desc',
        ...(opts.sleepMs === undefined ? {} : { FAKE_SLEEP_MS: String(opts.sleepMs) }),
      },
    },
    { expectBin: opts.bin },
  )
  const parsed = parseStream({
    stdout: launched.stdout,
    skillName: 'tea-timer',
    spawnError: launched.spawnError,
    timedOut: launched.timedOut,
  })
  return { parsed, code: launched.code, log }
}

describe('every broken reason, produced by a real run of the fake CLI', () => {
  it('timeout: the child is killed and nothing it would have written counts', async () => {
    const { parsed, log } = await run('trigger', { sleepMs: 8000, timeoutMs: 600 })
    expect(parsed.status).toBe('broken')
    expect(parsed.reason).toBe('timeout')
    expect(existsSync(log)).toBe(true)
    expect(readLog(log)[0].scenario).toBe('trigger')
  })

  it('no-init: system events of another subtype are not an init event', async () => {
    const { parsed, log } = await run('no-init')
    expect(parsed.status).toBe('broken')
    expect(parsed.reason).toBe('no-init')
    expect(parsed.events).toBe(4)
    expect(parsed.resultSubtype).toBe('success')
    expect(existsSync(log)).toBe(true)
  })

  it('no-result: a stream that stops before the result event', async () => {
    const { parsed } = await run('no-result')
    expect(parsed.status).toBe('broken')
    expect(parsed.reason).toBe('no-result')
    expect(parsed.model).toBe('claude-sonnet-5')
  })

  it('not-loaded: the skill under test is missing from the init skills', async () => {
    const { parsed } = await run('not-loaded')
    expect(parsed.status).toBe('broken')
    expect(parsed.reason).toBe('not-loaded')
    expect(parsed.skills).toEqual(['long-desc'])
  })

  it('auth: an assistant error field, with a result that says subtype success', async () => {
    const { parsed } = await run('auth')
    expect(parsed.status).toBe('broken')
    expect(parsed.reason).toBe('auth')
    expect(parsed.resultSubtype).toBe('success')
    expect(parsed.terminalReason).toBe('api_error')
  })

  it('spawn-error: an executable that does not exist, and no fake CLI ran', async () => {
    const missing = join(root, 'no-such-claude')
    const { parsed, log } = await run('trigger', { bin: missing })
    expect(parsed.status).toBe('broken')
    expect(parsed.reason).toBe('spawn-error')
    expect(existsSync(log)).toBe(false)
  })
})

describe('the classification order of SCOPE.md decides every collision', () => {
  it('authentication failed and the skill missing from skills together: auth, not not-loaded', async () => {
    const { parsed } = await run('auth-and-not-loaded')
    expect(parsed.reason).toBe('auth')
    expect(parsed.skills).not.toContain('tea-timer')
  })

  it('a timeout with no output at all: timeout, not no-init or no-result', async () => {
    const { parsed } = await run('no-result', { sleepMs: 8000, timeoutMs: 600 })
    expect(parsed.reason).toBe('timeout')
  })

  it('a run that used a tool and hit error_max_turns: valid and triggered, exit 1 and all', async () => {
    const { parsed, code } = await run('tool-then-max-turns')
    expect(code).toBe(1)
    expect(parsed.status).toBe('triggered')
    expect(parsed.reason).toBeNull()
    expect(parsed.resultSubtype).toBe('error_max_turns')
    expect(parsed.isError).toBe(true)
    expect(parsed.fired).toEqual(['tea-timer'])
  })

  it('a plugin skill fires for its bare name, and a Read of its SKILL.md counts too', async () => {
    const plugin = await run('trigger-plugin')
    expect(plugin.parsed.status).toBe('triggered')
    expect(plugin.parsed.fired).toEqual(['acme-pack:tea-timer'])
    const read = await run('trigger-read')
    expect(read.parsed.status).toBe('triggered')
    expect(read.parsed.fired).toEqual([])
    expect(read.parsed.readSkillMd).toEqual(['/a/project/.claude/skills/tea-timer/SKILL.md'])
  })

  it('a sibling that wins is not a trigger, and the stream says which one it was', async () => {
    const { parsed } = await run('sibling')
    expect(parsed.status).toBe('not-triggered')
    expect(parsed.fired).toEqual(['long-desc'])
  })

  it('lines that are not JSON are counted, not fatal', async () => {
    const { parsed } = await run('garbage')
    expect(parsed.nonJsonLines).toBe(1)
    expect(parsed.status).toBe('not-triggered')
  })
})
