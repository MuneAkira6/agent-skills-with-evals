#!/usr/bin/env node
// The fetcher: a Redmine issue as Markdown, with its attachments, where an attachment counts as
// fetched only when the bytes on disk match the size in the metadata and the content matches the
// declared type.
//
//   node .claude/skills/verifiable-fetch/scripts/fetch.ts --base URL --issue ID --out DIR
//                                                         [--max-path N]
//
// Why so strict: a gateway's 403 page and a sign-in page are both plausible files. Saved under the
// name the download asked for, they look like the screenshot somebody wanted, and the archive is
// complete only until the day a reader opens it. REDMINE_API_KEY, when set, goes to the origin of
// --base and to nothing else, and is never printed; every URL in every message is redacted.
//
// Exit 0 every attachment fetched, 1 at least one failed (the Markdown is still written), 2 the
// issue could not be fetched, 3 a usage error or an output directory too deep.

import { createHash } from 'node:crypto'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AttachmentRow, Issue } from './markdown.ts'
import { renderPage } from './markdown.ts'
import { deduplicate, fitToPath, safeName } from './names.ts'
import { redactUrls } from './redact-url.ts'

const USAGE = 'usage: fetch --base URL --issue ID --out DIR [--max-path N]'

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

export type Options = {
  base: string
  issue: number
  out: string
  maxPath: number
}

/** The default is 240: a Windows path has 260 characters, and a reader needs room to move the tree. */
export const DEFAULT_MAX_PATH = 240

/** The number of characters reserved for the file name itself in the depth check. */
const RESERVED_FOR_NAME = 20

/** At most five redirects, followed by hand so the API key never travels to another origin. */
const MAX_REDIRECTS = 5

export const parseArgs = (argv: string[]): Options => {
  let base: string | null = null
  let issue: number | null = null
  let out: string | null = null
  let maxPath = DEFAULT_MAX_PATH
  const value = (i: number, name: string): string => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${name} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--base':
        base = value(i, '--base')
        i += 1
        break
      case '--issue': {
        const text = value(i, '--issue')
        issue = Number(text)
        if (!Number.isInteger(issue) || issue < 1) {
          throw new UsageError(`--issue must be a positive integer, not "${text}"`)
        }
        i += 1
        break
      }
      case '--out':
        out = value(i, '--out')
        i += 1
        break
      case '--max-path': {
        const text = value(i, '--max-path')
        maxPath = Number(text)
        if (!Number.isInteger(maxPath) || maxPath < 1) {
          throw new UsageError(`--max-path must be a positive integer, not "${text}"`)
        }
        i += 1
        break
      }
      // pnpm forwards the `--` of `pnpm <script> -- …`; it is a separator, not an argument
      case '--':
        break
      default:
        throw new UsageError(`unknown argument ${argv[i]}`)
    }
  }
  if (base === null) throw new UsageError('--base is required')
  if (issue === null) throw new UsageError('--issue is required')
  if (out === null) throw new UsageError('--out is required')
  let origin: string
  try {
    origin = new URL(base).origin
  } catch {
    throw new UsageError(`--base is not a URL: ${base}`)
  }
  if (origin === 'null') throw new UsageError(`--base is not an absolute URL: ${base}`)
  return { base: base.replace(/\/+$/, ''), issue, out: resolve(out), maxPath }
}

/** The first bytes a content type must start with. */
const SIGNATURES: { type: string; bytes: number[] }[] = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { type: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
]

const baseType = (contentType: string): string => contentType.split(';')[0].trim().toLowerCase()

export const looksLikeHtml = (head: Buffer): boolean => {
  const text = head
    .toString('latin1')
    .replace(/^[\s﻿]+/, '')
    .toLowerCase()
  return text.startsWith('<!doctype html') || text.startsWith('<html')
}

export const signatureMatches = (contentType: string, head: Buffer): boolean | null => {
  const known = SIGNATURES.find((s) => s.type === baseType(contentType))
  if (known === undefined) return null
  if (head.length < known.bytes.length) return false
  return known.bytes.every((byte, i) => head[i] === byte)
}

type Download =
  | { ok: true; bytes: number; tempPath: string }
  | { ok: false; reason: string; tempPath: string | null }

const errorCode = (err: unknown): string => {
  const cause = (err as { cause?: { code?: string } }).cause
  return cause?.code ?? (err as { code?: string }).code ?? (err as Error).name ?? 'unknown'
}

/**
 * Downloads one attachment into a temporary file beside its target, counting its bytes and keeping
 * the first 64 for the signature check. Only the status, the byte count and the content decide.
 */
const download = async (
  url: string,
  trackerOrigin: string,
  apiKey: string | undefined,
  dir: string,
  targetName: string,
  expected: { size: number; contentType: string },
): Promise<Download> => {
  let current = url
  for (let redirects = 0; ; redirects += 1) {
    if (redirects > MAX_REDIRECTS)
      return { ok: false, reason: 'too many redirects', tempPath: null }
    const headers: Record<string, string> = {}
    // the key goes to the tracker's own origin and to nothing else, never to a redirect target
    if (apiKey !== undefined && apiKey !== '' && new URL(current).origin === trackerOrigin) {
      headers['X-Redmine-API-Key'] = apiKey
    }
    let response: Response
    try {
      response = await fetch(current, { redirect: 'manual', headers })
    } catch (err) {
      return { ok: false, reason: `network: ${errorCode(err)}`, tempPath: null }
    }
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location !== null) {
      current = new URL(location, current).toString()
      continue
    }
    if (response.status !== 200) {
      return { ok: false, reason: `HTTP ${response.status}`, tempPath: null }
    }

    mkdirSync(dir, { recursive: true })
    const tempPath = join(dir, `.${targetName}.part`)
    let count = 0
    const head: number[] = []
    const handle = await open(tempPath, 'w')
    try {
      const body = response.body
      if (body !== null) {
        const reader = body.getReader()
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          const buffer = Buffer.from(chunk.value)
          await handle.write(buffer)
          count += buffer.length
          for (let i = 0; i < buffer.length && head.length < 64; i += 1) head.push(buffer[i])
        }
      }
    } catch (err) {
      await handle.close()
      return { ok: false, reason: `network: ${errorCode(err)}`, tempPath }
    }
    await handle.close()

    const headBuffer = Buffer.from(head)
    // The order is the one the expected outcomes demand: the type tells a reader *what* arrived,
    // and a gateway page is the failure these rules exist for, so it is named before a byte count.
    if (baseType(expected.contentType) !== 'text/html' && looksLikeHtml(headBuffer)) {
      return { ok: false, reason: `type ${expected.contentType}: got HTML`, tempPath }
    }
    if (signatureMatches(expected.contentType, headBuffer) === false) {
      return { ok: false, reason: `type ${expected.contentType}: signature mismatch`, tempPath }
    }
    if (count !== expected.size) {
      return { ok: false, reason: `size ${count} != ${expected.size}`, tempPath }
    }
    return { ok: true, bytes: count, tempPath }
  }
}

type RawAttachment = {
  id: number
  filename: string
  filesize: number
  content_type: string
  content_url: string
}

export const run = async (options: Options, out: (line: string) => void): Promise<number> => {
  const apiKey = process.env.REDMINE_API_KEY
  const trackerOrigin = new URL(options.base).origin
  const issueUrl = `${options.base}/issues/${options.issue}.json?include=attachments,journals`

  let issue: Issue & { attachments?: RawAttachment[] }
  try {
    const headers: Record<string, string> = {}
    if (apiKey !== undefined && apiKey !== '') headers['X-Redmine-API-Key'] = apiKey
    const response = await fetch(issueUrl, { headers })
    if (response.status !== 200) {
      out(`issue ${options.issue}: HTTP ${response.status}`)
      return 2
    }
    const body = (await response.json()) as { issue?: Issue & { attachments?: RawAttachment[] } }
    if (body.issue === undefined) {
      out(`issue ${options.issue}: the response has no "issue" key`)
      return 2
    }
    issue = body.issue
  } catch (err) {
    out(redactUrls(`issue ${options.issue}: network: ${errorCode(err)}`))
    return 2
  }

  const attachmentsDir = join(options.out, 'attachments', String(options.issue))
  // Before any download: a directory so deep that no name fits is an error, not a surprise later.
  if (attachmentsDir.length + 1 + RESERVED_FOR_NAME > options.maxPath) {
    out(`output directory too deep for --max-path ${options.maxPath}`)
    return 3
  }

  const attachments = issue.attachments ?? []
  const rows: AttachmentRow[] = []
  const taken = new Set<string>()
  let failed = 0

  for (const attachment of attachments) {
    const deduplicated = deduplicate(safeName(attachment.filename), attachment.id, taken)
    const savedName = fitToPath(attachmentsDir, deduplicated, attachment.filename, options.maxPath)
    taken.add(savedName)
    const result = await download(
      attachment.content_url,
      trackerOrigin,
      apiKey,
      attachmentsDir,
      savedName,
      { size: attachment.filesize, contentType: attachment.content_type },
    )
    if (result.tempPath !== null && !result.ok) rmSync(result.tempPath, { force: true })
    if (result.ok) {
      renameSync(result.tempPath, join(attachmentsDir, savedName))
      out(redactUrls(`OK ${savedName} ${result.bytes}`))
      rows.push({
        originalName: attachment.filename,
        size: attachment.filesize,
        contentType: attachment.content_type,
        savedName,
        reason: null,
        link: `attachments/${options.issue}/${savedName}`,
      })
    } else {
      failed += 1
      out(redactUrls(`FAIL ${attachment.filename}: ${result.reason}`))
      rows.push({
        originalName: attachment.filename,
        size: attachment.filesize,
        contentType: attachment.content_type,
        savedName: null,
        reason: result.reason,
        link: null,
      })
    }
  }

  mkdirSync(options.out, { recursive: true })
  const page = renderPage(issue, options.base, rows)
  const handle = await open(join(options.out, `${options.issue}.md`), 'w')
  await handle.write(page)
  await handle.close()

  out(
    `fetched #${options.issue}: ${attachments.length} attachments, ${attachments.length - failed} ok, ${failed} failed`,
  )
  return failed > 0 ? 1 : 0
}

export const main = async (argv: string[], out: (line: string) => void): Promise<number> => {
  let options: Options
  try {
    options = parseArgs(argv)
  } catch (err) {
    out(`fetch: ${(err as Error).message}`)
    out(USAGE)
    return 3
  }
  try {
    return await run(options, out)
  } catch (err) {
    out(redactUrls(`fetch: ${(err as Error).message}`))
    return 3
  }
}

/** The sha256 of a file's bytes, for the tests and the demo to quote. */
export const sha256Of = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

const startedDirectly = (): boolean => {
  const entry = process.argv[1]
  if (entry === undefined) return false
  return basename(entry) === basename(fileURLToPath(import.meta.url)) && isAbsolute(entry)
}

if (startedDirectly()) {
  process.exitCode = await main(process.argv.slice(2), (line) => {
    process.stdout.write(`${line}\n`)
  })
}
