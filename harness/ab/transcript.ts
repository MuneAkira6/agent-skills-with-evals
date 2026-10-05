// Reading the arm's own stream, after redaction, into the two things a reader needs: what it did
// and what it said.

export type ToolCall = { name: string; input: string }

export type ArmTranscript = {
  toolCalls: ToolCall[]
  finalReply: string
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** One line per tool call, the input cut to 160 characters, then the final reply. */
export const INPUT_LIMIT = 160

export const readTranscript = (redactedStdout: string): ArmTranscript => {
  const toolCalls: ToolCall[] = []
  let finalReply = ''
  let lastAssistantText = ''
  for (const raw of redactedStdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('{')) continue
    let event: Record<string, unknown> | null
    try {
      event = asRecord(JSON.parse(line))
    } catch {
      continue
    }
    if (event === null) continue
    if (event.type === 'assistant') {
      const message = asRecord(event.message)
      const content = Array.isArray(message?.content) ? message.content : []
      for (const part of content) {
        const block = asRecord(part)
        if (block === null) continue
        if (block.type === 'tool_use') {
          toolCalls.push({
            name: typeof block.name === 'string' ? block.name : '(unnamed)',
            input: JSON.stringify(block.input ?? {}),
          })
        } else if (block.type === 'text' && typeof block.text === 'string') {
          lastAssistantText = block.text
        }
      }
    } else if (event.type === 'result' && typeof event.result === 'string') {
      finalReply = event.result
    }
  }
  return { toolCalls, finalReply: finalReply === '' ? lastAssistantText : finalReply }
}

export const transcriptMarkdown = (transcript: ArmTranscript): string => {
  const lines = ['# Transcript', '', '## Tool calls', '']
  if (transcript.toolCalls.length === 0) lines.push('(none)')
  for (const call of transcript.toolCalls) {
    const input =
      call.input.length > INPUT_LIMIT ? `${call.input.slice(0, INPUT_LIMIT)}…` : call.input
    lines.push(`- ${call.name} ${input}`)
  }
  lines.push(
    '',
    '## Final reply',
    '',
    transcript.finalReply === '' ? '(empty)' : transcript.finalReply,
    '',
  )
  return lines.join('\n')
}
