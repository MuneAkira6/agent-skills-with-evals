// The stream parser for `claude -p --output-format stream-json --verbose`.
//
// Why it exists: the exit code and the result's `subtype` both lie. A run that used any tool under
// `--max-turns 1` exits 1 with `subtype: "error_max_turns"` and is a perfectly valid measurement
// (F7); a run with no credentials exits 1 with `subtype: "success"` and is no measurement at all
// (F8). A harness that trusts either counts a broken instrument as "the skill did not fire" — the
// failure this probe was written to end.
//
// Lines that start with `{` are events; anything else is counted and ignored.

export type BrokenReason =
  | 'spawn-error'
  | 'timeout'
  | 'no-init'
  | 'no-result'
  | 'auth'
  | 'not-loaded'

export type RunStatus = 'triggered' | 'not-triggered' | 'broken'

export type Usage = {
  inputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  outputTokens: number
  thinkingTokens: number
}

export type ParsedRun = {
  status: RunStatus
  /** the reason when status is `broken`, null otherwise */
  reason: BrokenReason | null
  /** every skill name a `Skill` tool_use invoked, in order (a plugin's skill keeps its prefix) */
  fired: string[]
  /** the SKILL.md paths a `Read` tool_use opened, in order */
  readSkillMd: string[]
  model: string | null
  claudeCodeVersion: string | null
  /** the init event's skill list, empty when there was no init event */
  skills: string[]
  resultSubtype: string | null
  terminalReason: string | null
  isError: boolean | null
  numTurns: number | null
  durationMs: number | null
  totalCostUsd: number | null
  usage: Usage | null
  /** lines that were not JSON events */
  nonJsonLines: number
  events: number
}

export type ParseInput = {
  stdout: string
  /** the name of the skill under test */
  skillName: string
  /** a message when the process could not be started at all */
  spawnError?: string | null
  timedOut?: boolean
  /**
   * Whether a skill missing from the init event's list is `not-loaded`. True by default: that check
   * belongs to the probe, which installs the skill itself (F7). The A/B runner passes false — its
   * `without` arm has no skill installed on purpose, and that is the measurement, not a breakage.
   */
  checkLoaded?: boolean
}

type Event = Record<string, unknown>

const asRecord = (value: unknown): Event | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Event) : null

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const asNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null)

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** `name` itself, or a plugin's `<plugin>:<name>`. */
const namesSkill = (value: string, skillName: string): boolean =>
  value === skillName || value.endsWith(`:${skillName}`)

/** A Read of `…/<name>/SKILL.md`, with a Windows path read as a POSIX one (F13). */
const readsSkillMd = (filePath: string, skillName: string): boolean =>
  filePath.replace(/\\/g, '/').endsWith(`/${skillName}/SKILL.md`)

const readUsage = (usage: Event | null): Usage | null => {
  if (usage === null) return null
  const details = asRecord(usage.output_tokens_details)
  return {
    inputTokens: asNumber(usage.input_tokens) ?? 0,
    cacheCreationInputTokens: asNumber(usage.cache_creation_input_tokens) ?? 0,
    cacheReadInputTokens: asNumber(usage.cache_read_input_tokens) ?? 0,
    outputTokens: asNumber(usage.output_tokens) ?? 0,
    thinkingTokens: asNumber(details?.thinking_tokens) ?? 0,
  }
}

export const parseStream = (input: ParseInput): ParsedRun => {
  const run: ParsedRun = {
    status: 'not-triggered',
    reason: null,
    fired: [],
    readSkillMd: [],
    model: null,
    claudeCodeVersion: null,
    skills: [],
    resultSubtype: null,
    terminalReason: null,
    isError: null,
    numTurns: null,
    durationMs: null,
    totalCostUsd: null,
    usage: null,
    nonJsonLines: 0,
    events: 0,
  }

  let sawInit = false
  let sawResult = false
  let authError: string | null = null
  let triggered = false

  for (const raw of input.stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    if (!line.startsWith('{')) {
      run.nonJsonLines += 1
      continue
    }
    let event: Event | null
    try {
      event = asRecord(JSON.parse(line))
    } catch {
      run.nonJsonLines += 1
      continue
    }
    if (event === null) {
      run.nonJsonLines += 1
      continue
    }
    run.events += 1
    const type = asString(event.type)

    // Only subtype "init" is the init event: a session also emits system/thinking_tokens events,
    // eight of them in fixtures/streams/host-cli-2.1.233/sibling.jsonl.
    if (type === 'system' && asString(event.subtype) === 'init') {
      sawInit = true
      run.model = asString(event.model)
      run.claudeCodeVersion = asString(event.claude_code_version)
      run.skills = asArray(event.skills).filter((s): s is string => typeof s === 'string')
      continue
    }

    if (type === 'assistant') {
      const error = asString(event.error)
      if (error !== null && error !== '') authError = error
      const message = asRecord(event.message)
      for (const part of asArray(message?.content)) {
        const block = asRecord(part)
        if (block === null || asString(block.type) !== 'tool_use') continue
        const toolName = asString(block.name)
        const toolInput = asRecord(block.input)
        if (toolName === 'Skill') {
          const skill = asString(toolInput?.skill)
          if (skill !== null) {
            run.fired.push(skill)
            if (namesSkill(skill, input.skillName)) triggered = true
          }
        } else if (toolName === 'Read') {
          const filePath = asString(toolInput?.file_path)
          if (filePath !== null && /\/SKILL\.md$/.test(filePath.replace(/\\/g, '/'))) {
            run.readSkillMd.push(filePath)
            if (readsSkillMd(filePath, input.skillName)) triggered = true
          }
        }
      }
      continue
    }

    if (type === 'result') {
      sawResult = true
      run.resultSubtype = asString(event.subtype)
      run.terminalReason = asString(event.terminal_reason)
      run.isError = typeof event.is_error === 'boolean' ? event.is_error : null
      run.numTurns = asNumber(event.num_turns)
      run.durationMs = asNumber(event.duration_ms)
      run.totalCostUsd = asNumber(event.total_cost_usd)
      run.usage = readUsage(asRecord(event.usage))
    }
  }

  // The order of SCOPE.md, which decides every collision: a stream that is both
  // authentication-failed and missing its skill from the init list is `auth`, not `not-loaded`.
  const broken = (reason: BrokenReason): ParsedRun => {
    run.status = 'broken'
    run.reason = reason
    return run
  }
  if (input.spawnError !== undefined && input.spawnError !== null && input.spawnError !== '') {
    return broken('spawn-error')
  }
  if (input.timedOut === true) return broken('timeout')
  if (!sawInit) return broken('no-init')
  if (!sawResult) return broken('no-result')
  if (authError !== null) return broken('auth')
  if (run.terminalReason === 'api_error') return broken('auth')
  if (input.checkLoaded !== false && !run.skills.some((s) => namesSkill(s, input.skillName))) {
    return broken('not-loaded')
  }

  run.status = triggered ? 'triggered' : 'not-triggered'
  return run
}
