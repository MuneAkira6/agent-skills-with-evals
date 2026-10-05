// The mock GitHub REST API. The shapes are the recorded ones (facts F16, F17, F18), not a format
// remembered from documentation:
//
//   * `committed` has no `created_at`; its time is `committer.date`;
//   * `reviewed` has `submitted_at` and a **lower-case** state in the timeline, while
//     `/pulls/<n>/reviews` serves the same review with an **upper-case** one;
//   * `cross-referenced` names its source with its repository, and the source carries
//     `pull_request` when it is a pull request — which may belong to another repository;
//   * `updated_at` is the latest of **every** event, planning ones included, which is exactly how a
//     planning session hides an item nobody has touched for weeks (F18: #208 and #191);
//   * a page is announced by `Link`, never by a count.
//
// The scenario fixture keeps events in a compact form (`at`, `event`, `actor`, one extra field);
// this module is the only place that turns them into GitHub's shapes.

import { readFileSync } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { join } from 'node:path'

export type GithubLogEntry = {
  method: string
  path: string
  /** the names of the query parameters, never their values */
  query: string[]
  status: number
  /** whether an Authorization header was present; the value is never recorded */
  authorization: boolean
}

export type GithubOptions = {
  /** 0, the default, takes any free port */
  port?: number
  /** the fixtures directory; by default the one of this repository */
  fixtures?: string
  /** the ceiling on `per_page`, so a test can force pagination */
  maxPerPage?: number
  /** after this many requests, answer 403 with the rate-limit shape */
  rateLimitAfter?: number
  /** the first request whose path contains this answers 502 once */
  fail5xxOnce?: string
  onLog?: (entry: GithubLogEntry) => void
}

export type Github = {
  url: string
  log: () => GithubLogEntry[]
  close: () => Promise<void>
}

type ScenarioEvent = {
  event: string
  at: string
  actor: string
  label?: string
  milestone?: string
  assignee?: string
  reviewer?: string
  source?: number
  sha?: string
  message?: string
  state?: string
  body?: string
}

type ScenarioItem = {
  number: number
  kind: 'issue' | 'pr'
  title: string
  user: string
  assignees: string[]
  labels: string[]
  milestone: number | null
  state: string
  created_at: string
  closed_at: string | null
  blocked_by: number
  draft?: boolean
  head_ref?: string
  body: string
  events: ScenarioEvent[]
}

type Scenario = {
  repo: string
  repo_id: number
  now: string
  labels: Record<string, string>
  users: Record<string, number>
  milestones: { number: number; title: string; state: string; due_on: string | null }[]
  items: ScenarioItem[]
}

const RATE_LIMIT = 60
/** The address GitHub names in its unauthenticated rate-limit message; a documentation address. */
const RATE_LIMITED_ADDRESS = '192.0.2.1'

const listen = (server: Server, port: number): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('the mock could not read its own port'))
        return
      }
      resolve(address.port)
    })
  })

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve())
  })

export const startGithub = async (options: GithubOptions = {}): Promise<Github> => {
  const fixtures = options.fixtures ?? join(import.meta.dirname, '..', '..', 'fixtures')
  const scenario = JSON.parse(
    readFileSync(join(fixtures, 'github', 'scenario.json'), 'utf8'),
  ) as Scenario
  const maxPerPage = options.maxPerPage ?? 100
  const items = new Map<number, ScenarioItem>(scenario.items.map((item) => [item.number, item]))
  const entries: GithubLogEntry[] = []
  let requests = 0
  let failed5xx = false
  let url = ''

  const user = (login: string): Record<string, unknown> => ({
    login,
    id: scenario.users[login] ?? 0,
    type: 'User',
  })

  const label = (name: string): Record<string, unknown> => ({
    name,
    color: scenario.labels[name] ?? 'ededed',
  })

  const milestone = (number: number | null): Record<string, unknown> | null => {
    if (number === null) return null
    const found = scenario.milestones.find((m) => m.number === number)
    if (found === undefined) return null
    return {
      number: found.number,
      title: found.title,
      state: found.state,
      due_on: found.due_on,
      html_url: `https://github.com/${scenario.repo}/milestone/${found.number}`,
      url: `${url}/repos/${scenario.repo}/milestones/${found.number}`,
      id: 8000 + found.number,
      node_id: `MI_${found.number}`,
      creator: user(Object.keys(scenario.users)[0]),
      description: '',
      open_issues: scenario.items.filter((i) => i.milestone === found.number && i.state === 'open')
        .length,
      closed_issues: scenario.items.filter(
        (i) => i.milestone === found.number && i.state === 'closed',
      ).length,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      closed_at: found.state === 'closed' ? '2026-09-26T00:00:00Z' : null,
      labels_url: `${url}/repos/${scenario.repo}/milestones/${found.number}/labels`,
    }
  }

  /** `updated_at`, as GitHub computes it: the latest of every event, planning ones included. */
  const updatedAt = (item: ScenarioItem): string =>
    item.events.reduce((latest, event) => (event.at > latest ? event.at : latest), item.created_at)

  const issueJson = (item: ScenarioItem): Record<string, unknown> => {
    const base: Record<string, unknown> = {
      number: item.number,
      title: item.title,
      state: item.state,
      state_reason: item.state === 'closed' ? 'completed' : null,
      user: user(item.user),
      assignee: item.assignees.length > 0 ? user(item.assignees[0]) : null,
      assignees: item.assignees.map(user),
      labels: item.labels.map(label),
      milestone: milestone(item.milestone),
      comments: item.events.filter((event) => event.event === 'commented').length,
      created_at: item.created_at,
      updated_at: updatedAt(item),
      closed_at: item.closed_at,
      body: item.body,
      issue_dependencies_summary: {
        blocked_by: item.blocked_by,
        total_blocked_by: item.blocked_by,
        blocking: 0,
        total_blocking: 0,
      },
      html_url: `https://github.com/${scenario.repo}/issues/${item.number}`,
      url: `${url}/repos/${scenario.repo}/issues/${item.number}`,
      id: 900000 + item.number,
      node_id: `I_${item.number}`,
      locked: false,
      author_association: 'MEMBER',
      timeline_url: `${url}/repos/${scenario.repo}/issues/${item.number}/timeline`,
      comments_url: `${url}/repos/${scenario.repo}/issues/${item.number}/comments`,
      repository_url: `${url}/repos/${scenario.repo}`,
    }
    if (item.kind === 'pr') {
      base.pull_request = {
        url: `${url}/repos/${scenario.repo}/pulls/${item.number}`,
        html_url: `https://github.com/${scenario.repo}/pull/${item.number}`,
        diff_url: `https://github.com/${scenario.repo}/pull/${item.number}.diff`,
        patch_url: `https://github.com/${scenario.repo}/pull/${item.number}.patch`,
        merged_at: null,
      }
      base.draft = item.draft ?? false
    }
    return base
  }

  const pullJson = (item: ScenarioItem): Record<string, unknown> => ({
    number: item.number,
    state: item.state,
    draft: item.draft ?? false,
    created_at: item.created_at,
    updated_at: updatedAt(item),
    closed_at: item.closed_at,
    merged_at: null,
    merged: false,
    user: user(item.user),
    head: { ref: item.head_ref ?? `branch-${item.number}`, sha: 'f'.repeat(40) },
    base: { ref: 'main' },
    requested_reviewers: item.events
      .filter((event) => event.event === 'review_requested' && event.reviewer !== undefined)
      .map((event) => user(event.reviewer ?? '')),
    html_url: `https://github.com/${scenario.repo}/pull/${item.number}`,
    url: `${url}/repos/${scenario.repo}/pulls/${item.number}`,
    id: 900000 + item.number,
    node_id: `PR_${item.number}`,
  })

  /** One timeline event, in the shape GitHub really serves (F17). */
  const timelineEvent = (event: ScenarioEvent, index: number): Record<string, unknown> => {
    const common = { id: index + 1, actor: user(event.actor), event: event.event }
    switch (event.event) {
      case 'committed':
        // no created_at at all: the time lives in author.date and committer.date
        return {
          event: 'committed',
          sha: event.sha,
          node_id: `C_${event.sha?.slice(0, 8) ?? ''}`,
          message: event.message,
          author: { name: event.actor, email: `${event.actor}@example.invalid`, date: event.at },
          committer: { name: event.actor, email: `${event.actor}@example.invalid`, date: event.at },
          url: `${url}/repos/${scenario.repo}/git/commits/${event.sha}`,
        }
      case 'reviewed':
        // submitted_at, and a lower-case state in the timeline
        return {
          ...common,
          state: (event.state ?? '').toLowerCase(),
          body: event.body ?? null,
          submitted_at: event.at,
          user: user(event.actor),
        }
      case 'cross-referenced': {
        const source = event.source === undefined ? undefined : items.get(event.source)
        const issue: Record<string, unknown> = {
          number: source?.number ?? 0,
          title: source?.title ?? '',
          state: source?.state ?? 'open',
          user: user(source?.user ?? event.actor),
          repository: {
            full_name: scenario.repo,
            name: scenario.repo.split('/')[1],
            id: scenario.repo_id,
            owner: user(scenario.repo.split('/')[0]),
          },
        }
        if (source?.kind === 'pr') {
          issue.pull_request = {
            url: `${url}/repos/${scenario.repo}/pulls/${source.number}`,
            html_url: `https://github.com/${scenario.repo}/pull/${source.number}`,
            merged_at: null,
          }
        }
        return { ...common, created_at: event.at, source: { type: 'issue', issue } }
      }
      case 'labeled':
      case 'unlabeled':
        return { ...common, created_at: event.at, label: label(event.label ?? '') }
      case 'milestoned':
      case 'demilestoned':
        return { ...common, created_at: event.at, milestone: { title: event.milestone ?? '' } }
      case 'assigned':
      case 'unassigned':
        return { ...common, created_at: event.at, assignee: user(event.assignee ?? '') }
      case 'review_requested':
      case 'review_request_removed':
        return { ...common, created_at: event.at, requested_reviewer: user(event.reviewer ?? '') }
      case 'commented':
        return {
          ...common,
          created_at: event.at,
          updated_at: event.at,
          body: event.body ?? '',
          user: user(event.actor),
          author_association: 'MEMBER',
        }
      default:
        return { ...common, created_at: event.at }
    }
  }

  const reviewJson = (event: ScenarioEvent, index: number): Record<string, unknown> => ({
    id: 70000 + index,
    user: user(event.actor),
    // upper-case here, lower-case in the timeline: both are what GitHub serves
    state: (event.state ?? '').toUpperCase(),
    body: event.body ?? '',
    submitted_at: event.at,
    author_association: 'MEMBER',
  })

  const commentJson = (event: ScenarioEvent, index: number): Record<string, unknown> => ({
    id: 60000 + index,
    user: user(event.actor),
    created_at: event.at,
    updated_at: event.at,
    body: event.body ?? '',
    author_association: 'MEMBER',
  })

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requested = new URL(req.url ?? '/', url)
    const query = [...requested.searchParams.keys()]
    const authorization = req.headers.authorization !== undefined
    const path = requested.pathname
    const done = (status: number): void => {
      const entry: GithubLogEntry = { method: req.method ?? '', path, query, status, authorization }
      entries.push(entry)
      options.onLog?.(entry)
    }

    requests += 1
    const headers: Record<string, string> = {
      'content-type': 'application/json; charset=utf-8',
      'x-ratelimit-limit': String(RATE_LIMIT),
      'x-ratelimit-remaining': String(Math.max(0, RATE_LIMIT - requests)),
      'x-ratelimit-used': String(requests),
      'x-ratelimit-resource': 'core',
      'x-ratelimit-reset': String(Math.floor(Date.parse(scenario.now) / 1000) + 3600),
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { ...headers, allow: 'GET' })
      res.end(JSON.stringify({ message: 'Method Not Allowed' }))
      done(405)
      return
    }

    if (options.rateLimitAfter !== undefined && requests > options.rateLimitAfter) {
      headers['x-ratelimit-remaining'] = '0'
      res.writeHead(403, headers)
      res.end(
        JSON.stringify({
          message: `API rate limit exceeded for ${RATE_LIMITED_ADDRESS}. (But here's the good news: Authenticated requests get a higher rate limit.)`,
          documentation_url: 'https://docs.github.com/rest/overview/rate-limits-for-the-rest-api',
        }),
      )
      done(403)
      return
    }

    if (options.fail5xxOnce !== undefined && !failed5xx && path.includes(options.fail5xxOnce)) {
      failed5xx = true
      res.writeHead(502, headers)
      res.end(JSON.stringify({ message: 'Server Error' }))
      done(502)
      return
    }

    /** One page of a list, with the Link header a client must follow (F16). */
    const page = (all: Record<string, unknown>[]): void => {
      const asked = Number(requested.searchParams.get('per_page') ?? '30')
      const perPage = Math.max(1, Math.min(Number.isFinite(asked) ? asked : 30, maxPerPage))
      const pageNumber = Math.max(1, Number(requested.searchParams.get('page') ?? '1'))
      const last = Math.max(1, Math.ceil(all.length / perPage))
      const slice = all.slice((pageNumber - 1) * perPage, pageNumber * perPage)
      const links: string[] = []
      const link = (n: number, rel: string): string => {
        const next = new URL(requested.toString())
        next.searchParams.set('page', String(n))
        next.searchParams.set('per_page', String(perPage))
        return `<${next.toString()}>; rel="${rel}"`
      }
      if (pageNumber < last) {
        links.push(link(pageNumber + 1, 'next'), link(last, 'last'))
      }
      if (pageNumber > 1) links.push(link(1, 'first'), link(pageNumber - 1, 'prev'))
      const withLink = links.length > 0 ? { ...headers, link: links.join(', ') } : headers
      res.writeHead(200, withLink)
      res.end(JSON.stringify(slice))
      done(200)
    }

    const prefix = `/repos/${scenario.repo}`
    if (!path.startsWith(prefix)) {
      res.writeHead(404, headers)
      res.end(JSON.stringify({ message: 'Not Found' }))
      done(404)
      return
    }
    const rest = path.slice(prefix.length)

    if (rest === '/milestones') {
      const state = requested.searchParams.get('state') ?? 'open'
      const all = scenario.milestones
        .filter((m) => state === 'all' || m.state === state)
        .map((m) => milestone(m.number))
        .filter((m): m is Record<string, unknown> => m !== null)
      page(all)
      return
    }

    if (rest === '/issues') {
      const milestoneParam = requested.searchParams.get('milestone')
      const state = requested.searchParams.get('state') ?? 'open'
      const all = scenario.items
        .filter((item) => item.milestone !== null)
        .filter((item) =>
          milestoneParam === null || milestoneParam === '*'
            ? true
            : item.milestone === Number(milestoneParam),
        )
        .filter((item) => state === 'all' || item.state === state)
        // GitHub's default: by creation, newest first
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
        .map(issueJson)
      page(all)
      return
    }

    const timeline = /^\/issues\/(\d+)\/timeline$/.exec(rest)
    if (timeline !== null) {
      const item = items.get(Number(timeline[1]))
      if (item === undefined) {
        res.writeHead(404, headers)
        res.end(JSON.stringify({ message: 'Not Found' }))
        done(404)
        return
      }
      page(item.events.map(timelineEvent))
      return
    }

    const comments = /^\/issues\/(\d+)\/comments$/.exec(rest)
    if (comments !== null) {
      const item = items.get(Number(comments[1]))
      if (item === undefined) {
        res.writeHead(404, headers)
        res.end(JSON.stringify({ message: 'Not Found' }))
        done(404)
        return
      }
      const since = requested.searchParams.get('since')
      const all = item.events
        .filter((event) => event.event === 'commented')
        .filter((event) => since === null || event.at >= since)
        .map(commentJson)
      page(all)
      return
    }

    const reviews = /^\/pulls\/(\d+)\/reviews$/.exec(rest)
    if (reviews !== null) {
      const item = items.get(Number(reviews[1]))
      if (item === undefined || item.kind !== 'pr') {
        res.writeHead(404, headers)
        res.end(JSON.stringify({ message: 'Not Found' }))
        done(404)
        return
      }
      page(item.events.filter((event) => event.event === 'reviewed').map(reviewJson))
      return
    }

    const pull = /^\/pulls\/(\d+)$/.exec(rest)
    if (pull !== null) {
      const item = items.get(Number(pull[1]))
      if (item === undefined || item.kind !== 'pr') {
        res.writeHead(404, headers)
        res.end(JSON.stringify({ message: 'Not Found' }))
        done(404)
        return
      }
      res.writeHead(200, headers)
      res.end(JSON.stringify(pullJson(item)))
      done(200)
      return
    }

    res.writeHead(404, headers)
    res.end(JSON.stringify({ message: 'Not Found' }))
    done(404)
  })

  const listening = await listen(server, options.port ?? 0)
  url = `http://127.0.0.1:${listening}`

  return {
    url,
    log: () => [...entries],
    close: async () => {
      await closeServer(server)
    },
  }
}
