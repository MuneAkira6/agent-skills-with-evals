#!/usr/bin/env node
// `pnpm fetch:demo -- --issue 101 --out DIR [--max-path N]`
//
// Starts the mock tracker in-process on free ports, runs the fetcher against it and stops the mock.
// One process, no port to clash with, nothing left listening.

import { main } from '../skills/verifiable-fetch/scripts/fetch.ts'
import { startTracker } from './mocks/tracker.ts'

const argv = process.argv.slice(2)
const tracker = await startTracker()
try {
  const code = await main([...argv, '--base', tracker.trackerUrl], (line) => {
    process.stdout.write(`${line}\n`)
  })
  process.exitCode = code
} finally {
  await tracker.close()
}
