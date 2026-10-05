// The guard. The table is the product; the model's sentences are a courtesy, and a courtesy that
// cannot be checked is dropped. Every rule here exists because a generated sentence once carried
// something it had no business carrying: a number nobody could find, a link, somebody's handle.
//
// A rejected narrative is not patched. It is rejected with every reason listed, the call is retried
// once, and then the page goes out with the machine's own phrases — which is why the page never
// depends on this working.

export type Narrative = {
  decisions: { number: number; stuck_on?: string; decision_needed?: string }[]
  one_liners: { number: number; text: string }[]
  notes: string[]
}

export type GuardContext = {
  /** the decisions the rules chose; a narrative may speak about these and no others */
  decisionNumbers: number[]
  /** the items in the table's part of the narration input */
  tableNumbers: number[]
  /** every number that occurs anywhere in narrate-input.json */
  knownNumbers: number[]
}

export type GuardResult =
  | { accepted: true; narrative: Narrative; dropped: string[] }
  | { accepted: false; reasons: string[] }

export const LIMITS = {
  stuckOn: 80,
  decisionNeeded: 50,
  oneLiner: 60,
  notes: 3,
  note: 120,
}

/** Written as character classes: no literal token prefix may exist anywhere in this repository. */
const FORBIDDEN: { pattern: RegExp; name: string }[] = [
  { pattern: /http:\/\//i, name: '"http://"' },
  { pattern: /https:\/\//i, name: '"https://"' },
  { pattern: /www\./i, name: '"www."' },
  { pattern: /(^|\s)@[A-Za-z0-9][A-Za-z0-9-]*/, name: 'an @ mention' },
  { pattern: /sk-an[t]-/i, name: 'an Anthropic-style key' },
  { pattern: /gh[pousr]_/i, name: 'a GitHub-style token' },
  { pattern: /github_pa[t]_/i, name: 'a fine-grained GitHub token' },
  { pattern: /password/i, name: '"password"' },
  { pattern: /パスワード/, name: '"パスワード"' },
]

/** The outermost `{…}` of a text, with a fenced block unwrapped. */
export const extractJson = (text: string): string | null => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced === null ? text : fenced[1]
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  return body.slice(start, end + 1)
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

const lengthOf = (text: string): number => [...text].length

export const guard = (text: string, context: GuardContext): GuardResult => {
  const reasons: string[] = []
  const dropped: string[] = []

  const json = extractJson(text)
  if (json === null) return { accepted: false, reasons: ['no JSON object in the answer'] }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(json) as Record<string, unknown>
  } catch (err) {
    return { accepted: false, reasons: [`the JSON does not parse: ${(err as Error).message}`] }
  }

  const rawDecisions = Array.isArray(parsed.decisions) ? parsed.decisions : []
  const rawOneLiners = Array.isArray(parsed.one_liners) ? parsed.one_liners : []
  const rawNotes = Array.isArray(parsed.notes) ? parsed.notes : []

  // every string the narrative offers, for the rules that apply anywhere
  const everyString: string[] = []
  const decisions: Narrative['decisions'] = []
  const seen = new Set<number>()

  for (const entry of rawDecisions) {
    const record = (entry ?? {}) as Record<string, unknown>
    const number = typeof record.number === 'number' ? record.number : Number.NaN
    if (!Number.isFinite(number)) {
      reasons.push('a decision entry has no number')
      continue
    }
    if (!context.decisionNumbers.includes(number)) {
      reasons.push(`#${number} is not one of the decisions the rules chose`)
      continue
    }
    if (seen.has(number)) {
      reasons.push(`#${number} appears twice among the decisions`)
      continue
    }
    seen.add(number)
    const stuckOn = asString(record.stuck_on)
    const needed = asString(record.decision_needed)
    if (lengthOf(stuckOn) > LIMITS.stuckOn) {
      reasons.push(
        `stuck_on of #${number} is ${lengthOf(stuckOn)} characters (limit ${LIMITS.stuckOn})`,
      )
    }
    if (lengthOf(needed) > LIMITS.decisionNeeded) {
      reasons.push(
        `decision_needed of #${number} is ${lengthOf(needed)} characters (limit ${LIMITS.decisionNeeded})`,
      )
    }
    everyString.push(stuckOn, needed)
    // a missing or empty field is dropped, not rejected: the page fills it from the triggers
    if (stuckOn.trim() === '' || needed.trim() === '') {
      dropped.push(
        `#${number}: ${stuckOn.trim() === '' ? 'stuck_on' : ''}${stuckOn.trim() === '' && needed.trim() === '' ? ' and ' : ''}${needed.trim() === '' ? 'decision_needed' : ''} was empty`,
      )
    }
    decisions.push({
      number,
      ...(stuckOn.trim() === '' ? {} : { stuck_on: stuckOn }),
      ...(needed.trim() === '' ? {} : { decision_needed: needed }),
    })
  }

  const oneLiners: Narrative['one_liners'] = []
  for (const entry of rawOneLiners) {
    const record = (entry ?? {}) as Record<string, unknown>
    const number = typeof record.number === 'number' ? record.number : Number.NaN
    const value = asString(record.text)
    if (!Number.isFinite(number) || !context.tableNumbers.includes(number)) {
      reasons.push(
        `a one-liner for #${Number.isFinite(number) ? number : '?'}, which is not in the table`,
      )
      continue
    }
    if (lengthOf(value) > LIMITS.oneLiner) {
      reasons.push(
        `the one-liner of #${number} is ${lengthOf(value)} characters (limit ${LIMITS.oneLiner})`,
      )
    }
    everyString.push(value)
    oneLiners.push({ number, text: value })
  }

  const notes: string[] = []
  if (rawNotes.length > LIMITS.notes) {
    reasons.push(`${rawNotes.length} notes (limit ${LIMITS.notes})`)
  }
  for (const [index, entry] of rawNotes.entries()) {
    const value = asString(entry)
    if (lengthOf(value) > LIMITS.note) {
      reasons.push(`note ${index + 1} is ${lengthOf(value)} characters (limit ${LIMITS.note})`)
    }
    everyString.push(value)
    notes.push(value)
  }

  for (const value of everyString) {
    for (const match of value.matchAll(/#(\d+)/g)) {
      const number = Number(match[1])
      if (!context.knownNumbers.includes(number)) {
        reasons.push(`#${number} does not occur in narrate-input.json`)
      }
    }
    for (const forbidden of FORBIDDEN) {
      if (forbidden.pattern.test(value)) {
        reasons.push(`${forbidden.name} is not allowed: ${value.slice(0, 60)}`)
      }
    }
  }

  if (reasons.length > 0) {
    // every reason, once, in the order they were found
    return { accepted: false, reasons: [...new Set(reasons)] }
  }
  return { accepted: true, narrative: { decisions, one_liners: oneLiners, notes }, dropped }
}
