#!/usr/bin/env node
// The A/B runner: one arm of one eval, once, per command — so that every command stays well under
// ten minutes and a single arm can be re-run without touching the others.
//
//   node harness/ab.ts run --skill <name> --eval <id> --arm with|without --run <k>
//        --model <model> --out <dir> [--raw <dir>] [--timeout <seconds>] [--budget <usd>]
//   node harness/ab.ts report --skill <name> --out <dir>
//
// Both arms are identical apart from the skill's directory. Nothing an arm printed is written
// anywhere before the redaction, and the arm's own HOME, configuration directory and transcript
// live in a temporary directory that is removed when the run ends.
//
// AB_ROOT replaces the repository root the runner reads `skills/`, `evals/` and `fixtures/` from.
// It exists for the tests, as CLAUDE_BIN does for the launcher, and for nothing else.

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchClaude } from '../skills/skill-trigger-probe/scripts/lib/claude.ts'
import { makeRedactor } from '../skills/skill-trigger-probe/scripts/lib/redact.ts'
import { parseStream } from '../skills/skill-trigger-probe/scripts/lib/stream.ts'
import { contaminationFlags } from './ab/contamination.ts'
import { startMocks, summariseMocks } from './ab/mocks.ts'
import { collectOutputs } from './ab/outputs.ts'
import { readTranscript, transcriptMarkdown } from './ab/transcript.ts'
import type { EvalDef, Grade, OutputFile, Suite } from './ab/types.ts'

const USAGE = [
  'usage: ab run --skill <name> --eval <id> --arm with|without --run <k> --model <model>',
  '              --out <dir> [--raw <dir>] [--timeout <seconds>] [--budget <usd>]',
  '       ab report --skill <name> --out <dir>',
].join('\n')

/** The notice appended to both arms' system prompt, word for word as SCOPE.md fixes it. */
export const NOTICE =
  'You are running inside an evaluation sandbox. Work only inside the current working directory. Do not read, list or search anything outside it. The services the task names are on 127.0.0.1; use no other network service. Do not print environment variables.'

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

const abRoot = (): string => process.env.AB_ROOT ?? join(import.meta.dirname, '..')

/**
 * A path as `run.json` records it: relative to the repository while it is inside it, so that the
 * committed results of G4 carry `evals/.runs/…` and not this machine's home directory. A path
 * outside the repository (a temporary directory of a test, say) is kept as it is — it names nothing
 * of the machine that a reader must not see. The relative form is written with `/` on every OS, so a
 * result measured on Windows reads like one measured on Linux.
 */
const pathForRecord = (root: string, path: string): string => {
  const rel = relative(root, path)
  return rel.startsWith('..') || isAbsolute(rel) ? path : rel.split(sep).join('/')
}

export type RunOptions = {
  command: 'run'
  skill: string
  evalId: string
  arm: 'with' | 'without'
  run: number
  model: string
  out: string
  raw: string | null
  timeoutSeconds: number
  budgetUsd: number
}

export type ReportOptions = { command: 'report'; skill: string; out: string }

export const parseArgs = (input: string[]): RunOptions | ReportOptions => {
  let argv = input
  const command = argv[0] === '--' ? argv[1] : argv[0]
  if (argv[0] === '--') argv = argv.slice(1)
  if (command !== 'run' && command !== 'report') {
    throw new UsageError(`the first argument must be "run" or "report", not "${command ?? ''}"`)
  }
  const flags: Record<string, string> = {}
  for (let i = 1; i < argv.length; i += 1) {
    const name = argv[i]
    // pnpm forwards the `--` of `pnpm eval -- …`; it is a separator, not an argument
    if (name === '--') continue
    if (!name.startsWith('--')) throw new UsageError(`unexpected argument ${name}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`${name} needs a value`)
    }
    flags[name.slice(2)] = value
    i += 1
  }
  const need = (name: string): string => {
    const value = flags[name]
    if (value === undefined) throw new UsageError(`--${name} is required`)
    return value
  }
  if (command === 'report') {
    return { command, skill: need('skill'), out: resolve(need('out')) }
  }
  const skill = need('skill')
  const evalId = need('eval')
  const arm = need('arm')
  if (arm !== 'with' && arm !== 'without') {
    throw new UsageError('--arm must be "with" or "without"')
  }
  const run = Number(need('run'))
  if (!Number.isInteger(run) || run < 1) throw new UsageError('--run must be a positive integer')
  const timeoutSeconds = flags.timeout === undefined ? 540 : Number(flags.timeout)
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new UsageError('--timeout must be a positive number of seconds')
  }
  const budgetUsd = flags.budget === undefined ? 3 : Number(flags.budget)
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    throw new UsageError('--budget must be a positive number of dollars')
  }
  return {
    command,
    skill,
    evalId,
    arm,
    run,
    model: need('model'),
    out: resolve(need('out')),
    raw: flags.raw === undefined ? null : resolve(flags.raw),
    timeoutSeconds,
    budgetUsd,
  }
}

export const readSuite = (root: string, skill: string): Suite => {
  const file = join(root, 'evals', skill, 'evals.json')
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new UsageError(`cannot read ${file}: ${(err as Error).message}`)
  }
  const suite = data as Partial<Suite>
  if (!Array.isArray(suite.evals)) throw new UsageError(`${file} has no "evals" list`)
  return { skill: suite.skill ?? skill, evals: suite.evals }
}

export const findEval = (suite: Suite, id: string): EvalDef => {
  const found = suite.evals.find((e) => e.id === id)
  if (found === undefined) {
    throw new UsageError(
      `no eval "${id}" in the suite (have: ${suite.evals.map((e) => e.id).join(', ')})`,
    )
  }
  return found
}

type GraderModule = {
  grade?: (
    evalId: string,
    runDir: string,
    context: { assertions: EvalDef['assertions']; outputs: OutputFile[]; finalReply: string },
  ) => Grade[] | Promise<Grade[]>
  agreementKey?: (evalId: string, runDir: string) => string
}

/**
 * The suite's grader, or why it could not be loaded. It is imported through a file URL: on Windows
 * `import('C:\\…\\grade.ts')` reads `c:` as a URL scheme and fails. A failure to load is reported as
 * that, with the error code only, since the message carries this machine's absolute path.
 */
const loadGrader = async (
  root: string,
  skill: string,
): Promise<{ module: GraderModule } | { error: string }> => {
  const path = join(root, 'evals', skill, 'grade.ts')
  try {
    return { module: (await import(pathToFileURL(path).href)) as GraderModule }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? (err as Error).name
    return { error: `cannot load evals/${skill}/grade.ts (${code})` }
  }
}

export const runArm = async (options: RunOptions, out: (line: string) => void): Promise<number> => {
  const root = abRoot()
  const suite = readSuite(root, options.skill)
  const evalDef = findEval(suite, options.evalId)
  const raw = options.raw ?? join(root, 'evals', '.runs')
  const runDir = join(options.out, evalDef.id, options.arm, `run-${options.run}`)
  const rawDir = join(raw, options.skill, evalDef.id, options.arm, `run-${options.run}`)

  const tmp = mkdtempSync(join(tmpdir(), 'ab-run-'))
  const ws = join(tmp, 'ws')
  const home = join(tmp, 'home')
  const cfg = join(tmp, 'cfg')
  let mocks: Awaited<ReturnType<typeof startMocks>> = []
  try {
    for (const dir of [ws, home, cfg]) mkdirSync(dir, { recursive: true })
    for (const dir of evalDef.workspace.dirs) mkdirSync(join(ws, dir), { recursive: true })
    if (options.arm === 'with') {
      cpSync(join(root, 'skills', options.skill), join(ws, '.claude', 'skills', options.skill), {
        recursive: true,
      })
    }
    mocks = await startMocks(evalDef.mocks, root, join(root, 'fixtures'))

    // The CLI's own arguments, and the only part of the command line `run.json` records: with
    // CLAUDE_CALL_ENV_FILE set — the condition of every live arm — the full command line is
    // `bash <repo>/skills/.../call-env.sh <the env file> …`, and `run.json` is committed and never
    // passes through the redactor, so writing it would put this machine's paths into the repository.
    const claudeArgs = [
      '-p',
      '--model',
      options.model,
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--permission-mode',
      'bypassPermissions',
      '--max-budget-usd',
      String(options.budgetUsd),
      '--disallowedTools',
      'WebFetch',
      'WebSearch',
      'Bash(sudo:*)',
      'Bash(docker:*)',
      'Bash(git push:*)',
      '--append-system-prompt',
      NOTICE,
    ]
    const launched = await launchClaude({
      args: claudeArgs,
      prompt: evalDef.prompt,
      cwd: ws,
      timeoutMs: options.timeoutSeconds * 1000,
      env: { HOME: home, CLAUDE_CONFIG_DIR: cfg },
      unsetEnv: ['CLAUDE_CALL_ENV_FILE', 'GOALBUS_ENV_FILE'],
    })

    // Redaction first: nothing of the arm's output reaches a file before this.
    const redactor = makeRedactor()
    const redactedStdout = redactor.line(launched.stdout)
    const redactedStderr = redactor.line(launched.stderr)

    const parsed = parseStream({
      stdout: redactedStdout,
      skillName: options.skill,
      spawnError: launched.spawnError,
      timedOut: launched.timedOut,
      // the `without` arm has no skill installed on purpose: that is the measurement
      checkLoaded: false,
    })
    const transcript = readTranscript(redactedStdout)
    const outputs = collectOutputs(ws, runDir)
    const flags = contaminationFlags({
      toolCalls: transcript.toolCalls,
      finalReply: transcript.finalReply,
      tmp,
      arm: options.arm,
      skill: options.skill,
    })

    mkdirSync(runDir, { recursive: true })
    mkdirSync(rawDir, { recursive: true })
    writeFileSync(join(rawDir, 'transcript.jsonl'), redactedStdout)
    if (redactedStderr.trim() !== '') writeFileSync(join(rawDir, 'stderr.txt'), redactedStderr)
    writeFileSync(join(runDir, 'outputs.json'), `${JSON.stringify(outputs, null, 2)}\n`)
    writeFileSync(join(runDir, 'transcript.md'), transcriptMarkdown(transcript))

    const broken = parsed.status === 'broken'
    // An observation, not a verdict: the `not-loaded` rule of the stream parser is switched off for
    // both arms (see "Contract changes" in PROGRESS.md), so this is the only record of whether the
    // session really loaded the skill. On a `with` arm a false here makes every number of that run
    // worthless; on a `without` arm a false is what the arm is for.
    const skillInInit = parsed.skills.some(
      (name) => name === options.skill || name.endsWith(`:${options.skill}`),
    )
    const runJson = {
      skill: options.skill,
      eval: evalDef.id,
      arm: options.arm,
      run: options.run,
      status: broken ? 'broken' : 'completed',
      reason: parsed.reason,
      wsPath: ws,
      durationMs: launched.durationMs,
      exitCode: launched.code,
      timedOut: launched.timedOut,
      turns: parsed.numTurns,
      stopReason: parsed.terminalReason,
      resultSubtype: parsed.resultSubtype,
      model: { requested: options.model, resolved: parsed.model },
      claudeCodeVersion: parsed.claudeCodeVersion,
      tokens: {
        input: parsed.usage?.inputTokens ?? 0,
        cacheCreation: parsed.usage?.cacheCreationInputTokens ?? 0,
        cacheRead: parsed.usage?.cacheReadInputTokens ?? 0,
        output: parsed.usage?.outputTokens ?? 0,
        thinking: parsed.usage?.thinkingTokens ?? 0,
      },
      totalCostUsd: parsed.totalCostUsd,
      budgetUsd: options.budgetUsd,
      redactions: redactor.count(),
      mocks: summariseMocks(mocks),
      contamination: flags,
      rawTranscript: pathForRecord(root, join(rawDir, 'transcript.jsonl')),
      gradingError: null as string | null,
      claudeArgs,
      skillInInit,
    }
    // `run.json` is written **before** the grader runs: SCOPE.md gives the grader
    // "outputs.json, outputs/, the final reply and run.json" to read, and a grader that cannot see
    // the mock log or the workspace path can only answer "this cannot be decided".
    writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(runJson, null, 2)}\n`)

    const loaded = await loadGrader(root, options.skill)
    const grader = 'module' in loaded ? loaded.module : undefined
    let grades: Grade[]
    let gradingError: string | null = 'error' in loaded ? loaded.error : null
    const ungraded = (): Grade[] =>
      evalDef.assertions.map((a) => ({ id: a.id, kind: a.kind, passed: null, evidence: '' }))
    if (grader === undefined) {
      grades = ungraded()
    } else if (grader.grade === undefined) {
      gradingError = `no grade() in evals/${options.skill}/grade.ts`
      grades = ungraded()
    } else {
      try {
        grades = await grader.grade(evalDef.id, runDir, {
          assertions: evalDef.assertions,
          outputs,
          finalReply: transcript.finalReply,
        })
      } catch (err) {
        gradingError = (err as Error).message
        grades = ungraded()
      }
    }
    writeFileSync(join(runDir, 'grading.json'), `${JSON.stringify(grades, null, 2)}\n`)
    if (gradingError !== null) {
      runJson.gradingError = gradingError
      writeFileSync(join(runDir, 'run.json'), `${JSON.stringify(runJson, null, 2)}\n`)
    }

    out(`ab: ${runDir}`)
    out(
      `ab: ${options.skill}/${evalDef.id}/${options.arm}/run-${options.run} ${runJson.status}${
        broken ? ` (${parsed.reason})` : ''
      }, ${outputs.length} output file(s), ${redactor.count()} redaction(s), ${flags.length} flag(s)`,
    )
    return broken ? 2 : 0
  } finally {
    for (const mock of mocks) await mock.close()
    rmSync(tmp, { recursive: true, force: true })
  }
}

type RunJson = {
  eval: string
  arm: string
  run: number
  status: string
  reason: string | null
  durationMs: number
  turns: number | null
  stopReason: string | null
  model: { requested: string; resolved: string | null }
  claudeCodeVersion: string | null
  tokens: { input: number; cacheCreation: number; cacheRead: number; output: number }
  totalCostUsd: number | null
  redactions: number
  contamination: string[]
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const listDirs = (path: string): string[] => {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

export const report = async (
  options: ReportOptions,
  out: (line: string) => void,
): Promise<number> => {
  const loaded = await loadGrader(abRoot(), options.skill)
  if ('error' in loaded) out(`report: ${loaded.error}; the agreement column is n/a`)
  const grader = 'module' in loaded ? loaded.module : undefined
  const arms: Record<string, unknown>[] = []
  for (const evalId of listDirs(options.out)) {
    for (const arm of listDirs(join(options.out, evalId))) {
      const runDirs = listDirs(join(options.out, evalId, arm)).filter((d) => d.startsWith('run-'))
      const runs: { runJson: RunJson; grades: Grade[]; dir: string }[] = []
      for (const dir of runDirs) {
        const full = join(options.out, evalId, arm, dir)
        try {
          runs.push({
            dir: full,
            runJson: JSON.parse(readFileSync(join(full, 'run.json'), 'utf8')) as RunJson,
            grades: JSON.parse(readFileSync(join(full, 'grading.json'), 'utf8')) as Grade[],
          })
        } catch {
          // a run directory without a run.json is not a run
        }
      }
      if (runs.length === 0) continue
      const allGrades = runs.flatMap((r) => r.grades)
      const mechanical = allGrades.filter((g) => g.kind === 'mechanical')
      const judgment = allGrades.filter((g) => g.kind === 'judgment')
      const keys =
        grader?.agreementKey === undefined
          ? []
          : runs.map((r) => {
              try {
                return grader.agreementKey?.(evalId, r.dir) ?? ''
              } catch {
                return ''
              }
            })
      const decided = runs.length >= 2 && keys.length === runs.length
      arms.push({
        eval: evalId,
        arm,
        runs: runs.length,
        statuses: runs.map((r) => r.runJson.status),
        brokenReasons: runs.map((r) => r.runJson.reason).filter((r) => r !== null),
        stopReasons: runs.map((r) => r.runJson.stopReason),
        mechanical: {
          passed: mechanical.filter((g) => g.passed === true).length,
          total: mechanical.length,
        },
        judgment:
          judgment.some((g) => g.passed === null) && judgment.length > 0
            ? {
                passed: judgment.filter((g) => g.passed === true).length,
                total: judgment.length,
                pending: true,
              }
            : {
                passed: judgment.filter((g) => g.passed === true).length,
                total: judgment.length,
                pending: false,
              },
        medianDurationMs: median(runs.map((r) => r.runJson.durationMs)),
        tokens: {
          input: runs.reduce((s, r) => s + r.runJson.tokens.input, 0),
          cacheCreation: runs.reduce((s, r) => s + r.runJson.tokens.cacheCreation, 0),
          cacheRead: runs.reduce((s, r) => s + r.runJson.tokens.cacheRead, 0),
          output: runs.reduce((s, r) => s + r.runJson.tokens.output, 0),
        },
        totalCostUsd: runs.reduce((s, r) => s + (r.runJson.totalCostUsd ?? 0), 0),
        redactions: runs.reduce((s, r) => s + r.runJson.redactions, 0),
        contamination: runs.flatMap((r) => r.runJson.contamination),
        model: runs[0].runJson.model,
        claudeCodeVersion: runs[0].runJson.claudeCodeVersion,
        // Without a key for every run (a grader with no agreementKey, or one that could not be
        // loaded) agreement cannot be decided: n/a, neither "yes" nor "no".
        runsAgree: decided ? new Set(keys).size === 1 : null,
        // Two runs that produced nothing have the same (empty) key, and "they agree" would be a lie
        // about them. The distinction is reported beside the verdict, not folded into it.
        agreementTrivial: decided ? keys.every((key) => key === '') : null,
        agreementKeys: keys,
      })
    }
  }
  // The date of the measurement is the one its directory is named for (`ab-<YYYY-MM-DD>`, SCOPE.md's
  // own convention); without such a name, the day the report is written.
  const named = /ab-(\d{4}-\d{2}-\d{2})$/.exec(options.out)
  const date = named === null ? new Date().toISOString().slice(0, 10) : named[1]
  const models = [
    ...new Set(arms.map((a) => JSON.stringify((a.model as Record<string, unknown>) ?? {}))),
  ].map((m) => JSON.parse(m) as { requested?: string; resolved?: string })
  const versions = [...new Set(arms.map((a) => String(a.claudeCodeVersion ?? '')))]

  // relative while it is inside the repository: a committed benchmark names no path of the machine
  // that produced it. The `/tmp/…` strings that remain in the arms' contamination flags are
  // quotations of what an arm itself did, which is the flag's whole value.
  const benchmark = {
    skill: options.skill,
    date,
    model: models.length === 1 ? models[0] : models,
    claudeCodeVersion: versions.length === 1 ? versions[0] : versions,
    generatedFrom: pathForRecord(abRoot(), options.out),
    arms,
  }
  mkdirSync(options.out, { recursive: true })
  writeFileSync(join(options.out, 'benchmark.json'), `${JSON.stringify(benchmark, null, 2)}\n`)

  const runsPerArm = [...new Set(arms.map((a) => String(a.runs)))].join(', ')
  const lines: string[] = [
    `# A/B benchmark — ${options.skill}`,
    '',
    `- date: ${date}`,
    `- model requested: ${models.map((m) => m.requested ?? 'unknown').join(', ')} — resolved: ${models.map((m) => m.resolved ?? 'unknown').join(', ')}`,
    `- Claude Code: ${versions.join(', ')}`,
    `- runs per arm: ${runsPerArm}`,
    '',
    '| eval | arm | runs | mechanical | judgment | median duration | input | cache read | cache creation | output | cost (USD) | redactions | flags | runs agree |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const a of arms) {
    const m = a.mechanical as { passed: number; total: number }
    const j = a.judgment as { passed: number; total: number; pending: boolean }
    const t = a.tokens as Record<string, number>
    lines.push(
      `| ${a.eval} | ${a.arm} | ${a.runs} | ${m.passed}/${m.total} | ${
        j.pending ? `pending (${j.total})` : `${j.passed}/${j.total}`
      } | ${Math.round((a.medianDurationMs as number) / 1000)} s | ${t.input} | ${t.cacheRead} | ${
        t.cacheCreation
      } | ${t.output} | ${(a.totalCostUsd as number).toFixed(4)} | ${a.redactions} | ${
        (a.contamination as string[]).length
      } | ${
        a.runsAgree === null
          ? 'n/a'
          : a.agreementTrivial === true
            ? 'yes (empty: neither run produced one)'
            : a.runsAgree
              ? 'yes'
              : 'no'
      } |`,
    )
  }
  lines.push(
    '',
    'The dollar figures are the CLI-reported `total_cost_usd` (API-equivalent, not money spent).',
    '',
  )
  writeFileSync(join(options.out, 'benchmark.md'), lines.join('\n'))
  out(`ab: ${join(options.out, 'benchmark.json')}`)
  out(`ab: ${join(options.out, 'benchmark.md')}`)
  return 0
}

export const main = async (argv: string[], out: (line: string) => void): Promise<number> => {
  let options: RunOptions | ReportOptions
  try {
    options = parseArgs(argv)
  } catch (err) {
    out(`ab: ${(err as Error).message}`)
    out(USAGE)
    return 3
  }
  try {
    return options.command === 'run' ? await runArm(options, out) : await report(options, out)
  } catch (err) {
    out(`ab: ${(err as Error).message}`)
    return 3
  }
}

if (process.argv[1]?.endsWith('ab.ts') === true) {
  process.exitCode = await main(process.argv.slice(2), (line) => {
    process.stdout.write(`${line}\n`)
  })
}
