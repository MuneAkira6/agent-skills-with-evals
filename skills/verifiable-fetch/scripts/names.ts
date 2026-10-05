// The naming and path rules. They exist because of two failures: a file name out of a tracker is
// somebody's free text, and on Windows a path over the limit makes directory tools return an empty
// result without an error — so an archive that looks complete is not.

import { createHash } from 'node:crypto'
import { join } from 'node:path'

/**
 * `/`, `\`, `<`, `>`, `:`, `"`, `|`, `?` and `*`, plus every control character. Written as a set
 * and a code-point test rather than a regular expression: a control character inside a character
 * class is a lint error, and for good reason — it is invisible in the source.
 */
const FORBIDDEN_CHARACTERS = new Set(['/', '\\', '<', '>', ':', '"', '|', '?', '*'])
const LOWEST_PRINTABLE = 0x20

const sanitise = (name: string): string =>
  [...name]
    .map((ch) =>
      FORBIDDEN_CHARACTERS.has(ch) || (ch.codePointAt(0) ?? 0) < LOWEST_PRINTABLE ? '_' : ch,
    )
    .join('')

const DEVICE_NAMES = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]

/** The extension with its dot, or an empty string; never the whole name. */
export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot)
}

const stemOf = (name: string): string => name.slice(0, name.length - extensionOf(name).length)

/** The attachment's file name, made safe on every platform. */
export const safeName = (filename: string): string => {
  const replaced = sanitise(filename)
  const stem = stemOf(replaced)
  return DEVICE_NAMES.includes(stem.toUpperCase()) ? `_${replaced}` : replaced
}

/** A name already taken gets the attachment's id before its extension. */
export const deduplicate = (name: string, attachmentId: number, taken: Set<string>): string => {
  if (!taken.has(name)) return name
  const ext = extensionOf(name)
  return `${stemOf(name)}-${attachmentId}${ext}`
}

/**
 * The name cut so that the absolute path fits `maxPath`: the stem loses its tail and gains
 * `-<first 8 hex of sha256(the original name)>`, and the extension is kept. The hash is of the
 * original name, so the same attachment always gets the same short name.
 */
export const fitToPath = (
  dir: string,
  name: string,
  originalName: string,
  maxPath: number,
): string => {
  if (join(dir, name).length <= maxPath) return name
  const ext = extensionOf(name)
  const digest = createHash('sha256').update(originalName).digest('hex').slice(0, 8)
  const suffix = `-${digest}${ext}`
  const room = maxPath - dir.length - 1 - suffix.length
  const stem = stemOf(name).slice(0, Math.max(1, room))
  return `${stem}${suffix}`
}
