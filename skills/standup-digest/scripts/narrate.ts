// The narration: the one call to a language model this skill makes, and everything that keeps it
// cheap and safe.
//
// Cheap: a fresh empty directory so no project file is in scope, the system prompt replaced, no
// tools, no MCP server, the input cut to what the rules selected, and thinking switched off for that
// one process. **If the input is unchanged, the accepted text of the last run is reused and no call
// is made at all.**
//
// Safe: `narrative.sha` is written **only when the guard accepted**. A rejected run leaves none —
// the lesson of a day when a rejected run reused an earlier accepted narrative for a different
// input and nobody could tell from the page.

import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { callClaude } from './claude.ts'
import type { Facts, Feedback, ItemFacts } from './facts.ts'
import type { GuardContext, Narrative } from './guard.ts'
import { guard } from './guard.ts'
import type { Config } from './rules.ts'

/** The system prompt: one Japanese sentence, and the whole of the model's instructions about itself. */
export const SYSTEM_PROMPT =
  '朝会用の短い日本語の文だけを書き、与えられた JSON にない事実は書かず、JSON だけを返す。'

export const THINKING_VARIABLE = 'MAX_THINKING_TOKENS'

export type NarrateInput = {
  milestone: { title: string; due: string | null; days_left: number | null }
  decisions: {
    number: number
    title: string
    assignees: string[]
    triggers: string[]
    idle_days: number
    waiting_days: number
    review_days: number
    linked_pulls: number[]
    recent: { kind: string; date: string; comment?: string }[]
  }[]
  table: { number: number; title: string; lane: string; latest: string }[]
  feedback: { author: string; date: string; body: string }[]
}

const cut = (text: string, limit: number): string => [...text].slice(0, limit).join('')

/** Canonical JSON: keys sorted, no whitespace. Its sha256 is the input hash. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export const buildNarrateInput = (
  facts: Facts,
  config: Config,
  feedback: Feedback[] = [],
): NarrateInput => {
  const byNumber = new Map(facts.items.map((item) => [item.number, item]))
  const decisions = facts.decisions
    .map((number) => byNumber.get(number))
    .filter((item): item is ItemFacts => item !== undefined)

  const decisionEntries = decisions.map((item) => ({
    number: item.number,
    title: cut(item.title, 60),
    assignees: item.assignees,
    triggers: item.triggers as string[],
    idle_days: item.idleDays,
    waiting_days: item.waitingDays,
    review_days: item.reviewDays,
    linked_pulls: item.linkedPulls,
    recent: [],
  }))

  // the table's items, up to maxNarrated entries in all
  const room = Math.max(0, config.thresholds.maxNarrated - decisionEntries.length)
  const table = facts.items
    .filter(
      (item) =>
        !item.decision &&
        (item.lane === 'waiting' || item.lane === 'in-progress' || item.lane === 'stale'),
    )
    .sort((a, b) => a.number - b.number)
    .slice(0, room)
    .map((item) => ({
      number: item.number,
      title: cut(item.title, 60),
      lane: item.lane as string,
      latest:
        item.latestActivity === null
          ? ''
          : `${item.latestActivity.kind} ${item.latestActivity.at.slice(0, 10)}`,
    }))

  return {
    milestone: {
      title: facts.milestone.title,
      due: facts.milestone.dueDate,
      days_left: facts.milestone.daysLeft,
    },
    decisions: decisionEntries,
    table,
    feedback: feedback.map((comment) => ({
      author: comment.author,
      date: comment.date,
      body: cut(comment.body, 300),
    })),
  }
}

/** The latest three activities of an item, with a comment's first 120 characters. */
export const recentOf = (item: {
  activities: { kind: string; at: string; comment: string | null }[]
}): { kind: string; date: string; comment?: string }[] =>
  item.activities
    .slice(-3)
    .reverse()
    .map((activity) => ({
      kind: activity.kind,
      date: activity.at.slice(0, 10),
      ...(activity.comment === null ? {} : { comment: cut(activity.comment, 120) }),
    }))

export const buildPrompt = (input: NarrateInput): string =>
  [
    '以下の JSON は、規則が選んだ朝会の項目である。各項目について短い日本語の文を書く。',
    '',
    '- decisions の各要素に対して、`stuck_on`（何を待っているか、60 文字以内）と',
    '  `decision_needed`（「A か B か」の問い、40 文字以内）を書く。',
    '- table の各要素には、必要なら一行の要約（50 文字以内）を `one_liners` に書く。',
    '- feedback への返答は `notes` に 3 件以内、各 120 文字以内で書く。',
    '- JSON にない番号・URL・@メンションは書かない。推測もしない。',
    '- 返すのは次の形の JSON だけ。前置きも説明も書かない。',
    '',
    '```json',
    '{"decisions":[{"number":0,"stuck_on":"","decision_needed":""}],',
    ' "one_liners":[{"number":0,"text":""}],',
    ' "notes":[]}',
    '```',
    '',
    '入力:',
    '',
    '```json',
    JSON.stringify(input, null, 2),
    '```',
    '',
  ].join('\n')

export const inputHash = (input: NarrateInput): string =>
  createHash('sha256').update(canonicalJson(input)).digest('hex')

/** Every number that occurs anywhere in the narration input, for the guard's `#n` rule. */
export const knownNumbers = (input: NarrateInput): number[] => {
  const found = new Set<number>()
  for (const match of canonicalJson(input).matchAll(/\d+/g)) found.add(Number(match[0]))
  return [...found]
}

export type NarrationOutcome = {
  /** `accepted`, `reused`, or `none` with a reason */
  state: 'accepted' | 'reused' | 'none'
  reason: string | null
  narrative: Narrative | null
  /** the rejection reasons of every attempt, in order */
  rejections: string[][]
  calls: number
}

export type NarrateOptions = {
  facts: Facts
  config: Config
  outDir: string
  model: string
  /** the date directory of today, in the configured zone */
  today: string
  feedback?: Feedback[]
  timeoutMs?: number
  /** `default` leaves MAX_THINKING_TOKENS unset; anything else is its value */
  thinkingTokens?: string
}

type UsageLine = {
  date: string
  attempt: number
  models: string[]
  input: number
  cache_creation: number
  cache_read: number
  output: number
  thinking: number
  duration_ms: number
  total_cost_usd: number | null
  outcome: string
}

const usageFrom = (
  result: { stdout: string },
  today: string,
  attempt: number,
  outcome: string,
  durationMs: number,
): UsageLine => {
  let parsed: Record<string, unknown> = {}
  for (const line of result.stdout.split('\n')) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      // not the result line
    }
  }
  const usage = (parsed.usage ?? {}) as Record<string, unknown>
  const details = (usage.output_tokens_details ?? {}) as Record<string, unknown>
  const modelUsage = (parsed.modelUsage ?? {}) as Record<string, unknown>
  const number = (value: unknown): number => (typeof value === 'number' ? value : 0)
  return {
    date: today,
    attempt,
    models: Object.keys(modelUsage),
    input: number(usage.input_tokens),
    cache_creation: number(usage.cache_creation_input_tokens),
    cache_read: number(usage.cache_read_input_tokens),
    output: number(usage.output_tokens),
    thinking: number(details.thinking_tokens),
    duration_ms: durationMs,
    total_cost_usd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
    outcome,
  }
}

const resultTextOf = (stdout: string): string => {
  let text = ''
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const parsed = JSON.parse(trimmed) as { result?: unknown }
      if (typeof parsed.result === 'string') text = parsed.result
    } catch {
      // not the result line
    }
  }
  return text
}

/** A date-shaped directory name, so the reuse scan reads only the days it wrote itself. */
const DATE_DIRECTORY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The accepted narrative of a day whose input hash is this one, if there is any — the reuse that
 * makes an unchanged stand-up cost nothing.
 */
export const findReusable = (outDir: string, hash: string): Narrative | null => {
  let names: string[]
  try {
    names = readdirSync(outDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && DATE_DIRECTORY.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse()
  } catch {
    return null
  }
  for (const name of names) {
    const shaPath = join(outDir, name, 'narrative.sha')
    const jsonPath = join(outDir, name, 'narrative.json')
    if (!existsSync(shaPath) || !existsSync(jsonPath)) continue
    if (readFileSync(shaPath, 'utf8').trim() !== hash) continue
    try {
      return JSON.parse(readFileSync(jsonPath, 'utf8')) as Narrative
    } catch {
      return null
    }
  }
  return null
}

export const narrate = async (options: NarrateOptions): Promise<NarrationOutcome> => {
  const input = buildNarrateInput(options.facts, options.config, options.feedback ?? [])
  const hash = inputHash(input)
  mkdirSync(options.outDir, { recursive: true })
  writeFileSync(join(options.outDir, 'narrate-input.json'), `${canonicalJson(input)}\n`)
  writeFileSync(join(options.outDir, 'prompt.md'), buildPrompt(input))

  const reusable = findReusable(options.outDir, hash)
  if (reusable !== null) {
    return { state: 'reused', reason: null, narrative: reusable, rejections: [], calls: 0 }
  }

  const context: GuardContext = {
    decisionNumbers: input.decisions.map((entry) => entry.number),
    tableNumbers: input.table.map((entry) => entry.number),
    knownNumbers: knownNumbers(input),
  }

  const thinking = options.thinkingTokens ?? '0'
  const env: Record<string, string> = {}
  // the variable is set for this one process, never in a settings file
  if (thinking !== 'default') env[THINKING_VARIABLE] = thinking

  const rejections: string[][] = []
  let calls = 0
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await callClaude({
      args: [
        '-p',
        '--system-prompt',
        SYSTEM_PROMPT,
        '--tools',
        '',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--model',
        options.model,
        '--output-format',
        'json',
      ],
      prompt: buildPrompt(input),
      timeoutMs: options.timeoutMs ?? 420_000,
      env,
    })
    calls += 1

    if (result.spawnError !== null || result.timedOut) {
      const reason = result.timedOut ? 'the call timed out' : 'the CLI could not be started'
      appendFileSync(
        join(options.outDir, 'usage.jsonl'),
        `${JSON.stringify(usageFrom(result, options.today, attempt, 'error', result.durationMs))}\n`,
      )
      rejections.push([reason])
      continue
    }

    const verdict = guard(resultTextOf(result.stdout), context)
    appendFileSync(
      join(options.outDir, 'usage.jsonl'),
      `${JSON.stringify(usageFrom(result, options.today, attempt, verdict.accepted ? 'accepted' : 'rejected', result.durationMs))}\n`,
    )
    if (verdict.accepted) {
      const dayDir = join(options.outDir, options.today)
      mkdirSync(dayDir, { recursive: true })
      writeFileSync(
        join(dayDir, 'narrative.json'),
        `${JSON.stringify(verdict.narrative, null, 2)}\n`,
      )
      // only now, with the guard satisfied, does the hash go on disk
      writeFileSync(join(dayDir, 'narrative.sha'), `${hash}\n`)
      return { state: 'accepted', reason: null, narrative: verdict.narrative, rejections, calls }
    }
    rejections.push(verdict.reasons)
  }

  return {
    state: 'none',
    reason: `ガードが ${rejections.length} 回とも拒否`,
    narrative: null,
    rejections,
    calls,
  }
}
