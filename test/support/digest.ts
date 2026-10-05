import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Github, GithubOptions } from '../../harness/mocks/github.ts'
import { startGithub } from '../../harness/mocks/github.ts'
import { resolveBin } from '../../skills/standup-digest/scripts/claude.ts'
import type { Collected } from '../../skills/standup-digest/scripts/collect.ts'
import { collect } from '../../skills/standup-digest/scripts/collect.ts'
import { main as digestMain } from '../../skills/standup-digest/scripts/digest.ts'
import type { Facts, Feedback } from '../../skills/standup-digest/scripts/facts.ts'
import { buildFacts, factsJson } from '../../skills/standup-digest/scripts/facts.ts'
import type { Config, Item } from '../../skills/standup-digest/scripts/rules.ts'
import { FAKE_CLI } from './fake.ts'

/** The moment SCOPE.md computed its expected outcome for: Monday 2026-10-05 08:30 in Asia/Tokyo. */
export const NOW = '2026-10-04T23:30:00Z'

export const CONFIG: Config = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'skills', 'standup-digest', 'digest.config.json'),
    'utf8',
  ),
) as Config

export type Gathered = {
  api: Github
  collected: Collected
  facts: Facts
  items: Item[]
  feedback: Feedback[]
  json: string
}

/** Collects the scenario from a mock on a free port and builds the facts, then stops the mock. */
export const gather = async (
  options: { now?: string; feedbackIssue?: number | null; mock?: GithubOptions } = {},
): Promise<Gathered> => {
  const now = options.now ?? NOW
  const api = await startGithub(options.mock ?? {})
  try {
    const collected = await collect({
      api: api.url,
      config: CONFIG,
      now,
      milestoneNumber: null,
      feedbackIssue: options.feedbackIssue ?? null,
    })
    const { facts, items, feedback } = buildFacts(collected, CONFIG, now)
    return { api, collected, facts, items, feedback, json: factsJson(facts) }
  } finally {
    await api.close()
  }
}

/**
 * Runs the pipeline against a mock on a free port, in this process, and stops the mock. The mock
 * answers while `main` awaits its own fetches, so nothing here blocks on a child process.
 */
export const runDigest = async (
  args: string[],
  options: { mock?: GithubOptions; api?: string } = {},
): Promise<{ code: number; lines: string[]; api: Github | null }> => {
  const api = options.api === undefined ? await startGithub(options.mock ?? {}) : null
  const lines: string[] = []
  try {
    const code = await digestMain([...args, '--api', options.api ?? api?.url ?? ''], (line) => {
      lines.push(line)
    })
    return { code, lines, api }
  } finally {
    if (api !== null) await api.close()
  }
}

/**
 * The only way a G3 test runs the digest's narration: CLAUDE_BIN on the fake CLI, the real
 * CLAUDE_CALL_ENV_FILE out of the way, and a refusal to spawn anything else — the same guard the
 * trigger probe's tests use, for this skill's own launcher.
 */
export const withFakeNarration = async <T>(
  vars: Record<string, string | undefined>,
  body: () => Promise<T>,
): Promise<T> => {
  const before: Record<string, string | undefined> = {}
  const all = { CLAUDE_BIN: FAKE_CLI, CLAUDE_CALL_ENV_FILE: undefined, ...vars }
  for (const [name, value] of Object.entries(all)) {
    before[name] = process.env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    const bin = resolveBin(process.env.CLAUDE_BIN)
    if (bin[bin.length - 1] !== FAKE_CLI) {
      throw new Error(`a G3 test may only start the fake CLI, not ${bin.join(' ')}`)
    }
    return await body()
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}
