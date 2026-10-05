// This skill's own launcher. A skill directory stands alone: it may not import the trigger probe's
// launcher, so the rules of SCOPE.md ("Every `claude` this repository starts") are implemented here
// again, deliberately, in the smaller form this one call needs.
//
//   * a fresh empty directory under the OS temporary area, removed afterwards — so no CLAUDE.md,
//     no settings and no memory of any project reach the call;
//   * the prompt on standard input, never in an argument;
//   * CLAUDECODE removed: a nested session is a separate session;
//   * MAX_THINKING_TOKENS set for this one process, never in a settings file, so no other session
//     is affected;
//   * CLAUDE_CALL_ENV_FILE sourced by call-env.sh in a child shell when it is set, with the
//     caller's overrides applied after the file;
//   * CLAUDE_BIN honoured, so the tests can substitute a fake CLI;
//   * no value of any environment variable printed, logged or returned.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WRAPPER = join(import.meta.dirname, 'call-env.sh')

export type NarrationCall = {
  args: string[]
  prompt: string
  timeoutMs: number
  /** overrides for the child; only values this run invented belong here */
  env: Record<string, string>
}

export type NarrationResult = {
  stdout: string
  stderr: string
  code: number | null
  timedOut: boolean
  spawnError: string | null
  durationMs: number
  /** the directory the call ran in, already removed */
  cwd: string
}

export const resolveBin = (claudeBin: string | undefined): string[] => {
  const bin = claudeBin === undefined || claudeBin === '' ? 'claude' : claudeBin
  return /\.(ts|js|mjs)$/.test(bin) ? [process.execPath, bin] : [bin]
}

export const callClaude = (call: NarrationCall): Promise<NarrationResult> =>
  new Promise<NarrationResult>((resolve) => {
    const started = Date.now()
    // a fresh empty directory: nothing of any project is in scope for this call
    const cwd = mkdtempSync(join(tmpdir(), 'standup-digest-narrate-'))
    const envFile = process.env.CLAUDE_CALL_ENV_FILE
    const bin = resolveBin(process.env.CLAUDE_BIN)
    const removals = ['CLAUDE_CALL_ENV_FILE', 'CLAUDECODE']
    const overrides = Object.entries(call.env).map(([name, value]) => `${name}=${value}`)

    const argv =
      envFile === undefined || envFile === ''
        ? [...bin, ...call.args]
        : [
            'bash',
            WRAPPER,
            envFile,
            ...removals.flatMap((name) => ['-u', name]),
            ...overrides,
            ...bin,
            ...call.args,
          ]

    // With the wrapper, the overrides go only to `env`, after the file is sourced — the file finds
    // the credential through the real HOME on this host (fact F26). Without it they go straight in.
    const childEnv: Record<string, string> = {}
    for (const [name, value] of Object.entries(process.env)) {
      if (value !== undefined) childEnv[name] = value
    }
    for (const name of removals) delete childEnv[name]
    if (envFile === undefined || envFile === '') {
      for (const [name, value] of Object.entries(call.env)) childEnv[name] = value
    }

    const child = spawn(argv[0], argv.slice(1), {
      cwd,
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
      const pid = child.pid
      if (pid === undefined) return
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
        return
      }
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          // already gone
        }
      }
    }, call.timeoutMs)

    const settle = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rmSync(cwd, { recursive: true, force: true })
      resolve({ stdout, stderr, code, timedOut, spawnError, durationMs: Date.now() - started, cwd })
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
      settle(null)
    })
    child.on('close', (code) => settle(code))
    child.stdin?.on('error', () => {
      // a CLI that exits before reading its prompt
    })
    child.stdin?.end(call.prompt)
  })
