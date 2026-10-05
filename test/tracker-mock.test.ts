import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Tracker } from '../harness/mocks/tracker.ts'
import { generatedArchive, startTracker } from '../harness/mocks/tracker.ts'

const FIXTURES = join(import.meta.dirname, '..', 'fixtures')

let tracker: Tracker

beforeAll(async () => {
  // every test listens on port 0: the fixed 18451 and 18452 belong to the A/B runs and to manual runs
  tracker = await startTracker()
})

afterAll(async () => {
  await tracker.close()
})

const get = (path: string, init?: RequestInit) => fetch(`${tracker.trackerUrl}${path}`, init)

describe('the mock tracker serves the recorded shapes', () => {
  it('an issue without include has neither attachments nor journals, and with it has both', async () => {
    const bare = await get('/issues/101.json')
    expect(bare.status).toBe(200)
    const bareKeys = Object.keys(((await bare.json()) as { issue: object }).issue)
    expect(bareKeys).not.toContain('attachments')
    expect(bareKeys).not.toContain('journals')
    expect(bareKeys).toContain('subject')

    const full = await get('/issues/101.json?include=attachments,journals')
    const fullIssue = ((await full.json()) as { issue: Record<string, unknown> }).issue
    const fullKeys = Object.keys(fullIssue).sort()
    expect(fullKeys).toContain('attachments')
    expect(fullKeys).toContain('journals')
    expect(fullKeys.join(',')).toBe(
      'assigned_to,attachments,author,closed_on,created_on,description,done_ratio,due_date,estimated_hours,id,is_private,journals,priority,project,start_date,status,subject,total_estimated_hours,tracker,updated_on',
    )
    // the keys of F19, and only one of the two named in include when only one is asked for
    const onlyJournals = await get('/issues/101.json?include=journals')
    const onlyKeys = Object.keys(((await onlyJournals.json()) as { issue: object }).issue)
    expect(onlyKeys).toContain('journals')
    expect(onlyKeys).not.toContain('attachments')
  })

  it('x-mock is never served, and content_url carries the tracker origin and the encoded name', async () => {
    const response = await get('/issues/103.json?include=attachments')
    const issue = (
      (await response.json()) as {
        issue: { attachments: { id: number; content_url: string; 'x-mock'?: unknown }[] }
      }
    ).issue
    for (const attachment of issue.attachments) {
      expect(attachment['x-mock']).toBeUndefined()
      expect(attachment.content_url.startsWith(tracker.trackerUrl)).toBe(true)
    }
    const encoded = issue.attachments.find((a) => a.id === 308)
    expect(encoded?.content_url).toBe(
      `${tracker.trackerUrl}/attachments/download/308/%E9%80%9A%E7%9F%A5%3A%E8%A8%AD%E5%AE%9A%3F.png`,
    )
  })

  it('an attachment metadata request answers with an attachment key', async () => {
    const response = await get('/attachments/301.json')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { attachment: { id: number; filesize: number } }
    expect(body.attachment.id).toBe(301)
    expect(body.attachment.filesize).toBe(812)
  })

  it('a missing issue is a 404 with an empty body', async () => {
    const response = await get('/issues/105.json?include=attachments,journals')
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })

  it('anything but GET is 405, and it is logged', async () => {
    const before = tracker.log().length
    const response = await get('/issues/101.json', { method: 'POST' })
    expect(response.status).toBe(405)
    const entry = tracker.log()[before]
    expect(entry.method).toBe('POST')
    expect(entry.status).toBe(405)
    expect(entry.path).toBe('/issues/101.json')
  })

  it('the log keeps the query parameter names and never a key value', async () => {
    const before = tracker.log().length
    await get('/issues/101.json?include=attachments,journals', {
      headers: { 'X-Redmine-API-Key': 'a-planted-key-value' },
    })
    const entry = tracker.log()[before]
    expect(entry.query).toEqual(['include'])
    expect(entry.apiKey).toBe(true)
    expect(JSON.stringify(entry)).not.toContain('a-planted-key-value')
  })
})

describe('the attachment modes, each requested directly', () => {
  const download = (id: number, name = 'x.png') =>
    fetch(`${tracker.trackerUrl}/attachments/download/${id}/${name}`, { redirect: 'manual' })

  it('direct: 200 with the bytes of the fixture', async () => {
    const response = await download(301, 'board-before.png')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    const bytes = Buffer.from(await response.arrayBuffer())
    expect(bytes.length).toBe(812)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '39ae80397eed9d46b448385be587018fcc0a31b4b2de2e05ae198b4645e95627',
    )
    expect(bytes).toEqual(readFileSync(join(FIXTURES, 'tracker', 'files', 'board-before.png')))
  })

  it('signed: 302 to the media host with a token, valid when used and 403 when altered', async () => {
    const response = await download(302, 'board-after.png')
    expect(response.status).toBe(302)
    const location = response.headers.get('location') ?? ''
    expect(location.startsWith(`${tracker.mediaUrl}/media/302?`)).toBe(true)
    const url = new URL(location)
    const token = url.searchParams.get('token') ?? ''
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(Number(url.searchParams.get('expires'))).toBeGreaterThan(Date.now() / 1000)
    expect(tracker.issuedTokens()).toContain(token)

    const good = await fetch(location)
    expect(good.status).toBe(200)
    const bytes = Buffer.from(await good.arrayBuffer())
    expect(bytes.length).toBe(812)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '99b66246758c34aa8a99d79ab8e6dadcfbadd21148daf03a9c73f6df2a40ed8f',
    )

    const altered = new URL(location)
    altered.searchParams.set('token', `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`)
    const refused = await fetch(altered.toString())
    expect(refused.status).toBe(403)
    expect(refused.headers.get('content-type')).toBe('text/html; charset=utf-8')

    // a fresh token per redirect, so no two downloads share one
    const second = await download(302, 'board-after.png')
    const secondToken = new URL(second.headers.get('location') ?? '').searchParams.get('token')
    expect(secondToken).not.toBe(token)
  })

  it('blocked: a 302 whose target answers 403 with a gateway page', async () => {
    const response = await download(305, 'gateway-screenshot.png')
    expect(response.status).toBe(302)
    const blocked = await fetch(response.headers.get('location') ?? '')
    expect(blocked.status).toBe(403)
    expect(blocked.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const text = await blocked.text()
    expect(text).toContain('Access denied')
    expect(text.toLowerCase().startsWith('<!doctype html')).toBe(true)
  })

  it('login-page: 200 with a sign-in page under an image type', async () => {
    const response = await download(306, 'settings.png')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const text = await response.text()
    expect(text.toLowerCase().startsWith('<!doctype html')).toBe(true)
    expect(text).toContain('Sign in')
  })

  it('truncated: 200 with 274 of the 548 bytes and no content-length', async () => {
    const response = await download(310, 'partial.png')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBeNull()
    const bytes = Buffer.from(await response.arrayBuffer())
    expect(bytes.length).toBe(274)
    // it still starts with the PNG signature, which is why only the byte count catches it
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('missing: 404 with an HTML page', async () => {
    const response = await download(309, 'missing.png')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect((await response.text()).toLowerCase().startsWith('<!doctype html')).toBe(true)
  })

  it('the generated archive is 3,145,728 bytes with the sha256 of F20', async () => {
    const buffer = generatedArchive()
    expect(buffer.length).toBe(3_145_728)
    expect([...buffer.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(createHash('sha256').update(buffer).digest('hex')).toBe(
      '02e34249abc54aba2c06c3b8b35b7f4fc78ba9b10df5371e7d8372f50adbf44c',
    )
    // and the mock serves exactly those bytes, through its signed redirect
    const redirect = await download(304, 'export-log.zip')
    const served = await fetch(redirect.headers.get('location') ?? '')
    const bytes = Buffer.from(await served.arrayBuffer())
    expect(bytes.length).toBe(3_145_728)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '02e34249abc54aba2c06c3b8b35b7f4fc78ba9b10df5371e7d8372f50adbf44c',
    )
  })
})
