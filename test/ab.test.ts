import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NOTICE } from '../harness/ab.ts'
import { FAKE_CLI, launchFake, readLog } from './support/fake.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'

const REPO = join(import.meta.dirname, '..')
const AB = join(REPO, 'harness', 'ab.ts')
const FIXTURES = join(import.meta.dirname, 'fixtures-ab')

let root: string
let abRoot: string
let seq = 0

beforeAll(() => {
  root = makeTempDir('g1-ab')
  // the toy skill and its suite live under test/; the runner reads them from a temporary AB_ROOT
  abRoot = join(root, 'ab-root')
  mkdirSync(join(abRoot, 'skills'), { recursive: true })
  mkdirSync(join(abRoot, 'evals'), { recursive: true })
  cpSync(join(FIXTURES, 'toy-skill'), join(abRoot, 'skills', 'toy-skill'), { recursive: true })
  cpSync(join(FIXTURES, 'toy-suite'), join(abRoot, 'evals', 'toy-skill'), { recursive: true })
})

afterAll(() => {
  removeTempDir(root)
})

type Armed = {
  status: number | null
  stdout: string
  log: string
  out: string
  runDir: string
  raw: string
}

const runArm = (
  arm: 'with' | 'without',
  scenario: string,
  opts: {
    env?: Record<string, string>
    run?: number
    out?: string
    /** null uses the runner's own default raw directory, `<AB_ROOT>/evals/.runs` */
    raw?: string | null
  } = {},
): Armed => {
  seq += 1
  const log = join(root, `ab-${seq}.log`)
  const out = opts.out ?? join(root, `out-${seq}`)
  const raw = opts.raw === null ? join(abRoot, 'evals', '.runs') : join(root, `raw-${seq}`)
  const run = opts.run ?? 1
  const base: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) base[k] = v
  const r = spawnSync(
    process.execPath,
    [
      AB,
      'run',
      '--skill',
      'toy-skill',
      '--eval',
      'toy-write',
      '--arm',
      arm,
      '--run',
      String(run),
      '--model',
      'sonnet',
      '--out',
      out,
      ...(opts.raw === null ? [] : ['--raw', raw]),
      '--budget',
      '1.5',
    ],
    {
      encoding: 'utf8',
      env: {
        ...base,
        AB_ROOT: abRoot,
        CLAUDE_BIN: FAKE_CLI,
        CLAUDE_CALL_ENV_FILE: '',
        FAKE_LOG: log,
        FAKE_SCENARIO: scenario,
        FAKE_SKILL: 'toy-skill',
        ...opts.env,
      },
    },
  )
  return {
    status: r.status,
    stdout: r.stdout,
    log,
    out,
    raw,
    runDir: join(out, 'toy-write', arm, `run-${run}`),
  }
}

const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('the A/B runner on a toy eval kept under test/', () => {
  it('the with arm gets the skill and the without arm does not', () => {
    const withArm = runArm('with', 'arm-clean')
    expect(withArm.status).toBe(0)
    const withLog = readLog(withArm.log)[0]
    expect(withLog.projectEntries).toEqual(['.claude', 'out'])
    expect(withLog.projectSkills).toEqual(['toy-skill'])

    const withoutArm = runArm('without', 'arm-clean')
    expect(withoutArm.status).toBe(0)
    const withoutLog = readLog(withoutArm.log)[0]
    expect(withoutLog.projectEntries).toEqual(['out'])
    expect(withoutLog.projectSkills).toEqual([])
  })

  it('the argv carries the budget, the disallowed tools and the notice', () => {
    const r = runArm('with', 'arm-clean')
    const argv = readLog(r.log)[0].argv
    expect(argv).toEqual([
      '-p',
      '--model',
      'sonnet',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--permission-mode',
      'bypassPermissions',
      '--max-budget-usd',
      '1.5',
      '--disallowedTools',
      'WebFetch',
      'WebSearch',
      'Bash(sudo:*)',
      'Bash(docker:*)',
      'Bash(git push:*)',
      '--append-system-prompt',
      NOTICE,
    ])
    expect(NOTICE).toContain('You are running inside an evaluation sandbox.')
    expect(NOTICE).toContain('Do not print environment variables.')
  })

  it('HOME and CLAUDE_CONFIG_DIR are in the run temporary directory, and the env-file names are gone', () => {
    const r = runArm('with', 'arm-clean', {
      env: { GOALBUS_ENV_FILE: join(root, 'pretend-bus.env') },
    })
    const entry = readLog(r.log)[0]
    expect(entry.home.startsWith(join(tmpdir(), 'ab-run-'))).toBe(true)
    expect(entry.home.endsWith(`${sep}home`)).toBe(true)
    expect(entry.claudeConfigDir.startsWith(join(tmpdir(), 'ab-run-'))).toBe(true)
    expect(entry.claudeConfigDir.endsWith(`${sep}cfg`)).toBe(true)
    expect(entry.claudeCallEnvFile).toBe('absent')
    expect(entry.goalbusEnvFile).toBe('absent')
    expect(entry.cwd.endsWith(`${sep}ws`)).toBe(true)
  })

  it('writes outputs.json, outputs/, transcript.md, run.json and grading.json', () => {
    const r = runArm('with', 'arm-clean')
    const outputs = json<{ path: string; size: number; sha256: string; copied: boolean }[]>(
      join(r.runDir, 'outputs.json'),
    )
    expect(outputs.map((o) => o.path)).toEqual(['out/answer.md'])
    expect(outputs[0].copied).toBe(true)
    expect(existsSync(join(r.runDir, 'outputs', 'out', 'answer.md'))).toBe(true)
    const transcript = readFileSync(join(r.runDir, 'transcript.md'), 'utf8')
    expect(transcript).toContain('- Write ')
    expect(transcript).toContain('- Bash ')
    expect(transcript).toContain('out/answer.md を書きました。')
    const runJson = json<Record<string, unknown>>(join(r.runDir, 'run.json'))
    expect(runJson.status).toBe('completed')
    expect(runJson.arm).toBe('with')
    expect(runJson.turns).toBe(3)
    expect(runJson.budgetUsd).toBe(1.5)
    expect((runJson.tokens as Record<string, number>).output).toBe(300)
    expect(runJson.contamination).toEqual([])
    expect(runJson.gradingError).toBeNull()
    expect(
      existsSync(join(r.raw, 'toy-skill', 'toy-write', 'with', 'run-1', 'transcript.jsonl')),
    ).toBe(true)
    const grades = json<{ id: string; passed: boolean | null; evidence: string }[]>(
      join(r.runDir, 'grading.json'),
    )
    expect(grades.map((g) => g.id)).toEqual(['M1', 'M2', 'J1'])
    expect(grades[0].passed).toBe(true)
    expect(grades[0].evidence).toContain('outputs.json: out/answer.md')
    expect(grades[2].passed).toBeNull()
    expect(grades[2].evidence).toBe('')
  })

  it('report builds benchmark.json and benchmark.md and says whether two runs agree', () => {
    const out = join(root, 'out-report')
    runArm('with', 'arm-clean', { run: 1, out })
    runArm('with', 'arm-clean', { run: 2, out })
    runArm('without', 'arm-clean', { run: 1, out })
    const r = spawnSync(process.execPath, [AB, 'report', '--skill', 'toy-skill', '--out', out], {
      encoding: 'utf8',
      env: { ...process.env, AB_ROOT: abRoot },
    })
    expect(r.status).toBe(0)
    const md = readFileSync(join(out, 'benchmark.md'), 'utf8')
    expect(md).toContain('# A/B benchmark — toy-skill')
    expect(md).toContain('| toy-write | with | 2 | 4/4 | pending (2) |')
    expect(md).toContain('| toy-write | without | 1 | 2/2 | pending (1) |')
    expect(md).toContain('The dollar figures are the CLI-reported `total_cost_usd`')
    const benchmark = json<{ arms: { arm: string; runs: number; runsAgree: boolean | null }[] }>(
      join(out, 'benchmark.json'),
    )
    const withArm = benchmark.arms.find((a) => a.arm === 'with')
    expect(withArm?.runs).toBe(2)
    expect(withArm?.runsAgree).toBe(true)
    expect(benchmark.arms.find((a) => a.arm === 'without')?.runsAgree).toBeNull()
  })

  // Found on Windows after the run: the grader was imported by its path, which Windows reads as a URL
  // with the scheme `c:`, and the failure was swallowed into "no grade()". The report then printed
  // `yes (empty: …)` for two runs nobody had graded.
  it('a grade.ts that cannot be loaded is reported as that, and agreement as n/a', () => {
    const grader = join(abRoot, 'evals', 'toy-skill', 'grade.ts')
    const kept = readFileSync(grader, 'utf8')
    writeFileSync(grader, "throw new Error('broken at import')\n")
    try {
      const out = join(root, 'out-unloadable-grader')
      const first = runArm('with', 'arm-clean', { run: 1, out })
      runArm('with', 'arm-clean', { run: 2, out })
      const runJson = json<{ gradingError: string | null }>(join(first.runDir, 'run.json'))
      expect(runJson.gradingError).toBe('cannot load evals/toy-skill/grade.ts (Error)')
      const grades = json<{ passed: boolean | null }[]>(join(first.runDir, 'grading.json'))
      expect(grades.map((g) => g.passed)).toEqual([null, null, null])
      const r = spawnSync(process.execPath, [AB, 'report', '--skill', 'toy-skill', '--out', out], {
        encoding: 'utf8',
        env: { ...process.env, AB_ROOT: abRoot },
      })
      expect(r.status).toBe(0)
      expect(r.stdout).toContain(
        'report: cannot load evals/toy-skill/grade.ts (Error); the agreement column is n/a',
      )
      const benchmark = json<{
        arms: { runsAgree: boolean | null; agreementTrivial: boolean | null }[]
      }>(join(out, 'benchmark.json'))
      expect(benchmark.arms[0].runsAgree).toBeNull()
      expect(benchmark.arms[0].agreementTrivial).toBeNull()
      expect(readFileSync(join(out, 'benchmark.md'), 'utf8')).toMatch(
        /^\| toy-write \| with \| 2 \| 0\/4 \|.*\| n\/a \|$/m,
      )
    } finally {
      writeFileSync(grader, kept)
    }
  })

  it('a usage error exits 3', () => {
    const r = spawnSync(process.execPath, [AB, 'run', '--skill', 'toy-skill'], {
      encoding: 'utf8',
      env: { ...process.env, AB_ROOT: abRoot },
    })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('ab: --eval is required')
  })
})

describe('the contamination flags', () => {
  it('flags a path outside the sandbox', () => {
    const r = runArm('with', 'arm-outside-path')
    const runJson = json<{ contamination: string[] }>(join(r.runDir, 'run.json'))
    expect(runJson.contamination).toEqual(['Bash names a path outside the sandbox: /etc/hostname'])
  })

  it('flags a URL whose host is not local', () => {
    const r = runArm('with', 'arm-nonlocal-url')
    const runJson = json<{ contamination: string[] }>(join(r.runDir, 'run.json'))
    expect(runJson.contamination).toEqual([
      'Bash reaches a host that is not local: api.example.invalid',
    ])
  })

  it('flags a mention of the skill directory in the without arm only', () => {
    const without = json<{ contamination: string[] }>(
      join(runArm('without', 'arm-mentions-skill').runDir, 'run.json'),
    )
    expect(without.contamination).toContain(
      'the without arm mentions the skill directory: skills/toy-skill',
    )
    const withArm = json<{ contamination: string[] }>(
      join(runArm('with', 'arm-mentions-skill').runDir, 'run.json'),
    )
    expect(withArm.contamination).toEqual([])
  })

  it('a clean arm is not flagged', () => {
    const r = runArm('with', 'arm-clean')
    expect(json<{ contamination: string[] }>(join(r.runDir, 'run.json')).contamination).toEqual([])
  })
})

describe('the redaction, with its control', () => {
  // every planted value is joined from parts at run time: no literal token prefix exists in this
  // repository, because a publication's leak scan looks for exactly those
  const planted = {
    FAKE_LEAK_PROXY: `http://proxy-user:${['pw', 'd', '9f3a7c21b4'].join('')}@proxy.invalid:3128`,
    FAKE_LEAK_KEY: ['sk', '-ant-', 'api03-', 'A'.repeat(32)].join(''),
    FAKE_LEAK_TOKEN: ['gh', 'p_', 'B'.repeat(36)].join(''),
    FAKE_LEAK_SIGNED: `http://127.0.0.1:18452/media/302?token=${'c'.repeat(32)}&X-Amz-Signature=${'d'.repeat(40)}&expires=1799999999`,
  }

  it('no planted value reaches transcript.jsonl, transcript.md or run.json, and the count says how many went', () => {
    const r = runArm('with', 'arm-leak', {
      env: { ...planted, HTTPS_PROXY: planted.FAKE_LEAK_PROXY },
    })
    expect(r.status).toBe(0)
    const files = [
      join(r.runDir, 'transcript.md'),
      join(r.runDir, 'run.json'),
      join(r.raw, 'toy-skill', 'toy-write', 'with', 'run-1', 'transcript.jsonl'),
    ]
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const [name, value] of Object.entries(planted)) {
        expect(text, `${file} still holds ${name}`).not.toContain(value)
      }
    }
    const runJson = json<{ redactions: number }>(join(r.runDir, 'run.json'))
    expect(runJson.redactions).toBeGreaterThanOrEqual(8)
    // the arm's own output file is copied as the arm wrote it: SCOPE.md redacts stdout and stderr,
    // and an eval assertion (verifiable-fetch M3) is what checks an output file for a leaked token
    expect(readFileSync(join(r.runDir, 'outputs', 'out', 'answer.md'), 'utf8')).toContain(
      planted.FAKE_LEAK_KEY,
    )
    const transcript = readFileSync(join(r.runDir, 'transcript.md'), 'utf8')
    expect(transcript).toContain('[redacted]')
    // the proxy value is replaced whole, because it is an exact value of the runner's own
    // environment; the `user:password@` rule is for a URL that is not in the environment and is
    // tested on its own in test/redact.test.ts
    expect(transcript).not.toContain('proxy.invalid')
  })

  it('the control: the same arm output written without redaction holds every planted value', async () => {
    const dir = join(root, 'control')
    mkdirSync(dir, { recursive: true })
    const log = join(root, 'control.log')
    const launched = await launchFake({
      args: ['-p', '--output-format', 'stream-json', '--verbose'],
      prompt: 'Write out/answer.md and say where it is.',
      cwd: dir,
      timeoutMs: 20_000,
      env: {
        ...planted,
        HTTPS_PROXY: planted.FAKE_LEAK_PROXY,
        FAKE_LOG: log,
        FAKE_SCENARIO: 'arm-leak',
        FAKE_SKILL: 'toy-skill',
      },
    })
    const unredacted = join(dir, 'raw-without-redaction.jsonl')
    writeFileSync(unredacted, launched.stdout)
    const text = readFileSync(unredacted, 'utf8')
    for (const [name, value] of Object.entries(planted)) {
      expect(text, `the control lost ${name}`).toContain(value)
    }
  })
})

describe('the environment-file branch, which every other test above switches off', () => {
  // Every other A/B test here sets CLAUDE_CALL_ENV_FILE to '', so the launcher spawns the CLI
  // directly and the wrapper never appears. That is why none of them could catch a `run.json` that
  // recorded the whole command line: with the variable set — the condition of every live arm, since
  // that is how a nested call authenticates (F9, F10) — the command line begins
  // `bash <repo>/skills/skill-trigger-probe/scripts/lib/call-env.sh <the env file> …`.
  it('run.json records the CLI own arguments only, with no path of this machine in it', async () => {
    const envFile = join(root, 'ab-call-env-file.sh')
    writeFileSync(envFile, ['export ASKEV_FROM_FILE=from-file', ''].join('\n'))
    const r = runArm('with', 'arm-clean', { env: { CLAUDE_CALL_ENV_FILE: envFile }, raw: null })
    expect(r.status).toBe(0)
    // the wrapper really was used: the file was sourced and its variable reached the arm
    expect(readLog(r.log)[0].askev.ASKEV_FROM_FILE).toBe('from-file')

    const text = readFileSync(join(r.runDir, 'run.json'), 'utf8')
    // a path as JSON writes it: on Windows every `\` is doubled, and the raw form would never match
    const inJson = (path: string): string => JSON.stringify(path).slice(1, -1)
    expect(text).not.toContain('call-env.sh')
    expect(text).not.toContain(inJson(envFile))
    expect(text).not.toContain(homedir())
    expect(text).not.toContain(inJson(REPO))

    const runJson = json<{ wsPath: string; claudeArgs: string[]; rawTranscript: string }>(
      join(r.runDir, 'run.json'),
    )
    const armTmp = dirname(runJson.wsPath)
    expect(armTmp.startsWith(join(tmpdir(), 'ab-run-'))).toBe(true)
    const paths = [
      ...text.matchAll(/(?<![A-Za-z0-9._~-])\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+/g),
    ].map((m) => m[0])
    expect(paths.filter((p) => !p.startsWith(armTmp))).toEqual([])
    expect(runJson.claudeArgs[0]).toBe('-p')
    expect(runJson.claudeArgs).toContain('--append-system-prompt')
    expect(runJson.rawTranscript).toBe(
      'evals/.runs/toy-skill/toy-write/with/run-1/transcript.jsonl',
    )

    // The control: the data the old field carried still exists where the tests read it. This is the
    // shape run.json used to hold, and the assertions above on call-env.sh, the env file and the
    // repository's path would each have failed on it — so they are not vacuous.
    const control = await launchFake(
      {
        args: ['-p', '--output-format', 'stream-json', '--verbose'],
        prompt: 'Write out/answer.md and say where it is.',
        cwd: root,
        timeoutMs: 20_000,
        env: { FAKE_LOG: join(root, 'envfile-control.log'), FAKE_SCENARIO: 'no-trigger' },
      },
      { envFile },
    )
    expect(control.argv[0]).toBe('bash')
    expect(control.argv[1].endsWith('call-env.sh')).toBe(true)
    expect(control.argv[2]).toBe(envFile)
    // the repository's own path, wherever the checkout lives; the home directory is in it only when
    // the checkout is under it, which a fresh tree under /tmp is not (found after the run)
    expect(control.argv.join(' ')).toContain(REPO)
  })

  it('skillInInit is recorded for both arms, as an observation', () => {
    const withArm = json<{ skillInInit: boolean }>(
      join(runArm('with', 'arm-clean').runDir, 'run.json'),
    )
    expect(withArm.skillInInit).toBe(true)
    const withoutArm = json<{ skillInInit: boolean }>(
      join(runArm('without', 'arm-clean').runDir, 'run.json'),
    )
    expect(withoutArm.skillInInit).toBe(false)
    // and neither arm is broken for it: the not-loaded rule is off for the A/B runner on purpose
    expect(
      json<{ status: string }>(join(runArm('without', 'arm-clean').runDir, 'run.json')).status,
    ).toBe('completed')
  })
})
