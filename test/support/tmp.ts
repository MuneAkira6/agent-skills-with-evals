import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// Every temporary directory this run creates carries this prefix, so a leftover check can filter on
// the run's own files: the OS temp directory of this host holds other users' files too.
export const RUN_PREFIX = 'askev-'

export const makeTempDir = (label: string): string =>
  mkdtempSync(join(tmpdir(), `${RUN_PREFIX}${label}-`))

export const removeTempDir = (dir: string): void => {
  rmSync(dir, { recursive: true, force: true })
}

/** Writes a file and the directories above it. */
export const writeFileDeep = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/** Plants a skill directory: `<root>/<dirName>/SKILL.md` with the given frontmatter lines. */
export const plantSkill = (
  root: string,
  dirName: string,
  frontmatter: string[],
  body: string[] = ['# A planted skill', '', 'Nothing to do here.'],
): string => {
  const dir = join(root, dirName)
  writeFileDeep(join(dir, 'SKILL.md'), ['---', ...frontmatter, '---', '', ...body, ''].join('\n'))
  return dir
}

/** A string of exactly `length` characters that is a valid plain scalar (no trailing space). */
export const filler = (
  length: number,
  seed = 'Steeping times and water temperatures for tea. ',
): string => `${seed.repeat(Math.ceil(length / seed.length)).slice(0, length - 1)}x`
