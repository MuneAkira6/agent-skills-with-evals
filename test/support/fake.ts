import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchClaude, resolveBin } from '../../skills/skill-trigger-probe/scripts/lib/claude.ts'

/** The fake CLI the G1 tests run through CLAUDE_BIN. */
export const FAKE_CLI = join(import.meta.dirname, '..', 'fake-claude', 'cli.ts')

export type LogLine = {
  argv: string[]
  cwd: string
  stdinBytes: number
  stdin: string
  scenario: string
  planKey: string | null
  projectEntries: string[]
  thinking: string
  projectSkills: string[]
  claudecode: string
  claudeCallEnvFile: string
  goalbusEnvFile: string
  home: string
  claudeConfigDir: string
  askev: Record<string, string>
}

export const readLog = (path: string): LogLine[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LogLine)

/**
 * Sets process.env entries while `body` runs and restores them afterwards; an undefined value
 * removes the variable. Every test uses it to point CLAUDE_BIN at the fake CLI and to keep the
 * real CLAUDE_CALL_ENV_FILE out of the way — G1 makes no live call.
 */
export const withEnv = async <T>(
  vars: Record<string, string | undefined>,
  body: () => Promise<T>,
): Promise<T> => {
  const before: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(vars)) {
    before[name] = process.env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    return await body()
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

/**
 * The only way a G1 test starts the launcher directly. It points CLAUDE_BIN at the fake CLI, takes
 * the real CLAUDE_CALL_ENV_FILE out of the way, and refuses to spawn anything else: a test that
 * forgets this would start the real CLI, whose unauthenticated answer reads as a clean negative
 * (`subtype: "success"`, fact F8) instead of an error.
 */
export const launchFake = async (
  options: Parameters<typeof launchClaude>[0],
  /**
   * Extra process environment for this call. `envFile` is the only way a test exercises the
   * CLAUDE_CALL_ENV_FILE branch, and it must name a file the test wrote itself: the real one is
   * never opened or sourced by a G1 test.
   */
  extra: {
    envFile?: string
    vars?: Record<string, string | undefined>
    /** the executable this call expects instead of the fake CLI, for the spawn-error test */
    expectBin?: string
  } = {},
): Promise<Awaited<ReturnType<typeof launchClaude>>> =>
  withEnv(
    {
      CLAUDE_BIN: extra.expectBin ?? FAKE_CLI,
      CLAUDE_CALL_ENV_FILE: extra.envFile,
      ...extra.vars,
    },
    async () => {
      const expected = extra.expectBin ?? FAKE_CLI
      const bin = resolveBin(process.env.CLAUDE_BIN)
      if (bin[bin.length - 1] !== expected) {
        throw new Error(`a G1 test may only start ${expected}, not ${bin.join(' ')}`)
      }
      return launchClaude(options)
    },
  )
