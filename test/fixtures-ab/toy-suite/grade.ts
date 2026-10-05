// The toy grader the A/B runner tests use. The real graders are the deliverables of G2 and G3; this
// one exists to prove that the runner loads a grader, passes it the run directory and writes what it
// returns, and that `report` can compare two runs of an arm on an agreement key.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Assertion = { id: string; kind: 'mechanical' | 'judgment'; text: string }
type OutputFile = { path: string; size: number; sha256: string }
type Grade = { id: string; kind: Assertion['kind']; passed: boolean | null; evidence: string }

export const grade = (
  _evalId: string,
  runDir: string,
  context: { assertions: Assertion[]; outputs: OutputFile[]; finalReply: string },
): Grade[] =>
  context.assertions.map((assertion) => {
    if (assertion.kind === 'judgment') {
      return { id: assertion.id, kind: assertion.kind, passed: null, evidence: '' }
    }
    if (assertion.id === 'M1') {
      const found = context.outputs.find((o) => o.path === 'out/answer.md')
      return {
        id: 'M1',
        kind: assertion.kind,
        passed: found !== undefined,
        evidence:
          found === undefined
            ? `outputs.json of ${runDir} lists no out/answer.md`
            : `outputs.json: out/answer.md, ${found.size} bytes, sha256 ${found.sha256}`,
      }
    }
    return {
      id: assertion.id,
      kind: assertion.kind,
      passed: context.finalReply.trim() !== '',
      evidence: `the final reply is ${context.finalReply.trim().length} characters`,
    }
  })

/** Two runs of one arm agree when they left the same files with the same bytes. */
export const agreementKey = (_evalId: string, runDir: string): string => {
  const outputs = JSON.parse(readFileSync(join(runDir, 'outputs.json'), 'utf8')) as OutputFile[]
  return outputs
    .map((o) => `${o.path}:${o.sha256}`)
    .sort()
    .join('|')
}
