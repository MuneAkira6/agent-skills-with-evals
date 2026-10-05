// The three flags of SCOPE.md. A flag is something a reader must explain, not proof of a breach:
// an arm that printed `/usr/bin/env` in a command is flagged as naming a path outside its sandbox,
// and that explanation belongs in the results.

import type { ToolCall } from './transcript.ts'

// the whole URL, host captured: the path must be consumed too, or it is scanned as a bare path
const URL_IN_TEXT = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/([^\s/"'<>)\\]+)[^\s"'<>)\\]*/g
// a path must start where a path can start: `.claude/skills/x` is relative and is not a match
const ABSOLUTE_PATH = /(?<![A-Za-z0-9._~-])\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+/g
const LOCAL_HOSTS = ['127.0.0.1', 'localhost']

export type ContaminationInput = {
  toolCalls: ToolCall[]
  finalReply: string
  /** the arm's own temporary directory: every path it names should start here */
  tmp: string
  arm: 'with' | 'without'
  skill: string
}

export const contaminationFlags = (input: ContaminationInput): string[] => {
  const flags: string[] = []
  const seen = new Set<string>()
  const add = (flag: string): void => {
    if (seen.has(flag)) return
    seen.add(flag)
    flags.push(flag)
  }

  for (const call of input.toolCalls) {
    const withoutUrls = call.input.replace(URL_IN_TEXT, ' ')
    for (const match of withoutUrls.matchAll(ABSOLUTE_PATH)) {
      const path = match[0]
      if (path.startsWith(input.tmp)) continue
      add(`${call.name} names a path outside the sandbox: ${path}`)
    }
    for (const match of call.input.matchAll(URL_IN_TEXT)) {
      const host = match[1].split(':')[0]
      if (LOCAL_HOSTS.includes(host)) continue
      add(`${call.name} reaches a host that is not local: ${host}`)
    }
  }

  if (input.arm === 'without') {
    const needle = `skills/${input.skill}`
    const haystack = [...input.toolCalls.map((c) => `${c.name} ${c.input}`), input.finalReply]
    for (const text of haystack) {
      if (text.includes(needle)) {
        add(`the without arm mentions the skill directory: ${needle}`)
        break
      }
    }
  }
  return flags
}
