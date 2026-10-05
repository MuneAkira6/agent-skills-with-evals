// The one launcher the probe and the A/B runner share. Everything SCOPE.md asks of a nested
// `claude` lives here, so neither caller can forget a rule:
//
//   * the prompt goes on standard input, never into an argument — no text of a user's is ever
//     quoted for a shell, on Windows as on Linux (F13);
//   * stdout and stderr are captured, nothing is inherited, and `shell: true` appears nowhere;
//   * CLAUDECODE is removed: a nested session is a separate session;
//   * CLAUDE_CALL_ENV_FILE, when set, is sourced by call-env.sh in a child shell and the caller's
//     overrides are applied after it (F9, F10);
//   * CLAUDE_BIN replaces the executable, and a .ts/.js/.mjs path is run by this Node;
//   * a timeout kills the process and its children and is reported as `timedOut`.
//
// No value of any environment variable is printed, logged or returned by anything here.

import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'

const WRAPPER = join(import.meta.dirname, 'call-env.sh')

export type LaunchOptions = {
  /** the CLI's arguments, without the executable */
  args: string[]
  /** written to the child's standard input, then closed */
  prompt: string
  /** a directory in the OS temporary area, never inside a repository */
  cwd: string
  timeoutMs: number
  /** overrides applied after the environment file; only paths this run invented belong here */
  env?: Record<string, string>
  /** names to remove from the child's environment; CLAUDE_CALL_ENV_FILE is always removed */
  unsetEnv?: string[]
}

export type LaunchResult = {
  stdout: string
  stderr: string
  code: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  /** the message when the process could not be started at all */
  spawnError: string | null
  durationMs: number
  /** what was actually started, for the tests to observe */
  argv: string[]
}

/** The executable, as a command and its leading arguments. */
export const resolveBin = (claudeBin: string | undefined): string[] => {
  const bin = claudeBin === undefined || claudeBin === '' ? 'claude' : claudeBin
  return /\.(ts|js|mjs)$/.test(bin) ? [process.execPath, bin] : [bin]
}

const killTree = (child: ChildProcess): void => {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    return
  }
  try {
    // the child was started detached, so this reaches the whole process group
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
}

export const launchClaude = (opts: LaunchOptions): Promise<LaunchResult> =>
  new Promise<LaunchResult>((resolve) => {
    const started = Date.now()
    const envFile = process.env.CLAUDE_CALL_ENV_FILE
    const bin = resolveBin(process.env.CLAUDE_BIN)

    const removals = ['CLAUDE_CALL_ENV_FILE', 'CLAUDECODE', ...(opts.unsetEnv ?? [])]
    const unique = removals.filter((name, i) => removals.indexOf(name) === i)
    const overrides = Object.entries(opts.env ?? {}).map(([name, value]) => `${name}=${value}`)

    let argv: string[]
    if (envFile !== undefined && envFile !== '') {
      const envArgs = [...unique.flatMap((name) => ['-u', name]), ...overrides]
      argv = ['bash', WRAPPER, envFile, ...envArgs, ...bin, ...opts.args]
    } else {
      argv = [...bin, ...opts.args]
    }

    // The child's own environment: without it the wrapper's `.` would run with nothing at all.
    //
    // With the wrapper, the overrides are **not** put here. SCOPE.md says the wrapper sources the
    // file and *then* `exec env` applies the overrides; putting them here too would apply them
    // before the file instead of after. That is not a nicety: on this host the file finds the
    // credential through the real HOME, so sourcing it with an overridden HOME leaves the call
    // unauthenticated (fact F26). Without the wrapper there is nothing to apply them later, so
    // they go into the environment directly.
    const childEnv: Record<string, string> = {}
    for (const [name, value] of Object.entries(process.env)) {
      if (value !== undefined) childEnv[name] = value
    }
    for (const name of unique) delete childEnv[name]
    if (envFile === undefined || envFile === '') {
      for (const [name, value] of Object.entries(opts.env ?? {})) childEnv[name] = value
    }

    const child = spawn(argv[0], argv.slice(1), {
      cwd: opts.cwd,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let spawnError: string | null = null
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, opts.timeoutMs)

    const settle = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        stdout,
        stderr,
        code,
        signal,
        timedOut,
        spawnError,
        durationMs: Date.now() - started,
        argv,
      })
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (err: Error) => {
      spawnError = err.message
      settle(null, null)
    })
    child.on('close', (code, signal) => settle(code, signal))

    child.stdin?.on('error', () => {
      // a CLI that exits before reading its prompt
    })
    child.stdin?.end(opts.prompt)
  })
