#!/usr/bin/env node
// Starts the mock tracker on 18451 and its media host on 18452, both on 127.0.0.1, and writes the
// request log as JSON lines on stdout. Ctrl-C stops it.

import { startTracker } from './tracker.ts'

const tracker = await startTracker({
  trackerPort: 18451,
  mediaPort: 18452,
  onLog: (entry) => {
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  },
})

process.stdout.write(
  `${JSON.stringify({ event: 'listening', tracker: tracker.trackerUrl, media: tracker.mediaUrl })}\n`,
)

const stop = (): void => {
  void tracker.close().then(() => {
    process.exit(0)
  })
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
