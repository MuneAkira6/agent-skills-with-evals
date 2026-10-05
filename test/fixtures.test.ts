import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The first test of the run: it reads the given fixtures, so that the toolchain is proven on the
// inputs every later goal depends on. The counts are the ones facts.md F20 and SCOPE.md state.
const repoRoot = join(import.meta.dirname, '..')

const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(join(repoRoot, ...parts), 'utf8'))

describe('the given GitHub scenario', () => {
  it('holds 4 milestones and 22 items', () => {
    const scenario = readJson('fixtures', 'github', 'scenario.json') as {
      milestones: unknown[]
      items: unknown[]
    }
    expect(scenario.milestones).toHaveLength(4)
    expect(scenario.items).toHaveLength(22)
  })
})

describe('the given tracker issues', () => {
  it('hold 4 issues and 10 attachments in all', () => {
    const tracker = readJson('fixtures', 'tracker', 'issues.json') as {
      issues: { attachments: unknown[] }[]
    }
    expect(tracker.issues).toHaveLength(4)
    const attachments = tracker.issues.reduce((n, issue) => n + issue.attachments.length, 0)
    expect(attachments).toBe(10)
  })
})
