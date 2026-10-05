import { defineConfig } from 'vitest/config'

// Every Vitest test lives under test/, never inside skills/: a skill directory is copied alone into
// another repository's .claude/skills/, and its tests must not travel with it.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The end-to-end tests start the fake CLI a dozen times each. On Windows a Node start costs a
    // few hundred milliseconds, and under the whole suite's parallel load one such test took 8 s,
    // past Vitest's 5-second default (found after the run, on the author's PC).
    testTimeout: 30_000,
  },
})
