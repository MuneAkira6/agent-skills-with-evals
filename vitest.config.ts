import { defineConfig } from 'vitest/config'

// Every Vitest test lives under test/, never inside skills/: a skill directory is copied alone into
// another repository's .claude/skills/, and its tests must not travel with it.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
