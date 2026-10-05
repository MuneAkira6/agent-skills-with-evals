#!/usr/bin/env node
// Starts the mock GitHub API on 18453, on 127.0.0.1, and writes the request log as JSON lines on
// stdout. Ctrl-C stops it.

import { startGithub } from './github.ts'

const github = await startGithub({
  port: 18453,
  onLog: (entry) => {
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  },
})

process.stdout.write(`${JSON.stringify({ event: 'listening', api: github.url })}\n`)

const stop = (): void => {
  void github.close().then(() => {
    process.exit(0)
  })
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
