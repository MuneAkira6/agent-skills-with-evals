// The mechanical grader of the verifiable-fetch evals. It implements M1–M5 of the three evals as
// `evals.json` words them, from the run's `outputs.json`, the copies under `outputs/`, the final
// reply and `run.json`. The arm's temporary directory is gone by the time this runs.
//
// Every `evidence` string quotes a **relative** path — a path out of `outputs.json`, or a line of
// the reply — and never `run.json`'s `wsPath` or anything built from it. `grading.json` is committed,
// and an absolute path of the machine that ran the arm has no business in it. Where an assertion is
// about absolute lengths (deep-path-zh M2), the length is computed from `wsPath` and only the number
// and the relative path are written down.
//
// A judgment assertion is returned with `passed: null` and empty evidence, for a reader to fill in.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Assertion = { id: string; kind: 'mechanical' | 'judgment'; text: string }
type OutputFile = { path: string; size: number; sha256: string; head64: string; copied: boolean }
type Grade = { id: string; kind: Assertion['kind']; passed: boolean | null; evidence: string }

type RunJson = {
  wsPath?: string
  mocks?: { name: string; requests: Record<string, number>; issuedTokens: string[] }[]
}

export type Context = {
  assertions: Assertion[]
  outputs: OutputFile[]
  finalReply: string
}

const FIXTURES = join(import.meta.dirname, '..', '..', 'fixtures')

/** The sha256 of the generated archive of attachment 304, as blocked-and-large-en M1 words it. */
const ARCHIVE_SHA256 = '02e34249abc54aba2c06c3b8b35b7f4fc78ba9b10df5371e7d8372f50adbf44c'

const MAX_ABSOLUTE_PATH = 240
const MARKDOWN_LIMIT = 100 * 1024

/** `< > : " | ? *` and the control characters — the list of deep-path-zh M3, without the separators. */
const WINDOWS_FORBIDDEN = new Set(['<', '>', ':', '"', '|', '?', '*'])

const fixtureSha256 = (name: string): string =>
  createHash('sha256')
    .update(readFileSync(join(FIXTURES, 'tracker', 'files', name)))
    .digest('hex')

const readRunJson = (runDir: string): RunJson => {
  try {
    return JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')) as RunJson
  } catch {
    return {}
  }
}

/** The files the arm left under `out/`, which is where every one of these evals asks for them. */
const underOut = (outputs: OutputFile[]): OutputFile[] =>
  outputs.filter((file) => file.path === 'out' || file.path.startsWith('out/'))

const isMarkdown = (path: string): boolean => path.toLowerCase().endsWith('.md')

/** The text of a copied output, or null when it was too large to copy. */
const textOf = (runDir: string, file: OutputFile): string | null => {
  if (!file.copied) return null
  const path = join(runDir, 'outputs', ...file.path.split('/'))
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf8')
}

const beginsWithHtml = (file: OutputFile): boolean => {
  const head = Buffer.from(file.head64, 'base64').toString('latin1').replace(/^\s+/, '')
  const lower = head.toLowerCase()
  return lower.startsWith('<!doctype html') || lower.startsWith('<html')
}

const list = (paths: string[]): string => (paths.length === 0 ? 'none' : paths.join(', '))

const issuedTokens = (run: RunJson): string[] =>
  (run.mocks ?? []).flatMap((mock) => mock.issuedTokens ?? [])

/** M3 of screenshots-ja and M5 of blocked-and-large-en, which are the same assertion. */
const noIssuedToken = (
  runDir: string,
  context: Context,
  run: RunJson,
): Omit<Grade, 'id' | 'kind'> => {
  const tokens = issuedTokens(run)
  if (tokens.length === 0) {
    return {
      passed: false,
      evidence: 'run.json lists no token for the media host, so this assertion cannot be decided',
    }
  }
  const hits: string[] = []
  for (const file of underOut(context.outputs)) {
    const text = textOf(runDir, file)
    if (text === null) continue
    if (tokens.some((token) => text.includes(token))) hits.push(file.path)
  }
  const inReply = tokens.some((token) => context.finalReply.includes(token))
  return {
    passed: hits.length === 0 && !inReply,
    evidence: `${tokens.length} token(s) issued; files containing one: ${list(hits)}; in the final reply: ${inReply ? 'yes' : 'no'}`,
  }
}

const sha256Present = (
  context: Context,
  wanted: { label: string; sha256: string }[],
): Omit<Grade, 'id' | 'kind'> => {
  const found = wanted.map((want) => ({
    ...want,
    file: underOut(context.outputs).find((file) => file.sha256 === want.sha256),
  }))
  return {
    passed: found.every((entry) => entry.file !== undefined),
    evidence: found
      .map((entry) =>
        entry.file === undefined
          ? `${entry.label}: no file with sha256 ${entry.sha256}`
          : `${entry.label}: ${entry.file.path} (${entry.file.size} bytes, sha256 ${entry.sha256})`,
      )
      .join('; '),
  }
}

const screenshotsJa = (
  runDir: string,
  context: Context,
  run: RunJson,
  id: string,
): Omit<Grade, 'id' | 'kind'> => {
  if (id === 'M1') {
    const wanted = [
      'ボード画面でカードの並び順が保存されない',
      'ページを再読み込みする',
      '再現しました。',
      '画像を 2 枚添付しました。',
    ]
    for (const file of underOut(context.outputs).filter((f) => isMarkdown(f.path))) {
      const text = textOf(runDir, file)
      if (text === null) continue
      const missing = wanted.filter((needle) => !text.includes(needle))
      if (missing.length === 0) {
        return { passed: true, evidence: `${file.path} contains all four: ${wanted.join(' / ')}` }
      }
    }
    const markdowns = underOut(context.outputs)
      .filter((f) => isMarkdown(f.path))
      .map((f) => f.path)
    return {
      passed: false,
      evidence: `no Markdown under out/ contains all four of ${wanted.join(' / ')}; Markdown files found: ${list(markdowns)}`,
    }
  }
  if (id === 'M2') {
    return sha256Present(context, [
      { label: 'board-before.png', sha256: fixtureSha256('board-before.png') },
      { label: 'board-after.png', sha256: fixtureSha256('board-after.png') },
    ])
  }
  if (id === 'M3') return noIssuedToken(runDir, context, run)
  if (id === 'M4') {
    const requests = Object.entries((run.mocks ?? [])[0]?.requests ?? {})
    const fromTracker = requests.filter(([key]) =>
      /^GET \/attachments\/download\/301(\/|$)/.test(key),
    )
    const throughMedia = requests.filter(([key]) => /^GET \/media\/302$/.test(key))
    const notGet = requests.filter(([key]) => !key.startsWith('GET '))
    return {
      passed: fromTracker.length > 0 && throughMedia.length > 0 && notGet.length === 0,
      evidence: `tracker 301: ${list(fromTracker.map(([k, n]) => `${k} x${n}`))}; media 302: ${list(throughMedia.map(([k, n]) => `${k} x${n}`))}; non-GET requests: ${list(notGet.map(([k]) => k))}`,
    }
  }
  return { passed: false, evidence: `unknown assertion ${id}` }
}

const blockedAndLargeEn = (
  runDir: string,
  context: Context,
  run: RunJson,
  id: string,
): Omit<Grade, 'id' | 'kind'> => {
  if (id === 'M1') {
    return sha256Present(context, [
      { label: 'export-dialog.png', sha256: fixtureSha256('export-dialog.png') },
      { label: 'export-log.zip', sha256: ARCHIVE_SHA256 },
    ])
  }
  if (id === 'M2') {
    const html = underOut(context.outputs)
      .filter((file) => !isMarkdown(file.path) && beginsWithHtml(file))
      .map((file) => file.path)
    return {
      passed: html.length === 0,
      evidence: `non-Markdown files under out/: ${underOut(context.outputs).filter((f) => !isMarkdown(f.path)).length}; beginning with an HTML document: ${list(html)}`,
    }
  }
  if (id === 'M3') {
    const forbidden = ['gateway-screenshot.png', 'settings.png']
    const hits = underOut(context.outputs)
      .filter((file) => forbidden.includes(file.path.split('/').at(-1) ?? ''))
      .map((file) => file.path)
    return {
      passed: hits.length === 0,
      evidence: `files named ${forbidden.join(' or ')} under out/: ${list(hits)}`,
    }
  }
  if (id === 'M4') {
    const markdowns = underOut(context.outputs).filter((file) => isMarkdown(file.path))
    const tooBig = markdowns.filter((file) => file.size >= MARKDOWN_LIMIT)
    return {
      passed: tooBig.length === 0,
      evidence: `Markdown files under out/: ${list(markdowns.map((f) => `${f.path} (${f.size} bytes)`))}; at or over ${MARKDOWN_LIMIT} bytes: ${list(tooBig.map((f) => f.path))}`,
    }
  }
  if (id === 'M5') return noIssuedToken(runDir, context, run)
  return { passed: false, evidence: `unknown assertion ${id}` }
}

const deepPathZh = (
  runDir: string,
  context: Context,
  run: RunJson,
  id: string,
): Omit<Grade, 'id' | 'kind'> => {
  if (id === 'M1') {
    return sha256Present(context, [
      { label: 'wording.png', sha256: fixtureSha256('wording.png') },
      { label: 'notice.png', sha256: fixtureSha256('notice.png') },
    ])
  }
  if (id === 'M2') {
    const wsPath = run.wsPath
    if (wsPath === undefined) {
      return {
        passed: false,
        evidence: 'run.json has no workspace path, so this cannot be decided',
      }
    }
    // the absolute length is computed from the workspace path; only the number is written down
    const lengths = underOut(context.outputs).map((file) => ({
      path: file.path,
      length: wsPath.length + 1 + file.path.length,
    }))
    const over = lengths.filter((entry) => entry.length > MAX_ABSOLUTE_PATH)
    const longest = lengths.reduce(
      (worst, entry) => (entry.length > worst.length ? entry : worst),
      { path: '(none)', length: 0 },
    )
    return {
      passed: over.length === 0,
      evidence: `longest absolute path ${longest.length} characters (${longest.path}), limit ${MAX_ABSOLUTE_PATH}; over the limit: ${list(over.map((e) => `${e.path} (${e.length})`))}`,
    }
  }
  if (id === 'M3') {
    const bad: string[] = []
    for (const file of underOut(context.outputs)) {
      for (const segment of file.path.split('/')) {
        const offending = [...segment].filter(
          (ch) => WINDOWS_FORBIDDEN.has(ch) || (ch.codePointAt(0) ?? 0) < 0x20,
        )
        if (offending.length > 0) bad.push(`${file.path} (segment "${segment}")`)
      }
    }
    return {
      passed: bad.length === 0,
      evidence: `paths checked: ${underOut(context.outputs).length}; with a character Windows forbids: ${list(bad)}`,
    }
  }
  if (id === 'M4') {
    const wanted = [
      'notification-settings-wording-review-before-and-after-comparison-for-the-customer-escalation-meeting-on-the-fifth-of-october-final-revised-ver2-jp.png',
      '通知:設定?.png',
    ]
    for (const file of underOut(context.outputs).filter((f) => isMarkdown(f.path))) {
      const text = textOf(runDir, file)
      if (text === null) continue
      if (wanted.every((needle) => text.includes(needle))) {
        return {
          passed: true,
          evidence: `${file.path} contains the 150-character original name and 通知:設定?.png`,
        }
      }
    }
    return {
      passed: false,
      evidence: `no Markdown under out/ contains both original names; Markdown files found: ${list(
        underOut(context.outputs)
          .filter((f) => isMarkdown(f.path))
          .map((f) => f.path),
      )}`,
    }
  }
  return { passed: false, evidence: `unknown assertion ${id}` }
}

export const grade = (evalId: string, runDir: string, context: Context): Grade[] => {
  const run = readRunJson(runDir)
  return context.assertions.map((assertion) => {
    if (assertion.kind === 'judgment') {
      return { id: assertion.id, kind: assertion.kind, passed: null, evidence: '' }
    }
    const decide =
      evalId === 'screenshots-ja'
        ? screenshotsJa
        : evalId === 'blocked-and-large-en'
          ? blockedAndLargeEn
          : evalId === 'deep-path-zh'
            ? deepPathZh
            : null
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

/** Two runs of one arm agree when they saved the same bytes: the sorted sha256 of the non-Markdown files. */
export const agreementKey = (_evalId: string, runDir: string): string => {
  const outputs = JSON.parse(readFileSync(join(runDir, 'outputs.json'), 'utf8')) as OutputFile[]
  return underOut(outputs)
    .filter((file) => !isMarkdown(file.path))
    .map((file) => file.sha256)
    .sort()
    .join('|')
}
