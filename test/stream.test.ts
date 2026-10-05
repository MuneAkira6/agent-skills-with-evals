import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStream } from '../skills/skill-trigger-probe/scripts/lib/stream.ts'

const SAMPLES = join(import.meta.dirname, '..', 'fixtures', 'streams')

const sample = (host: string, name: string): string =>
  readFileSync(join(SAMPLES, host, `${name}.jsonl`), 'utf8')

const classify = (host: string, name: string, skillName = 'tea-timer') =>
  parseStream({ stdout: sample(host, name), skillName })

describe('the stream parser on the six recorded samples', () => {
  it('host trigger: triggered, with tea-timer in fired', () => {
    const run = classify('host-cli-2.1.233', 'trigger')
    expect(run.status).toBe('triggered')
    expect(run.reason).toBeNull()
    expect(run.fired).toEqual(['tea-timer'])
    expect(run.claudeCodeVersion).toBe('2.1.233')
    expect(run.model).toBe('claude-sonnet-5')
    expect(run.resultSubtype).toBe('error_max_turns')
    expect(run.isError).toBe(true)
  })

  it('host no-trigger: not-triggered, nothing fired', () => {
    const run = classify('host-cli-2.1.233', 'no-trigger')
    expect(run.status).toBe('not-triggered')
    expect(run.fired).toEqual([])
    expect(run.resultSubtype).toBe('success')
  })

  it('host sibling: not-triggered, ToolSearch used and no skill fired', () => {
    const run = classify('host-cli-2.1.233', 'sibling')
    expect(run.status).toBe('not-triggered')
    expect(run.fired).toEqual([])
    expect(run.readSkillMd).toEqual([])
    expect(run.resultSubtype).toBe('error_max_turns')
  })

  it('host no-credentials: broken with reason auth although its subtype is success', () => {
    const run = classify('host-cli-2.1.233', 'no-credentials')
    expect(run.status).toBe('broken')
    expect(run.reason).toBe('auth')
    expect(run.resultSubtype).toBe('success')
    expect(run.isError).toBe(true)
    expect(run.terminalReason).toBe('api_error')
    // the trap of F8: the skill is loaded, so only the error field and terminal_reason tell
    expect(run.skills).toContain('tea-timer')
  })

  it('windows trigger: triggered on CLI 2.1.287', () => {
    const run = classify('windows-cli-2.1.287', 'trigger')
    expect(run.status).toBe('triggered')
    expect(run.fired).toEqual(['tea-timer'])
    expect(run.claudeCodeVersion).toBe('2.1.287')
  })

  it('windows no-trigger: not-triggered on CLI 2.1.287', () => {
    const run = classify('windows-cli-2.1.287', 'no-trigger')
    expect(run.status).toBe('not-triggered')
    expect(run.claudeCodeVersion).toBe('2.1.287')
    expect(run.fired).toEqual([])
  })

  it('reads the result measurements, including the thinking tokens', () => {
    const run = classify('host-cli-2.1.233', 'sibling')
    expect(run.usage?.thinkingTokens).toBeGreaterThan(0)
    expect(run.totalCostUsd).toBeGreaterThan(0)
    expect(run.durationMs).toBeGreaterThan(0)
    expect(run.numTurns).toBe(2)
  })

  it('counts the lines that are not JSON events instead of failing on them', () => {
    const run = parseStream({
      stdout: `a warning on stdout\n${sample('host-cli-2.1.233', 'trigger')}\nnot json either`,
      skillName: 'tea-timer',
    })
    expect(run.nonJsonLines).toBe(2)
    expect(run.status).toBe('triggered')
    expect(run.events).toBe(7)
  })

  it('a sibling that fires is recorded in fired and still not-triggered for the skill under test', () => {
    const run = classify('host-cli-2.1.233', 'trigger', 'long-desc')
    expect(run.status).toBe('not-triggered')
    expect(run.fired).toEqual(['tea-timer'])
  })
})
