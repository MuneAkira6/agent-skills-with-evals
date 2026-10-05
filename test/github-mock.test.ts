import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Github } from '../harness/mocks/github.ts'
import { startGithub } from '../harness/mocks/github.ts'

let api: Github

beforeAll(async () => {
  // port 0: 18453 belongs to the A/B runs and to manual runs
  api = await startGithub()
})

afterAll(async () => {
  await api.close()
})

const get = async (
  path: string,
): Promise<{ status: number; link: string | null; body: unknown }> => {
  const response = await fetch(`${api.url}${path}`)
  return {
    status: response.status,
    link: response.headers.get('link'),
    body: await response.json(),
  }
}

type Issue = Record<string, unknown>

const issues = async (query: string): Promise<Issue[]> =>
  (await get(`/repos/acme/tasks/issues?${query}`)).body as Issue[]

const timeline = async (n: number): Promise<Record<string, unknown>[]> =>
  (await get(`/repos/acme/tasks/issues/${n}/timeline?per_page=100`)).body as Record<
    string,
    unknown
  >[]

describe('the mock GitHub API serves the recorded shapes', () => {
  it("an issue's keys are the ones of F16", async () => {
    const all = await issues('milestone=13&state=all&per_page=100')
    const issue = all.find((item) => item.number === 202)
    expect(issue).toBeDefined()
    for (const key of [
      'number',
      'title',
      'state',
      'state_reason',
      'user',
      'assignee',
      'assignees',
      'labels',
      'milestone',
      'comments',
      'created_at',
      'updated_at',
      'closed_at',
      'body',
      'issue_dependencies_summary',
      'html_url',
      'url',
      'id',
      'node_id',
    ]) {
      expect(Object.keys(issue ?? {}), key).toContain(key)
    }
    // `user` is the author, `assignee` the first of `assignees`: two different people here
    expect(issue?.user).toEqual({ login: 'yui-kato', id: 1105, type: 'User' })
    expect(issue?.assignee).toEqual({ login: 'ren-suzuki', id: 1102, type: 'User' })
    expect(issue?.assignees).toEqual([{ login: 'ren-suzuki', id: 1102, type: 'User' }])
    expect(issue?.labels).toEqual([
      { name: 'bug', color: 'd73a4a' },
      { name: 'status: waiting', color: 'fbca04' },
    ])
    expect(issue?.milestone).toMatchObject({
      number: 13,
      title: 'Sprint 13',
      state: 'open',
      due_on: '2026-10-09T00:00:00Z',
    })
    expect(issue?.issue_dependencies_summary).toMatchObject({ blocked_by: 1 })
    expect(issue?.comments).toBe(1)
    // an issue is not a pull request
    expect(Object.keys(issue ?? {})).not.toContain('pull_request')
    expect(Object.keys(issue ?? {})).not.toContain('draft')
  })

  it('a pull request in the issue list carries pull_request and draft', async () => {
    const all = await issues('milestone=13&state=all&per_page=100')
    const pr = all.find((item) => item.number === 210)
    expect(pr?.draft).toBe(false)
    expect(Object.keys(pr?.pull_request as object)).toEqual([
      'url',
      'html_url',
      'diff_url',
      'patch_url',
      'merged_at',
    ])
  })

  it('the issue list filters by milestone and state and sorts newest first', async () => {
    const current = await issues('milestone=13&state=all&per_page=100')
    expect(current.map((item) => item.number)).toEqual([
      210, 204, 212, 211, 203, 215, 213, 209, 214, 201, 202, 207, 206, 208, 205,
    ])
    expect(current).toHaveLength(15)
    expect(current.filter((item) => item.state === 'open')).toHaveLength(13)
    const carry = await issues('milestone=12&state=open&per_page=100')
    expect(carry.map((item) => item.number)).toEqual([190, 191])
  })

  it('a committed event has no created_at, and its time is committer.date (F17)', async () => {
    const events = await timeline(210)
    const committed = events.find((event) => event.event === 'committed')
    expect(committed).toBeDefined()
    expect(Object.keys(committed ?? {})).not.toContain('created_at')
    expect(committed?.committer).toMatchObject({ date: '2026-10-03T02:50:00Z' })
    expect(committed?.author).toMatchObject({ date: '2026-10-03T02:50:00Z' })
    expect(committed?.sha).toBe('dbfbf070dce76a67e7383fd52247101c6e81eeef')
  })

  it('a reviewed event has submitted_at and a lower-case state, while /reviews is upper-case', async () => {
    const events = await timeline(210)
    const reviewed = events.find((event) => event.event === 'reviewed')
    expect(Object.keys(reviewed ?? {})).not.toContain('created_at')
    expect(reviewed?.state).toBe('approved')
    expect(reviewed?.submitted_at).toBe('2026-10-04T01:00:00Z')

    const reviews = (await get('/repos/acme/tasks/pulls/210/reviews?per_page=100')).body as Record<
      string,
      unknown
    >[]
    expect(reviews).toHaveLength(1)
    expect(reviews[0].state).toBe('APPROVED')
    expect(reviews[0].submitted_at).toBe('2026-10-04T01:00:00Z')

    // #211 has an approval and then a changes-requested from the same reviewer
    const both = (await get('/repos/acme/tasks/pulls/211/reviews?per_page=100')).body as Record<
      string,
      unknown
    >[]
    expect(both.map((review) => review.state)).toEqual(['APPROVED', 'CHANGES_REQUESTED'])
  })

  it('a cross-reference names its source repository, and only a pull request carries pull_request', async () => {
    const fromPr = (await timeline(201)).find((event) => event.event === 'cross-referenced')
    const source = fromPr?.source as { type: string; issue: Record<string, unknown> }
    expect(source.type).toBe('issue')
    expect(source.issue.number).toBe(221)
    expect((source.issue.repository as { full_name: string }).full_name).toBe('acme/tasks')
    expect(Object.keys(source.issue)).toContain('pull_request')

    // #208's cross-reference comes from issue #230, which is no pull request
    const fromIssue = (await timeline(208)).find((event) => event.event === 'cross-referenced')
    const other = fromIssue?.source as { issue: Record<string, unknown> }
    expect(other.issue.number).toBe(230)
    expect((other.issue.repository as { full_name: string }).full_name).toBe('acme/tasks')
    expect(Object.keys(other.issue)).not.toContain('pull_request')
  })

  it("#208's updated_at is its latest event, which is a planning one (F18)", async () => {
    const all = await issues('milestone=13&state=all&per_page=100')
    const item = all.find((entry) => entry.number === 208)
    expect(item?.updated_at).toBe('2026-10-01T00:00:00Z')
    expect(item?.created_at).toBe('2026-08-20T00:00:00Z')
    // its last comment — its last real activity — is three weeks older than that
    const commented = (await timeline(208)).filter((event) => event.event === 'commented')
    expect(commented.map((event) => event.created_at)).toEqual(['2026-09-10T02:00:00Z'])

    // #191 has the same shape: a label added long after the last comment
    const carry = await issues('milestone=12&state=open&per_page=100')
    const item191 = carry.find((entry) => entry.number === 191)
    expect(item191?.updated_at).toBe('2026-09-28T01:05:00Z')
    const commented191 = (await timeline(191)).filter((event) => event.event === 'commented')
    expect(commented191.map((event) => event.created_at)).toEqual(['2026-09-12T00:00:00Z'])
  })

  it('a pull request endpoint gives number, state, draft, head and requested reviewers', async () => {
    const draft = (await get('/repos/acme/tasks/pulls/223')).body as Record<string, unknown>
    expect(draft.number).toBe(223)
    expect(draft.draft).toBe(true)
    expect(draft.state).toBe('open')
    expect((draft.head as { ref: string }).ref).toBe('203-wording')
    expect(draft.merged_at).toBeNull()
    const open = (await get('/repos/acme/tasks/pulls/221')).body as Record<string, unknown>
    expect(open.draft).toBe(false)
    expect((open.requested_reviewers as { login: string }[]).map((u) => u.login)).toEqual([
      'kai-ito',
    ])
  })

  it('comments filter on since, and the rate-limit headers are on every response', async () => {
    const all = (await get('/repos/acme/tasks/issues/300/comments?per_page=100')).body as Record<
      string,
      unknown
    >[]
    expect(all.map((comment) => comment.created_at)).toEqual([
      '2026-09-24T00:00:00Z',
      '2026-10-03T00:30:00Z',
    ])
    const since = (
      await get('/repos/acme/tasks/issues/300/comments?since=2026-09-27T23:30:00Z&per_page=100')
    ).body as Record<string, unknown>[]
    expect(since.map((comment) => comment.created_at)).toEqual(['2026-10-03T00:30:00Z'])

    const response = await fetch(`${api.url}/repos/acme/tasks/milestones?state=all`)
    expect(response.headers.get('x-ratelimit-limit')).toBe('60')
    expect(response.headers.get('x-ratelimit-resource')).toBe('core')
    expect(response.headers.get('x-ratelimit-reset')).not.toBeNull()
    expect(response.headers.get('x-ratelimit-remaining')).not.toBeNull()
  })

  it('pagination is announced by Link, and per_page is capped at maxPerPage', async () => {
    const small = await startGithub({ maxPerPage: 3 })
    try {
      const first = await fetch(
        `${small.url}/repos/acme/tasks/issues?milestone=13&state=all&per_page=100`,
      )
      const page1 = (await first.json()) as Record<string, unknown>[]
      expect(page1).toHaveLength(3)
      const link = first.headers.get('link') ?? ''
      expect(link).toContain('rel="next"')
      expect(link).toContain('rel="last"')
      expect(link).toContain('page=2')
      // 15 items, 3 a page: the last page is 5
      expect(link).toContain('page=5')
      const lastUrl = /<([^>]+)>; rel="last"/.exec(link)?.[1] ?? ''
      const last = await fetch(lastUrl)
      expect((await last.json()) as unknown[]).toHaveLength(3)
      expect(last.headers.get('link') ?? '').not.toContain('rel="next"')
    } finally {
      await small.close()
    }
  })

  it('anything but GET is 405, an unknown path is 404 with a message, and both are logged', async () => {
    const before = api.log().length
    const post = await fetch(`${api.url}/repos/acme/tasks/issues`, { method: 'POST' })
    expect(post.status).toBe(405)
    const unknown = await get('/repos/acme/tasks/nope')
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ message: 'Not Found' })
    const other = await get('/repos/other/repo/issues')
    expect(other.status).toBe(404)
    const added = api.log().slice(before)
    expect(added.map((entry) => `${entry.method} ${entry.status}`)).toEqual([
      'POST 405',
      'GET 404',
      'GET 404',
    ])
    // the log keeps the names of the query parameters and never an Authorization value
    const withAuth = await fetch(`${api.url}/repos/acme/tasks/issues?milestone=13&state=all`, {
      headers: { authorization: 'Bearer a-planted-token-value' },
    })
    expect(withAuth.status).toBe(200)
    const entry = api.log().at(-1)
    expect(entry?.query).toEqual(['milestone', 'state'])
    expect(entry?.authorization).toBe(true)
    expect(JSON.stringify(entry)).not.toContain('a-planted-token-value')
  })

  it('rateLimitAfter answers 403 with remaining 0 and names the address', async () => {
    const limited = await startGithub({ rateLimitAfter: 1 })
    try {
      const first = await fetch(`${limited.url}/repos/acme/tasks/milestones?state=all`)
      expect(first.status).toBe(200)
      const second = await fetch(`${limited.url}/repos/acme/tasks/milestones?state=all`)
      expect(second.status).toBe(403)
      expect(second.headers.get('x-ratelimit-remaining')).toBe('0')
      expect(((await second.json()) as { message: string }).message).toContain('192.0.2.1')
    } finally {
      await limited.close()
    }
  })

  it('fail5xxOnce answers 502 once for a matching path and then serves it', async () => {
    const flaky = await startGithub({ fail5xxOnce: '/timeline' })
    try {
      expect((await fetch(`${flaky.url}/repos/acme/tasks/milestones?state=all`)).status).toBe(200)
      expect((await fetch(`${flaky.url}/repos/acme/tasks/issues/201/timeline`)).status).toBe(502)
      expect((await fetch(`${flaky.url}/repos/acme/tasks/issues/201/timeline`)).status).toBe(200)
    } finally {
      await flaky.close()
    }
  })
})
