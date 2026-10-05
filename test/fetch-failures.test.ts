// The three failure reasons the given fixtures cannot produce. They are planted here so that every
// one of the fetcher's six reasons has a control that really goes red:
//
//   HTTP <status>            — issues 102 and 104 (test/fetch-issues.test.ts)
//   size <got> != <filesize> — issue 104, the truncated attachment
//   type T: got HTML         — issue 102, the sign-in page
//   type T: signature mismatch }
//   too many redirects       } here
//   network: <code>          }

import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { main, signatureMatches } from '../skills/verifiable-fetch/scripts/fetch.ts'
import { makeTempDir, removeTempDir } from './support/tmp.ts'
import { filesUnder } from './support/tracker.ts'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

let root: string

beforeAll(() => {
  root = makeTempDir('g2-failures')
})

afterAll(() => {
  removeTempDir(root)
})

const listen = (server: Server): Promise<string> =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('no port'))
        return
      }
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })

const close = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve())
  })

/** A tiny tracker that serves one issue with one attachment pointing wherever the test wants. */
const oneAttachment = (contentPath: string, contentType: string, filesize: number) =>
  createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/issues/101.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          issue: {
            id: 101,
            subject: 'planted',
            description: '',
            project: { name: 'Acme Tasks' },
            tracker: { name: 'Bug' },
            status: { name: 'New' },
            priority: { name: 'Normal' },
            author: { name: 'a' },
            created_on: '2026-10-01T00:00:00Z',
            updated_on: '2026-10-01T00:00:00Z',
            journals: [],
            attachments: [
              {
                id: 901,
                filename: 'planted.png',
                filesize,
                content_type: contentType,
                content_url: `http://127.0.0.1:${(req.socket.localPort ?? 0).toString()}${contentPath}`,
                description: '',
              },
            ],
          },
        }),
      )
      return
    }
    // a redirect that never ends: each hop points at the next one
    const hop = /^\/loop\/(\d+)$/.exec(url.pathname)
    if (hop !== null) {
      res.writeHead(302, { location: `/loop/${Number(hop[1]) + 1}` })
      res.end('')
      return
    }
    if (url.pathname === '/jpeg-under-png') {
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(JPEG.length) })
      res.end(JPEG)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('no\n')
  })

describe('signatureMatches, the rule behind "signature mismatch"', () => {
  it('accepts the right bytes, refuses the wrong ones, and has no opinion on an unknown type', () => {
    expect(signatureMatches('image/png', PNG)).toBe(true)
    expect(signatureMatches('image/png', JPEG)).toBe(false)
    expect(signatureMatches('image/jpeg', JPEG)).toBe(true)
    expect(signatureMatches('image/jpeg', PNG)).toBe(false)
    // a body shorter than the signature cannot match
    expect(signatureMatches('image/png', PNG.subarray(0, 3))).toBe(false)
    // a type with no signature in the table: no opinion, so only the size and the HTML rule apply
    expect(signatureMatches('text/csv', Buffer.from('a,b,c'))).toBeNull()
    expect(signatureMatches('application/octet-stream', PNG)).toBeNull()
    // the declared type may carry parameters
    expect(signatureMatches('image/png; charset=binary', PNG)).toBe(true)
    expect(signatureMatches('IMAGE/PNG', PNG)).toBe(true)
    // the other three of the table
    expect(signatureMatches('image/gif', Buffer.from('GIF89a'))).toBe(true)
    expect(signatureMatches('application/pdf', Buffer.from('%PDF-1.7'))).toBe(true)
    expect(signatureMatches('application/zip', Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true)
    expect(signatureMatches('application/zip', Buffer.from('PK'))).toBe(false)
  })
})

describe('the three reasons the fixtures cannot produce', () => {
  it('signature mismatch: JPEG bytes served under image/png, end to end', async () => {
    const server = oneAttachment('/jpeg-under-png', 'image/png', JPEG.length)
    const base = await listen(server)
    const out = join(root, 'mismatch')
    const lines: string[] = []
    try {
      const code = await main(['--base', base, '--issue', '101', '--out', out], (line) => {
        lines.push(line)
      })
      expect(code).toBe(1)
      expect(lines).toEqual([
        'FAIL planted.png: type image/png: signature mismatch',
        'fetched #101: 1 attachments, 0 ok, 1 failed',
      ])
    } finally {
      await close(server)
    }
    // the size matched, so only the signature refused it, and nothing is left on disk
    expect(filesUnder(out)).toEqual(['101.md'])
  })

  it('too many redirects: more than five hops', async () => {
    const server = oneAttachment('/loop/1', 'image/png', 10)
    const base = await listen(server)
    const out = join(root, 'loop')
    const lines: string[] = []
    try {
      const code = await main(['--base', base, '--issue', '101', '--out', out], (line) => {
        lines.push(line)
      })
      expect(code).toBe(1)
      expect(lines[0]).toBe('FAIL planted.png: too many redirects')
    } finally {
      await close(server)
    }
    expect(filesUnder(out)).toEqual(['101.md'])
  })

  it('network: a closed port makes the issue request exit 2', async () => {
    // take a port and give it straight back, so nothing is listening on it
    const server = createServer(() => {})
    const base = await listen(server)
    await close(server)
    const out = join(root, 'refused')
    const lines: string[] = []
    const code = await main(['--base', base, '--issue', '101', '--out', out], (line) => {
      lines.push(line)
    })
    expect(code).toBe(2)
    expect(lines).toEqual(['issue 101: network: ECONNREFUSED'])
    expect(filesUnder(out)).toEqual([])
  })
})
