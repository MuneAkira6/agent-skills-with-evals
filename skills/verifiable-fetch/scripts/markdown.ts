// The page. Its order and its Japanese are fixed by the contract: five sections, a description whose
// own headings are demoted so that they cannot be mistaken for the page's, every journal oldest
// first, and one `（説明なし）` under each saved image for the agent to replace with a sentence.

export type Journal = {
  user?: { name?: string }
  created_on?: string
  notes?: string | null
  details?: { name?: string; old_value?: string | null; new_value?: string | null }[]
}

export type Issue = {
  id: number
  subject: string
  description?: string | null
  project?: { name?: string }
  tracker?: { name?: string }
  status?: { name?: string }
  priority?: { name?: string }
  author?: { name?: string }
  assigned_to?: { name?: string }
  created_on?: string
  updated_on?: string
  journals?: Journal[]
}

export type AttachmentRow = {
  originalName: string
  size: number
  contentType: string
  savedName: string | null
  reason: string | null
  /** the link target, relative to the Markdown file */
  link: string | null
}

const date = (iso: string | undefined): string => (iso ?? '').slice(0, 10)

/** `2026-09-29T02:00:00Z` as `2026-09-29 02:00`. */
const minute = (iso: string | undefined): string => {
  const text = iso ?? ''
  return `${text.slice(0, 10)} ${text.slice(11, 16)}`
}

/** A line of one to five `#` plus a space gets one more, so it sits under the page's own headings. */
export const demoteHeadings = (description: string): string =>
  description
    .split('\n')
    .map((line) => (/^#{1,5} /.test(line) ? `#${line}` : line))
    .join('\n')

/** Spaces and parentheses are the only characters a Markdown link cannot carry as they are. */
const linkTarget = (path: string): string =>
  path.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')

export const renderPage = (issue: Issue, base: string, rows: AttachmentRow[]): string => {
  const lines: string[] = []

  lines.push('## Title', '', `#${issue.id}: ${issue.subject}`, '')

  lines.push('## Meta', '', '| Field | Value |', '| --- | --- |')
  lines.push(`| Project | ${issue.project?.name ?? ''} |`)
  lines.push(`| Tracker | ${issue.tracker?.name ?? ''} |`)
  lines.push(`| Status | ${issue.status?.name ?? ''} |`)
  lines.push(`| Priority | ${issue.priority?.name ?? ''} |`)
  lines.push(`| Author | ${issue.author?.name ?? ''} |`)
  if (issue.assigned_to?.name !== undefined) lines.push(`| Assignee | ${issue.assigned_to.name} |`)
  lines.push(`| Created | ${date(issue.created_on)} |`)
  lines.push(`| Updated | ${date(issue.updated_on)} |`)
  lines.push(`| URL | ${base}/issues/${issue.id} |`)
  lines.push('')

  lines.push('## Description', '')
  lines.push(demoteHeadings(issue.description ?? ''))
  lines.push('')

  lines.push('## Journals', '')
  // a journal with neither notes nor details is left out; `（なし）` when nothing is left
  const kept = (issue.journals ?? []).filter(
    (journal) => (journal.notes ?? '').trim() !== '' || (journal.details ?? []).length > 0,
  )
  if (kept.length === 0) lines.push('（なし）', '')
  for (const journal of kept) {
    lines.push(`### ${journal.user?.name ?? ''} — ${minute(journal.created_on)} UTC`, '')
    if ((journal.notes ?? '').trim() !== '') lines.push(journal.notes ?? '', '')
    for (const detail of journal.details ?? []) {
      lines.push(`- ${detail.name ?? ''}: ${detail.old_value ?? ''} → ${detail.new_value ?? ''}`)
    }
    if ((journal.details ?? []).length > 0) lines.push('')
  }

  lines.push(
    '## Attachments',
    '',
    '| File | Size | Saved as | Result |',
    '| --- | --- | --- | --- |',
  )
  for (const row of rows) {
    const result = row.reason === null ? 'OK' : `取得失敗: ${row.reason}`
    lines.push(`| ${row.originalName} | ${row.size} | ${row.savedName ?? '-'} | ${result} |`)
  }
  lines.push('')

  for (const row of rows) {
    if (row.reason !== null || row.link === null) continue
    if (!row.contentType.startsWith('image/')) continue
    lines.push(`### ${row.originalName}`, '')
    lines.push(`![${row.originalName}](${linkTarget(row.link)})`, '')
    lines.push('（説明なし）', '')
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}
