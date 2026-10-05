// Every expectation here is written from the expected-outcome table of SCOPE.md, which the author
// computed independently of any implementation (fact F20). Where the code and the table disagree,
// the code is wrong.

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { RawPull, TimelineEvent } from '../skills/standup-digest/scripts/rules.ts'
import {
  activityOf,
  isApproved,
  scoreOf,
  waitingForReviewSince,
} from '../skills/standup-digest/scripts/rules.ts'
import { CONFIG, gather, NOW } from './support/digest.ts'

/** The expected outcome, row for row, as SCOPE.md gives it. */
const EXPECTED: Record<
  number,
  {
    idle: number
    waiting: number
    review: number
    lane: string
    triggers: string[]
    decision: boolean
  }
> = {
  190: { idle: 2, waiting: 0, review: 0, lane: 'quiet', triggers: ['carryover'], decision: true },
  191: { idle: 22, waiting: 0, review: 0, lane: 'silent', triggers: [], decision: false },
  201: { idle: 2, waiting: 0, review: 3, lane: 'waiting', triggers: ['review'], decision: true },
  202: { idle: 3, waiting: 7, review: 0, lane: 'waiting', triggers: ['waiting'], decision: true },
  203: { idle: 1, waiting: 0, review: 0, lane: 'in-progress', triggers: [], decision: false },
  204: { idle: 2, waiting: 0, review: 0, lane: 'quiet', triggers: ['unassigned'], decision: true },
  205: { idle: 4, waiting: 71, review: 0, lane: 'waiting', triggers: ['waiting'], decision: true },
  206: { idle: 2, waiting: 20, review: 0, lane: 'waiting', triggers: ['waiting'], decision: true },
  207: { idle: 1, waiting: 14, review: 0, lane: 'waiting', triggers: ['waiting'], decision: false },
  208: { idle: 24, waiting: 0, review: 0, lane: 'silent', triggers: [], decision: false },
  209: { idle: 6, waiting: 0, review: 0, lane: 'stale', triggers: [], decision: false },
  210: { idle: 0, waiting: 0, review: 0, lane: 'quiet', triggers: [], decision: false },
  211: { idle: 2, waiting: 0, review: 5, lane: 'waiting', triggers: ['review'], decision: true },
  212: { idle: 0, waiting: 0, review: 0, lane: 'quiet', triggers: [], decision: false },
  215: { idle: 1, waiting: 1, review: 0, lane: 'waiting', triggers: [], decision: false },
}

const DECISIONS: [number, number][] = [
  [206, 60.4],
  [205, 45.8],
  [202, 23.6],
  [211, 15.4],
  [201, 11.4],
  [190, 0.4],
  [204, 0.4],
]

describe('the collection on the scenario', () => {
  it('makes exactly 26 requests, and they are the ones SCOPE.md lists', async () => {
    const { api, collected } = await gather()
    expect(collected.requests).toBe(26)
    const paths = api.log().map((entry) => entry.path)
    expect(paths).toHaveLength(26)
    expect(paths.filter((path) => path.endsWith('/milestones'))).toHaveLength(1)
    expect(paths.filter((path) => path.endsWith('/issues'))).toHaveLength(2)
    const timelines = paths.filter((path) => path.endsWith('/timeline'))
    expect(timelines).toHaveLength(17)
    // the 15 open items, then the two linked pull requests that are not items
    expect(
      timelines
        .map((path) => Number(/\/issues\/(\d+)\/timeline$/.exec(path)?.[1]))
        .sort((a, b) => a - b),
    ).toEqual([190, 191, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 215, 221, 223])
    expect(
      paths
        .filter((path) => path.endsWith('/reviews'))
        .map((path) => Number(/\/pulls\/(\d+)\/reviews$/.exec(path)?.[1])),
    ).toEqual([210, 211, 221, 223])
    expect(
      paths
        .filter((path) => /\/pulls\/\d+$/.test(path))
        .map((path) => Number(/\/pulls\/(\d+)$/.exec(path)?.[1])),
    ).toEqual([221, 223])
    // every request is a GET
    expect(api.log().every((entry) => entry.method === 'GET')).toBe(true)
  })

  it('chooses milestone 13 as current and 12 as previous, and never tracks #192 or #230', async () => {
    const { collected, facts } = await gather()
    expect(collected.current.number).toBe(13)
    expect(collected.current.title).toBe('Sprint 13')
    expect(collected.previous?.number).toBe(12)
    expect(collected.previous?.title).toBe('Sprint 12')
    expect(facts.milestone.all).toBe(15)
    expect(facts.milestone.open).toBe(13)
    expect(facts.carryover).toEqual([190, 191])
    expect(facts.milestone.daysLeft).toBe(4)
    expect(facts.today).toBe('2026-10-05')
    const tracked = facts.items.map((item) => item.number)
    // #192 and #230 are in Sprint 14, #300 is the feedback issue: none of them is ever tracked
    expect(tracked).not.toContain(192)
    expect(tracked).not.toContain(230)
    expect(tracked).not.toContain(300)
    expect(tracked).toEqual([
      190, 191, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 215,
    ])
  })

  it('follows every page through Link with maxPerPage 3 and gets the same facts', async () => {
    const big = await gather()
    const small = await gather({ mock: { maxPerPage: 3 } })
    // more HTTP requests, the same facts
    expect(small.collected.requests).toBeGreaterThan(big.collected.requests)
    const strip = (json: string): string => json.replace(/"requests": \d+/, '"requests": <n>')
    const sha = (text: string): string => createHash('sha256').update(text).digest('hex')
    expect(sha(strip(small.json))).toBe(sha(strip(big.json)))
    expect(small.facts.items).toEqual(big.facts.items)
    expect(small.facts.decisions).toEqual(big.facts.decisions)
  })
})

describe('activity: what counts and what does not', () => {
  it('the idle days of the 15 open items are the ones of the expected outcome', async () => {
    const { facts } = await gather()
    const idle = Object.fromEntries(facts.items.map((item) => [item.number, item.idleDays]))
    expect(idle).toEqual(
      Object.fromEntries(Object.entries(EXPECTED).map(([number, row]) => [number, row.idle])),
    )
  })

  it('#208 and #191 are silent although their updated_at is recent (F18)', async () => {
    const { facts, api } = await gather()
    const silent = facts.items.filter((item) => item.lane === 'silent').map((item) => item.number)
    expect(silent).toEqual([191, 208])
    expect(facts.items.find((item) => item.number === 208)?.idleDays).toBe(24)
    expect(facts.items.find((item) => item.number === 191)?.idleDays).toBe(22)
    // the collection never asked for anything that would let it read updated_at as activity
    expect(api.log().some((entry) => entry.path.includes('updated'))).toBe(false)
  })

  it('a committed event is read from committer.date and a reviewed one from submitted_at', () => {
    expect(
      activityOf({ event: 'committed', committer: { date: '2026-10-03T02:50:00Z' } }, CONFIG),
    ).toEqual({ kind: 'committed', at: '2026-10-03T02:50:00Z', comment: null })
    expect(
      activityOf({ event: 'reviewed', submitted_at: '2026-10-04T01:00:00Z', body: 'ok' }, CONFIG),
    ).toEqual({ kind: 'reviewed', at: '2026-10-04T01:00:00Z', comment: 'ok' })
    // a commit with no committer date cannot be dated, so it is no activity
    expect(activityOf({ event: 'committed' }, CONFIG)).toBeNull()
  })

  it('each of the ten non-activity kinds is refused on its own', () => {
    const at = '2026-10-04T00:00:00Z'
    const refused: [string, TimelineEvent][] = [
      ['milestoned', { event: 'milestoned', created_at: at, body: undefined }],
      ['demilestoned', { event: 'demilestoned', created_at: at }],
      ['assigned', { event: 'assigned', created_at: at }],
      ['unassigned', { event: 'unassigned', created_at: at }],
      ['review_requested', { event: 'review_requested', created_at: at }],
      ['mentioned', { event: 'mentioned', created_at: at }],
      ['subscribed', { event: 'subscribed', created_at: at }],
      [
        'a label that is no status label',
        { event: 'labeled', created_at: at, label: { name: 'bug' } },
      ],
      [
        'a cross-reference from an issue',
        {
          event: 'cross-referenced',
          created_at: at,
          source: { issue: { number: 230, repository: { full_name: 'acme/tasks' } } },
        },
      ],
      [
        'a cross-reference from a pull request of another repository',
        {
          event: 'cross-referenced',
          created_at: at,
          source: {
            issue: {
              number: 1307,
              repository: { full_name: 'other/repo' },
              pull_request: { url: 'x' },
            },
          },
        },
      ],
    ]
    for (const [name, event] of refused) {
      expect(activityOf(event, CONFIG), name).toBeNull()
    }
    // and the two labelled cases that do count
    expect(
      activityOf({ event: 'labeled', created_at: at, label: { name: 'status: waiting' } }, CONFIG),
    ).not.toBeNull()
    expect(
      activityOf(
        { event: 'unlabeled', created_at: at, label: { name: 'status: in progress' } },
        CONFIG,
      ),
    ).not.toBeNull()
    // and a cross-reference from a pull request of the same repository
    expect(
      activityOf(
        {
          event: 'cross-referenced',
          created_at: at,
          source: {
            issue: {
              number: 221,
              repository: { full_name: 'acme/tasks' },
              pull_request: { url: 'x' },
            },
          },
        },
        CONFIG,
      ),
    ).not.toBeNull()
  })
})

describe('lanes and triggers', () => {
  it('the lane and the triggers of each of the 15 open items are the expected ones', async () => {
    const { facts } = await gather()
    for (const item of facts.items) {
      const row = EXPECTED[item.number]
      expect(item.lane, `#${item.number} lane`).toBe(row.lane)
      expect(item.triggers, `#${item.number} triggers`).toEqual(row.triggers)
      expect(item.waitingDays, `#${item.number} waiting`).toBe(row.waiting)
      expect(item.reviewDays, `#${item.number} review`).toBe(row.review)
      expect(item.decision, `#${item.number} decision`).toBe(row.decision)
    }
  })

  it('#207 has a waiting trigger and is still not a decision, by the member rule', async () => {
    const { facts } = await gather()
    const item = facts.items.find((entry) => entry.number === 207)
    expect(item?.triggers).toEqual(['waiting'])
    expect(item?.waitingDays).toBe(14)
    expect(item?.assignees).toEqual(['guest-dev'])
    expect(CONFIG.members).not.toContain('guest-dev')
    expect(item?.decision).toBe(false)
  })

  it('#215 is in the waiting lane and is listed under the label conflict', async () => {
    const { facts } = await gather()
    const item = facts.items.find((entry) => entry.number === 215)
    expect(item?.lane).toBe('waiting')
    expect(item?.labels).toEqual(['feature', 'status: in progress', 'status: waiting'])
    expect(item?.decision).toBe(false)
    expect(facts.hygiene.labelConflict).toEqual([215])
    expect(facts.hygiene.unassigned).toEqual([204])
  })

  it('a pull request is approved only when nobody has the last word against it', () => {
    const pull = (reviews: { user: string; state: string; submittedAt: string }[]): RawPull => ({
      number: 1,
      state: 'open',
      draft: false,
      createdAt: '2026-10-01T00:00:00Z',
      reviews,
      readyForReviewAt: null,
    })
    expect(isApproved(pull([{ user: 'a', state: 'APPROVED', submittedAt: '1' }]))).toBe(true)
    // the same reviewer later asks for changes: not approved
    expect(
      isApproved(
        pull([
          { user: 'a', state: 'APPROVED', submittedAt: '1' },
          { user: 'a', state: 'CHANGES_REQUESTED', submittedAt: '2' },
        ]),
      ),
    ).toBe(false)
    // somebody else asks for changes: not approved either
    expect(
      isApproved(
        pull([
          { user: 'a', state: 'APPROVED', submittedAt: '1' },
          { user: 'b', state: 'CHANGES_REQUESTED', submittedAt: '2' },
        ]),
      ),
    ).toBe(false)
    // a comment-only review says nothing either way
    expect(
      isApproved(
        pull([
          { user: 'a', state: 'APPROVED', submittedAt: '1' },
          { user: 'b', state: 'COMMENTED', submittedAt: '2' },
        ]),
      ),
    ).toBe(true)
    expect(isApproved(pull([]))).toBe(false)
    // an approved pull request is not waiting for review; a draft never is
    expect(
      waitingForReviewSince(pull([{ user: 'a', state: 'APPROVED', submittedAt: '1' }])),
    ).toBeNull()
    expect(waitingForReviewSince({ ...pull([]), draft: true })).toBeNull()
    expect(waitingForReviewSince({ ...pull([]), state: 'closed' })).toBeNull()
    expect(waitingForReviewSince(pull([]))).toBe('2026-10-01T00:00:00Z')
    // since the latest ready_for_review when there is one
    expect(waitingForReviewSince({ ...pull([]), readyForReviewAt: '2026-10-03T00:00:00Z' })).toBe(
      '2026-10-03T00:00:00Z',
    )
  })
})

describe('the decisions and their order', () => {
  it('are exactly the seven of the expected outcome, with its scores and its order', async () => {
    const { facts } = await gather()
    expect(facts.decisions).toEqual(DECISIONS.map(([number]) => number))
    for (const [number, score] of DECISIONS) {
      expect(facts.items.find((item) => item.number === number)?.score, `#${number}`).toBe(score)
    }
    // #190 comes before #204 on the older creation date, their scores being equal
    const a = facts.items.find((item) => item.number === 190)
    const b = facts.items.find((item) => item.number === 204)
    expect(a?.score).toBe(b?.score)
    expect((a?.createdAt ?? '') < (b?.createdAt ?? '')).toBe(true)
    expect(facts.decisions.indexOf(190)).toBeLessThan(facts.decisions.indexOf(204))
  })

  it('control: without the chronic discount #205 ranks first, at 90.8', async () => {
    const { facts } = await gather()
    const item205 = facts.items.find((item) => item.number === 205)
    expect(item205?.waitingDays).toBe(71)
    expect(item205?.score).toBe(45.8)
    const undiscounted = scoreOf(
      {
        waitingDays: item205?.waitingDays ?? 0,
        reviewDays: item205?.reviewDays ?? 0,
        idleDays: item205?.idleDays ?? 0,
        blockedBy: item205?.blockedBy ?? 0,
        waitingPulls: item205?.waitingPulls ?? [],
      },
      CONFIG,
      { chronicDiscount: false },
    )
    expect(undiscounted).toBe(90.8)
    // with the discount off, #205 outranks #206, which is first in the real ranking
    const item206 = facts.items.find((item) => item.number === 206)
    expect(item206?.score).toBe(60.4)
    expect(undiscounted).toBeGreaterThan(item206?.score ?? 0)
    expect(facts.decisions[0]).toBe(206)
  })

  it('control: a sum instead of the max double-counts one stall', () => {
    // an item that carries a waiting label and has a pull request waiting for review: one stall,
    // two measurements of it. The defect the author's own evaluation found.
    const constructed = {
      waitingDays: 10,
      reviewDays: 10,
      idleDays: 0,
      blockedBy: 0,
      waitingPulls: [{ number: 1, days: 10 }],
    }
    const byMax = scoreOf(constructed, CONFIG)
    const bySum = scoreOf(constructed, CONFIG, { sumInsteadOfMax: true })
    // 3 x 10 against 3 x 10 + 2 x 10, plus the 5 for the waiting pull request
    expect(byMax).toBe(35)
    expect(bySum).toBe(55)
    expect(bySum).toBeGreaterThan(byMax)
  })

  it('the cap and the chronic discount are applied as the formula words them', () => {
    const base = { reviewDays: 0, idleDays: 0, blockedBy: 0, waitingPulls: [] }
    // 3 x min(waiting, 30)
    expect(scoreOf({ ...base, waitingDays: 10 }, CONFIG)).toBe(30)
    expect(scoreOf({ ...base, waitingDays: 30 }, CONFIG)).toBe(90)
    expect(scoreOf({ ...base, waitingDays: 45 }, CONFIG)).toBe(90)
    // at 60 days the chronic discount halves it
    expect(scoreOf({ ...base, waitingDays: 59 }, CONFIG)).toBe(90)
    expect(scoreOf({ ...base, waitingDays: 60 }, CONFIG)).toBe(45)
    // the idle days add a fifth of themselves, capped too
    expect(scoreOf({ ...base, waitingDays: 0, idleDays: 10 }, CONFIG)).toBe(2)
    expect(scoreOf({ ...base, waitingDays: 0, idleDays: 100 }, CONFIG)).toBe(6)
    // a blocked item gets 2, a waiting pull request 5
    expect(scoreOf({ ...base, waitingDays: 0, blockedBy: 1 }, CONFIG)).toBe(2)
    expect(scoreOf({ ...base, waitingDays: 0, waitingPulls: [{ number: 1 }] }, CONFIG)).toBe(5)
  })
})

describe('the clock', () => {
  it('today, the 72-hour Monday window and the weekday come from the configured zone', async () => {
    const { facts } = await gather()
    expect(facts.now).toBe(NOW)
    expect(facts.today).toBe('2026-10-05')
    expect(facts.timezone).toBe('Asia/Tokyo')
    expect(facts.since.weekday).toBe('Monday')
    expect(facts.since.hours).toBe(72)
    expect(facts.since.from).toBe('2026-10-01T23:30:00.000Z')
  })
})
