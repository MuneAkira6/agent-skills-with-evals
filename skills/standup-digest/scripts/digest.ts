#!/usr/bin/env node
// The pipeline.
//
//   node .claude/skills/standup-digest/scripts/digest.ts preview|collect-only
//        [--repo owner/name] [--api URL] [--milestone N] [--now ISO] [--out DIR]
//        [--config FILE] [--model MODEL] [--feedback-issue N]
//
// `collect-only` writes the page from the rules alone and makes no call at all. `preview` adds the
// narration: one call, behind a guard, reused when the input has not changed.
//
// Exit 0 a page was written, 2 the collection failed and no page exists, 3 a usage error.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CollectionError, collect } from './collect.ts'
import { buildFacts, factsJson } from './facts.ts'
import { narrate } from './narrate.ts'
import { renderPage, sha256Of } from './page.ts'
import type { Config } from './rules.ts'

const USAGE = [
  'usage: digest preview|collect-only [--repo owner/name] [--api URL] [--milestone N]',
  '                                   [--now ISO] [--out DIR] [--config FILE] [--model MODEL]',
  '                                   [--feedback-issue N]',
].join('\n')

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

export type Options = {
  mode: 'preview' | 'collect-only'
  repo: string | null
  api: string
  milestone: number | null
  now: string
  out: string
  configFile: string
  model: string
  feedbackIssue: number | null
}

const DEFAULT_CONFIG = join(import.meta.dirname, '..', 'digest.config.json')

export const parseArgs = (argv: string[], nowFallback: string): Options => {
  const args = argv.filter((arg) => arg !== '--')
  const mode = args[0]
  if (mode !== 'preview' && mode !== 'collect-only') {
    throw new UsageError(
      `the first argument must be "preview" or "collect-only", not "${mode ?? ''}"`,
    )
  }
  const flags: Record<string, string> = {}
  for (let i = 1; i < args.length; i += 1) {
    const name = args[i]
    if (!name.startsWith('--')) throw new UsageError(`unexpected argument ${name}`)
    const value = args[i + 1]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${name} needs a value`)
    flags[name.slice(2)] = value
    i += 1
  }
  const integer = (name: string): number | null => {
    const text = flags[name]
    if (text === undefined) return null
    const value = Number(text)
    if (!Number.isInteger(value) || value < 1) {
      throw new UsageError(`--${name} must be a positive integer, not "${text}"`)
    }
    return value
  }
  const now = flags.now ?? nowFallback
  if (Number.isNaN(Date.parse(now))) throw new UsageError(`--now is not a date: "${now}"`)
  return {
    mode,
    repo: flags.repo ?? null,
    api: flags.api ?? 'https://api.github.com',
    milestone: integer('milestone'),
    now: new Date(Date.parse(now)).toISOString(),
    out: resolve(flags.out ?? join(tmpdir(), 'standup-digest')),
    configFile: resolve(flags.config ?? DEFAULT_CONFIG),
    model: flags.model ?? 'sonnet',
    feedbackIssue: integer('feedback-issue'),
  }
}

export const readConfig = (file: string, repoOverride: string | null): Config => {
  let config: Config
  try {
    config = JSON.parse(readFileSync(file, 'utf8')) as Config
  } catch (err) {
    throw new UsageError(`cannot read the configuration ${file}: ${(err as Error).message}`)
  }
  for (const key of ['repo', 'timezone', 'members', 'thresholds'] as const) {
    if (config[key] === undefined) throw new UsageError(`${file} has no "${key}"`)
  }
  return repoOverride === null ? config : { ...config, repo: repoOverride }
}

export const run = async (options: Options, out: (line: string) => void): Promise<number> => {
  const config = readConfig(options.configFile, options.repo)

  let collected: Awaited<ReturnType<typeof collect>>
  try {
    collected = await collect({
      api: options.api,
      config,
      now: options.now,
      milestoneNumber: options.milestone,
      feedbackIssue: options.feedbackIssue,
    })
  } catch (err) {
    if (err instanceof CollectionError) {
      out(`digest: ${err.message}`)
      return 2
    }
    throw err
  }
  out(`digest: ${collected.requests} requests`)

  const { facts, feedback } = buildFacts(collected, config, options.now)
  mkdirSync(options.out, { recursive: true })
  const json = factsJson(facts)
  writeFileSync(join(options.out, 'facts.json'), json)

  let narrative = null
  let reason: string | null = 'collect-only'
  let state = 'none'
  if (options.mode === 'preview') {
    const outcome = await narrate({
      facts,
      config,
      outDir: options.out,
      model: options.model,
      today: facts.today,
      feedback,
      thinkingTokens: process.env.DIGEST_THINKING_TOKENS,
    })
    state = outcome.state
    narrative = outcome.narrative
    reason = outcome.reason
    for (const [attempt, reasons] of outcome.rejections.entries()) {
      out(`digest: narration attempt ${attempt + 1} rejected: ${reasons.join('; ')}`)
    }
  }

  const page = renderPage({
    facts,
    config,
    narrative,
    degradedReason: narrative === null ? (reason ?? 'ナレーションなし') : null,
    factsSha256: sha256Of(json),
    feedback,
  })
  const pagePath = join(options.out, 'digest.md')
  writeFileSync(pagePath, page)

  const narrativeText =
    state === 'accepted' ? 'accepted' : state === 'reused' ? 'reused' : `none — ${reason ?? ''}`
  out(`digest: ${pagePath} (narrative: ${narrativeText})`)
  return 0
}

export const main = async (argv: string[], out: (line: string) => void): Promise<number> => {
  let options: Options
  try {
    options = parseArgs(argv, new Date().toISOString())
  } catch (err) {
    out(`digest: ${(err as Error).message}`)
    out(USAGE)
    return 3
  }
  try {
    return await run(options, out)
  } catch (err) {
    if (err instanceof UsageError) {
      out(`digest: ${err.message}`)
      return 3
    }
    out(`digest: ${(err as Error).message}`)
    return 3
  }
}

const startedDirectly = (): boolean => {
  const entry = process.argv[1]
  if (entry === undefined) return false
  return isAbsolute(entry) && entry === fileURLToPath(import.meta.url)
}

if (startedDirectly()) {
  process.exitCode = await main(process.argv.slice(2), (line) => {
    process.stdout.write(`${line}\n`)
  })
}
