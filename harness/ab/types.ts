export type Assertion = { id: string; kind: 'mechanical' | 'judgment'; text: string }

export type EvalDef = {
  id: string
  prompt: string
  mocks: string[]
  workspace: { dirs: string[] }
  expected_output?: string
  assertions: Assertion[]
}

export type Suite = { skill: string; evals: EvalDef[] }

export type Grade = {
  id: string
  kind: Assertion['kind']
  /** null for a judgment assertion: a reader fills it in, quoting the evidence */
  passed: boolean | null
  evidence: string
}

export type OutputFile = {
  path: string
  size: number
  sha256: string
  /** the first 64 bytes, so a reader can tell a PNG from an error page without the file */
  head64: string
  copied: boolean
}
