// The facts: everything the rules decided, in one object that is written as `facts.json` and hashed.
//
// Nothing in here moves but `now` and the request count. No duration, no cost, no timestamp of its
// own — two runs on the same input must give the same bytes, and the page's footer carries the first
// eight hex of this file's sha256, so one stray clock reading would poison both.

import type { Collected, Comment, Milestone } from './collect.ts'
import type { Activity, Config, Item, Lane, RawItem, Trigger } from './rules.ts'
import {
  buildItem,
  dateDifference,
  dateInZone,
  decisionOrder,
  monthDay,
  weekdayInZone,
} from './rules.ts'

export type ItemFacts = {
  number: number
  title: string
  kind: 'issue' | 'pr'
  assignees: string[]
  labels: string[]
  createdAt: string
  carryover: boolean
  idleDays: number
  waitingDays: number
  reviewDays: number
  blockedBy: number
  linkedPulls: number[]
  waitingPulls: { number: number; days: number }[]
  lane: Lane
  triggers: Trigger[]
  decision: boolean
  /** the ranking score; it only orders the decisions, and the contract leaves it open elsewhere */
  score: number
  latestActivity: Activity | null
}

export type Facts = {
  now: string
  today: string
  timezone: string
  repo: string
  /** the number of HTTP requests the collection made */
  requests: number
  milestone: {
    number: number
    title: string
    dueOn: string | null
    dueDate: string | null
    daysLeft: number | null
    open: number
    all: number
  }
  previousMilestone: { number: number; title: string } | null
  carryover: number[]
  /** the window "since yesterday": 24 hours, or 72 on a Monday */
  since: { hours: number; from: string; weekday: string }
  items: ItemFacts[]
  closedSinceYesterday: number[]
  createdSinceYesterday: number[]
  hygiene: { unassigned: number[]; labelConflict: number[] }
  /** the decisions, in the order the page lists them */
  decisions: number[]
}

/**
 * The feedback comments travel beside the facts and are deliberately **not** part of them:
 * SCOPE.md says that with `--feedback-issue` "the facts do not change", and the comment window
 * moves with `now` while the facts must not.
 */
export type Feedback = { author: string; date: string; body: string }

const milestoneCounts = (items: RawItem[]): { open: number; all: number } => ({
  open: items.filter((item) => item.state === 'open').length,
  all: items.length,
})

const dueDateOf = (milestone: Milestone, config: Config): string | null =>
  milestone.due_on === null ? null : dateInZone(milestone.due_on, config.timezone)

export const buildFacts = (
  collected: Collected,
  config: Config,
  now: string,
): { facts: Facts; items: Item[]; feedback: Feedback[] } => {
  const today = dateInZone(now, config.timezone)
  const weekday = weekdayInZone(now, config.timezone)
  // 72 hours on a Monday, so that Friday's work is still "since yesterday"
  const hours = weekday === 'Monday' ? 72 : 24
  const from = new Date(Date.parse(now) - hours * 3600 * 1000).toISOString()

  const carryoverNumbers = collected.carryover.map((item) => item.number)
  const openRaw = [...collected.items, ...collected.carryover]
    .filter((item) => item.state === 'open')
    .sort((a, b) => a.number - b.number)
  const items = openRaw.map((raw) =>
    buildItem(raw, { now, config, items: openRaw, carryoverNumbers, pulls: collected.pulls }),
  )

  const closedSinceYesterday = collected.items
    .filter((item) => item.closedAt !== null && item.closedAt >= from && item.closedAt <= now)
    .map((item) => item.number)
    .sort((a, b) => a - b)
  const createdSinceYesterday = [...collected.items, ...collected.carryover]
    .filter((item) => item.createdAt >= from && item.createdAt <= now)
    .map((item) => item.number)
    .sort((a, b) => a - b)

  const hygiene = {
    unassigned: items.filter((item) => item.assignees.length === 0).map((item) => item.number),
    labelConflict: items
      .filter(
        (item) =>
          item.labels.some((name) => config.waitingLabels.includes(name)) &&
          item.labels.some((name) => config.inProgressLabels.includes(name)),
      )
      .map((item) => item.number),
  }

  const decisions = items
    .filter((item) => item.decision)
    .sort(decisionOrder)
    .map((item) => item.number)

  const dueDate = dueDateOf(collected.current, config)
  const counts = milestoneCounts(collected.items)

  const facts: Facts = {
    now,
    today,
    timezone: config.timezone,
    repo: config.repo,
    requests: collected.requests,
    milestone: {
      number: collected.current.number,
      title: collected.current.title,
      dueOn: collected.current.due_on,
      dueDate,
      daysLeft: dueDate === null ? null : dateDifference(today, dueDate),
      open: counts.open,
      all: counts.all,
    },
    previousMilestone:
      collected.previous === null
        ? null
        : { number: collected.previous.number, title: collected.previous.title },
    carryover: [...carryoverNumbers].sort((a, b) => a - b),
    since: { hours, from, weekday },
    items: items.map((item) => ({
      number: item.number,
      title: item.title,
      kind: item.kind,
      assignees: item.assignees,
      labels: item.labels,
      createdAt: item.createdAt,
      carryover: item.carryover,
      idleDays: item.idleDays,
      waitingDays: item.waitingDays,
      reviewDays: item.reviewDays,
      blockedBy: item.blockedBy,
      linkedPulls: item.linkedPulls,
      waitingPulls: item.waitingPulls,
      lane: item.lane,
      triggers: item.triggers,
      decision: item.decision,
      score: item.score,
      latestActivity: item.latestActivity,
    })),
    closedSinceYesterday,
    createdSinceYesterday,
    hygiene,
    decisions,
  }
  const feedback = collected.feedback.map((comment: Comment) => ({
    author: comment.user,
    date: monthDay(comment.createdAt, config.timezone, true),
    body: comment.body,
  }))
  return { facts, items, feedback }
}

/** `facts.json`'s bytes: two spaces and a trailing newline, so the file is readable and stable. */
export const factsJson = (facts: Facts): string => `${JSON.stringify(facts, null, 2)}\n`
