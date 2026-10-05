import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REDACTED, redactUrls } from '../skills/verifiable-fetch/scripts/redact-url.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'
import { fetchIssue, filesUnder } from './support/tracker.ts'

// The key is joined from parts at run time, like every planted secret in this repository: no literal
// token prefix may exist anywhere, because a publication's leak scan looks for exactly those.
const API_KEY = ['redmine', 'key', '7f3c1a9b4e2d8604'].join('-')

let root: string

beforeAll(() => {
  root = makeTempDir('g2-secrets')
})

afterAll(() => {
  removeTempDir(root)
})

const withKey = async <T>(key: string | undefined, body: () => Promise<T>): Promise<T> => {
  const before = process.env.REDMINE_API_KEY
  if (key === undefined) delete process.env.REDMINE_API_KEY
  else process.env.REDMINE_API_KEY = key
  try {
    return await body()
  } finally {
    if (before === undefined) delete process.env.REDMINE_API_KEY
    else process.env.REDMINE_API_KEY = before
  }
}

describe('the API key goes to the origin of --base and nowhere else', () => {
  it('every tracker request carries it, no media-host request does, and it is in no output', async () => {
    const out = join(root, 'keyed')
    const run = await withKey(API_KEY, () => fetchIssue(101, out, [], { requireKey: API_KEY }))
    expect(run.code).toBe(0)

    const log = run.tracker.log()
    const tracker = log.filter((entry) => entry.server === 'tracker')
    const media = log.filter((entry) => entry.server === 'media')
    expect(tracker.length).toBe(3)
    expect(media.length).toBe(1)
    expect(tracker.filter((entry) => entry.apiKey).length).toBe(3)
    expect(media.filter((entry) => entry.apiKey).length).toBe(0)
    // attachment 302 is the signed one: the tracker saw the key, the media host it redirected to did not
    expect(media[0].path).toBe('/media/302')

    // the key's value is in no line of output and in no written file
    expect(run.stdout).not.toContain(API_KEY)
    const files = filesUnder(out)
    expect(files.length).toBeGreaterThan(0)
    let matches = 0
    for (const file of files) {
      const text = readFileSync(join(out, file), 'latin1')
      if (text.includes(API_KEY)) matches += 1
    }
    expect(matches).toBe(0)
    // and the mock's own log never holds it either, only the fact that a header was there
    expect(JSON.stringify(log)).not.toContain(API_KEY)
  })

  it('control: without the key the tracker answers 401 and the fetcher exits 2', async () => {
    const out = join(root, 'unkeyed')
    const run = await withKey(undefined, () => fetchIssue(101, out, [], { requireKey: API_KEY }))
    expect(run.code).toBe(2)
    expect(run.lines).toEqual(['issue 101: HTTP 401'])
    expect(run.tracker.log().filter((entry) => entry.status === 401).length).toBe(1)
    expect(filesUnder(out)).toEqual([])
  })

  it('control: a wrong key is refused as well', async () => {
    const out = join(root, 'wrongkey')
    const run = await withKey(['redmine', 'key', 'not-the-right-one'].join('-'), () =>
      fetchIssue(101, out, [], { requireKey: API_KEY }),
    )
    expect(run.code).toBe(2)
    expect(run.lines).toEqual(['issue 101: HTTP 401'])
  })
})

describe('no token the media host issued reaches any output', () => {
  it('every issued token is absent from stdout and from every written file', async () => {
    const out = join(root, 'tokens')
    // issue 102 has two signed attachments and one blocked one, so three tokens are minted
    const run = await fetchIssue(102, out)
    expect(run.code).toBe(1)
    const tokens = run.tracker.issuedTokens()
    expect(tokens.length).toBe(3)
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{32}$/)

    const files = filesUnder(out)
    expect(files).toContain('102.md')
    let matches = 0
    for (const token of tokens) {
      if (run.stdout.includes(token)) matches += 1
      for (const file of files) {
        if (readFileSync(join(out, file), 'latin1').includes(token)) matches += 1
      }
    }
    expect(matches).toBe(0)

    // control: the token IS in the raw redirect the mock logged, so the comparison above is not vacuous
    const redirects = run.tracker.log().filter((entry) => entry.location !== undefined)
    expect(redirects.length).toBe(3)
    let inRedirects = 0
    for (const token of tokens) {
      if (redirects.some((entry) => (entry.location ?? '').includes(token))) inRedirects += 1
    }
    expect(inRedirects).toBe(3)
  })

  it('the redaction hides the query values of a signed URL, keeping their names', () => {
    const signed = `http://127.0.0.1:18452/media/302?token=${'a'.repeat(32)}&signature=abc&sig=def&expires=1799999999&key=zzz&X-Amz-Signature=${'b'.repeat(40)}`
    expect(redactUrls(signed)).toBe(
      `http://127.0.0.1:18452/media/302?token=${REDACTED}&signature=${REDACTED}&sig=${REDACTED}&expires=${REDACTED}&key=${REDACTED}&X-Amz-Signature=${REDACTED}`,
    )
    // `key` is in this skill's list and not in the A/B runner's: a tracker's own links carry one
    expect(redactUrls('http://host/a?key=secret-value')).toBe(`http://host/a?key=${REDACTED}`)
    // a line with nothing to hide is returned unchanged
    const clean = 'OK board-after.png 812'
    expect(redactUrls(clean)).toBe(clean)
  })
})
