// The collection. Six kinds of request, in a fixed order, and **no page is written from partial
// data**: a rate limit, a 5xx that does not recover, or any other non-2xx stops the whole run.
//
// Pages are followed through `Link: …; rel="next"` only, never by counting (fact F16) — a count is a
// guess about a list somebody else is appending to.

import type { Config, RawItem, RawPull, TimelineEvent } from './rules.ts'
import { dateInZone } from './rules.ts'

export class CollectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollectionError'
  }
}

export type Milestone = {
  number: number
  title: string
  state: string
  due_on: string | null
}

export type Comment = { user: string; createdAt: string; body: string }

export type Collected = {
  requests: number
  current: Milestone
  previous: Milestone | null
  /** every item of the current milestone, open and closed */
  items: RawItem[]
  /** the open items of the previous milestone */
  carryover: RawItem[]
  pulls: Map<number, RawPull>
  feedback: Comment[]
}

type Fetcher = typeof fetch

export type CollectOptions = {
  api: string
  config: Config
  now: string
  milestoneNumber: number | null
  feedbackIssue: number | null
  fetchImpl?: Fetcher
  /** waits between the retries of a 5xx; the tests pass a no-op */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const nextLink = (header: string | null): string | null => {
  if (header === null) return null
  for (const part of header.split(',')) {
    const match = /<([^>]+)>;\s*rel="next"/.exec(part.trim())
    if (match !== null) return match[1]
  }
  return null
}

export class Client {
  requests = 0

  private readonly api: string
  private readonly config: Config
  private readonly fetchImpl: Fetcher
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: {
    api: string
    config: Config
    fetchImpl?: Fetcher
    sleep?: (ms: number) => Promise<void>
  }) {
    this.api = options.api.replace(/\/+$/, '')
    this.config = options.config
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleep = options.sleep ?? defaultSleep
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'standup-digest',
    }
    const token = process.env.GITHUB_TOKEN
    // the token is sent and never printed
    if (token !== undefined && token !== '') headers.authorization = `Bearer ${token}`
    return headers
  }

  /** One request, with the two retries a 5xx is allowed and no tolerance for anything else. */
  private async once(url: string): Promise<Response> {
    const waits = [1000, 2000]
    for (let attempt = 0; ; attempt += 1) {
      this.requests += 1
      let response: Response
      try {
        response = await this.fetchImpl(url, { headers: this.headers() })
      } catch (err) {
        throw new CollectionError(
          `${url.slice(this.api.length)}: network: ${(err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message}`,
        )
      }
      if (response.status >= 200 && response.status < 300) return response
      if (
        (response.status === 403 || response.status === 429) &&
        response.headers.get('x-ratelimit-remaining') === '0'
      ) {
        const reset = Number(response.headers.get('x-ratelimit-reset') ?? '0')
        const at =
          reset > 0
            ? new Intl.DateTimeFormat('en-GB', {
                timeZone: this.config.timezone,
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(reset * 1000))
            : 'an unknown time'
        throw new CollectionError(
          `rate limit reached; it resets at ${at} (${this.config.timezone})`,
        )
      }
      if (response.status >= 500 && attempt < waits.length) {
        await this.sleep(waits[attempt])
        continue
      }
      throw new CollectionError(`${url.slice(this.api.length)}: HTTP ${response.status}`)
    }
  }

  async get<T>(path: string): Promise<T> {
    const response = await this.once(`${this.api}${path}`)
    return (await response.json()) as T
  }

  /** Every page of a list, followed through `Link` alone. */
  async list<T>(path: string): Promise<T[]> {
    let url = `${this.api}${path}`
    const all: T[] = []
    for (;;) {
      const response = await this.once(url)
      all.push(...((await response.json()) as T[]))
      const next = nextLink(response.headers.get('link'))
      if (next === null) return all
      url = next
    }
  }
}

type ApiIssue = {
  number: number
  title: string
  state: string
  draft?: boolean
  pull_request?: unknown
  assignees?: { login: string }[]
  labels?: { name: string }[]
  created_at: string
  closed_at: string | null
  issue_dependencies_summary?: { blocked_by?: number }
}

const toRawItem = (issue: ApiIssue, timeline: TimelineEvent[]): RawItem => ({
  number: issue.number,
  title: issue.title,
  kind: issue.pull_request === undefined ? 'issue' : 'pr',
  state: issue.state,
  draft: issue.draft ?? false,
  assignees: (issue.assignees ?? []).map((user) => user.login),
  labels: (issue.labels ?? []).map((label) => label.name),
  createdAt: issue.created_at,
  closedAt: issue.closed_at,
  blockedBy: issue.issue_dependencies_summary?.blocked_by ?? 0,
  timeline,
})

/** The current milestone: the one asked for, or the open one with the earliest due date. */
export const chooseCurrent = (milestones: Milestone[], asked: number | null): Milestone | null => {
  if (asked !== null) return milestones.find((m) => m.number === asked) ?? null
  const dated = milestones
    .filter((m) => m.state === 'open' && m.due_on !== null)
    .sort((a, b) => ((a.due_on ?? '') < (b.due_on ?? '') ? -1 : 1))
  return dated[0] ?? null
}

/** The previous milestone: the closed one with the latest due date. */
export const choosePrevious = (milestones: Milestone[]): Milestone | null => {
  const dated = milestones
    .filter((m) => m.state === 'closed' && m.due_on !== null)
    .sort((a, b) => ((a.due_on ?? '') > (b.due_on ?? '') ? -1 : 1))
  return dated[0] ?? null
}

export const collect = async (options: CollectOptions): Promise<Collected> => {
  const { config } = options
  const client = new Client({
    api: options.api,
    config,
    fetchImpl: options.fetchImpl,
    sleep: options.sleep,
  })
  const repo = config.repo

  const milestones = await client.list<Milestone>(
    `/repos/${repo}/milestones?state=all&per_page=100`,
  )
  const current = chooseCurrent(milestones, options.milestoneNumber)
  if (current === null) throw new CollectionError('no current milestone')
  const previous = choosePrevious(milestones)

  const currentIssues = await client.list<ApiIssue>(
    `/repos/${repo}/issues?milestone=${current.number}&state=all&per_page=100`,
  )
  const carryIssues =
    previous === null
      ? []
      : await client.list<ApiIssue>(
          `/repos/${repo}/issues?milestone=${previous.number}&state=open&per_page=100`,
        )

  // every open item gets its timeline, in number order so that two runs ask in the same order
  const openIssues = [...currentIssues, ...carryIssues]
    .filter((issue) => issue.state === 'open')
    .sort((a, b) => a.number - b.number)
  const timelines = new Map<number, TimelineEvent[]>()
  for (const issue of openIssues) {
    timelines.set(
      issue.number,
      await client.list<TimelineEvent>(
        `/repos/${repo}/issues/${issue.number}/timeline?per_page=100`,
      ),
    )
  }

  const items = currentIssues.map((issue) => toRawItem(issue, timelines.get(issue.number) ?? []))
  const carryover = carryIssues.map((issue) => toRawItem(issue, timelines.get(issue.number) ?? []))

  // every open pull request involved: an item that is one, or one linked to an open item
  const involved = new Map<number, { isItem: boolean }>()
  for (const item of [...items, ...carryover]) {
    if (item.state !== 'open') continue
    if (item.kind === 'pr') involved.set(item.number, { isItem: true })
    for (const event of item.timeline) {
      if (event.event !== 'cross-referenced') continue
      const issue = event.source?.issue
      if (issue?.repository?.full_name !== repo || issue.pull_request === undefined) continue
      const number = issue.number
      if (number !== undefined && !involved.has(number)) involved.set(number, { isItem: false })
    }
  }

  const pulls = new Map<number, RawPull>()
  for (const number of [...involved.keys()].sort((a, b) => a - b)) {
    const reviews = await client.list<{
      user?: { login?: string }
      state?: string
      submitted_at?: string
    }>(`/repos/${repo}/pulls/${number}/reviews?per_page=100`)
    const asItem = [...items, ...carryover].find((item) => item.number === number)
    let state = asItem?.state ?? 'open'
    let draft = asItem?.draft ?? false
    let createdAt = asItem?.createdAt ?? options.now
    let timeline = asItem?.timeline ?? []
    if (asItem === undefined) {
      // a linked pull request that is not an item: its own record, for `draft`, and its timeline,
      // for the latest `ready_for_review`
      const pull = await client.get<{
        state?: string
        draft?: boolean
        created_at?: string
      }>(`/repos/${repo}/pulls/${number}`)
      state = pull.state ?? 'open'
      draft = pull.draft ?? false
      createdAt = pull.created_at ?? options.now
      timeline = await client.list<TimelineEvent>(
        `/repos/${repo}/issues/${number}/timeline?per_page=100`,
      )
    }
    const readyForReview = timeline
      .filter((event) => event.event === 'ready_for_review' && event.created_at !== undefined)
      .map((event) => event.created_at ?? '')
      .sort()
    pulls.set(number, {
      number,
      state,
      draft,
      createdAt,
      reviews: reviews
        .map((review) => ({
          user: review.user?.login ?? '',
          state: (review.state ?? '').toUpperCase(),
          submittedAt: review.submitted_at ?? '',
        }))
        .sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1)),
      readyForReviewAt: readyForReview.at(-1) ?? null,
    })
  }

  let feedback: Comment[] = []
  if (options.feedbackIssue !== null) {
    const since = new Date(Date.parse(options.now) - 7 * 24 * 3600 * 1000).toISOString()
    const comments = await client.list<{
      user?: { login?: string }
      created_at?: string
      body?: string
    }>(
      `/repos/${repo}/issues/${options.feedbackIssue}/comments?since=${encodeURIComponent(since)}&per_page=100`,
    )
    feedback = comments.map((comment) => ({
      user: comment.user?.login ?? '',
      createdAt: comment.created_at ?? '',
      body: comment.body ?? '',
    }))
  }

  return {
    requests: client.requests,
    current,
    previous,
    items,
    carryover,
    pulls,
    feedback,
  }
}

/** `today`, the date of `now` in the configured zone — the only clock the page reads. */
export const todayOf = (now: string, config: Config): string => dateInZone(now, config.timezone)
