import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Tracker, TrackerOptions } from '../../harness/mocks/tracker.ts'
import { startTracker } from '../../harness/mocks/tracker.ts'
import { main } from '../../skills/verifiable-fetch/scripts/fetch.ts'

export type Fetched = {
  code: number
  /** every line the fetcher printed, in order */
  lines: string[]
  stdout: string
  tracker: Tracker
}

/**
 * Starts the mock on free ports, runs the fetcher against it in this process and stops the mock.
 * The tracker handle is returned so a test can read the request log and the issued tokens after the
 * run — the mock is already closed, and both are plain arrays.
 */
export const fetchIssue = async (
  issue: number,
  out: string,
  extra: string[] = [],
  options: TrackerOptions = {},
): Promise<Fetched> => {
  const tracker = await startTracker(options)
  const lines: string[] = []
  try {
    const code = await main(
      ['--base', tracker.trackerUrl, '--issue', String(issue), '--out', out, ...extra],
      (line) => {
        lines.push(line)
      },
    )
    return { code, lines, stdout: `${lines.join('\n')}\n`, tracker }
  } finally {
    await tracker.close()
  }
}

/** Every file under `dir`, as paths relative to it with `/` separators, sorted. */
export const filesUnder = (dir: string): string[] => {
  const found: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) found.push(relative(dir, path).split(sep).join('/'))
    }
  }
  try {
    if (statSync(dir).isDirectory()) walk(dir)
  } catch {
    return []
  }
  return found.sort()
}

export const sha256File = (path: string): string =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
