#!/usr/bin/env node
// The frontmatter validator. Every rule carries its id and its source: A = the Agent Skills
// specification (agentskills.io), C = the Claude documentation (platform.claude.com). Both limits
// were read from the published pages (facts F12); the 1,536-character note comes from a measurement
// of the CLI itself (F11), which is why it is a note and not a rule.
//
//   node skills/skill-trigger-probe/scripts/validate.ts [<skill-dir>...]
//
// With no argument it validates every directory under `skills/` of the working directory.
// Exit 0 every skill valid (warnings allowed), 1 at least one error, 3 a directory or file that
// cannot be read or a frontmatter construct outside the supported subset.

import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Frontmatter } from './lib/frontmatter.ts'
import { FrontmatterError, parseFrontmatter } from './lib/frontmatter.ts'

/** A directory or file the validator cannot read: exit 3, never a finding. */
export class ReadFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReadFailure'
  }
}

export type SkillReport = {
  dir: string
  /** the name as the frontmatter gives it, or the directory's name when there is none */
  name: string
  descriptionLength: number
  /** the errors, in rule order */
  findings: string[]
  /** measured notes that are not rules (F11) */
  notes: string[]
  warnings: string[]
  infos: string[]
}

const NAME_LIMIT = 64
const DESCRIPTION_LIMIT = 1024
const COMPATIBILITY_LIMIT = 500
const LINE_RECOMMENDATION = 500
/** What the CLI versions of F11 passed to the model before cutting with an ellipsis. */
const MEASURED_CUT = 1536

const SPEC_KEYS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']
const NAME_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const XML_TAG = /<[A-Za-z/!?][^>]*>/
const RESERVED = ['anthropic', 'claude']

const num = (n: number): string => n.toLocaleString('en-US')

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const readSkillMd = (dir: string): string | null => {
  try {
    return readFileSync(join(dir, 'SKILL.md'), 'utf8')
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'ENOENT') return null
    throw new ReadFailure(`cannot read ${join(dir, 'SKILL.md')}: ${code ?? String(err)}`)
  }
}

const checkName = (fm: Frontmatter, dir: string, report: SkillReport): void => {
  const raw = fm.values.name
  if (raw === undefined) {
    report.findings.push('V2 name: missing (A, C)')
    return
  }
  const name = asString(raw)
  if (name === null) {
    report.findings.push('V2 name: not a scalar (A, C)')
    return
  }
  report.name = name === '' ? basename(dir) : name
  if (name === '') {
    report.findings.push('V2 name: empty (A, C)')
    return
  }
  if (name.length > NAME_LIMIT) {
    report.findings.push(`V2 name: ${num(name.length)} characters (limit ${num(NAME_LIMIT)}, A, C)`)
  } else if (!NAME_SHAPE.test(name)) {
    report.findings.push(
      `V2 name: "${name}" is not lowercase letters, digits and single hyphens (A, C)`,
    )
  } else if (name !== basename(dir)) {
    report.findings.push(
      `V2 name: "${name}" differs from the directory name "${basename(dir)}" (A)`,
    )
  }
  for (const word of RESERVED) {
    if (name.includes(word)) {
      report.findings.push(`V3 name: contains the reserved word "${word}" (C)`)
      break
    }
  }
}

const checkDescription = (fm: Frontmatter, report: SkillReport): void => {
  const raw = fm.values.description
  if (raw === undefined) {
    report.findings.push('V4 description: missing (A, C)')
    return
  }
  const description = asString(raw)
  if (description === null) {
    report.findings.push('V4 description: not a scalar (A, C)')
    return
  }
  report.descriptionLength = description.length
  if (description.trim() === '') {
    report.findings.push('V4 description: empty (A, C)')
    return
  }
  if (description.length > DESCRIPTION_LIMIT) {
    report.findings.push(
      `V4 description: ${num(description.length)} characters (limit ${num(DESCRIPTION_LIMIT)}, A, C)`,
    )
    report.notes.push(
      `description: the CLI versions measured here passed only its first ${num(MEASURED_CUT)} characters to the model, followed by "…" (F11)`,
    )
  }
  const tag = XML_TAG.exec(description)
  if (tag !== null) {
    report.findings.push(`V5 description: contains the XML tag "${tag[0]}" (C)`)
  }
}

const checkRest = (fm: Frontmatter, text: string, report: SkillReport): void => {
  const compatibility = asString(fm.values.compatibility)
  if (compatibility !== null && compatibility.length > COMPATIBILITY_LIMIT) {
    report.findings.push(
      `V6 compatibility: ${num(compatibility.length)} characters (limit ${num(COMPATIBILITY_LIMIT)}, A)`,
    )
  }
  const metadata = fm.values.metadata
  if (metadata !== undefined) {
    const isMap =
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      Object.values(metadata).every((v) => typeof v === 'string')
    if (!isMap) report.findings.push('V6 metadata: not a map of strings to strings (A)')
  }

  const lines = text.split(/\r?\n/).length
  if (lines > LINE_RECOMMENDATION) {
    report.warnings.push(
      `SKILL.md: ${num(lines)} lines (A recommends under ${num(LINE_RECOMMENDATION)})`,
    )
  }
  if (Array.isArray(fm.values['allowed-tools'])) {
    report.warnings.push('allowed-tools: given as a list; A asks for a space-separated string')
  }
  const extra = fm.keys.filter((k) => !SPEC_KEYS.includes(k))
  if (extra.length > 0) {
    report.infos.push(
      `${extra.join(', ')}: ${extra.length === 1 ? 'a key' : 'keys'} outside the specification (products add their own keys)`,
    )
  }
}

/** Validates one skill directory. Throws ReadFailure or FrontmatterError for an exit-3 situation. */
export const validateSkill = (dir: string): SkillReport => {
  const report: SkillReport = {
    dir,
    name: basename(dir),
    descriptionLength: 0,
    findings: [],
    notes: [],
    warnings: [],
    infos: [],
  }
  try {
    if (!statSync(dir).isDirectory()) throw new ReadFailure(`not a directory: ${dir}`)
  } catch (err) {
    if (err instanceof ReadFailure) throw err
    throw new ReadFailure(
      `cannot read directory ${dir}: ${(err as { code?: string }).code ?? String(err)}`,
    )
  }
  const text = readSkillMd(dir)
  if (text === null) {
    report.findings.push('V1 SKILL.md: missing (A)')
    return report
  }
  const fm = parseFrontmatter(text)
  if (fm === null) {
    report.findings.push('V1 SKILL.md: no frontmatter (A)')
    return report
  }
  checkName(fm, dir, report)
  checkDescription(fm, report)
  checkRest(fm, text, report)
  return report
}

/** Every directory under `skills/` of the working directory, sorted. */
export const defaultSkillDirs = (root = 'skills'): string[] => {
  let entries: string[]
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(root, e.name))
  } catch (err) {
    throw new ReadFailure(
      `cannot read directory ${root}: ${(err as { code?: string }).code ?? String(err)}`,
    )
  }
  return entries.sort()
}

export const formatReport = (report: SkillReport): string[] => {
  const lines: string[] = []
  if (report.findings.length === 0) {
    lines.push(`ok ${report.name} (description ${num(report.descriptionLength)} characters)`)
  } else {
    lines.push(`FAIL ${report.name}`)
  }
  for (const f of report.findings) lines.push(`  ${f}`)
  for (const n of report.notes) lines.push(`  note ${n}`)
  for (const w of report.warnings) lines.push(`  warning ${w}`)
  for (const i of report.infos) lines.push(`  info ${i}`)
  return lines
}

export const main = (argv: string[], out: (line: string) => void): number => {
  let dirs: string[]
  try {
    dirs = argv.length > 0 ? argv.map((d) => resolve(d)) : defaultSkillDirs()
  } catch (err) {
    out(`validate: ${(err as Error).message}`)
    return 3
  }
  const reports: SkillReport[] = []
  for (const dir of dirs) {
    try {
      reports.push(validateSkill(dir))
    } catch (err) {
      if (err instanceof ReadFailure) {
        out(`validate: ${(err as Error).message}`)
        return 3
      }
      if (err instanceof FrontmatterError) {
        out(`validate: ${join(dir, 'SKILL.md')} ${(err as Error).message}`)
        return 3
      }
      throw err
    }
  }
  let warnings = 0
  for (const report of reports) {
    for (const line of formatReport(report)) out(line)
    warnings += report.warnings.length
  }
  const failed = reports.filter((r) => r.findings.length > 0).length
  out(
    `validated ${reports.length} skill${reports.length === 1 ? '' : 's'}: ${reports.length - failed} ok, ${failed} failed, ${warnings} warning${warnings === 1 ? '' : 's'}`,
  )
  return failed > 0 ? 1 : 0
}

const startedDirectly = (): boolean => {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (startedDirectly()) {
  process.exitCode = main(process.argv.slice(2), (line) => {
    process.stdout.write(`${line}\n`)
  })
}
