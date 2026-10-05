import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { launchClaude } from '../skills/skill-trigger-probe/scripts/lib/claude.ts'
import { resolveBin } from '../skills/skill-trigger-probe/scripts/lib/claude.ts'
import { parseStream } from '../skills/skill-trigger-probe/scripts/lib/stream.ts'
import { FAKE_CLI, launchFake, readLog, withEnv } from './support/fake.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'

const STREAM_ARGS = ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', '1']
const PROMPT = 'How long should I steep green tea, and how hot should the water be?'

let root: string
let seq = 0

const nextLog = (): string => {
  seq += 1
  return join(root, `fake-${seq}.log`)
}

beforeAll(() => {
  root = makeTempDir('g1-launcher')
})

afterAll(() => {
  removeTempDir(root)
})

type Launched = Awaited<ReturnType<typeof launchClaude>>

const launch = async (
  fake: Record<string, string>,
  opts: { timeoutMs?: number; env?: Record<string, string>; bin?: string; envFile?: string } = {},
): Promise<{ run: Launched; log: string }> => {
  const log = nextLog()
  const run = await launchFake(
    {
      args: STREAM_ARGS,
      prompt: PROMPT,
      cwd: root,
      timeoutMs: opts.timeoutMs ?? 20_000,
      env: {
        FAKE_LOG: log,
        FAKE_SKILL: 'tea-timer',
        FAKE_SIBLINGS: 'long-desc',
        ...fake,
        ...opts.env,
      },
    },
    { envFile: opts.envFile, expectBin: opts.bin },
  )
  return { run, log }
}

describe('the launcher, observed through the fake CLI own log', () => {
  it('puts the prompt on stdin and in no argument', async () => {
    const { run, log } = await launch({ FAKE_SCENARIO: 'trigger' })
    const [entry] = readLog(log)
    expect(entry.stdin).toBe(PROMPT)
    expect(entry.stdinBytes).toBe(Buffer.byteLength(PROMPT))
    expect(entry.argv).toEqual(STREAM_ARGS)
    expect(run.argv.some((a) => a.includes('steep'))).toBe(false)
    expect(entry.cwd).toBe(root)
  })

  it('runs a CLAUDE_BIN ending in .ts with this Node', async () => {
    expect(resolveBin('/x/cli.ts')).toEqual([process.execPath, '/x/cli.ts'])
    expect(resolveBin('/x/cli.mjs')).toEqual([process.execPath, '/x/cli.mjs'])
    expect(resolveBin('/x/cli.js')).toEqual([process.execPath, '/x/cli.js'])
    expect(resolveBin(undefined)).toEqual(['claude'])
    expect(resolveBin('/usr/local/bin/claude')).toEqual(['/usr/local/bin/claude'])
    const { run, log } = await launch({ FAKE_SCENARIO: 'no-trigger' })
    expect(run.argv[0]).toBe(process.execPath)
    expect(run.argv[1]).toBe(FAKE_CLI)
    expect(existsSync(log)).toBe(true)
  })

  it('removes CLAUDECODE from the child', async () => {
    const { log } = await withEnv({ CLAUDECODE: '1' }, () =>
      launch({ FAKE_SCENARIO: 'no-trigger' }),
    )
    expect(readLog(log)[0].claudecode).toBe('absent')
  })

  it('sources CLAUDE_CALL_ENV_FILE, lets the caller overrides win, and removes the variable', async () => {
    const envFile = join(root, 'call-env-file.sh')
    writeFileSync(
      envFile,
      ['export ASKEV_FROM_FILE=from-file', 'export ASKEV_BOTH=from-file', ''].join('\n'),
    )
    const { run, log } = await launch(
      { FAKE_SCENARIO: 'no-trigger' },
      { envFile, env: { ASKEV_BOTH: 'from-override' } },
    )
    expect(run.argv[0]).toBe('bash')
    expect(run.argv[1].endsWith('call-env.sh')).toBe(true)
    expect(run.argv[2]).toBe(envFile)
    expect(run.argv).toContain('-u')
    expect(run.argv).toContain('CLAUDE_CALL_ENV_FILE')
    const [entry] = readLog(log)
    expect(entry.askev.ASKEV_FROM_FILE).toBe('from-file')
    expect(entry.askev.ASKEV_BOTH).toBe('from-override')
    expect(entry.claudeCallEnvFile).toBe('absent')
  })

  it('removes the names the caller asks for, with or without the env file', async () => {
    const envFile = join(root, 'call-env-file.sh')
    const direct = await withEnv({ ASKEV_DROP_ME: 'still-here' }, () =>
      launch({ FAKE_SCENARIO: 'no-trigger' }),
    )
    expect(readLog(direct.log)[0].askev.ASKEV_DROP_ME).toBe('still-here')
    const dropped = await withEnv({ ASKEV_DROP_ME: 'still-here' }, async () => {
      const log = nextLog()
      const run = await launchFake(
        {
          args: STREAM_ARGS,
          prompt: PROMPT,
          cwd: root,
          timeoutMs: 20_000,
          unsetEnv: ['ASKEV_DROP_ME'],
          env: { FAKE_LOG: log, FAKE_SCENARIO: 'no-trigger' },
        },
        { envFile },
      )
      return { run, log }
    })
    expect(readLog(dropped.log)[0].askev.ASKEV_DROP_ME).toBeUndefined()
    expect(dropped.run.argv).toContain('ASKEV_DROP_ME')
  })

  it('kills a child that runs past its timeout and reports timedOut', async () => {
    const { run, log } = await launch(
      { FAKE_SCENARIO: 'trigger', FAKE_SLEEP_MS: '8000' },
      {
        // 3 s and not 0.6: on a loaded Windows machine a Node start alone can outlast 0.6 s
        timeoutMs: 3000,
      },
    )
    expect(run.timedOut).toBe(true)
    // POSIX kills the process group with SIGKILL; on Windows `taskkill /T /F` ends the tree and Node
    // reports an exit code and no signal. SCOPE.md asks for `timedOut` on both.
    expect(run.signal).toBe(process.platform === 'win32' ? null : 'SIGKILL')
    expect(run.stdout).toBe('')
    expect(existsSync(log)).toBe(true)
    const parsed = parseStream({
      stdout: run.stdout,
      skillName: 'tea-timer',
      timedOut: run.timedOut,
    })
    expect(parsed.reason).toBe('timeout')
  })

  it('prints no environment value: a planted variable reaches neither the log nor the output', async () => {
    const secret = ['askev', 'planted', 'value', 'eb17d3'].join('-')
    const { run, log } = await withEnv(
      { ASKEV_NOT_LOGGED_NAME: undefined, SOME_PLANTED_VAR: secret },
      () => launch({ FAKE_SCENARIO: 'no-trigger' }),
    )
    const text = readLog(log)
      .map((entry) => JSON.stringify(entry))
      .join('\n')
    expect(text).not.toContain(secret)
    expect(run.stdout).not.toContain(secret)
    expect(run.stderr).not.toContain(secret)
    // the real HOME is outside the OS temp directory and is never written out
    expect(readLog(log)[0].home).toBe('outside-os-temp')
  })
})
