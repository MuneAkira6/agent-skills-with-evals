// The rules. Everything a reader of the page could argue about is decided here, from the timeline
// alone, and never from `updated_at` — a planning session moves every leftover at once and makes
// `updated_at` say that nobody's work is old (fact F18, and items #208 and #191 of the scenario).
//
// What counts as **activity** is the short list below and nothing else. Milestone moves, assignments
// and label changes that are not a status label are planning or noise: counting them is exactly how
// an item nobody has touched for three weeks looks fresh.

export type Thresholds = {
  silentDays: number
  staleDays: number
  waitingDecisionDays: number
  reviewDecisionDays: number
  capDays: number
  chronicDays: number
  maxNarrated: number
}

export type Config = {
  repo: string
  timezone: string
  waitingLabels: string[]
  inProgressLabels: string[]
  members: string[]
  thresholds: Thresholds
}

/** A timeline event, in the shape GitHub serves it. */
export type TimelineEvent = {
  event?: string
  created_at?: string
  submitted_at?: string
  committer?: { date?: string }
  label?: { name?: string }
  source?: {
    issue?: { repository?: { full_name?: string }; pull_request?: unknown; number?: number }
  }
  body?: string
  state?: string
}

export type Activity = { kind: string; at: string; comment: string | null }

export const HOUR = 3600 * 1000
export const DAY = 24 * HOUR

/** `floor((now − t) ÷ 24 h)`, the only way this skill counts days. */
export const daysSince = (now: string, then: string): number =>
  Math.floor((Date.parse(now) - Date.parse(then)) / DAY)

/** The date of an instant in a time zone, as `YYYY-MM-DD`. */
export const dateInZone = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))

export const weekdayInZone = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(iso))

/** Whole days from one `YYYY-MM-DD` to another. */
export const dateDifference = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

/** `MM/DD` and `M/D` of a date in a zone, for the page. */
export const monthDay = (iso: string, timeZone: string, padded: boolean): string => {
  const [, month, day] = dateInZone(iso, timeZone).split('-')
  return padded ? `${month}/${day}` : `${Number(month)}/${Number(day)}`
}

/** The events that are activity, and nothing else. */
const ALWAYS_ACTIVITY = [
  'commented',
  'closed',
  'reopened',
  'renamed',
  'referenced',
  'ready_for_review',
  'convert_to_draft',
  'merged',
  'head_ref_force_pushed',
]

/**
 * The time an event happened if it counts as activity, otherwise null. `committed` has no
 * `created_at` and `reviewed` has `submitted_at` (fact F17); a `cross-referenced` counts only from a
 * pull request of the same repository; a `labeled` or `unlabeled` counts only for a status label.
 */
export const activityOf = (event: TimelineEvent, config: Config): Activity | null => {
  const kind = event.event ?? ''
  const statusLabels = [...config.waitingLabels, ...config.inProgressLabels]
  if (kind === 'committed') {
    const at = event.committer?.date
    return at === undefined ? null : { kind, at, comment: null }
  }
  if (kind === 'reviewed') {
    const at = event.submitted_at
    return at === undefined ? null : { kind, at, comment: event.body ?? null }
  }
  if (kind === 'cross-referenced') {
    const issue = event.source?.issue
    const sameRepo = issue?.repository?.full_name === config.repo
    const isPull = issue?.pull_request !== undefined
    if (!sameRepo || !isPull || event.created_at === undefined) return null
    return { kind, at: event.created_at, comment: null }
  }
  if (kind === 'labeled' || kind === 'unlabeled') {
    if (!statusLabels.includes(event.label?.name ?? '')) return null
    return event.created_at === undefined ? null : { kind, at: event.created_at, comment: null }
  }
  if (ALWAYS_ACTIVITY.includes(kind)) {
    return event.created_at === undefined
      ? null
      : { kind, at: event.created_at, comment: kind === 'commented' ? (event.body ?? null) : null }
  }
  // milestoned, demilestoned, assigned, unassigned, review_requested, mentioned, subscribed,
  // any other label, and every event kind not named above: planning or noise, not activity
  return null
}

export type RawItem = {
  number: number
  title: string
  kind: 'issue' | 'pr'
  state: string
  draft: boolean
  assignees: string[]
  labels: string[]
  createdAt: string
  closedAt: string | null
  blockedBy: number
  timeline: TimelineEvent[]
}

/** A pull request the collection fetched because an item is linked to it or is it. */
export type RawPull = {
  number: number
  state: string
  draft: boolean
  createdAt: string
  /** every review, upper-case state, oldest first */
  reviews: { user: string; state: string; submittedAt: string }[]
  /** the latest `ready_for_review` event, when there is one */
  readyForReviewAt: string | null
}

export type Lane = 'silent' | 'waiting' | 'in-progress' | 'stale' | 'quiet'

export const LANE_MARK: Record<Lane, string> = {
  silent: '⏸️',
  waiting: '🔴',
  'in-progress': '🚧',
  stale: '💤',
  quiet: '🙊',
}

export type Trigger = 'carryover' | 'waiting' | 'review' | 'unassigned'

/** The fixed Japanese question of each trigger, in the order the page asks them. */
export const TRIGGER_QUESTION: Record<Trigger, string> = {
  carryover: '今のマイルストーンに入れるか閉じるか',
  waiting: '催促するか外すか',
  review: '誰がいつレビューするか',
  unassigned: '担当を決めるか外すか',
}

/** The phrase the page uses when no narrative says what an item is waiting for. */
export const TRIGGER_PHRASE: Record<Trigger, string> = {
  carryover: '前マイルストーンで終わらなかった',
  waiting: '待ち状態のまま',
  review: 'レビューの結論待ち',
  unassigned: '担当者が決まっていない',
}

export const TRIGGER_ORDER: Trigger[] = ['carryover', 'waiting', 'review', 'unassigned']

export type Item = {
  number: number
  title: string
  kind: 'issue' | 'pr'
  assignees: string[]
  labels: string[]
  createdAt: string
  blockedBy: number
  carryover: boolean
  activities: Activity[]
  latestActivity: Activity | null
  idleDays: number
  waitingDays: number
  reviewDays: number
  /** the pull requests this item is linked to, in number order */
  linkedPulls: number[]
  /** the linked pull requests that are waiting for review */
  waitingPulls: { number: number; days: number }[]
  /** a linked pull request that is an open draft */
  hasOpenDraft: boolean
  lane: Lane
  triggers: Trigger[]
  decision: boolean
  score: number
}

/**
 * A pull request is **approved** when, taking each reviewer's latest review whose state is APPROVED
 * or CHANGES_REQUESTED, at least one is APPROVED and none is CHANGES_REQUESTED. A comment-only
 * review says nothing either way, so it is left out of the reckoning.
 */
export const isApproved = (pull: RawPull): boolean => {
  const latest = new Map<string, string>()
  for (const review of pull.reviews) {
    if (review.state !== 'APPROVED' && review.state !== 'CHANGES_REQUESTED') continue
    latest.set(review.user, review.state)
  }
  const states = [...latest.values()]
  return states.includes('APPROVED') && !states.includes('CHANGES_REQUESTED')
}

/** Open, not a draft and not approved; waiting since its latest `ready_for_review`, or its creation. */
export const waitingForReviewSince = (pull: RawPull): string | null => {
  if (pull.state !== 'open' || pull.draft || isApproved(pull)) return null
  return pull.readyForReviewAt ?? pull.createdAt
}

export const laneOf = (
  item: {
    idleDays: number
    labels: string[]
    waitingPulls: { number: number }[]
    hasOpenDraft: boolean
  },
  config: Config,
): Lane => {
  if (item.idleDays >= config.thresholds.silentDays) return 'silent'
  const waitingLabel = item.labels.some((name) => config.waitingLabels.includes(name))
  if (waitingLabel || item.waitingPulls.length > 0) return 'waiting'
  const inProgressLabel = item.labels.some((name) => config.inProgressLabels.includes(name))
  if (inProgressLabel || item.hasOpenDraft) return 'in-progress'
  if (item.idleDays >= config.thresholds.staleDays) return 'stale'
  return 'quiet'
}

/**
 * The triggers of an item. A **silent** item has none at all: SCOPE.md says "for an item that is not
 * silent, a trigger fires when…", and the expected outcome shows it — #191 is a carry-over item and
 * its Triggers cell is empty, because fourteen days of silence take it out of the decisions
 * altogether and leave it as a number on the ⏸️ line.
 */
export const triggersOf = (
  item: {
    carryover: boolean
    waitingDays: number
    reviewDays: number
    assignees: string[]
    lane: Lane
  },
  config: Config,
): Trigger[] => {
  if (item.lane === 'silent') return []
  const found: Trigger[] = []
  if (item.carryover) found.push('carryover')
  if (item.waitingDays >= config.thresholds.waitingDecisionDays) found.push('waiting')
  if (item.reviewDays >= config.thresholds.reviewDecisionDays) found.push('review')
  if (item.assignees.length === 0) found.push('unassigned')
  return TRIGGER_ORDER.filter((trigger) => found.includes(trigger))
}

/**
 * The ranking score. The same stall is not counted twice — the waiting days and the review days give
 * the larger of the two, not their sum, which is the defect the author's own evaluation found — and a
 * chronic item is discounted, because the stand-up has had many chances at it already.
 */
export const scoreOf = (
  item: {
    waitingDays: number
    reviewDays: number
    idleDays: number
    blockedBy: number
    waitingPulls: { number: number }[]
  },
  config: Config,
  options: { chronicDiscount?: boolean; sumInsteadOfMax?: boolean } = {},
): number => {
  const cap = config.thresholds.capDays
  const waiting = 3 * Math.min(item.waitingDays, cap)
  const review = 2 * Math.min(item.reviewDays, cap)
  let age = options.sumInsteadOfMax === true ? waiting + review : Math.max(waiting, review)
  if (
    options.chronicDiscount !== false &&
    Math.max(item.waitingDays, item.reviewDays) >= config.thresholds.chronicDays
  ) {
    age = age * 0.5
  }
  const score =
    age +
    (item.waitingPulls.length > 0 ? 5 : 0) +
    (item.blockedBy > 0 ? 2 : 0) +
    Math.min(item.idleDays, cap) / 5
  // one decimal is all the inputs can carry
  return Math.round(score * 10) / 10
}

/** An item is a decision when a trigger fires and somebody at the stand-up can decide it. */
export const isDecision = (
  item: { triggers: Trigger[]; assignees: string[]; lane: Lane },
  config: Config,
): boolean => {
  if (item.lane === 'silent') return false
  if (item.triggers.length === 0) return false
  if (item.assignees.length === 0) return true
  return item.assignees.some((login) => config.members.includes(login))
}

/** Descending score, ties by older creation, then by lower number. */
export const decisionOrder = (a: Item, b: Item): number => {
  if (a.score !== b.score) return b.score - a.score
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.number - b.number
}

export type BuildInput = {
  now: string
  config: Config
  items: RawItem[]
  carryoverNumbers: number[]
  pulls: Map<number, RawPull>
}

/** Everything the rules decide about one open item. */
export const buildItem = (raw: RawItem, input: BuildInput): Item => {
  const { now, config } = input
  const activities: Activity[] = [{ kind: 'created', at: raw.createdAt, comment: null }]
  for (const event of raw.timeline) {
    const activity = activityOf(event, config)
    if (activity !== null) activities.push(activity)
  }
  activities.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const latestActivity = activities.at(-1) ?? null
  const idleDays = latestActivity === null ? 0 : daysSince(now, latestActivity.at)

  // an item that is a pull request is linked to itself; otherwise its qualifying cross-references
  const linked = new Set<number>()
  if (raw.kind === 'pr') linked.add(raw.number)
  for (const event of raw.timeline) {
    if (event.event !== 'cross-referenced') continue
    if (activityOf(event, config) === null) continue
    const number = event.source?.issue?.number
    if (number !== undefined) linked.add(number)
  }
  const linkedPulls = [...linked].sort((a, b) => a - b)

  const waitingPulls: { number: number; days: number }[] = []
  let hasOpenDraft = false
  for (const number of linkedPulls) {
    const pull = input.pulls.get(number)
    if (pull === undefined) continue
    if (pull.state === 'open' && pull.draft) hasOpenDraft = true
    const since = waitingForReviewSince(pull)
    if (since !== null) waitingPulls.push({ number, days: daysSince(now, since) })
  }
  const reviewDays = waitingPulls.reduce((worst, pull) => Math.max(worst, pull.days), 0)

  // the waiting days count from the latest `labeled` for a waiting label the item still carries
  let waitingDays = 0
  const carriesWaiting = raw.labels.some((name) => config.waitingLabels.includes(name))
  if (carriesWaiting) {
    const labelled = raw.timeline
      .filter(
        (event) =>
          event.event === 'labeled' &&
          config.waitingLabels.includes(event.label?.name ?? '') &&
          raw.labels.includes(event.label?.name ?? '') &&
          event.created_at !== undefined,
      )
      .map((event) => event.created_at ?? '')
      .sort()
    waitingDays = daysSince(now, labelled.at(-1) ?? raw.createdAt)
  }

  const core = {
    idleDays,
    labels: raw.labels,
    waitingPulls,
    hasOpenDraft,
    waitingDays,
    reviewDays,
    blockedBy: raw.blockedBy,
    assignees: raw.assignees,
    carryover: input.carryoverNumbers.includes(raw.number),
  }
  const lane = laneOf(core, config)
  const triggers = triggersOf({ ...core, lane }, config)
  const decision = isDecision({ triggers, assignees: raw.assignees, lane }, config)
  return {
    number: raw.number,
    title: raw.title,
    kind: raw.kind,
    assignees: raw.assignees,
    labels: raw.labels,
    createdAt: raw.createdAt,
    blockedBy: raw.blockedBy,
    carryover: core.carryover,
    activities,
    latestActivity,
    idleDays,
    waitingDays,
    reviewDays,
    linkedPulls,
    waitingPulls,
    hasOpenDraft,
    lane,
    triggers,
    decision,
    score: scoreOf(core, config),
  }
}
