// The mock Redmine tracker and its media host.
//
// The shapes are the recorded ones (facts F19), not a format remembered from documentation: the
// issue JSON's keys, the `include=` rule, a missing issue as a 404 with an empty body, and the
// signed redirect to another host that cloud trackers use. `x-mock` in the fixture is read here and
// never served.
//
// Every request is logged with the *names* of its query parameters and whether an API key header was
// present — never the key's value. A redirect's `Location` is logged in full, because the token it
// carries is the control the attachment tests need: it shows the token existed where the fetcher saw
// it, while no output of the fetcher may contain it.

import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { join } from 'node:path'

export type TrackerLogEntry = {
  server: 'tracker' | 'media'
  method: string
  path: string
  /** the names of the query parameters, never their values */
  query: string[]
  /** whether an X-Redmine-API-Key header was present; the value is never recorded */
  apiKey: boolean
  status: number
  /** the raw Location of a redirect, token and all */
  location?: string
}

export type TrackerOptions = {
  /** 0, the default, takes any free port */
  trackerPort?: number
  mediaPort?: number
  /** the key the tracker demands; false or undefined demands none */
  requireKey?: string | false
  /** the fixtures directory; by default the one of this repository */
  fixtures?: string
  onLog?: (entry: TrackerLogEntry) => void
}

export type Tracker = {
  trackerUrl: string
  mediaUrl: string
  log: () => TrackerLogEntry[]
  /** every token the media host issued, in order */
  issuedTokens: () => string[]
  close: () => Promise<void>
}

type Mock = { mode: string; file?: string; generated?: string }

type Attachment = {
  id: number
  filename: string
  filesize: number
  content_type: string
  content_url: string
  description: string
  'x-mock'?: Mock
  [key: string]: unknown
}

type Issue = {
  id: number
  attachments: Attachment[]
  journals: unknown[]
  [key: string]: unknown
}

/** The generated archive of attachment 304: `50 4B 03 04`, then one xorshift32 step per byte. */
export const generatedArchive = (size = 3145728): Buffer => {
  const buf = Buffer.alloc(size)
  buf[0] = 0x50
  buf[1] = 0x4b
  buf[2] = 0x03
  buf[3] = 0x04
  let s = 0x2545f491
  for (let i = 4; i < size; i += 1) {
    s = (s ^ (s << 13)) >>> 0
    s = (s ^ (s >>> 17)) >>> 0
    s = (s ^ (s << 5)) >>> 0
    buf[i] = s & 0xff
  }
  return buf
}

const GATEWAY_DENIED = [
  '<!DOCTYPE html>',
  '<html lang="en"><head><title>403 Access denied</title></head>',
  '<body><h1>Access denied</h1>',
  '<p>The gateway refused this request. Contact your administrator.</p>',
  '</body></html>',
  '',
].join('\n')

const SIGN_IN_PAGE = [
  '<!doctype html>',
  '<html lang="en"><head><title>Sign in</title></head>',
  '<body><h1>Sign in</h1>',
  '<form method="post" action="/login"><input name="user"><input name="password" type="password">',
  '<button>Sign in</button></form>',
  '</body></html>',
  '',
].join('\n')

const NOT_FOUND_PAGE = [
  '<!DOCTYPE html>',
  '<html lang="en"><head><title>404 Not found</title></head>',
  '<body><h1>404</h1><p>The page you were looking for does not exist.</p></body></html>',
  '',
].join('\n')

/**
 * `content-disposition` for a file name that is not ASCII. A header carries Latin-1 only, so a
 * Japanese name needs RFC 5987's `filename*` beside an ASCII fallback — which is what a real server
 * sends, and what Node refuses to send without.
 */
const contentDisposition = (filename: string): string => {
  const ascii = [...filename]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code >= 0x20 && code <= 0x7e && ch !== '"' && ch !== '\\' ? ch : '_'
    })
    .join('')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

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

export const startTracker = async (options: TrackerOptions = {}): Promise<Tracker> => {
  const fixtures = options.fixtures ?? join(import.meta.dirname, '..', '..', 'fixtures')
  const raw = JSON.parse(readFileSync(join(fixtures, 'tracker', 'issues.json'), 'utf8')) as {
    issues: Issue[]
  }
  const issues = new Map<number, Issue>(raw.issues.map((issue) => [issue.id, issue]))
  const attachments = new Map<number, Attachment>()
  for (const issue of raw.issues) {
    for (const attachment of issue.attachments) attachments.set(attachment.id, attachment)
  }

  const entries: TrackerLogEntry[] = []
  const tokens: string[] = []
  const issued = new Map<string, { attachmentId: number; expires: number }>()
  let archive: Buffer | null = null

  const record = (entry: TrackerLogEntry): void => {
    entries.push(entry)
    options.onLog?.(entry)
  }

  const bytesOf = (attachment: Attachment): Buffer => {
    const mock = attachment['x-mock']
    if (mock?.generated === 'xorshift32-zip') {
      archive ??= generatedArchive(attachment.filesize)
      return archive
    }
    if (mock?.file === undefined) {
      throw new Error(`attachment ${attachment.id} has no file in its x-mock`)
    }
    return readFileSync(join(fixtures, 'tracker', 'files', mock.file))
  }

  /** The attachment as it is served: `x-mock` removed, `{tracker}` resolved. */
  const servedAttachment = (attachment: Attachment, trackerUrl: string): Attachment => {
    const copy: Attachment = { ...attachment }
    delete copy['x-mock']
    copy.content_url = attachment.content_url.replace('{tracker}', trackerUrl)
    return copy
  }

  let trackerUrl = ''
  let mediaUrl = ''

  const trackerServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', trackerUrl)
    const query = [...url.searchParams.keys()]
    const apiKey = req.headers['x-redmine-api-key'] !== undefined
    const done = (status: number, location?: string): void => {
      record({
        server: 'tracker',
        method: req.method ?? '',
        path: url.pathname,
        query,
        apiKey,
        status,
        ...(location === undefined ? {} : { location }),
      })
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET' })
      res.end('Method Not Allowed\n')
      done(405)
      return
    }
    if (
      options.requireKey !== undefined &&
      options.requireKey !== false &&
      req.headers['x-redmine-api-key'] !== options.requireKey
    ) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end('')
      done(401)
      return
    }

    const issueMatch = /^\/issues\/(\d+)\.json$/.exec(url.pathname)
    if (issueMatch !== null) {
      const issue = issues.get(Number(issueMatch[1]))
      if (issue === undefined) {
        // a missing issue is a 404 with an empty body (F19)
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end('')
        done(404)
        return
      }
      const include = (url.searchParams.get('include') ?? '').split(',').map((s) => s.trim())
      const served: Record<string, unknown> = { ...issue }
      // the attachments and journals keys appear only when named in include, as Redmine does
      if (include.includes('attachments')) {
        served.attachments = issue.attachments.map((a) => servedAttachment(a, trackerUrl))
      } else {
        delete served.attachments
      }
      if (!include.includes('journals')) delete served.journals
      const body = JSON.stringify({ issue: served })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(body)
      done(200)
      return
    }

    const metaMatch = /^\/attachments\/(\d+)\.json$/.exec(url.pathname)
    if (metaMatch !== null) {
      const attachment = attachments.get(Number(metaMatch[1]))
      if (attachment === undefined) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end('')
        done(404)
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ attachment: servedAttachment(attachment, trackerUrl) }))
      done(200)
      return
    }

    // the name in the path is ignored, as Redmine does
    const downloadMatch = /^\/attachments\/download\/(\d+)(?:\/.*)?$/.exec(url.pathname)
    if (downloadMatch !== null) {
      const attachment = attachments.get(Number(downloadMatch[1]))
      if (attachment === undefined) {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
        res.end(NOT_FOUND_PAGE)
        done(404)
        return
      }
      const mock = attachment['x-mock']
      const mode = mock?.mode ?? 'direct'
      if (mode === 'missing') {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
        res.end(NOT_FOUND_PAGE)
        done(404)
        return
      }
      if (mode === 'login-page') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(SIGN_IN_PAGE)
        done(200)
        return
      }
      if (mode === 'signed' || mode === 'blocked') {
        const token = randomBytes(16).toString('hex')
        const expires = Math.floor(Date.now() / 1000) + 300
        tokens.push(token)
        issued.set(token, { attachmentId: attachment.id, expires })
        const location = `${mediaUrl}/media/${attachment.id}?token=${token}&expires=${expires}`
        res.writeHead(302, { location })
        res.end('')
        done(302, location)
        return
      }
      if (mode === 'truncated') {
        const bytes = bytesOf(attachment)
        const half = bytes.subarray(0, Math.floor(bytes.length / 2))
        // no content-length: the response goes out chunked and stops halfway
        res.writeHead(200, { 'content-type': attachment.content_type })
        res.end(half)
        done(200)
        return
      }
      const bytes = bytesOf(attachment)
      res.writeHead(200, {
        'content-type': attachment.content_type,
        'content-length': String(bytes.length),
        'content-disposition': contentDisposition(attachment.filename),
      })
      res.end(bytes)
      done(200)
      return
    }

    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
    res.end(NOT_FOUND_PAGE)
    done(404)
  })

  const mediaServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', mediaUrl)
    const query = [...url.searchParams.keys()]
    const done = (status: number): void => {
      // The media host never *needs* an API key, but it records whether one arrived: that is how a
      // test can see that the fetcher sent the key to the tracker's origin and to nowhere else.
      record({
        server: 'media',
        method: req.method ?? '',
        path: url.pathname,
        query,
        apiKey: req.headers['x-redmine-api-key'] !== undefined,
        status,
      })
    }
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET' })
      res.end('Method Not Allowed\n')
      done(405)
      return
    }
    const match = /^\/media\/(\d+)$/.exec(url.pathname)
    if (match === null) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(NOT_FOUND_PAGE)
      done(404)
      return
    }
    const attachment = attachments.get(Number(match[1]))
    if (attachment === undefined) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(NOT_FOUND_PAGE)
      done(404)
      return
    }
    if (attachment['x-mock']?.mode === 'blocked') {
      // the gateway's own error page, which is also a plausible file to save
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' })
      res.end(GATEWAY_DENIED)
      done(403)
      return
    }
    const token = url.searchParams.get('token') ?? ''
    const expires = url.searchParams.get('expires') ?? ''
    const grant = issued.get(token)
    const valid =
      grant !== undefined &&
      grant.attachmentId === attachment.id &&
      String(grant.expires) === expires &&
      Math.floor(Date.now() / 1000) <= grant.expires
    if (!valid) {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' })
      res.end(GATEWAY_DENIED)
      done(403)
      return
    }
    const bytes = bytesOf(attachment)
    res.writeHead(200, {
      'content-type': attachment.content_type,
      'content-length': String(bytes.length),
    })
    res.end(bytes)
    done(200)
  })

  const trackerListening = await listen(trackerServer, options.trackerPort ?? 0)
  const mediaListening = await listen(mediaServer, options.mediaPort ?? 0)
  trackerUrl = `http://127.0.0.1:${trackerListening}`
  mediaUrl = `http://127.0.0.1:${mediaListening}`

  return {
    trackerUrl,
    mediaUrl,
    log: () => [...entries],
    issuedTokens: () => [...tokens],
    close: async () => {
      await Promise.all([closeServer(trackerServer), closeServer(mediaServer)])
    },
  }
}

/** The sha256 of the generated archive, so a test can state it without building the buffer twice. */
export const generatedArchiveSha256 = (size = 3145728): string =>
  createHash('sha256').update(generatedArchive(size)).digest('hex')
