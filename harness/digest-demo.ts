#!/usr/bin/env node
// `pnpm digest:demo -- [--mode preview|collect-only] [--now ISO] [--out DIR] [--feedback]`
//
// Starts the mock GitHub API in-process on a free port and runs the pipeline against it. One
// process, no port to clash with, nothing left listening.

import { main } from '../skills/standup-digest/scripts/digest.ts'
import { startGithub } from './mocks/github.ts'

/** The moment SCOPE.md computed its expected outcome for: Monday 2026-10-05 08:30 in Asia/Tokyo. */
const DEFAULT_NOW = '2026-10-04T23:30:00Z'

const argv = process.argv.slice(2).filter((arg) => arg !== '--')
const value = (name: string): string | null => {
  const index = argv.indexOf(name)
  return index === -1 ? null : (argv[index + 1] ?? null)
}

const mode = value('--mode') ?? 'preview'
const now = value('--now') ?? DEFAULT_NOW
const out = value('--out')
const feedback = argv.includes('--feedback')

const github = await startGithub()
try {
  const args = [mode, '--api', github.url, '--now', now]
  if (out !== null) args.push('--out', out)
  if (feedback) args.push('--feedback-issue', '300')
  process.exitCode = await main(args, (line) => {
    process.stdout.write(`${line}\n`)
  })
} finally {
  await github.close()
}
