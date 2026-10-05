import { spawnSync } from 'node:child_process'
import { existsSync, type RmOptions, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ProbeResult, removeProject } from '../skills/skill-trigger-probe/scripts/probe.ts'
import { FAKE_CLI, readLog } from './support/fake.ts'
import { makeTempDir, plantSkill, removeTempDir } from './support/tmp.ts'

const PROBE = join(
  import.meta.dirname,
  '..',
  'skills',
  'skill-trigger-probe',
  'scripts',
  'probe.ts',
)

const GOOD_DESCRIPTION =
  'Steeping times and water temperatures for green, black and oolong tea. Use when the user asks how long to steep tea. Not for coffee.'

let root: string
let skillDir: string
let siblingDir: string
let seq = 0

beforeAll(() => {
  root = makeTempDir('g1-probe')
  skillDir = plantSkill(root, 'tea-timer', ['name: tea-timer', `description: ${GOOD_DESCRIPTION}`])
  siblingDir = plantSkill(root, 'long-desc', [
    'name: long-desc',
    `description: ${GOOD_DESCRIPTION} This one is the sibling.`,
  ])
})

afterAll(() => {
  removeTempDir(root)
})

type Probed = { status: number | null; stdout: string; log: string; out: string }

const runProbe = (
  queries: { id: string; query: string; should_trigger: boolean }[],
  plan: Record<string, string[]>,
  extraArgs: string[] = [],
  inheritedConfig?: string,
): Probed => {
  seq += 1
  const log = join(root, `probe-${seq}.log`)
  const queriesFile = join(root, `queries-${seq}.json`)
  const planFile = join(root, `plan-${seq}.json`)
  const out = join(root, `result-${seq}`, `trigger.json`)
  writeFileSync(queriesFile, `${JSON.stringify(queries, null, 2)}\n`)
  writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`)
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  delete env.CLAUDE_CALL_ENV_FILE
  delete env.CLAUDE_CONFIG_DIR
  if (inheritedConfig !== undefined) env.CLAUDE_CONFIG_DIR = inheritedConfig
  const r = spawnSync(
    process.execPath,
    [
      PROBE,
      '--skill',
      skillDir,
      '--sibling',
      siblingDir,
      '--queries',
      queriesFile,
      '--runs',
      '3',
      '--model',
      'sonnet',
      '--out',
      out,
      '--concurrency',
      '1',
      ...extraArgs,
    ],
    {
      encoding: 'utf8',
      env: {
        ...env,
        CLAUDE_BIN: FAKE_CLI,
        FAKE_LOG: log,
        FAKE_SCENARIO: 'plan',
        FAKE_PLAN: planFile,
        FAKE_SKILL: 'tea-timer',
        FAKE_SIBLINGS: 'long-desc',
      },
    },
  )
  return { status: r.status, stdout: r.stdout, log, out }
}

const QUERIES = [
  { id: 'pos-strong', query: 'a query about pos-strong', should_trigger: true },
  { id: 'pos-weak', query: 'a query about pos-weak', should_trigger: true },
  { id: 'neg-clean', query: 'a query about neg-clean', should_trigger: false },
  { id: 'neg-sibling', query: 'a query about neg-sibling', should_trigger: false },
]

const PLAN: Record<string, string[]> = {
  'pos-strong': ['trigger', 'trigger', 'trigger'],
  'pos-weak': ['trigger', 'no-trigger', 'no-trigger'],
  'neg-clean': ['no-trigger', 'no-trigger', 'no-trigger'],
  'neg-sibling': ['sibling', 'sibling', 'sibling'],
}

const read = (out: string): ProbeResult => JSON.parse(readFileSync(out, 'utf8')) as ProbeResult

describe('the probe end to end on the fake CLI', () => {
  it('exit 0: a complete measurement, with the rates, the flags and the siblings', () => {
    const r = runProbe(QUERIES, PLAN)
    expect(r.status).toBe(0)
    const result = read(r.out)
    expect(result.perRun).toHaveLength(12)
    const byId = Object.fromEntries(result.perQuery.map((q) => [q.id, q]))
    expect(byId['pos-strong'].rate).toBe(1)
    expect(byId['pos-strong'].passed).toBe(true)
    expect(byId['pos-strong'].nearThreshold).toBe(false)
    expect(byId['pos-weak'].triggered).toBe(1)
    expect(byId['pos-weak'].valid).toBe(3)
    expect(byId['pos-weak'].rate).toBeCloseTo(1 / 3)
    expect(byId['pos-weak'].passed).toBe(false)
    expect(byId['pos-weak'].nearThreshold).toBe(true)
    expect(byId['neg-clean'].rate).toBe(0)
    expect(byId['neg-clean'].passed).toBe(true)
    expect(byId['neg-sibling'].rate).toBe(0)
    expect(byId['neg-sibling'].siblingsFired).toEqual({ 'long-desc': 3 })
    expect(result.summary.positives).toEqual({ passed: 1, total: 2 })
    expect(result.summary.negatives).toEqual({ passed: 2, total: 2 })
    expect(result.summary.brokenTotal).toBe(0)
    expect(result.summary.incomplete).toBe(false)
    expect(result.summary.nearThreshold).toEqual(['pos-weak'])
    expect(result.summary.siblingsFired).toEqual({ 'long-desc': 3 })
    expect(result.model).toEqual({ requested: 'sonnet', resolved: 'claude-sonnet-5' })
    expect(result.claudeCodeVersion).toBe('2.1.233-fake')
    // no query text is ever written into a result file
    expect(readFileSync(r.out, 'utf8')).not.toContain('a query about')
  })

  it('writes the Markdown beside the JSON', () => {
    const r = runProbe(QUERIES, PLAN)
    const md = readFileSync(r.out.replace(/\.json$/, '.md'), 'utf8')
    expect(md).toContain('# Trigger rates — tea-timer')
    expect(md).toContain('| pos-weak | trigger | 0.33 | 3/3 | failed near-threshold |  |')
    expect(md).toContain('| neg-sibling | no trigger | 0.00 | 3/3 |  | long-desc 3 |')
    expect(md).toContain('- siblings fired: long-desc 3')
    expect(md).toContain('- measurement complete: yes')
    expect(r.stdout).toContain('probe: positives 1/2, negatives 2/2, broken 0')
  })

  it('exit 2: a broken run is counted by its reason and never as "not triggered"', () => {
    const queries = [{ id: 'pos-broken', query: 'a query about pos-broken', should_trigger: true }]
    const r = runProbe(queries, { 'pos-broken': ['trigger', 'auth', 'trigger'] })
    expect(r.status).toBe(2)
    const result = read(r.out)
    const q = result.perQuery[0]
    expect(q.valid).toBe(2)
    expect(q.triggered).toBe(2)
    expect(q.rate).toBe(1)
    expect(q.passed).toBe(true)
    expect(q.incomplete).toBe(true)
    expect(q.brokenReasons).toEqual({ auth: 1 })
    expect(result.summary.brokenRuns).toEqual({ auth: 1 })
    expect(result.summary.incomplete).toBe(true)
    const md = readFileSync(r.out.replace(/\.json$/, '.md'), 'utf8')
    expect(md).toContain('- broken runs: 1 (auth 1)')
    expect(md).toContain('- measurement complete: no — at least one run was broken')
  })

  it('the temporary project holds exactly the skill and its siblings, and is gone afterwards', () => {
    const r = runProbe(QUERIES, PLAN)
    const entries = readLog(r.log)
    expect(entries).toHaveLength(12)
    for (const entry of entries) {
      expect(entry.projectEntries).toEqual(['.claude'])
      expect(entry.projectSkills).toEqual(['long-desc', 'tea-timer'])
      expect(entry.cwd.startsWith(join(tmpdir(), 'skill-trigger-probe-'))).toBe(true)
      expect(entry.cwd.endsWith(`${sep}ws`)).toBe(true)
    }
    expect(existsSync(entries[0].cwd)).toBe(false)
  })

  it('exit 3: a usage error, and a skill that does not validate', () => {
    const usage = spawnSync(process.execPath, [PROBE, '--skill', skillDir], { encoding: 'utf8' })
    expect(usage.status).toBe(3)
    expect(usage.stdout).toContain('probe: --queries is required')

    const broken = plantSkill(root, 'tea--timer', [
      'name: tea--timer',
      `description: ${GOOD_DESCRIPTION}`,
    ])
    const queriesFile = join(root, 'queries-validate.json')
    writeFileSync(queriesFile, `${JSON.stringify(QUERIES, null, 2)}\n`)
    const r = spawnSync(
      process.execPath,
      [
        PROBE,
        '--skill',
        broken,
        '--queries',
        queriesFile,
        '--runs',
        '1',
        '--model',
        'sonnet',
        '--out',
        join(root, 'never-written.json'),
      ],
      // CLAUDE_CALL_ENV_FILE is removed here too: today this run exits 3 before launching
      // anything, but that is a property of the code under test, not of this test
      { encoding: 'utf8', env: { ...process.env, CLAUDE_BIN: FAKE_CLI, CLAUDE_CALL_ENV_FILE: '' } },
    )
    expect(r.status).toBe(3)
    expect(r.stdout).toContain(
      'V2 name: "tea--timer" is not lowercase letters, digits and single hyphens (A, C)',
    )
    expect(r.stdout).toContain('probe: the skill does not validate, so nothing was measured')
    expect(existsSync(join(root, 'never-written.json'))).toBe(false)
  })
})

describe('the probe configuration isolation', () => {
  it('--isolated-config gives every run a fresh CLAUDE_CONFIG_DIR under its own project', () => {
    const r = runProbe(QUERIES, PLAN, ['--isolated-config'], join(root, 'inherited-cfg'))
    expect(r.status).toBe(0)
    const dirs = readLog(r.log).map((e) => e.claudeConfigDir)
    expect(dirs).toHaveLength(12)
    expect(new Set(dirs).size).toBe(12)
    for (const dir of dirs) {
      expect(dir.startsWith(join(tmpdir(), 'skill-trigger-probe-'))).toBe(true)
      // `\` on Windows, `/` elsewhere
      expect(dir).toMatch(/[\\/]cfg[\\/]run-\d+$/)
      expect(existsSync(dir)).toBe(false)
    }
  })

  it('without it, every run sees the configuration directory it inherited', () => {
    const inherited = join(root, 'inherited-cfg')
    const r = runProbe(QUERIES, PLAN, [], inherited)
    expect(r.status).toBe(0)
    const dirs = new Set(readLog(r.log).map((e) => e.claudeConfigDir))
    expect([...dirs]).toEqual([inherited])
  })
})

// Found on Windows after the run: the removal of the temporary project threw EPERM (a CLI that had
// just exited still held the directory), the error left probe() from its `finally`, and seven minutes
// of measurement were never written.
describe('removing the temporary project', () => {
  it('a removal that fails is reported, and does not throw', () => {
    const lines: string[] = []
    const failing = (): void => {
      throw Object.assign(new Error('EPERM, Permission denied'), { code: 'EPERM' })
    }
    expect(() =>
      removeProject('skill-trigger-probe-x', (l) => lines.push(l), failing),
    ).not.toThrow()
    expect(lines).toEqual([
      'probe: could not remove skill-trigger-probe-x (EPERM); the results are written, remove it by hand',
    ])
  })

  it('is retried, since the directory is held only for a moment', () => {
    let seen: RmOptions | undefined
    removeProject(
      'skill-trigger-probe-x',
      () => {},
      (_path, options) => {
        seen = options
      },
    )
    expect(seen).toMatchObject({ recursive: true, force: true, maxRetries: 10 })
  })
})
