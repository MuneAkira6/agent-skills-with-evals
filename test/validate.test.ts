import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateSkill } from '../skills/skill-trigger-probe/scripts/validate.ts'
import { filler, makeTempDir, plantSkill, removeTempDir, writeFileDeep } from './support/tmp.ts'

const VALIDATE = join(
  import.meta.dirname,
  '..',
  'skills',
  'skill-trigger-probe',
  'scripts',
  'validate.ts',
)

const GOOD_DESCRIPTION =
  'Steeping times and water temperatures for green, black and oolong tea. Use when the user asks how long to steep tea. Not for coffee.'

let root: string

beforeAll(() => {
  root = makeTempDir('g1-validate')
})

afterAll(() => {
  removeTempDir(root)
})

describe('each of V1-V6 broken on its own fails with that id and nothing else', () => {
  it('V1: a skill directory with no SKILL.md', () => {
    const dir = join(root, 'no-file')
    mkdirSync(dir, { recursive: true })
    const report = validateSkill(dir)
    expect(report.findings).toEqual(['V1 SKILL.md: missing (A)'])
  })

  it('V1: a SKILL.md with no frontmatter', () => {
    const dir = join(root, 'no-frontmatter')
    writeFileDeep(join(dir, 'SKILL.md'), '# A skill without any frontmatter\n')
    const report = validateSkill(dir)
    expect(report.findings).toEqual(['V1 SKILL.md: no frontmatter (A)'])
  })

  it('V2: a name with a doubled hyphen, equal to its directory', () => {
    const dir = plantSkill(root, 'tea--timer', [
      'name: tea--timer',
      `description: ${GOOD_DESCRIPTION}`,
    ])
    const report = validateSkill(dir)
    expect(report.findings).toEqual([
      'V2 name: "tea--timer" is not lowercase letters, digits and single hyphens (A, C)',
    ])
  })

  it('V3: a name that contains a reserved word', () => {
    const dir = plantSkill(root, 'claude-timer', [
      'name: claude-timer',
      `description: ${GOOD_DESCRIPTION}`,
    ])
    const report = validateSkill(dir)
    expect(report.findings).toEqual(['V3 name: contains the reserved word "claude" (C)'])
  })

  it('V4: a description of 1,563 characters, with the measured note of F11', () => {
    const dir = plantSkill(root, 'long-desc', ['name: long-desc', `description: ${filler(1563)}`])
    const report = validateSkill(dir)
    expect(report.descriptionLength).toBe(1563)
    expect(report.findings).toEqual(['V4 description: 1,563 characters (limit 1,024, A, C)'])
    expect(report.notes).toEqual([
      'description: the CLI versions measured here passed only its first 1,536 characters to the model, followed by "…" (F11)',
    ])
  })

  it('V5: a description that carries an XML tag', () => {
    const dir = plantSkill(root, 'tag-desc', [
      'name: tag-desc',
      'description: Steeping times for tea. Use when the user asks <notice>about tea</notice>.',
    ])
    const report = validateSkill(dir)
    expect(report.findings).toEqual(['V5 description: contains the XML tag "<notice>" (C)'])
  })

  it('V6: a compatibility of 612 characters', () => {
    const dir = plantSkill(root, 'wide-compat', [
      'name: wide-compat',
      `description: ${GOOD_DESCRIPTION}`,
      `compatibility: ${filler(612, 'needs Node 24 and a POSIX shell. ')}`,
    ])
    const report = validateSkill(dir)
    expect(report.findings).toEqual(['V6 compatibility: 612 characters (limit 500, A)'])
  })

  it('V6: a metadata that is not a map of strings to strings', () => {
    const dir = plantSkill(root, 'list-metadata', [
      'name: list-metadata',
      `description: ${GOOD_DESCRIPTION}`,
      'metadata:',
      '  - author',
      '  - version',
    ])
    const report = validateSkill(dir)
    expect(report.findings).toEqual(['V6 metadata: not a map of strings to strings (A)'])
  })
})

describe('the warnings never fail a skill', () => {
  it('a 600-line body, allowed-tools as a list and a key outside the specification', () => {
    const body = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`)
    const dir = plantSkill(
      root,
      'warn-only',
      [
        'name: warn-only',
        `description: ${GOOD_DESCRIPTION}`,
        'allowed-tools:',
        '  - Read',
        '  - Write',
        'owner: acme-tasks',
      ],
      body,
    )
    const report = validateSkill(dir)
    expect(report.findings).toEqual([])
    expect(report.warnings).toEqual([
      'SKILL.md: 610 lines (A recommends under 500)',
      'allowed-tools: given as a list; A asks for a space-separated string',
    ])
    expect(report.infos).toEqual([
      'owner: a key outside the specification (products add their own keys)',
    ])
  })
})

describe('the validator from the command line', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [VALIDATE, ...args], { encoding: 'utf8' })

  it('a valid skill exits 0', () => {
    const dir = plantSkill(root, 'tea-timer', [
      'name: tea-timer',
      `description: ${GOOD_DESCRIPTION}`,
      'license: MIT',
    ])
    const r = run(dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('ok tea-timer (description 132 characters)')
    expect(r.stdout.trim().split('\n').at(-1)).toBe('validated 1 skill: 1 ok, 0 failed, 0 warnings')
  })

  it('a 1,563-character description exits 1 with the V4 line and the 1,536 note', () => {
    const r = run(join(root, 'long-desc'))
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('FAIL long-desc')
    expect(r.stdout).toContain('V4 description: 1,563 characters (limit 1,024, A, C)')
    expect(r.stdout).toContain(
      'note description: the CLI versions measured here passed only its first 1,536 characters to the model, followed by "…" (F11)',
    )
  })

  it('a directory that cannot be read exits 3', () => {
    const missing = join(root, 'not-there')
    const r = run(missing)
    expect(r.status).toBe(3)
    expect(r.stdout).toContain(`cannot read directory ${missing}: ENOENT`)
  })

  it('a frontmatter construct outside the supported subset exits 3', () => {
    const dir = plantSkill(root, 'flow-style', [
      'name: flow-style',
      `description: ${GOOD_DESCRIPTION}`,
      'metadata: { author: acme }',
    ])
    const r = run(dir)
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('line 4: flow style is not supported: "metadata: { author: acme }"')
  })
})
