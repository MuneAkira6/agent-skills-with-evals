// Starting the mocks an eval asks for. The modules themselves are the deliverables of G2 and G3;
// this registry is what the A/B runner talks to, and it is imported by a path built at run time so
// that the runner works before they exist (G1's toy eval asks for no mock at all).

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export type MockLogEntry = {
  server: string
  method: string
  path: string
  status: number
}

export type MockHandle = {
  name: string
  log: () => MockLogEntry[]
  issuedTokens: () => string[]
  close: () => Promise<void> | void
}

/** The fixed ports of SCOPE.md, all on 127.0.0.1. */
export const PORTS = { tracker: 18451, media: 18452, github: 18453 }

type Unknown = Record<string, unknown>

const loadModule = async (abRoot: string, file: string): Promise<Unknown> => {
  const path = join(abRoot, 'harness', 'mocks', file)
  try {
    // a file URL, not the path: on Windows `import('C:\\…')` reads `c:` as a URL scheme
    return (await import(pathToFileURL(path).href)) as Unknown
  } catch (err) {
    throw new Error(`cannot start the mock from ${path}: ${(err as Error).message}`)
  }
}

export const startMocks = async (
  names: string[],
  abRoot: string,
  fixtures: string,
): Promise<MockHandle[]> => {
  const handles: MockHandle[] = []
  for (const name of names) {
    if (name === 'tracker') {
      const mod = await loadModule(abRoot, 'tracker.ts')
      const start = mod.startTracker as (opts: Unknown) => Promise<MockHandle> | MockHandle
      const handle = await start({
        trackerPort: PORTS.tracker,
        mediaPort: PORTS.media,
        requireKey: false,
        fixtures,
      })
      handles.push({ ...handle, name: 'tracker' })
    } else if (name === 'github') {
      const mod = await loadModule(abRoot, 'github.ts')
      const start = mod.startGithub as (opts: Unknown) => Promise<MockHandle> | MockHandle
      const handle = await start({ port: PORTS.github, fixtures })
      handles.push({
        ...handle,
        name: 'github',
        issuedTokens: handle.issuedTokens ?? (() => []),
      })
    } else {
      throw new Error(`unknown mock "${name}"`)
    }
  }
  return handles
}

/**
 * The log summary `run.json` carries: the requests by method and path, and the tokens the media host
 * issued — their **values**, not a count, because an eval assertion (verifiable-fetch M3 and M5) is
 * "no file and no reply contains any token the media host issued", and a grader reading `run.json`
 * long after the mock is gone needs the values to decide it. They are a mock's dummies, minted for
 * 300 seconds against a server that no longer exists.
 */
export const summariseMocks = (
  handles: MockHandle[],
): { name: string; requests: Record<string, number>; issuedTokens: string[] }[] =>
  handles.map((handle) => {
    const requests: Record<string, number> = {}
    for (const entry of handle.log()) {
      const key = `${entry.method} ${entry.path}`
      requests[key] = (requests[key] ?? 0) + 1
    }
    return { name: handle.name, requests, issuedTokens: handle.issuedTokens() }
  })
