// The YAML subset a SKILL.md frontmatter may use, parsed by hand: no npm package may enter a skill
// directory, and a full YAML parser would accept constructs this validator cannot judge. Anything
// outside the subset is an error naming its line — the parser never guesses what was meant.
//
// Supported: top-level `key: value` with a plain scalar (cut at ` #`, continued on more-indented
// lines and folded with single spaces), a double-quoted scalar (`\"`, `\\`, `\n`, `\t`, `\uXXXX`),
// a single-quoted scalar (`''` for a quote), the block scalars `|`, `|-`, `>` and `>-`, a list of
// scalars, and one level of `key: value` pairs under `metadata:`.

export type FrontmatterValue = string | string[] | Record<string, string>

export type Frontmatter = {
  /** the top-level keys, in the order they appear */
  keys: string[]
  values: Record<string, FrontmatterValue>
  /** 1-based line of each key, for the validator's messages */
  lineOf: Record<string, number>
  /** 1-based line of the closing `---` */
  endLine: number
}

export class FrontmatterError extends Error {
  line: number

  constructor(line: number, detail: string) {
    super(`line ${line}: ${detail}`)
    this.name = 'FrontmatterError'
    this.line = line
  }
}

const KEY_LINE = /^([A-Za-z0-9][A-Za-z0-9_.-]*):(?: (.*))?$/
const LIST_ITEM = /^(-)(?: (.*))?$/
const BLOCK_HEADER = /^([|>])(-?)(?:[ \t]+#.*)?$/

const isBlank = (line: string): boolean => line.trim() === ''
const isComment = (line: string): boolean => /^[ ]*#/.test(line)

/** The line as an error message shows it: trimmed, cut, quoted. */
const show = (line: string): string => {
  const t = line.trim()
  return `"${t.length > 60 ? `${t.slice(0, 60)}…` : t}"`
}

const indentOf = (line: string, lineNo: number): number => {
  const lead = /^[ \t]*/.exec(line)?.[0] ?? ''
  if (lead.includes('\t')) {
    throw new FrontmatterError(lineNo, `a tab is used for indentation: ${show(line)}`)
  }
  return lead.length
}

/** A plain scalar's text: everything up to ` #`, with trailing spaces removed. */
const plainText = (text: string): string => {
  const cut = text.search(/ #/)
  return (cut === -1 ? text : text.slice(0, cut)).trim()
}

const unsupportedLead = (lineNo: number, text: string, line: string): void => {
  const lead = text[0] ?? ''
  if (lead === '&') throw new FrontmatterError(lineNo, `an anchor is not supported: ${show(line)}`)
  if (lead === '*') throw new FrontmatterError(lineNo, `an alias is not supported: ${show(line)}`)
  if (lead === '!') throw new FrontmatterError(lineNo, `a tag is not supported: ${show(line)}`)
  if (lead === '{' || lead === '[') {
    throw new FrontmatterError(lineNo, `flow style is not supported: ${show(line)}`)
  }
}

/** A scalar that must be complete on one line: quoted or plain. */
const oneLineScalar = (text: string, lineNo: number, line: string): string => {
  const t = text.trim()
  unsupportedLead(lineNo, t, line)
  if (t.startsWith('"')) return doubleQuoted(t, lineNo, line)
  if (t.startsWith("'")) return singleQuoted(t, lineNo, line)
  if (t.startsWith('|') || t.startsWith('>')) {
    throw new FrontmatterError(lineNo, `a block scalar is not supported here: ${show(line)}`)
  }
  return plainText(t)
}

const doubleQuoted = (text: string, lineNo: number, line: string): string => {
  let out = ''
  let i = 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      const tail = text.slice(i + 1).trim()
      if (tail !== '' && !tail.startsWith('#')) {
        throw new FrontmatterError(lineNo, `text after a closing quote: ${show(line)}`)
      }
      return out
    }
    if (ch !== '\\') {
      out += ch
      i += 1
      continue
    }
    const esc = text[i + 1]
    if (esc === '"' || esc === '\\') {
      out += esc
      i += 2
    } else if (esc === 'n') {
      out += '\n'
      i += 2
    } else if (esc === 't') {
      out += '\t'
      i += 2
    } else if (esc === 'u') {
      const hex = text.slice(i + 2, i + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw new FrontmatterError(lineNo, `a broken \\u escape: ${show(line)}`)
      }
      out += String.fromCharCode(Number.parseInt(hex, 16))
      i += 6
    } else {
      throw new FrontmatterError(lineNo, `an escape outside the supported set: ${show(line)}`)
    }
  }
  throw new FrontmatterError(
    lineNo,
    `a double-quoted scalar is not closed on its line: ${show(line)}`,
  )
}

const singleQuoted = (text: string, lineNo: number, line: string): string => {
  let out = ''
  let i = 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'") {
      if (text[i + 1] === "'") {
        out += "'"
        i += 2
        continue
      }
      const tail = text.slice(i + 1).trim()
      if (tail !== '' && !tail.startsWith('#')) {
        throw new FrontmatterError(lineNo, `text after a closing quote: ${show(line)}`)
      }
      return out
    }
    out += ch
    i += 1
  }
  throw new FrontmatterError(
    lineNo,
    `a single-quoted scalar is not closed on its line: ${show(line)}`,
  )
}

/** YAML's folding: a break becomes a space, an empty line a newline, a more-indented line keeps it. */
const fold = (body: string[]): string => {
  let out = ''
  let started = false
  let blanks = 0
  let lastMore = false
  for (const line of body) {
    if (isBlank(line)) {
      blanks += 1
      continue
    }
    const more = /^[ \t]/.test(line)
    if (!started) out += line
    else if (blanks > 0) out += '\n'.repeat(blanks) + line
    else if (more || lastMore) out += `\n${line}`
    else out += ` ${line}`
    started = true
    lastMore = more
    blanks = 0
  }
  return out
}

type Scan = { value: FrontmatterValue; next: number }

/** A block scalar's body: the lines more indented than the key, dedented by the first one's indent. */
const blockScalar = (
  lines: string[],
  start: number,
  close: number,
  style: string,
  chomp: string,
): Scan => {
  const body: string[] = []
  let blockIndent = -1
  let i = start
  while (i < close) {
    const line = lines[i]
    if (isBlank(line)) {
      body.push('')
      i += 1
      continue
    }
    const indent = indentOf(line, i + 1)
    if (indent === 0) break
    if (blockIndent === -1) blockIndent = indent
    if (indent < blockIndent) break
    body.push(line.slice(blockIndent))
    i += 1
  }
  while (body.length > 0 && isBlank(body[body.length - 1])) body.pop()
  let value = style === '|' ? body.join('\n') : fold(body)
  if (chomp !== '-' && value !== '') value += '\n'
  return { value, next: i }
}

const listItems = (lines: string[], start: number, close: number, indent: number): Scan => {
  const items: string[] = []
  let i = start
  while (i < close) {
    const line = lines[i]
    if (isBlank(line) || isComment(line)) {
      i += 1
      continue
    }
    const ind = indentOf(line, i + 1)
    if (ind !== indent) break
    const m = LIST_ITEM.exec(line.slice(ind))
    if (!m) break
    const text = m[2] ?? ''
    if (text.trim() === '') {
      throw new FrontmatterError(i + 1, `a list item without a scalar: ${show(line)}`)
    }
    items.push(oneLineScalar(text, i + 1, line))
    i += 1
  }
  return { value: items, next: i }
}

const nestedMap = (lines: string[], start: number, close: number, indent: number): Scan => {
  const map: Record<string, string> = {}
  const seen: Record<string, number> = {}
  let i = start
  while (i < close) {
    const line = lines[i]
    if (isBlank(line) || isComment(line)) {
      i += 1
      continue
    }
    const ind = indentOf(line, i + 1)
    if (ind < indent) break
    if (ind > indent) {
      throw new FrontmatterError(i + 1, `deeper nesting is not supported: ${show(line)}`)
    }
    const m = KEY_LINE.exec(line.slice(ind))
    if (!m) throw new FrontmatterError(i + 1, `not a supported construct: ${show(line)}`)
    const key = m[1]
    if (key in seen) {
      throw new FrontmatterError(i + 1, `duplicated key "${key}" (first on line ${seen[key]})`)
    }
    const rest = m[2] ?? ''
    if (rest.trim() === '' || rest.trim().startsWith('#')) {
      throw new FrontmatterError(i + 1, `deeper nesting is not supported: ${show(line)}`)
    }
    seen[key] = i + 1
    map[key] = oneLineScalar(rest, i + 1, line)
    i += 1
  }
  return { value: map, next: i }
}

/**
 * The frontmatter of a SKILL.md, or null when the text has none (no leading `---`, or no closing
 * one). A construct outside the supported subset throws a FrontmatterError naming its line.
 */
export const parseFrontmatter = (text: string): Frontmatter | null => {
  const lines = text.split(/\r?\n/)
  if (lines.length === 0 || lines[0].trimEnd() !== '---') return null
  let close = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trimEnd() === '---') {
      close = i
      break
    }
  }
  if (close === -1) return null

  const fm: Frontmatter = { keys: [], values: {}, lineOf: {}, endLine: close + 1 }
  let i = 1
  while (i < close) {
    const line = lines[i]
    if (isBlank(line) || isComment(line)) {
      i += 1
      continue
    }
    const lineNo = i + 1
    if (indentOf(line, lineNo) !== 0) {
      throw new FrontmatterError(lineNo, `unexpected indentation: ${show(line)}`)
    }
    const m = KEY_LINE.exec(line)
    if (!m) throw new FrontmatterError(lineNo, `not a supported construct: ${show(line)}`)
    const key = m[1]
    if (key in fm.values) {
      throw new FrontmatterError(
        lineNo,
        `duplicated key "${key}" (first on line ${fm.lineOf[key]})`,
      )
    }
    const rest = m[2] ?? ''
    const head = rest.trim()

    let scan: Scan
    if (head !== '' && !head.startsWith('#')) {
      unsupportedLead(lineNo, head, line)
      if (head.startsWith('|') || head.startsWith('>')) {
        const b = BLOCK_HEADER.exec(head)
        if (!b) {
          throw new FrontmatterError(
            lineNo,
            `a block scalar header outside |, |-, > and >-: ${show(line)}`,
          )
        }
        scan = blockScalar(lines, i + 1, close, b[1], b[2])
      } else if (head.startsWith('"') || head.startsWith("'")) {
        scan = { value: oneLineScalar(head, lineNo, line), next: i + 1 }
      } else {
        // a plain scalar, continued on every more-indented line that follows
        const parts = [plainText(rest)]
        let j = i + 1
        while (j < close) {
          const cont = lines[j]
          if (isBlank(cont) || isComment(cont)) break
          if (indentOf(cont, j + 1) === 0) break
          parts.push(plainText(cont))
          j += 1
        }
        scan = { value: parts.join(' ').trim(), next: j }
      }
    } else {
      // nothing on the key's line: a list, a map (only under `metadata`), a folded plain scalar,
      // or an empty value when the next significant line is another top-level key
      let j = i + 1
      while (j < close && (isBlank(lines[j]) || isComment(lines[j]))) j += 1
      if (j >= close) scan = { value: '', next: j }
      else {
        const nextLine = lines[j]
        const ind = indentOf(nextLine, j + 1)
        const body = nextLine.slice(ind)
        if (LIST_ITEM.test(body)) scan = listItems(lines, j, close, ind)
        else if (ind === 0) scan = { value: '', next: j }
        else if (KEY_LINE.test(body)) {
          if (key !== 'metadata') {
            throw new FrontmatterError(
              j + 1,
              `deeper nesting is not supported (only metadata holds a map): ${show(nextLine)}`,
            )
          }
          scan = nestedMap(lines, j, close, ind)
        } else {
          const parts: string[] = []
          let k = j
          while (k < close) {
            const cont = lines[k]
            if (isBlank(cont) || isComment(cont)) break
            if (indentOf(cont, k + 1) === 0) break
            parts.push(plainText(cont))
            k += 1
          }
          scan = { value: parts.join(' ').trim(), next: k }
        }
      }
    }

    fm.keys.push(key)
    fm.values[key] = scan.value
    fm.lineOf[key] = lineNo
    i = scan.next
  }
  return fm
}
