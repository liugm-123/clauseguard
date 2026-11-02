/** 与后端 engine.review() 返回结构一一对应，前后端类型同源可查。 */

export type RiskLevel = 'high' | 'medium' | 'low'
export type StepStatus = 'running' | 'done' | 'skipped' | 'failed'

export interface Clause {
  index: number
  title: string
  text: string
  is_preamble: boolean
}

export interface Citation {
  law_id: string
  law_name: string
  article: string
  text: string
  scenario: string
  score: number
  matched_keywords: string[]
}

export interface Finding {
  clause_index: number
  clause_title: string
  clause_excerpt: string
  risk_level: RiskLevel
  risk_level_name: string
  scenario: string
  citations: Citation[]
  advice: string
  script: string
  extra_checks: string[]
  confidence: string
  llm_verified: boolean
  evidence_quote: string
  /** 流式中间态：规则初筛刚推送、尚未经 LLM 复核 */
  provisional?: boolean
}

export interface Step {
  id: string
  title: string
  detail: string
  status: StepStatus
  elapsed_ms: number
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
  ok: boolean
  summary: string
  round: number
  source: 'llm' | 'rule'
}

export interface LlmStats {
  verified: number
  dropped: number
  rejected: number
  citation_warn: number
}

export interface ReviewResult {
  category: string
  category_name: string
  engine_mode: 'llm' | 'rule'
  notes: string[]
  injection: { detected: boolean; hits: string[] }
  clauses: Clause[]
  findings: Finding[]
  tools: ToolCall[]
  risk_score: number
  verdict: string
  verdict_level: RiskLevel
  steps: Step[]
  llm_stats: LlmStats
  retrieval: { method: string; corpus_size: number }
  stats: {
    clause_count: number
    finding_count: number
    high_risk: number
    elapsed_ms: number
  }
  disclaimer: string
}

export interface Sample {
  id: string
  name: string
}

export interface LetterPayload {
  category_name: string
  findings: Array<{
    clause_title: string
    advice: string
    risk_level_name: string
    citations: Array<{ law_name: string; article: string }>
  }>
}

export type Phase = 'idle' | 'reviewing' | 'done' | 'error'
