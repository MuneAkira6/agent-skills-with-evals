import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Context } from '../evals/standup-digest/grade.ts'
import {
  agreementKey,
  decisionNumbersIn,
  decisionSection,
  EXPECTED_DECISIONS,
  grade,
  numbersIn,
  OPEN_ITEMS,
} from '../evals/standup-digest/grade.ts'
import { collectOutputs } from '../harness/ab/outputs.ts'
import { NOW, runDigest } from './support/digest.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'

type Assertion = { id: string; kind: 'mechanical' | 'judgment'; text: string }
type OutputFile = { path: string; size: number; sha256: string; head64: string; copied: boolean }
type Suite = { evals: { id: string; assertions: Assertion[] }[] }

const SUITE = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'evals', 'standup-digest', 'evals.json'), 'utf8'),
) as Suite

/** A workspace path that is a plausible arm's but belongs to no machine. */
const WS_PATH = '/tmp/ab-run-planted1/ws'

const assertionsOf = (evalId: string): Assertion[] => {
  const found = SUITE.evals.find((entry) => entry.id === evalId)
  if (found === undefined) throw new Error(`no eval ${evalId} in evals.json`)
  return found.assertions
}

type Planted = { runDir: string; outputs: OutputFile[]; finalReply: string }

let root: string
let planted: Planted

/** A planted good output: a real pipeline run collected the way the A/B runner collects an arm. */
const plant = async (name: string, durationMs = 42_000): Promise<Planted> => {
  const ws = join(root, name, 'ws')
  const runDir = join(root, name, 'run')
  mkdirSync(join(ws, 'out'), { recursive: true })
  mkdirSync(runDir, { recursive: true })
  await runDigest(['collect-only', '--now', NOW, '--out', join(ws, 'out')])
  const outputs = collectOutputs(ws, runDir)
  writeFileSync(join(runDir, 'outputs.json'), `${JSON.stringify(outputs, null, 2)}\n`)
  writeFileSync(
    join(runDir, 'run.json'),
    `${JSON.stringify(
      {
        wsPath: WS_PATH,
        durationMs,
        mocks: [
          {
            name: 'github',
            requests: {
              'GET /repos/acme/tasks/milestones': 1,
              'GET /repos/acme/tasks/issues': 2,
              'GET /repos/acme/tasks/issues/201/timeline': 1,
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  )
  const finalReply = [
    '今日決めることは 7 件です。',
    '1. #206 催促するか外すか',
    '2. #205 催促するか外すか',
    '3. #202 催促するか外すか',
    '4. #211 誰がいつレビューするか',
    '5. #201 誰がいつレビューするか',
    '6. #190 今のマイルストーンに入れるか閉じるか',
    '7. #204 担当を決めるか外すか',
    '全文は out/digest.md にあります。',
  ].join('\n')
  return { runDir, outputs, finalReply }
}

const context = (p: Planted, evalId: string, overrides: Partial<Context> = {}): Context => ({
  assertions: assertionsOf(evalId),
  outputs: p.outputs,
  finalReply: p.finalReply,
  ...overrides,
})

const failing = (evalId: string, p: Planted, overrides: Partial<Context> = {}): string[] =>
  grade(evalId, p.runDir, context(p, evalId, overrides))
    .filter((g) => g.passed === false)
    .map((g) => g.id)

/** The page copy of a planted run, so a violation can be written into it and then undone. */
const pagePath = (p: Planted): string => {
  const file = p.outputs.find((entry) => entry.path.endsWith('digest.md'))
  if (file === undefined) throw new Error('the planted run has no page')
  return join(p.runDir, 'outputs', ...file.path.split('/'))
}

const editPage = (p: Planted, edit: (text: string) => string): string => {
  const path = pagePath(p)
  const before = readFileSync(path, 'utf8')
  writeFileSync(path, edit(before))
  return before
}

const restorePage = (p: Planted, text: string): void => {
  writeFileSync(pagePath(p), text)
}

const editRunJson = (p: Planted, edit: (run: Record<string, unknown>) => void): string => {
  const path = join(p.runDir, 'run.json')
  const before = readFileSync(path, 'utf8')
  const parsed = JSON.parse(before) as Record<string, unknown>
  edit(parsed)
  writeFileSync(path, JSON.stringify(parsed, null, 2))
  return before
}

beforeAll(async () => {
  root = makeTempDir('g3-grade')
  planted = await plant('good')
}, 30_000)

afterAll(() => {
  removeTempDir(root)
})

describe('the helpers the assertions are built from', () => {
  it('reads issue numbers in order of first appearance, without repeats', () => {
    expect(numbersIn('#206 then #205 then #206 again')).toEqual([206, 205])
    // a longer number is not a prefix match
    expect(numbersIn('#20 and #206 and #2061')).toEqual([20, 206, 2061])
    expect(numbersIn('nothing here')).toEqual([])
  })

  it('cuts the decision section at the next heading of the same level', () => {
    const page = [
      '# t',
      '',
      '## 今日決めること（2）',
      '1. #206',
      '2. #205',
      '',
      '## それ以外',
      '| #207 |',
    ].join('\n')
    const section = decisionSection(page)
    expect(section).toContain('#206')
    expect(section).toContain('#205')
    expect(section).not.toContain('#207')
    expect(decisionSection('# nothing')).toBeNull()
  })

  it('a PR reference inside a fact is not a decision number', () => {
    const section =
      '## 今日決めること（2）\n1. **#201**\n   x ｜ PR #221 レビュー待ち 3 日 ｜ y\n2. **#211**'
    expect(numbersIn(section)).toEqual([201, 221, 211])
    expect(decisionNumbersIn(section)).toEqual([201, 211])
  })
})

describe('the grader on a planted good output', () => {
  it('passes every mechanical assertion of both evals and leaves the judgment ones open', () => {
    for (const evalId of ['preview-zh', 'decisions-only-ja']) {
      const grades = grade(evalId, planted.runDir, context(planted, evalId))
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

describe('preview-zh: each mechanical assertion fails on a violation of itself alone', () => {
  it('M1: a table comes before the decision heading', () => {
    const before = editPage(planted, (text) => `| # | x |\n|---|---|\n${text}`)
    try {
      expect(failing('preview-zh', planted)).toEqual(['M1'])
    } finally {
      restorePage(planted, before)
    }
  })

  it('M2: the decisions are in the wrong order', () => {
    const before = editPage(planted, (text) =>
      text.replace('1. **#206', '1. **#205').replace('2. **#205', '2. **#206'),
    )
    try {
      // M2 reads the order, M3 still counts each item once
      expect(failing('preview-zh', planted)).toEqual(['M2'])
    } finally {
      restorePage(planted, before)
    }
  })

  it('M3: an open item is named twice outside the ✅ and ⚠️ lines', () => {
    const before = editPage(planted, (text) => `${text}\nおまけ: #209 も見ておく\n`)
    try {
      expect(failing('preview-zh', planted)).toEqual(['M3'])
    } finally {
      restorePage(planted, before)
    }
  })

  it('M3: an item that is never tracked is mentioned', () => {
    const before = editPage(planted, (text) => `${text}\n- ⚠️ 参考: #230\n`)
    try {
      expect(failing('preview-zh', planted)).toEqual(['M3'])
    } finally {
      restorePage(planted, before)
    }
  })

  it('M4: a silent item is put into the decision section', () => {
    const before = editPage(planted, (text) =>
      text
        .replace('7. **#204', '7. **#208')
        .replace(
          '- ⏸️ 14 日以上動きなし（2）：#191（前マイルストーン残）、#208',
          '- ⏸️ 14 日以上動きなし（1）：#191（前マイルストーン残）',
        ),
    )
    try {
      // #204 leaves the page and #208 is named twice, so M3 and M2 go red as well; M4 is the point
      expect(failing('preview-zh', planted)).toContain('M4')
    } finally {
      restorePage(planted, before)
    }
  })

  it('M5: the milestone or its due date is missing', () => {
    const before = editPage(planted, (text) => text.replace('Sprint 13', 'Sprint ??'))
    try {
      expect(failing('preview-zh', planted)).toEqual(['M5'])
    } finally {
      restorePage(planted, before)
    }
  })

  it('M6: the mock log shows a request that is not a GET', () => {
    const before = editRunJson(planted, (run) => {
      const mocks = run.mocks as { requests: Record<string, number> }[]
      mocks[0].requests['POST /repos/acme/tasks/issues/204/comments'] = 1
    })
    try {
      expect(failing('preview-zh', planted)).toEqual(['M6'])
      expect(failing('decisions-only-ja', planted)).toEqual(['M4'])
    } finally {
      writeFileSync(join(planted.runDir, 'run.json'), before)
    }
  })
})

describe('decisions-only-ja: each mechanical assertion fails on a violation of itself alone', () => {
  it('M1: the reply opens with the wrong seven numbers', () => {
    expect(
      failing('decisions-only-ja', planted, {
        finalReply: '今日決めること: #204 #190 #201 #211 #202 #205 #206',
      }),
    ).toEqual(['M1'])
  })

  it('M1: the reply names no number at all', () => {
    expect(failing('decisions-only-ja', planted, { finalReply: 'できました。' })).toEqual(['M1'])
  })

  it('M1: a PR reference quoted from the page does not displace a decision', () => {
    const reply = [
      '1. #206 催促するか外すか',
      '2. #205 催促するか外すか',
      '3. #202 催促するか外すか',
      '4. #211 誰がいつレビューするか',
      '5. #201 ― PR #221 レビュー待ち 3 日 → 誰がいつレビューするか',
      '6. #190 今のマイルストーンに入れるか閉じるか',
      '7. #204 担当を決めるか外すか',
    ].join('\n')
    expect(failing('decisions-only-ja', planted, { finalReply: reply })).toEqual([])
    // and a reply that really gets the order wrong still fails
    expect(
      failing('decisions-only-ja', planted, {
        finalReply: '1. #204 2. #190 3. #201 4. #211 5. #202 6. #205 7. #206',
      }),
    ).toEqual(['M1'])
  })

  it('M2: the page does not mention every open item', () => {
    const before = editPage(planted, (text) =>
      text.replace('- 🙊 発言不要（2）：#210、#212', '- 🙊 発言不要（1）：#210'),
    )
    try {
      expect(failing('decisions-only-ja', planted)).toEqual(['M2'])
    } finally {
      restorePage(planted, before)
    }
  })

  it('M3: the arm took longer than five minutes', async () => {
    const slow = await plant('slow', 301_000)
    expect(failing('decisions-only-ja', slow)).toEqual(['M3'])
    // and a run just inside the limit passes
    const quick = await plant('quick', 299_000)
    expect(failing('decisions-only-ja', quick)).toEqual([])
  }, 30_000)
})

describe('no evidence string names the arm workspace', () => {
  it('every evidence string of every graded run is free of the absolute wsPath', () => {
    let checked = 0
    for (const evalId of ['preview-zh', 'decisions-only-ja']) {
      for (const g of grade(evalId, planted.runDir, context(planted, evalId))) {
        expect(g.evidence, `${evalId} ${g.id}`).not.toContain(WS_PATH)
        expect(g.evidence, `${evalId} ${g.id}`).not.toContain('/tmp/')
        checked += 1
      }
    }
    expect(checked).toBe(13)
  })

  it('control: the same check on an evidence string that does name it goes red', () => {
    const grades = grade('decisions-only-ja', planted.runDir, context(planted, 'decisions-only-ja'))
    // M3 is the assertion that reads run.json; this is what it would look like if it quoted the path
    const asIfQuoted = grades.map((g) =>
      g.id === 'M3' ? { ...g, evidence: `the arm in ${WS_PATH} took 42 s` } : g,
    )
    expect(asIfQuoted.filter((g) => g.evidence.includes(WS_PATH)).map((g) => g.id)).toEqual(['M3'])
    expect(grades.find((g) => g.id === 'M3')?.evidence).toBe('the arm took 42 s (limit 300 s)')
  })
})

describe('agreementKey', () => {
  it('is the decision list the page carries', () => {
    expect(agreementKey('preview-zh', planted.runDir)).toBe(EXPECTED_DECISIONS.join(','))
    expect(agreementKey('decisions-only-ja', planted.runDir)).toBe(EXPECTED_DECISIONS.join(','))
  })

  it('is the same for two runs of the same data, and differs when the list differs', async () => {
    const again = await plant('again')
    expect(agreementKey('preview-zh', again.runDir)).toBe(
      agreementKey('preview-zh', planted.runDir),
    )
    const before = editPage(planted, (text) => text.replace('1. **#206', '1. **#205'))
    try {
      expect(agreementKey('preview-zh', planted.runDir)).not.toBe(EXPECTED_DECISIONS.join(','))
    } finally {
      restorePage(planted, before)
    }
    expect(OPEN_ITEMS).toHaveLength(15)
  }, 30_000)
})
