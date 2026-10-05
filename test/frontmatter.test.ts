import { describe, expect, it } from 'vitest'
import {
  FrontmatterError,
  parseFrontmatter,
} from '../skills/skill-trigger-probe/scripts/lib/frontmatter.ts'

const yaml = (...lines: string[]): string =>
  ['---', ...lines, '---', '', '# The body of the skill', ''].join('\n')

const parse = (...lines: string[]) => {
  const fm = parseFrontmatter(yaml(...lines))
  if (fm === null) throw new Error('expected a frontmatter')
  return fm
}

/** The message of the FrontmatterError a frontmatter raises, for the refusal tests. */
const refusal = (...lines: string[]): string => {
  try {
    parseFrontmatter(yaml(...lines))
  } catch (err) {
    if (err instanceof FrontmatterError) return err.message
    throw err
  }
  throw new Error('expected a FrontmatterError')
}

describe('the frontmatter parser reads every supported construct', () => {
  it('reads a plain scalar and cuts it at " #"', () => {
    const fm = parse('name: tea-timer', 'description: Steeping times. # a trailing comment')
    expect(fm.values.name).toBe('tea-timer')
    expect(fm.values.description).toBe('Steeping times.')
    expect(fm.keys).toEqual(['name', 'description'])
    expect(fm.lineOf.description).toBe(3)
  })

  it('folds a plain scalar continued on more-indented lines with single spaces', () => {
    const fm = parse(
      'description: Use when the user asks',
      '  how long to steep tea,',
      '  and not for coffee.',
    )
    expect(fm.values.description).toBe(
      'Use when the user asks how long to steep tea, and not for coffee.',
    )
  })

  it('folds a plain scalar that starts on the line after its key', () => {
    const fm = parse('description:', '  first part', '  second part')
    expect(fm.values.description).toBe('first part second part')
  })

  it('reads a double-quoted scalar with the escapes \\" \\\\ \\n \\t and \\uXXXX', () => {
    const fm = parse(
      String.raw`description: "a \"quoted\" word, a backslash \\, a tab\there, a break\nand あ"`,
    )
    expect(fm.values.description).toBe(
      'a "quoted" word, a backslash \\, a tab\there, a break\nand あ',
    )
  })

  it("reads a single-quoted scalar where '' is one quote", () => {
    const fm = parse("license: 'it''s a quote'")
    expect(fm.values.license).toBe("it's a quote")
  })

  it('reads the four block scalars |, |-, > and >-', () => {
    const fm = parse(
      'literal: |',
      '  one',
      '  two',
      'literalStrip: |-',
      '  one',
      '  two',
      'folded: >',
      '  one',
      '  two',
      'foldedStrip: >-',
      '  one',
      '  two',
    )
    expect(fm.values.literal).toBe('one\ntwo\n')
    expect(fm.values.literalStrip).toBe('one\ntwo')
    expect(fm.values.folded).toBe('one two\n')
    expect(fm.values.foldedStrip).toBe('one two')
  })

  it('reads a list of scalars, quoted or plain', () => {
    const fm = parse('allowed-tools:', '  - Read', "  - 'Bash(ls:*)'")
    expect(fm.values['allowed-tools']).toEqual(['Read', 'Bash(ls:*)'])
  })

  it('reads one level of key: value pairs under metadata', () => {
    const fm = parse('metadata:', '  author: acme-tasks', "  version: '2'")
    expect(fm.values.metadata).toEqual({ author: 'acme-tasks', version: '2' })
  })

  it('skips comment lines and blank lines, and reads a key with no value as empty', () => {
    const fm = parse('# a comment', 'name: tea-timer', '', 'description:', 'license: MIT')
    expect(fm.values.description).toBe('')
    expect(fm.values.license).toBe('MIT')
    expect(fm.keys).toEqual(['name', 'description', 'license'])
  })

  it('returns null when there is no frontmatter and when it is never closed', () => {
    expect(parseFrontmatter('# A skill with no frontmatter\n')).toBeNull()
    expect(parseFrontmatter('---\nname: x\nstill open\n')).toBeNull()
  })
})

describe('the frontmatter parser refuses what it cannot judge, naming the line', () => {
  it('refuses a duplicated key and names both lines', () => {
    expect(refusal('name: tea-timer', 'description: one', 'name: coffee-timer')).toBe(
      'line 4: duplicated key "name" (first on line 2)',
    )
  })

  it('refuses a duplicated key under metadata', () => {
    expect(refusal('metadata:', '  author: a', '  author: b')).toBe(
      'line 4: duplicated key "author" (first on line 3)',
    )
  })

  it('refuses a tab used for indentation', () => {
    expect(refusal('description: one', '\tcontinued with a tab')).toBe(
      'line 3: a tab is used for indentation: "continued with a tab"',
    )
  })

  it('refuses an anchor, an alias and a tag', () => {
    expect(refusal('name: &anchor tea-timer')).toBe(
      'line 2: an anchor is not supported: "name: &anchor tea-timer"',
    )
    expect(refusal('name: *other')).toBe('line 2: an alias is not supported: "name: *other"')
    expect(refusal('name: !!str tea-timer')).toBe(
      'line 2: a tag is not supported: "name: !!str tea-timer"',
    )
  })

  it('refuses flow style, as a mapping and as a sequence', () => {
    expect(refusal('metadata: { author: acme }')).toBe(
      'line 2: flow style is not supported: "metadata: { author: acme }"',
    )
    expect(refusal('allowed-tools: [Read, Write]')).toBe(
      'line 2: flow style is not supported: "allowed-tools: [Read, Write]"',
    )
  })

  it('refuses a map under a key other than metadata, and deeper nesting under metadata', () => {
    expect(refusal('limits:', '  max: 3')).toBe(
      'line 3: deeper nesting is not supported (only metadata holds a map): "max: 3"',
    )
    expect(refusal('metadata:', '  owner:', '    name: acme')).toBe(
      'line 3: deeper nesting is not supported: "owner:"',
    )
  })

  it('refuses a block scalar header outside the four supported ones', () => {
    expect(refusal('description: |+', '  one')).toBe(
      'line 2: a block scalar header outside |, |-, > and >-: "description: |+"',
    )
  })

  it('refuses an unclosed quote, a stray escape and text after a closing quote', () => {
    expect(refusal('description: "never closed')).toBe(
      'line 2: a double-quoted scalar is not closed on its line: "description: "never closed"',
    )
    expect(refusal(String.raw`description: "a \x escape"`)).toBe(
      'line 2: an escape outside the supported set: "description: "a \\x escape""',
    )
    expect(refusal('description: "closed" and more')).toBe(
      'line 2: text after a closing quote: "description: "closed" and more"',
    )
  })

  it('refuses a line that is no key at all and an unexpected indentation', () => {
    expect(refusal('name:tea-timer')).toBe('line 2: not a supported construct: "name:tea-timer"')
    expect(refusal('name: tea-timer', '', '  stray: line')).toBe(
      'line 4: unexpected indentation: "stray: line"',
    )
  })

  it('refuses a list item without a scalar', () => {
    expect(refusal('allowed-tools:', '  - Read', '  -')).toBe(
      'line 4: a list item without a scalar: "-"',
    )
  })
})
