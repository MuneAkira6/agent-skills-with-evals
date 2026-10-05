import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Context } from '../evals/verifiable-fetch/grade.ts'
import { agreementKey, grade } from '../evals/verifiable-fetch/grade.ts'
import { collectOutputs } from '../harness/ab/outputs.ts'
import { startTracker } from '../harness/mocks/tracker.ts'
import { main } from '../skills/verifiable-fetch/scripts/fetch.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'

type Assertion = { id: string; kind: 'mechanical' | 'judgment'; text: string }
type OutputFile = { path: string; size: number; sha256: string; head64: string; copied: boolean }
type Suite = { evals: { id: string; assertions: Assertion[] }[] }

const SUITE = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'evals', 'verifiable-fetch', 'evals.json'), 'utf8'),
) as Suite

/** A workspace path that is a plausible arm's but belongs to no machine: never this run's own. */
const WS_PATH = '/tmp/ab-run-planted0/ws'

const assertionsOf = (evalId: string): Assertion[] => {
  const found = SUITE.evals.find((entry) => entry.id === evalId)
  if (found === undefined) throw new Error(`no eval ${evalId} in evals.json`)
  return found.assertions
}

type Planted = {
  runDir: string
  outputs: OutputFile[]
  finalReply: string
  tokens: string[]
  requests: Record<string, number>
}

let root: string
const planted: Record<string, Planted> = {}

/**
 * A planted *good* output: a real fetcher run against the mock, collected exactly as the A/B runner
 * collects an arm's workspace, with a run.json of the shape the runner writes.
 */
const plant = async (
  evalId: string,
  issue: number,
  outDir: string,
  finalReply: string,
): Promise<Planted> => {
  const ws = join(root, evalId, 'ws')
  const runDir = join(root, evalId, 'run')
  mkdirSync(join(ws, 'out'), { recursive: true })
  mkdirSync(runDir, { recursive: true })
  const tracker = await startTracker()
  try {
    await main(
      ['--base', tracker.trackerUrl, '--issue', String(issue), '--out', join(ws, outDir)],
      () => {},
    )
  } finally {
    await tracker.close()
  }
  const outputs = collectOutputs(ws, runDir)
  const requests: Record<string, number> = {}
  for (const entry of tracker.log()) {
    const key = `${entry.method} ${entry.path}`
    requests[key] = (requests[key] ?? 0) + 1
  }
  const tokens = tracker.issuedTokens()
  writeFileSync(join(runDir, 'outputs.json'), `${JSON.stringify(outputs, null, 2)}\n`)
  writeFileSync(
    join(runDir, 'run.json'),
    `${JSON.stringify({ wsPath: WS_PATH, mocks: [{ name: 'tracker', requests, issuedTokens: tokens }] }, null, 2)}\n`,
  )
  return { runDir, outputs, finalReply, tokens, requests }
}

const context = (p: Planted, evalId: string, overrides: Partial<Context> = {}): Context => ({
  assertions: assertionsOf(evalId),
  outputs: p.outputs,
  finalReply: p.finalReply,
  ...overrides,
})

/** Grades a planted run after a violation has been applied, and returns the failing ids. */
const failing = (evalId: string, p: Planted, overrides: Partial<Context> = {}): string[] =>
  grade(evalId, p.runDir, context(p, evalId, overrides))
    .filter((g) => g.passed === false)
    .map((g) => g.id)

/** A copy of the planted outputs with one entry changed, so a violation touches one check only. */
const withOutputs = (p: Planted, change: (outputs: OutputFile[]) => OutputFile[]): Planted => ({
  ...p,
  outputs: change(p.outputs.map((file) => ({ ...file }))),
})

const markdownPath = (p: Planted): string => {
  const file = p.outputs.find((entry) => entry.path.endsWith('.md'))
  if (file === undefined) throw new Error('the planted run has no Markdown')
  return file.path
}

const editMarkdown = (p: Planted, edit: (text: string) => string): void => {
  const path = join(p.runDir, 'outputs', ...markdownPath(p).split('/'))
  writeFileSync(path, edit(readFileSync(path, 'utf8')))
}

const restoreMarkdown = (p: Planted, text: string): void => {
  writeFileSync(join(p.runDir, 'outputs', ...markdownPath(p).split('/')), text)
}

const markdownText = (p: Planted): string =>
  readFileSync(join(p.runDir, 'outputs', ...markdownPath(p).split('/')), 'utf8')

beforeAll(async () => {
  root = makeTempDir('g2-grade')
  planted['screenshots-ja'] = await plant(
    'screenshots-ja',
    101,
    'out',
    'out/ に 101.md と添付 2 件を保存しました。',
  )
  planted['blocked-and-large-en'] = await plant(
    'blocked-and-large-en',
    102,
    'out',
    'Saved out/102.md; gateway-screenshot.png and settings.png could not be fetched.',
  )
  planted['deep-path-zh'] = await plant(
    'deep-path-zh',
    103,
    join('out', 'archive', '2026', '10', 'customer-escalations', 'notification-wording-review'),
    '已保存到 out/archive/…，其中一个文件名过长已被缩短。',
  )
}, 30_000)

afterAll(() => {
  removeTempDir(root)
})

describe('the grader on a planted good output', () => {
  it('passes every mechanical assertion of the three evals and leaves the judgment ones open', () => {
    for (const evalId of ['screenshots-ja', 'blocked-and-large-en', 'deep-path-zh']) {
      const grades = grade(evalId, planted[evalId].runDir, context(planted[evalId], evalId))
      expect(grades.map((g) => g.id)).toEqual(assertionsOf(evalId).map((a) => a.id))
      for (const g of grades) {
        if (g.kind === 'judgment') {
          expect(g.passed, `${evalId} ${g.id}`).toBeNull()
          expect(g.evidence, `${evalId} ${g.id}`).toBe('')
        } else {
          expect(g.passed, `${evalId} ${g.id}: ${g.evidence}`).toBe(true)
          expect(g.evidence.length, `${evalId} ${g.id}`).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('screenshots-ja: each mechanical assertion fails on a violation of itself alone', () => {
  it('M1: the Markdown loses one of the four required strings', () => {
    const p = planted['screenshots-ja']
    const before = markdownText(p)
    editMarkdown(p, (text) => text.replace('画像を 2 枚添付しました。', 'removed'))
    try {
      expect(failing('screenshots-ja', p)).toEqual(['M1'])
    } finally {
      restoreMarkdown(p, before)
    }
  })

  it('M2: one of the two screenshots is missing from outputs.json', () => {
    const p = planted['screenshots-ja']
    const broken = withOutputs(p, (outputs) =>
      outputs.filter((file) => !file.path.endsWith('board-after.png')),
    )
    expect(failing('screenshots-ja', broken)).toEqual(['M2'])
  })

  it('M3: a token the media host issued is written into the Markdown', () => {
    const p = planted['screenshots-ja']
    const before = markdownText(p)
    editMarkdown(p, (text) => `${text}\nsee http://127.0.0.1:1/x?token=${p.tokens[0]}\n`)
    try {
      expect(failing('screenshots-ja', p)).toEqual(['M3'])
    } finally {
      restoreMarkdown(p, before)
    }
  })

  it('M3: a token in the final reply alone is caught too', () => {
    const p = planted['screenshots-ja']
    expect(failing('screenshots-ja', p, { finalReply: `done, token=${p.tokens[0]}` })).toEqual([
      'M3',
    ])
  })

  it('M4: the mock log no longer shows attachment 302 through the media host', () => {
    const p = planted['screenshots-ja']
    const runJson = JSON.parse(readFileSync(join(p.runDir, 'run.json'), 'utf8')) as {
      mocks: { requests: Record<string, number> }[]
    }
    const before = readFileSync(join(p.runDir, 'run.json'), 'utf8')
    delete runJson.mocks[0].requests['GET /media/302']
    writeFileSync(join(p.runDir, 'run.json'), JSON.stringify(runJson, null, 2))
    try {
      expect(failing('screenshots-ja', p)).toEqual(['M4'])
    } finally {
      writeFileSync(join(p.runDir, 'run.json'), before)
    }
  })

  it('M4: a request that is not a GET fails it as well', () => {
    const p = planted['screenshots-ja']
    const before = readFileSync(join(p.runDir, 'run.json'), 'utf8')
    const runJson = JSON.parse(before) as { mocks: { requests: Record<string, number> }[] }
    runJson.mocks[0].requests['POST /issues/101.json'] = 1
    writeFileSync(join(p.runDir, 'run.json'), JSON.stringify(runJson, null, 2))
    try {
      expect(failing('screenshots-ja', p)).toEqual(['M4'])
    } finally {
      writeFileSync(join(p.runDir, 'run.json'), before)
    }
  })
})

describe('blocked-and-large-en: each mechanical assertion fails on a violation of itself alone', () => {
  const evalId = 'blocked-and-large-en'

  it('M1: the archive is missing', () => {
    const p = planted[evalId]
    const broken = withOutputs(p, (outputs) =>
      outputs.filter((file) => !file.path.endsWith('export-log.zip')),
    )
    expect(failing(evalId, broken)).toEqual(['M1'])
  })

  it('M2: a non-Markdown output begins with an HTML document', () => {
    const p = planted[evalId]
    const broken = withOutputs(p, (outputs) => [
      ...outputs,
      {
        path: 'out/attachments/102/evidence.png',
        size: 191,
        sha256: 'a'.repeat(64),
        head64: Buffer.from('<!DOCTYPE html>\n<html>').toString('base64'),
        copied: true,
      },
    ])
    expect(failing(evalId, broken)).toEqual(['M2'])
  })

  it('M3: a file named settings.png exists, with bytes that are not HTML', () => {
    const p = planted[evalId]
    const broken = withOutputs(p, (outputs) => [
      ...outputs,
      {
        path: 'out/attachments/102/settings.png',
        size: 812,
        sha256: 'b'.repeat(64),
        head64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64'),
        copied: true,
      },
    ])
    expect(failing(evalId, broken)).toEqual(['M3'])
  })

  it('M4: a Markdown file reaches 100 KB, which is the archive inlined', () => {
    const p = planted[evalId]
    const broken = withOutputs(p, (outputs) =>
      outputs.map((file) => (file.path.endsWith('.md') ? { ...file, size: 120_000 } : file)),
    )
    expect(failing(evalId, broken)).toEqual(['M4'])
  })

  it('M5: a token the media host issued is written into the Markdown', () => {
    const p = planted[evalId]
    const before = markdownText(p)
    editMarkdown(p, (text) => `${text}\n${p.tokens[0]}\n`)
    try {
      expect(failing(evalId, p)).toEqual(['M5'])
    } finally {
      restoreMarkdown(p, before)
    }
  })
})

describe('deep-path-zh: each mechanical assertion fails on a violation of itself alone', () => {
  const evalId = 'deep-path-zh'

  it('M1: one of the two images is missing', () => {
    const p = planted[evalId]
    const broken = withOutputs(p, (outputs) =>
      outputs.filter((file) => !file.path.includes('通知')),
    )
    // the Japanese name also appears in M4's check, which reads the Markdown and still passes
    expect(failing(evalId, broken)).toEqual(['M1'])
  })

  it('M2: the workspace path makes an absolute path pass 240 characters', () => {
    const p = planted[evalId]
    const before = readFileSync(join(p.runDir, 'run.json'), 'utf8')
    const runJson = JSON.parse(before) as { wsPath: string }
    runJson.wsPath = `/tmp/ab-run-${'x'.repeat(120)}/ws`
    writeFileSync(join(p.runDir, 'run.json'), JSON.stringify(runJson, null, 2))
    try {
      expect(failing(evalId, p)).toEqual(['M2'])
    } finally {
      writeFileSync(join(p.runDir, 'run.json'), before)
    }
  })

  it('M3: a path segment holds a character Windows forbids', () => {
    const p = planted[evalId]
    const broken = withOutputs(p, (outputs) => [
      ...outputs,
      {
        path: 'out/archive/通知:設定?.png',
        size: 739,
        sha256: 'c'.repeat(64),
        head64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'),
        copied: true,
      },
    ])
    expect(failing(evalId, broken)).toEqual(['M3'])
  })

  it('M4: the Markdown loses one of the two original names', () => {
    const p = planted[evalId]
    const before = markdownText(p)
    editMarkdown(p, (text) => text.replaceAll('通知:設定?.png', 'notice.png'))
    try {
      expect(failing(evalId, p)).toEqual(['M4'])
    } finally {
      restoreMarkdown(p, before)
    }
  })
})

describe('no evidence string names the arm workspace', () => {
  it('every evidence string of every graded run is free of the absolute wsPath', () => {
    let checked = 0
    for (const evalId of ['screenshots-ja', 'blocked-and-large-en', 'deep-path-zh']) {
      for (const g of grade(evalId, planted[evalId].runDir, context(planted[evalId], evalId))) {
        expect(g.evidence, `${evalId} ${g.id}`).not.toContain(WS_PATH)
        expect(g.evidence, `${evalId} ${g.id}`).not.toContain('/tmp/')
        checked += 1
      }
    }
    expect(checked).toBe(17)
  })

  it('control: the same check on an evidence string that does name it goes red', () => {
    const grades = grade(
      'deep-path-zh',
      planted['deep-path-zh'].runDir,
      context(planted['deep-path-zh'], 'deep-path-zh'),
    )
    // M2 is the assertion that must *read* wsPath; this is what it would look like if it quoted it
    const asIfQuoted = grades.map((g) =>
      g.id === 'M2' ? { ...g, evidence: `longest absolute path: ${WS_PATH}/out/archive` } : g,
    )
    const offenders = asIfQuoted.filter((g) => g.evidence.includes(WS_PATH)).map((g) => g.id)
    expect(offenders).toEqual(['M2'])
    // and the real M2 evidence says the same thing with a number and a relative path
    const real = grades.find((g) => g.id === 'M2')
    expect(real?.evidence).toMatch(/^longest absolute path \d+ characters \(out\//)
  })
})

describe('agreementKey', () => {
  it('is the sorted sha256 of the non-Markdown files under out/', () => {
    const p = planted['screenshots-ja']
    const key = agreementKey('screenshots-ja', p.runDir)
    const expected = p.outputs
      .filter((file) => file.path.startsWith('out/') && !file.path.endsWith('.md'))
      .map((file) => file.sha256)
      .sort()
      .join('|')
    expect(key).toBe(expected)
    expect(key.split('|')).toHaveLength(2)
    expect(key).not.toContain('.md')
  })

  it('is the same for two runs that saved the same bytes, and differs when the bytes differ', async () => {
    const again = await plant('screenshots-ja-again', 101, 'out', 'again')
    expect(agreementKey('screenshots-ja', again.runDir)).toBe(
      agreementKey('screenshots-ja', planted['screenshots-ja'].runDir),
    )
    const other = agreementKey('blocked-and-large-en', planted['blocked-and-large-en'].runDir)
    expect(other).not.toBe(agreementKey('screenshots-ja', planted['screenshots-ja'].runDir))
  })
})
