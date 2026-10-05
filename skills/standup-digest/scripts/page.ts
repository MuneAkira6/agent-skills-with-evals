// The page. The table is the product; the language model only ever fills in short phrases, and the
// page reads the same without it. Japanese without politeness markers, because it is read aloud
// standing up.
//
// Every open tracked item appears **exactly once** among the decisions, the table, 発言不要 and ⏸️.
// A line with nothing to say is left out.

import { createHash } from 'node:crypto'
import type { Facts, Feedback, ItemFacts } from './facts.ts'
import type { Config, Lane } from './rules.ts'
import { monthDay, TRIGGER_ORDER, TRIGGER_PHRASE, TRIGGER_QUESTION } from './rules.ts'

/** What the narrative may add, once the guard has accepted it. */
export type Narrative = {
  decisions: { number: number; stuck_on?: string; decision_needed?: string }[]
  one_liners: { number: number; text: string }[]
  notes: string[]
}

export type PageInput = {
  facts: Facts
  config: Config
  /** the accepted narrative, or null for a page the rules wrote alone */
  narrative: Narrative | null
  /** why there is no narrative, for the degraded line */
  degradedReason: string | null
  /** the sha256 of the facts.json these facts were written as */
  factsSha256: string
  /** the feedback comments, which are not part of the facts */
  feedback?: Feedback[]
}

const ACTIVITY_LABEL: Record<string, string> = {
  created: '作成',
  commented: 'コメント',
  committed: 'コミット',
  reviewed: 'レビュー',
  closed: 'クローズ',
  reopened: '再オープン',
  renamed: '改題',
  referenced: '参照',
  ready_for_review: 'レビュー依頼',
  convert_to_draft: '下書きに戻す',
  merged: 'マージ',
  head_ref_force_pushed: '強制プッシュ',
  'cross-referenced': 'PR 参照',
  labeled: 'ラベル',
  unlabeled: 'ラベル削除',
}

const LANE_MARK: Record<Lane, string> = {
  silent: '⏸️',
  waiting: '🔴',
  'in-progress': '🚧',
  stale: '💤',
  quiet: '🙊',
}

/** The table's lanes, in the order the page lists them. */
const TABLE_LANES: Lane[] = ['waiting', 'in-progress', 'stale']

const cut = (text: string, limit: number): string =>
  [...text].length <= limit ? text : `${[...text].slice(0, limit).join('')}…`

const numbers = (list: number[]): string => list.map((n) => `#${n}`).join('、')

const assigneesOf = (item: ItemFacts): string =>
  item.assignees.length === 0 ? '担当なし' : item.assignees.join('・')

/** The machine-made facts of a decision line, joined with `・`. */
export const decisionFacts = (item: ItemFacts): string => {
  const parts: string[] = []
  if (item.waitingDays > 0) parts.push(`待ち ${item.waitingDays} 日`)
  for (const pull of item.waitingPulls) {
    // an item that *is* the pull request does not name itself twice on its own line: the heading
    // above already says #<n>, and the page must mention each tracked item exactly once
    parts.push(
      pull.number === item.number
        ? `レビュー待ち ${pull.days} 日`
        : `PR #${pull.number} レビュー待ち ${pull.days} 日`,
    )
  }
  if (item.carryover) parts.push('前マイルストーンから持ち越し')
  if (item.assignees.length === 0) parts.push('担当なし')
  if (item.blockedBy > 0) parts.push(`依存 ${item.blockedBy} 件未完了`)
  return parts.join('・')
}

/** The kind and date of the latest activity, e.g. `コメント 10/03`. */
export const latestMove = (item: ItemFacts, config: Config): string => {
  if (item.latestActivity === null) return '動きなし'
  const label = ACTIVITY_LABEL[item.latestActivity.kind] ?? item.latestActivity.kind
  return `${label} ${monthDay(item.latestActivity.at, config.timezone, true)}`
}

const minuteInZone = (iso: string, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}

export const renderPage = (input: PageInput): string => {
  const { facts, config, narrative } = input
  const byNumber = new Map(facts.items.map((item) => [item.number, item]))
  const lines: string[] = []

  const dueText =
    facts.milestone.dueOn === null
      ? '期日なし'
      : `${monthDay(facts.milestone.dueOn, config.timezone, false)}まで`
  const leftText = facts.milestone.daysLeft === null ? '' : `・残り ${facts.milestone.daysLeft} 日`
  const measured = `${monthDay(facts.now, config.timezone, true)} ${minuteInZone(facts.now, config.timezone)}`
  lines.push(
    `**${facts.milestone.title}（${dueText}${leftText}）｜ 未完了 ${facts.milestone.open}/${facts.milestone.all} ｜ 前マイルストーン残 ${facts.carryover.length} ｜ ${measured} 計測**`,
    '',
  )

  // 今日決めること
  const decisions = facts.decisions
    .map((number) => byNumber.get(number))
    .filter((item): item is ItemFacts => item !== undefined)
  lines.push(`## 今日決めること（${decisions.length}）`, '')
  if (input.degradedReason !== null) {
    lines.push(`本日は自動要約なし（${input.degradedReason}）。以下は機械判定のみ。`, '')
  }
  if (decisions.length === 0) {
    lines.push('今日決めることはない。', '')
  }
  for (const [index, item] of decisions.entries()) {
    const narrated = narrative?.decisions.find((entry) => entry.number === item.number)
    const firstTrigger = TRIGGER_ORDER.find((trigger) => item.triggers.includes(trigger))
    const question =
      narrated?.decision_needed !== undefined && narrated.decision_needed !== ''
        ? narrated.decision_needed
        : firstTrigger === undefined
          ? ''
          : TRIGGER_QUESTION[firstTrigger]
    const stuck =
      narrated?.stuck_on !== undefined && narrated.stuck_on !== ''
        ? narrated.stuck_on
        : firstTrigger === undefined
          ? ''
          : TRIGGER_PHRASE[firstTrigger]
    lines.push(`${index + 1}. **#${item.number} ${assigneesOf(item)} ― ${question}**`)
    lines.push(`   ${cut(item.title, 40)} ｜ ${decisionFacts(item)} ｜ ${stuck}`)
  }
  if (decisions.length > 0) lines.push('')

  // それ以外の未完了: the table holds what is neither a decision, nor quiet, nor silent
  const tableItems = TABLE_LANES.flatMap((lane) =>
    facts.items
      .filter((item) => !item.decision && item.lane === lane)
      .sort((a, b) => a.number - b.number),
  )
  lines.push(`## それ以外の未完了（${tableItems.length}）`, '')
  const laneCount = (lane: Lane): number => tableItems.filter((item) => item.lane === lane).length
  lines.push(
    `${LANE_MARK.waiting} ${laneCount('waiting')} ・ ${LANE_MARK['in-progress']} ${laneCount('in-progress')} ・ ${LANE_MARK.stale} ${laneCount('stale')}`,
    '',
  )
  lines.push('| # | 担当 | 状態 | 直近の動き |', '|---|---|---|---|')
  for (const item of tableItems) {
    const oneLiner = narrative?.one_liners.find((entry) => entry.number === item.number)
    const move =
      oneLiner !== undefined && oneLiner.text !== '' ? oneLiner.text : latestMove(item, config)
    lines.push(`| #${item.number} | ${assigneesOf(item)} | ${LANE_MARK[item.lane]} | ${move} |`)
  }
  lines.push('')

  // the four one-line summaries; a line with nothing to say is left out
  const closed = facts.closedSinceYesterday
  const created = facts.createdSinceYesterday
  const eventHalves: string[] = []
  if (closed.length > 0) eventHalves.push(`✅ 昨日から完了 ${closed.length}：${numbers(closed)}`)
  if (created.length > 0) eventHalves.push(`🆕 追加 ${created.length}：${numbers(created)}`)
  if (eventHalves.length > 0) lines.push(`- ${eventHalves.join(' ／ ')}`)

  const quiet = facts.items
    .filter((item) => !item.decision && item.lane === 'quiet')
    .map((item) => item.number)
  if (quiet.length > 0) lines.push(`- 🙊 発言不要（${quiet.length}）：${numbers(quiet)}`)

  const silent = facts.items.filter((item) => item.lane === 'silent')
  if (silent.length > 0) {
    const marked = silent
      .map((item) => `#${item.number}${item.carryover ? '（前マイルストーン残）' : ''}`)
      .join('、')
    lines.push(`- ⏸️ 14 日以上動きなし（${silent.length}）：${marked}`)
  }

  const hygieneParts: string[] = []
  if (facts.hygiene.unassigned.length > 0) {
    hygieneParts.push(
      `担当なし ${facts.hygiene.unassigned.length}（${numbers(facts.hygiene.unassigned)}）`,
    )
  }
  if (facts.hygiene.labelConflict.length > 0) {
    hygieneParts.push(
      `ラベル矛盾 ${facts.hygiene.labelConflict.length}（${numbers(facts.hygiene.labelConflict)}）`,
    )
  }
  if (hygieneParts.length > 0) lines.push(`- ⚠️ 不備：${hygieneParts.join('・')}`)
  if (eventHalves.length > 0 || quiet.length > 0 || silent.length > 0 || hygieneParts.length > 0) {
    lines.push('')
  }

  const feedback = input.feedback ?? []
  if (feedback.length > 0) {
    lines.push('## 💬 前日までのコメント', '')
    for (const comment of feedback.slice(0, 5)) {
      lines.push(`- ${comment.date} ${comment.author}：${comment.body}`)
    }
    for (const note of narrative?.notes ?? []) lines.push(`- （AI）${note}`)
    lines.push('')
  }

  // the rule and the footer sit on consecutive lines, as the contract's template shows
  lines.push('---')
  lines.push(
    `計測 ${facts.now} ／ ${facts.repo} ／ facts ${input.factsSha256.slice(0, 8)} ／ 自動生成。判断は人が行う`,
  )
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

export const sha256Of = (text: string): string => createHash('sha256').update(text).digest('hex')
