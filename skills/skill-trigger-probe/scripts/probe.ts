#!/usr/bin/env node
// The trigger probe: it starts the real CLI once per query and run, and counts how often the skill
// under test actually fired.
//
//   node skills/skill-trigger-probe/scripts/probe.ts --skill <skill-dir> [--sibling <skill-dir>]...
//        --queries <trigger.json> --runs <n> --model <model> --out <file.json>
//        [--concurrency <k>] [--timeout <seconds>] [--isolated-config]
//
// Two rules decide everything here. A run that could not be measured is **broken**, counted by its
// reason and never counted as "the skill did not fire": a silently broken instrument once looked
// exactly like a skill that never triggers. And a rate is triggered divided by the **valid** runs,
// so a measurement with broken runs says `incomplete` instead of quietly reporting a smaller rate.
//
// Exit 0 the measurement is complete, 2 at least one run was broken (the files are still written),
// 3 a usage error or a failing validation.

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchClaude } from './lib/claude.ts'
import type { BrokenReason, ParsedRun } from './lib/stream.ts'
import { parseStream } from './lib/stream.ts'
import { formatReport, validateSkill } from './validate.ts'

/**
 * A path as the result file records it: relative to the working directory while it is inside it, so
 * that a committed measurement carries `evals/<skill>/trigger.json` and not this machine's home
 * directory. A path outside stays as it is — it names nothing a reader must not see.
 */
const pathForRecord = (path: string): string => {
  const rel = relative(process.cwd(), path)
  return rel.startsWith('..') || isAbsolute(rel) ? path : rel
}

const USAGE = [
  'usage: probe --skill <skill-dir> [--sibling <skill-dir>]... --queries <trigger.json>',
  '             --runs <n> --model <model> --out <file.json>',
  '             [--concurrency <k>] [--timeout <seconds>] [--isolated-config]',
].join('\n')

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

export type Query = { id: string; query: string; should_trigger: boolean }

export type Options = {
  skillDir: string
  siblingDirs: string[]
  queriesFile: string
  runs: number
  model: string
  out: string
  concurrency: number
  timeoutSeconds: number
  isolatedConfig: boolean
}

export const parseArgs = (argv: string[]): Options => {
  const siblingDirs: string[] = []
  let skillDir: string | null = null
  let queriesFile: string | null = null
  let runs: number | null = null
  let model: string | null = null
  let out: string | null = null
  let concurrency = 4
  let timeoutSeconds = 240
  let isolatedConfig = false

  const value = (i: number, name: string): string => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${name} needs a value`)
    return v
  }
  const positive = (text: string, name: string): number => {
    const n = Number(text)
    if (!Number.isInteger(n) || n < 1) throw new UsageError(`${name} must be a positive integer`)
    return n
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--skill':
        skillDir = value(i, '--skill')
        i += 1
        break
      case '--sibling':
        siblingDirs.push(value(i, '--sibling'))
        i += 1
        break
      case '--queries':
        queriesFile = value(i, '--queries')
        i += 1
        break
      case '--runs':
        runs = positive(value(i, '--runs'), '--runs')
        i += 1
        break
      case '--model':
        model = value(i, '--model')
        i += 1
        break
      case '--out':
        out = value(i, '--out')
        i += 1
        break
      case '--concurrency':
        concurrency = positive(value(i, '--concurrency'), '--concurrency')
        i += 1
        break
      case '--timeout':
        timeoutSeconds = positive(value(i, '--timeout'), '--timeout')
        i += 1
        break
      case '--isolated-config':
        isolatedConfig = true
        break
      // pnpm forwards the `--` of `pnpm <script> -- …`; it is a separator, not an argument
      case '--':
        break
      default:
        throw new UsageError(`unknown argument ${arg}`)
    }
  }
  if (skillDir === null) throw new UsageError('--skill is required')
  if (queriesFile === null) throw new UsageError('--queries is required')
  if (runs === null) throw new UsageError('--runs is required')
  // there is no default model: an earlier probe defined one and never passed it to the CLI
  if (model === null) throw new UsageError('--model is required')
  if (out === null) throw new UsageError('--out is required')
  return {
    skillDir: resolve(skillDir),
    siblingDirs: siblingDirs.map((d) => resolve(d)),
    queriesFile: resolve(queriesFile),
    runs,
    model,
    out: resolve(out),
    concurrency,
    timeoutSeconds,
    isolatedConfig,
  }
}

export const readQueries = (file: string): Query[] => {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    throw new UsageError(`cannot read ${file}: ${(err as { code?: string }).code ?? String(err)}`)
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new UsageError(`${file} is not JSON: ${(err as Error).message}`)
  }
  if (!Array.isArray(data)) throw new UsageError(`${file} must hold a list of queries`)
  return data.map((entry, i) => {
    const e = entry as Partial<Query>
    if (typeof e.id !== 'string' || e.id === '') {
      throw new UsageError(`${file}: entry ${i} has no "id"`)
    }
    if (typeof e.query !== 'string' || e.query === '') {
      throw new UsageError(`${file}: entry ${e.id} has no "query"`)
    }
    if (typeof e.should_trigger !== 'boolean') {
      throw new UsageError(`${file}: entry ${e.id} has no boolean "should_trigger"`)
    }
    return { id: e.id, query: e.query, should_trigger: e.should_trigger }
  })
}

export type RunRecord = {
  queryId: string
  run: number
  status: ParsedRun['status']
  reason: BrokenReason | null
  fired: string[]
  durationMs: number
  model: string | null
  claudeCodeVersion: string | null
  totalCostUsd: number | null
}

export type QueryRecord = {
  id: string
  shouldTrigger: boolean
  runs: number
  valid: number
  triggered: number
  /** triggered divided by the valid runs; null when no run was valid */
  rate: number | null
  passed: boolean
  incomplete: boolean
  nearThreshold: boolean
  brokenReasons: Record<string, number>
  siblingsFired: Record<string, number>
}

const countInto = (target: Record<string, number>, key: string): void => {
  target[key] = (target[key] ?? 0) + 1
}

/** `name` itself or a plugin's `<plugin>:<name>` is the skill, anything else is a sibling. */
const isOwnName = (fired: string, name: string): boolean =>
  fired === name || fired.endsWith(`:${name}`)

export const summarise = (
  queries: Query[],
  records: RunRecord[],
  skillName: string,
  runsPerQuery: number,
): QueryRecord[] =>
  queries.map((query) => {
    const mine = records.filter((r) => r.queryId === query.id)
    const valid = mine.filter((r) => r.status !== 'broken')
    const triggered = valid.filter((r) => r.status === 'triggered').length
    const rate = valid.length === 0 ? null : triggered / valid.length
    const brokenReasons: Record<string, number> = {}
    for (const r of mine) if (r.reason !== null) countInto(brokenReasons, r.reason)
    const siblingsFired: Record<string, number> = {}
    for (const r of mine) {
      for (const fired of r.fired) {
        if (!isOwnName(fired, skillName)) countInto(siblingsFired, fired)
      }
    }
    const passed = rate === null ? false : query.should_trigger ? rate >= 0.5 : rate < 0.5
    return {
      id: query.id,
      shouldTrigger: query.should_trigger,
      runs: runsPerQuery,
      valid: valid.length,
      triggered,
      rate,
      passed,
      incomplete: valid.length < runsPerQuery,
      // three runs cannot tell 0.33 from 0.5: say so instead of reporting a number that cannot hold
      nearThreshold: rate !== null && rate >= 0.25 && rate <= 0.75 && valid.length < 6,
      brokenReasons,
      siblingsFired,
    }
  })

const rateText = (rate: number | null): string => (rate === null ? 'n/a' : rate.toFixed(2))

export const markdown = (result: ProbeResult): string => {
  const s = result.summary
  const lines: string[] = [
    `# Trigger rates — ${result.skill.name}`,
    '',
    `- date (UTC): ${result.dateUtc}`,
    `- model requested: ${result.model.requested} — resolved: ${result.model.resolved ?? 'unknown'}`,
    `- Claude Code: ${result.claudeCodeVersion ?? 'unknown'}`,
    `- runs per query: ${result.runsPerQuery}`,
    `- isolated configuration: ${result.isolatedConfig ? 'yes' : 'no'}`,
    `- siblings installed: ${result.siblings.length === 0 ? 'none' : result.siblings.join(', ')}`,
    `- positives passed: ${s.positives.passed}/${s.positives.total}`,
    `- negatives passed: ${s.negatives.passed}/${s.negatives.total}`,
    `- broken runs: ${s.brokenTotal}${
      s.brokenTotal === 0
        ? ''
        : ` (${Object.entries(s.brokenRuns)
            .map(([reason, n]) => `${reason} ${n}`)
            .join(', ')})`
    }`,
    `- near-threshold queries: ${s.nearThreshold.length === 0 ? 'none' : s.nearThreshold.join(', ')}`,
    `- siblings fired: ${
      Object.keys(s.siblingsFired).length === 0
        ? 'none'
        : Object.entries(s.siblingsFired)
            .map(([name, n]) => `${name} ${n}`)
            .join(', ')
    }`,
    `- total cost reported by the CLI (USD, API-equivalent, not money spent): ${s.totalCostUsd.toFixed(4)}`,
    `- measurement complete: ${s.incomplete ? 'no — at least one run was broken' : 'yes'}`,
    '',
    '| id | expectation | rate | valid runs | flags | siblings fired |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const q of result.perQuery) {
    const flags = [
      q.passed ? '' : 'failed',
      q.incomplete ? 'incomplete' : '',
      q.nearThreshold ? 'near-threshold' : '',
    ].filter((f) => f !== '')
    const siblings = Object.entries(q.siblingsFired)
      .map(([name, n]) => `${name} ${n}`)
      .join(' ')
    lines.push(
      `| ${q.id} | ${q.shouldTrigger ? 'trigger' : 'no trigger'} | ${rateText(q.rate)} | ${q.valid}/${q.runs} | ${flags.join(' ')} | ${siblings} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

export type ProbeResult = {
  skill: { name: string; dir: string; descriptionCharacters: number }
  siblings: string[]
  queriesFile: string
  runsPerQuery: number
  model: { requested: string; resolved: string | null }
  claudeCodeVersion: string | null
  isolatedConfig: boolean
  dateUtc: string
  summary: {
    positives: { passed: number; total: number }
    negatives: { passed: number; total: number }
    brokenRuns: Record<string, number>
    brokenTotal: number
    nearThreshold: string[]
    siblingsFired: Record<string, number>
    totalCostUsd: number
    incomplete: boolean
  }
  perQuery: QueryRecord[]
  perRun: RunRecord[]
}

/** Runs `worker` over the items, at most `limit` at a time. */
const pool = async <T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0
  const take = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, take))
}

export const probe = async (
  options: Options,
  out: (line: string) => void,
): Promise<{ code: number; result: ProbeResult | null }> => {
  const report = validateSkill(options.skillDir)
  for (const line of formatReport(report)) out(line)
  if (report.findings.length > 0) {
    out('probe: the skill does not validate, so nothing was measured')
    return { code: 3, result: null }
  }
  const skillName = report.name
  const queries = readQueries(options.queriesFile)

  const project = mkdtempSync(join(tmpdir(), 'skill-trigger-probe-'))
  const records: RunRecord[] = []
  try {
    const skillsDir = join(project, 'ws', '.claude', 'skills')
    mkdirSync(skillsDir, { recursive: true })
    cpSync(options.skillDir, join(skillsDir, skillName), { recursive: true })
    for (const sibling of options.siblingDirs) {
      cpSync(sibling, join(skillsDir, basename(sibling)), { recursive: true })
    }
    const ws = join(project, 'ws')

    type Job = { query: Query; index: number }
    const jobs: Job[] = []
    for (const query of queries) {
      for (let i = 1; i <= options.runs; i += 1) jobs.push({ query, index: i })
    }

    let configSeq = 0
    await pool(jobs, options.concurrency, async (job) => {
      const env: Record<string, string> = {}
      if (options.isolatedConfig) {
        configSeq += 1
        const dir = join(project, 'cfg', `run-${configSeq}`)
        mkdirSync(dir, { recursive: true })
        env.CLAUDE_CONFIG_DIR = dir
      }
      const launched = await launchClaude({
        args: [
          '-p',
          '--model',
          options.model,
          '--output-format',
          'stream-json',
          '--verbose',
          '--max-turns',
          '1',
          '--no-session-persistence',
          '--strict-mcp-config',
        ],
        prompt: job.query.query,
        cwd: ws,
        timeoutMs: options.timeoutSeconds * 1000,
        env,
      })
      const parsed = parseStream({
        stdout: launched.stdout,
        skillName,
        spawnError: launched.spawnError,
        timedOut: launched.timedOut,
      })
      records.push({
        queryId: job.query.id,
        run: job.index,
        status: parsed.status,
        reason: parsed.reason,
        fired: parsed.fired,
        durationMs: launched.durationMs,
        model: parsed.model,
        claudeCodeVersion: parsed.claudeCodeVersion,
        totalCostUsd: parsed.totalCostUsd,
      })
    })
  } finally {
    rmSync(project, { recursive: true, force: true })
  }

  records.sort((a, b) => (a.queryId === b.queryId ? a.run - b.run : a.queryId < b.queryId ? -1 : 1))
  const perQuery = summarise(queries, records, skillName, options.runs)
  const brokenRuns: Record<string, number> = {}
  for (const r of records) if (r.reason !== null) countInto(brokenRuns, r.reason)
  const siblingsFired: Record<string, number> = {}
  for (const q of perQuery) {
    for (const [name, n] of Object.entries(q.siblingsFired)) {
      siblingsFired[name] = (siblingsFired[name] ?? 0) + n
    }
  }
  const positives = perQuery.filter((q) => q.shouldTrigger)
  const negatives = perQuery.filter((q) => !q.shouldTrigger)
  const brokenTotal = records.filter((r) => r.status === 'broken').length

  const result: ProbeResult = {
    skill: {
      name: skillName,
      dir: pathForRecord(options.skillDir),
      descriptionCharacters: report.descriptionLength,
    },
    siblings: options.siblingDirs.map((d) => basename(d)),
    queriesFile: pathForRecord(options.queriesFile),
    runsPerQuery: options.runs,
    model: {
      requested: options.model,
      // the resolved model is the init event's own, never the requested alias
      resolved: records.find((r) => r.model !== null)?.model ?? null,
    },
    claudeCodeVersion: records.find((r) => r.claudeCodeVersion !== null)?.claudeCodeVersion ?? null,
    isolatedConfig: options.isolatedConfig,
    dateUtc: new Date().toISOString().slice(0, 10),
    summary: {
      positives: { passed: positives.filter((q) => q.passed).length, total: positives.length },
      negatives: { passed: negatives.filter((q) => q.passed).length, total: negatives.length },
      brokenRuns,
      brokenTotal,
      nearThreshold: perQuery.filter((q) => q.nearThreshold).map((q) => q.id),
      siblingsFired,
      totalCostUsd: records.reduce((sum, r) => sum + (r.totalCostUsd ?? 0), 0),
      incomplete: brokenTotal > 0,
    },
    perQuery,
    perRun: records,
  }

  mkdirSync(dirname(options.out), { recursive: true })
  writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`)
  const mdPath = options.out.replace(/\.json$/, '.md')
  writeFileSync(mdPath, markdown(result))
  out(`probe: ${options.out}`)
  out(`probe: ${mdPath}`)
  out(
    `probe: positives ${result.summary.positives.passed}/${result.summary.positives.total}, negatives ${result.summary.negatives.passed}/${result.summary.negatives.total}, broken ${brokenTotal}`,
  )
  return { code: brokenTotal > 0 ? 2 : 0, result }
}

export const main = async (argv: string[], out: (line: string) => void): Promise<number> => {
  let options: Options
  try {
    options = parseArgs(argv)
  } catch (err) {
    out(`probe: ${(err as Error).message}`)
    out(USAGE)
    return 3
  }
  try {
    return (await probe(options, out)).code
  } catch (err) {
    out(`probe: ${(err as Error).message}`)
    return 3
  }
}

const startedDirectly = (): boolean => {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (startedDirectly()) {
  process.exitCode = await main(process.argv.slice(2), (line) => {
    process.stdout.write(`${line}\n`)
  })
}
