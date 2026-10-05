// The mechanical grader of the standup-digest evals. It implements the assertions of both evals as
// `evals.json` words them, from the run's `outputs.json`, the copies under `outputs/`, the final
// reply and `run.json` (its duration and its mock log).
//
// Every `evidence` string quotes a **relative** path or a number, never `run.json`'s `wsPath` or
// anything built from it: `grading.json` is committed, and an absolute path of the machine that ran
// the arm has no business in it.
//
// A judgment assertion is returned with `passed: null` and empty evidence, for a reader to fill in.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Assertion = { id: string; kind: 'mechanical' | 'judgment'; text: string }
type OutputFile = { path: string; size: number; sha256: string; head64: string; copied: boolean }
type Grade = { id: string; kind: Assertion['kind']; passed: boolean | null; evidence: string }

type RunJson = {
  durationMs?: number
  mocks?: { name: string; requests: Record<string, number> }[]
}

export type Context = {
  assertions: Assertion[]
  outputs: OutputFile[]
  finalReply: string
}

/** The decisions the rules choose for the scenario, in order (SCOPE.md's expected outcome). */
export const EXPECTED_DECISIONS = [206, 205, 202, 211, 201, 190, 204]

/** The 15 open tracked items of the scenario. */
export const OPEN_ITEMS = [
  190, 191, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 215,
]

/** Items the collection must never track: they belong to another milestone. */
const NEVER_TRACKED = [192, 230]

/** The seconds decisions-only-ja allows the arm. */
const DURATION_LIMIT_MS = 300_000

const DECISION_HEADING = '今日決めること'

const list = (values: (string | number)[]): string =>
  values.length === 0 ? 'none' : values.join(', ')

const readRunJson = (runDir: string): RunJson => {
  try {
    return JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')) as RunJson
  } catch {
    return {}
  }
}

const underOut = (outputs: OutputFile[]): OutputFile[] =>
  outputs.filter((file) => file.path === 'out' || file.path.startsWith('out/'))

const isMarkdown = (path: string): boolean => path.toLowerCase().endsWith('.md')

const textOf = (runDir: string, file: OutputFile): string | null => {
  if (!file.copied) return null
  const path = join(runDir, 'outputs', ...file.path.split('/'))
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

/** Every Markdown under `out/`, with its text, in path order. */
const markdowns = (runDir: string, context: Context): { path: string; text: string }[] =>
  underOut(context.outputs)
    .filter((file) => isMarkdown(file.path))
    .map((file) => ({ path: file.path, text: textOf(runDir, file) ?? '' }))
    .filter((entry) => entry.text !== '')

/** The issue numbers of a text, in order of first appearance, without repeats. */
export const numbersIn = (text: string): number[] => {
  const found: number[] = []
  for (const match of text.matchAll(/#(\d+)(?!\d)/g)) {
    const number = Number(match[1])
    if (!found.includes(number)) found.push(number)
  }
  return found
}

/**
 * The **issue** numbers of the decision section, which is what preview-zh M2 asks for: a `#n`
 * written as `PR #n` is a reference to a pull request inside a machine-made fact
 * (`PR #221 レビュー待ち 3 日`), not an item the section is deciding about. Dropping those is the
 * only reading under which SCOPE.md's page format and this assertion can both hold.
 */
export const decisionNumbersIn = (section: string): number[] =>
  numbersIn(section.replace(/PR\s+#\d+/g, ' '))

/** The decision section: from the heading that names it to the next heading of the same level. */
export const decisionSection = (text: string): string | null => {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^#{1,6} /.test(line) && line.includes(DECISION_HEADING))
  if (start === -1) return null
  const level = (lines[start].match(/^#+/) ?? ['#'])[0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    const heading = /^(#+) /.exec(lines[i])
    if (heading !== null && heading[1].length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/** `GET` and nothing else, over every mock in the run. */
const onlyGetRequests = (run: RunJson): Omit<Grade, 'id' | 'kind'> => {
  const keys = (run.mocks ?? []).flatMap((mock) => Object.keys(mock.requests ?? {}))
  const others = keys.filter((key) => !key.startsWith('GET '))
  return {
    passed: keys.length > 0 && others.length === 0,
    evidence:
      keys.length === 0
        ? 'run.json lists no mock request at all, so this cannot be decided'
        : `${keys.length} distinct request(s), of which not a GET: ${list(others)}`,
  }
}

const previewZh = (
  runDir: string,
  context: Context,
  run: RunJson,
  id: string,
): Omit<Grade, 'id' | 'kind'> => {
  const pages = markdowns(runDir, context)
  if (id === 'M1') {
    for (const page of pages) {
      const lines = page.text.split('\n')
      const heading = lines.findIndex(
        (line) => /^#{1,6} /.test(line) && line.includes(DECISION_HEADING),
      )
      const table = lines.findIndex((line) => line.trimStart().startsWith('|'))
      if (heading === -1) continue
      if (table === -1 || heading < table) {
        return {
          passed: true,
          evidence: `${page.path}: the ${DECISION_HEADING} heading is on line ${heading + 1}${table === -1 ? ' and the file has no table' : `, the first table on line ${table + 1}`}`,
        }
      }
      return {
        passed: false,
        evidence: `${page.path}: the first table is on line ${table + 1}, before the ${DECISION_HEADING} heading on line ${heading + 1}`,
      }
    }
    return {
      passed: false,
      evidence: `no Markdown under out/ has a heading containing ${DECISION_HEADING}; files: ${list(pages.map((p) => p.path))}`,
    }
  }
  if (id === 'M2') {
    for (const page of pages) {
      const section = decisionSection(page.text)
      if (section === null) continue
      const found = decisionNumbersIn(section)
      return {
        passed: JSON.stringify(found) === JSON.stringify(EXPECTED_DECISIONS),
        evidence: `${page.path}: the ${DECISION_HEADING} section names ${list(found)} (expected ${list(EXPECTED_DECISIONS)})`,
      }
    }
    return { passed: false, evidence: `no ${DECISION_HEADING} section in any Markdown under out/` }
  }
  if (id === 'M3') {
    for (const page of pages) {
      // the lists of what changed and of what people should fix may repeat a number
      const kept = page.text
        .split('\n')
        .filter((line) => !line.startsWith('- ✅') && !line.startsWith('- ⚠️'))
        .join('\n')
      const counts = OPEN_ITEMS.map((number) => ({
        number,
        times: [...kept.matchAll(new RegExp(`#${number}(?!\\d)`, 'g'))].length,
      }))
      const wrong = counts.filter((entry) => entry.times !== 1)
      const forbidden = NEVER_TRACKED.filter((number) =>
        new RegExp(`#${number}(?!\\d)`).test(page.text),
      )
      if (wrong.length === 0 && forbidden.length === 0) {
        return {
          passed: true,
          evidence: `${page.path}: each of the 15 open items appears exactly once outside the ✅ and ⚠️ lines, and neither #192 nor #230 appears`,
        }
      }
      return {
        passed: false,
        evidence: `${page.path}: not exactly once: ${list(wrong.map((entry) => `#${entry.number}×${entry.times}`))}; forbidden: ${list(forbidden.map((n) => `#${n}`))}`,
      }
    }
    return { passed: false, evidence: 'no Markdown under out/ to check' }
  }
  if (id === 'M4') {
    for (const page of pages) {
      const section = decisionSection(page.text)
      if (section === null) continue
      const silent = [191, 208].filter((number) => new RegExp(`#${number}(?!\\d)`).test(section))
      return {
        passed: silent.length === 0,
        evidence: `${page.path}: silent items inside the ${DECISION_HEADING} section: ${list(silent.map((n) => `#${n}`))}`,
      }
    }
    return { passed: false, evidence: `no ${DECISION_HEADING} section in any Markdown under out/` }
  }
  if (id === 'M5') {
    for (const page of pages) {
      const hasMilestone = page.text.includes('Sprint 13')
      const due = ['10/9', '10-09', '2026-10-09'].filter((form) => page.text.includes(form))
      if (hasMilestone && due.length > 0) {
        return {
          passed: true,
          evidence: `${page.path}: holds "Sprint 13" and the due date as ${list(due)}`,
        }
      }
      return {
        passed: false,
        evidence: `${page.path}: Sprint 13 ${hasMilestone ? 'found' : 'missing'}, due date forms found: ${list(due)}`,
      }
    }
    return { passed: false, evidence: 'no Markdown under out/ to check' }
  }
  if (id === 'M6') return onlyGetRequests(run)
  return { passed: false, evidence: `unknown assertion ${id}` }
}

const decisionsOnlyJa = (
  runDir: string,
  context: Context,
  run: RunJson,
  id: string,
): Omit<Grade, 'id' | 'kind'> => {
  if (id === 'M1') {
    // The same reading as preview-zh M2, which this grader has used since it was written: a `#n`
    // spelled `PR #n` is a pull-request reference inside a machine-made fact, not one of the issue
    // numbers the reply is listing. A reply that quotes the page's own facts necessarily carries
    // `PR #221 レビュー待ち 3 日`, so counting that as an issue number would make the assertion
    // unsatisfiable for a correct answer (fact F27).
    const found = decisionNumbersIn(context.finalReply).slice(0, EXPECTED_DECISIONS.length)
    return {
      passed: JSON.stringify(found) === JSON.stringify(EXPECTED_DECISIONS),
      evidence: `the final reply names ${list(found)} first (expected ${list(EXPECTED_DECISIONS)})`,
    }
  }
  if (id === 'M2') {
    for (const page of markdowns(runDir, context)) {
      const missing = OPEN_ITEMS.filter(
        (number) => !new RegExp(`#${number}(?!\\d)`).test(page.text),
      )
      if (missing.length === 0) {
        return { passed: true, evidence: `${page.path} mentions all 15 open tracked items` }
      }
      return {
        passed: false,
        evidence: `${page.path} does not mention ${list(missing.map((n) => `#${n}`))}`,
      }
    }
    return { passed: false, evidence: 'no Markdown under out/ to check' }
  }
  if (id === 'M3') {
    const duration = run.durationMs
    if (duration === undefined) {
      return { passed: false, evidence: 'run.json has no duration, so this cannot be decided' }
    }
    return {
      passed: duration <= DURATION_LIMIT_MS,
      evidence: `the arm took ${Math.round(duration / 1000)} s (limit ${DURATION_LIMIT_MS / 1000} s)`,
    }
  }
  if (id === 'M4') return onlyGetRequests(run)
  return { passed: false, evidence: `unknown assertion ${id}` }
}

export const grade = (evalId: string, runDir: string, context: Context): Grade[] => {
  const run = readRunJson(runDir)
  return context.assertions.map((assertion) => {
    if (assertion.kind === 'judgment') {
      return { id: assertion.id, kind: assertion.kind, passed: null, evidence: '' }
    }
    const decide =
      evalId === 'preview-zh' ? previewZh : evalId === 'decisions-only-ja' ? decisionsOnlyJa : null
    if (decide === null) {
      return {
        id: assertion.id,
        kind: assertion.kind,
        passed: false,
        evidence: `unknown eval ${evalId}`,
      }
    }
    const { passed, evidence } = decide(runDir, context, run, assertion.id)
    return { id: assertion.id, kind: assertion.kind, passed, evidence }
  })
}

/**
 * Two runs of one arm agree when they chose the same decisions in the same order: the numbers the
 * grader reads for preview-zh M2, or for decisions-only-ja M1.
 */
export const agreementKey = (evalId: string, runDir: string): string => {
  let outputs: OutputFile[] = []
  try {
    outputs = JSON.parse(readFileSync(join(runDir, 'outputs.json'), 'utf8')) as OutputFile[]
  } catch {
    outputs = []
  }
  for (const file of underOut(outputs).filter((entry) => isMarkdown(entry.path))) {
    const text = textOf(runDir, file)
    if (text === null) continue
    const section = decisionSection(text)
    if (section === null) continue
    return decisionNumbersIn(section).join(',')
  }
  // no page: fall back to the reply's order, which is what decisions-only-ja asks for
  try {
    const transcript = readFileSync(join(runDir, 'transcript.md'), 'utf8')
    return numbersIn(transcript).slice(0, EXPECTED_DECISIONS.length).join(',')
  } catch {
    return `${evalId}:no-decisions`
  }
}
