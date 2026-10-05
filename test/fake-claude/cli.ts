#!/usr/bin/env node
// The fake CLI every G1 test runs instead of the real one, through CLAUDE_BIN. It writes the
// stream-json shapes of fixtures/streams/ and records one JSON line per invocation so the tests can
// see what the launcher actually did.
//
// It never dumps its environment. It logs the presence of CLAUDECODE, CLAUDE_CALL_ENV_FILE and
// GOALBUS_ENV_FILE, the values of HOME and CLAUDE_CONFIG_DIR only while they point inside the OS
// temporary directory, and the values of the ASKEV_* variables, which this run invents itself.
//
// Driven by (all invented by this run):
//   FAKE_LOG        the JSON-lines log to append to
//   FAKE_SCENARIO   the stream to write (see SCENARIOS); `plan` reads FAKE_PLAN
//   FAKE_PLAN       a JSON file { "<query substring>": ["<scenario>", ...] }, chosen by call count
//   FAKE_SKILL      the name of the skill under test
//   FAKE_SIBLINGS   comma-separated sibling names that appear in the init event
//   FAKE_SLEEP_MS   milliseconds to sleep before writing anything
//   FAKE_STDERR     a line to write to stderr
//   FAKE_EXIT       the exit code (otherwise the scenario's own)

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const env = (name: string): string | undefined => {
  const value = process.env[name]
  return value === undefined || value === '' ? undefined : value
}

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/** A path is logged only while it points inside the OS temporary directory. */
const safePath = (value: string | undefined): string => {
  if (value === undefined) return 'unset'
  return value.startsWith(tmpdir()) ? value : 'outside-os-temp'
}

const presence = (name: string): string => (env(name) === undefined ? 'absent' : 'present')

/** What the working directory holds: the probe builds a project with nothing but .claude/skills/. */
const listDir = (path: string): string[] => {
  try {
    return readdirSync(path).sort()
  } catch {
    return []
  }
}

const skillName = (): string => env('FAKE_SKILL') ?? 'tea-timer'

/**
 * The skills a real session would load from the project it was started in. The arm scenarios use
 * this, so an arm's init event reports what the A/B runner actually installed: the `with` arm sees
 * the skill and the `without` arm sees nothing.
 */
const projectSkills = (): string[] => listDir(join(process.cwd(), '.claude', 'skills'))
const siblings = (): string[] => (env('FAKE_SIBLINGS') ?? '').split(',').filter((s) => s !== '')

const init = (skills: string[]): string =>
  JSON.stringify({
    type: 'system',
    subtype: 'init',
    claude_code_version: '2.1.233-fake',
    model: 'claude-sonnet-5',
    permissionMode: 'default',
    cwd: process.cwd(),
    skills,
    tools: ['Bash', 'Read', 'Skill', 'ToolSearch', 'Write'],
  })

const thinkingTokens = (): string =>
  JSON.stringify({ type: 'system', subtype: 'thinking_tokens', tokens: 128 })

const assistantText = (text: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: { model: 'claude-sonnet-5', content: [{ type: 'text', text }] },
  })

const assistantSkill = (skill: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-sonnet-5',
      content: [{ type: 'tool_use', name: 'Skill', input: { skill, args: 'a fake invocation' } }],
    },
  })

const assistantRead = (filePath: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-sonnet-5',
      content: [{ type: 'tool_use', name: 'Read', input: { file_path: filePath } }],
    },
  })

const assistantAuthError = (): string =>
  JSON.stringify({
    type: 'assistant',
    error: 'authentication_failed',
    message: {
      model: '<synthetic>',
      content: [{ type: 'text', text: 'Not logged in · Please run /login' }],
    },
  })

const result = (
  subtype: string,
  isError: boolean,
  terminalReason: string,
  numTurns: number,
): string =>
  JSON.stringify({
    type: 'result',
    subtype,
    is_error: isError,
    terminal_reason: terminalReason,
    num_turns: numTurns,
    duration_ms: 1234,
    total_cost_usd: 0.0123,
    modelUsage: { 'claude-sonnet-5': { inputTokens: 2 } },
    usage: {
      input_tokens: 2,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 200,
      output_tokens: 50,
      output_tokens_details: { thinking_tokens: 7 },
    },
  })

const toolUse = (name: string, input: Record<string, unknown>): string =>
  JSON.stringify({
    type: 'assistant',
    message: { model: 'claude-sonnet-5', content: [{ type: 'tool_use', name, input }] },
  })

const resultWithReply = (reply: string): string =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    terminal_reason: 'completed',
    num_turns: 3,
    duration_ms: 2345,
    total_cost_usd: 0.0456,
    result: reply,
    modelUsage: { 'claude-sonnet-5': { inputTokens: 10 } },
    usage: {
      input_tokens: 10,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 2000,
      output_tokens: 300,
      output_tokens_details: { thinking_tokens: 11 },
    },
  })

/** The arm scenarios write a file into the working directory, as a real arm would. */
const writeAnswer = (text: string): string => {
  const dir = join(process.cwd(), 'out')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // the workspace already has it
  }
  const file = join(dir, 'answer.md')
  writeFileSync(file, text)
  return file
}

/**
 * How many invocations came **before** this one, for a scenario that answers differently each time.
 * The log line of the current call is already written by the time a scenario is chosen, so it is
 * subtracted — counting it made a two-answer plan skip straight to its second answer.
 */
const countCalls = (): number => {
  const logPath = env('FAKE_LOG')
  if (logPath === undefined) return 0
  try {
    const lines = readFileSync(logPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '').length
    return Math.max(0, lines - 1)
  } catch {
    return 0
  }
}

/**
 * The values the redaction control plants. They are read from FAKE_LEAK_* only — this fake never
 * reads a proxy variable or any other secret-looking name, and the test puts the same strings into
 * both FAKE_LEAK_PROXY and HTTPS_PROXY so the runner still has to redact them by value.
 */
const leaks = (): Record<string, string> => {
  const found: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('FAKE_LEAK_') && value !== undefined && value !== '') found[key] = value
  }
  return found
}

type Scenario = { lines: string[]; exit: number }

const scenario = (name: string): Scenario => {
  const skill = skillName()
  const loaded = [skill, ...siblings()]
  switch (name) {
    case 'trigger':
      return {
        lines: [
          init(loaded),
          assistantSkill(skill),
          result('error_max_turns', true, 'max_turns', 2),
        ],
        exit: 1,
      }
    case 'trigger-read':
      return {
        lines: [
          init(loaded),
          assistantRead(`/a/project/.claude/skills/${skill}/SKILL.md`),
          result('error_max_turns', true, 'max_turns', 2),
        ],
        exit: 1,
      }
    case 'trigger-plugin':
      return {
        lines: [
          init([`acme-pack:${skill}`, ...siblings()]),
          assistantSkill(`acme-pack:${skill}`),
          result('error_max_turns', true, 'max_turns', 2),
        ],
        exit: 1,
      }
    case 'no-trigger':
      return {
        lines: [init(loaded), assistantText('Canberra.'), result('success', false, 'completed', 1)],
        exit: 0,
      }
    case 'sibling':
      return {
        lines: [
          init(loaded),
          assistantSkill(siblings()[0] ?? 'long-desc'),
          result('error_max_turns', true, 'max_turns', 2),
        ],
        exit: 1,
      }
    case 'no-init':
      // system events that are not the init event: only subtype "init" may count as one
      return {
        lines: [
          thinkingTokens(),
          thinkingTokens(),
          assistantText('No init event came first.'),
          result('success', false, 'completed', 1),
        ],
        exit: 0,
      }
    case 'no-result':
      return { lines: [init(loaded), assistantText('Cut off before the result.')], exit: 0 }
    case 'not-loaded':
      return {
        lines: [
          init(siblings().length > 0 ? siblings() : ['long-desc']),
          assistantText('That skill is not installed here.'),
          result('success', false, 'completed', 1),
        ],
        exit: 0,
      }
    case 'auth':
      return {
        lines: [init(loaded), assistantAuthError(), result('success', true, 'api_error', 1)],
        exit: 1,
      }
    case 'auth-and-not-loaded':
      // both broken reasons at once: SCOPE.md's order makes this `auth`
      return {
        lines: [
          init(siblings().length > 0 ? siblings() : ['long-desc']),
          assistantAuthError(),
          result('success', true, 'api_error', 1),
        ],
        exit: 1,
      }
    case 'tool-then-max-turns':
      // a valid run that used a tool under --max-turns 1: exits 1 and is no failure (F7)
      return {
        lines: [
          init(loaded),
          assistantSkill(skill),
          JSON.stringify({
            type: 'user',
            message: { content: [{ type: 'tool_result', content: `Launching skill: ${skill}` }] },
          }),
          result('error_max_turns', true, 'max_turns', 2),
        ],
        exit: 1,
      }
    case 'arm-clean': {
      const file = writeAnswer(
        '# The answer\n\nfetched from http://127.0.0.1:18451/issues/101.json\n',
      )
      return {
        lines: [
          init(projectSkills()),
          toolUse('Write', { file_path: file, content: '# The answer' }),
          toolUse('Bash', { command: 'curl -s http://127.0.0.1:18451/issues/101.json' }),
          resultWithReply('out/answer.md を書きました。'),
        ],
        exit: 0,
      }
    }
    case 'arm-leak': {
      const planted = leaks()
      const file = writeAnswer(`# The answer\n\n${Object.values(planted).join('\n')}\n`)
      return {
        lines: [
          init(projectSkills()),
          toolUse('Write', { file_path: file, content: Object.values(planted).join(' ') }),
          toolUse('Bash', {
            command: Object.entries(planted)
              .map(([key, value]) => `echo ${key}=${value}`)
              .join('; '),
          }),
          resultWithReply(`planted: ${Object.values(planted).join(' ')}`),
        ],
        exit: 0,
      }
    }
    case 'arm-outside-path':
      return {
        lines: [
          init(projectSkills()),
          toolUse('Bash', { command: 'cat /etc/hostname' }),
          resultWithReply('read a file outside the sandbox'),
        ],
        exit: 0,
      }
    case 'arm-nonlocal-url':
      return {
        lines: [
          init(projectSkills()),
          toolUse('Bash', { command: 'curl -s https://api.example.invalid/v1/items' }),
          resultWithReply('reached a host that is not local'),
        ],
        exit: 0,
      }
    case 'arm-mentions-skill':
      return {
        lines: [
          init(projectSkills()),
          toolUse('Read', { file_path: `.claude/skills/${skill}/SKILL.md` }),
          resultWithReply(`I read skills/${skill}/SKILL.md to learn the rules.`),
        ],
        exit: 0,
      }
    case 'narrate': {
      // `--output-format json` prints one object; its `result` is the model's text
      const files = (env('FAKE_NARRATIVE') ?? '').split(',').filter((f) => f !== '')
      const seen = countCalls()
      const file = files.length === 0 ? null : files[Math.min(seen, files.length - 1)]
      const reply = file === null ? '{}' : readFileSync(file, 'utf8')
      return {
        lines: [
          JSON.stringify({
            type: 'result',
            subtype: 'success',
            is_error: false,
            terminal_reason: 'completed',
            num_turns: 1,
            duration_ms: 1500,
            total_cost_usd: 0.0031,
            result: reply,
            modelUsage: { 'claude-sonnet-5': { inputTokens: 193 } },
            usage: {
              input_tokens: 193,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              output_tokens: 128,
              output_tokens_details: { thinking_tokens: 0 },
            },
          }),
        ],
        exit: 0,
      }
    }
    case 'garbage':
      return {
        lines: ['a line that is not JSON', init(loaded), result('success', false, 'completed', 1)],
        exit: 0,
      }
    default:
      return {
        lines: [
          init(loaded),
          assistantText(`unknown scenario ${name}`),
          result('success', false, 'completed', 1),
        ],
        exit: 0,
      }
  }
}

/** The plan picks a scenario by how often this query has been seen in the log already. */
const fromPlan = (planPath: string, logPath: string | undefined, prompt: string): string => {
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Record<string, string[]>
  const key = Object.keys(plan).find((k) => prompt.includes(k))
  if (key === undefined) return 'no-trigger'
  let seen = 0
  if (logPath !== undefined) {
    try {
      for (const line of readFileSync(logPath, 'utf8').split('\n')) {
        if (
          line.includes('"planKey":') &&
          (JSON.parse(line) as { planKey?: string }).planKey === key
        ) {
          seen += 1
        }
      }
    } catch {
      seen = 0
    }
  }
  const list = plan[key]
  return list[seen % list.length]
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const run = async (): Promise<void> => {
  const prompt = await readStdin()
  const logPath = env('FAKE_LOG')
  const sleepMs = Number.parseInt(env('FAKE_SLEEP_MS') ?? '0', 10)

  const planPath = env('FAKE_PLAN')
  let name = env('FAKE_SCENARIO') ?? 'no-trigger'
  let planKey: string | null = null
  if (name === 'plan' && planPath !== undefined) {
    const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Record<string, string[]>
    planKey = Object.keys(plan).find((k) => prompt.includes(k)) ?? null
    name = fromPlan(planPath, logPath, prompt)
  }

  const askev: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('ASKEV_') && value !== undefined) askev[key] = value
  }

  if (logPath !== undefined) {
    appendFileSync(
      logPath,
      `${JSON.stringify({
        argv: process.argv.slice(2),
        cwd: process.cwd(),
        stdinBytes: Buffer.byteLength(prompt),
        stdin: prompt,
        scenario: name,
        planKey,
        claudecode: presence('CLAUDECODE'),
        claudeCallEnvFile: presence('CLAUDE_CALL_ENV_FILE'),
        goalbusEnvFile: presence('GOALBUS_ENV_FILE'),
        projectEntries: listDir(process.cwd()),
        projectSkills: listDir(join(process.cwd(), '.claude', 'skills')),
        thinking: env('MAX_THINKING_TOKENS') ?? 'absent',
        home: safePath(env('HOME')),
        claudeConfigDir: safePath(env('CLAUDE_CONFIG_DIR')),
        askev,
      })}\n`,
    )
  }

  if (sleepMs > 0) await sleep(sleepMs)

  const stderrLine = env('FAKE_STDERR')
  if (stderrLine !== undefined) process.stderr.write(`${stderrLine}\n`)

  const chosen = scenario(name)
  for (const line of chosen.lines) process.stdout.write(`${line}\n`)
  const forced = env('FAKE_EXIT')
  process.exitCode = forced === undefined ? chosen.exit : Number.parseInt(forced, 10)
}

await run()
