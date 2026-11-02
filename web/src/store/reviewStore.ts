import { create } from 'zustand'
import { getSample, getSamples, streamReview } from '@/lib/api'
import type { Clause, Phase, Finding, ReviewResult, Sample, Step, ToolCall } from '@/lib/types'

interface ReviewState {
  text: string
  phase: Phase
  error: string | null
  samples: Sample[]
  steps: Step[]
  tools: ToolCall[]
  clauses: Clause[]
  findings: Finding[]
  result: ReviewResult | null
  selected: number | null
  /** 已完成事件的时间戳，用于进度动画 */
  streaming: boolean
  setText: (text: string) => void
  loadSamples: () => Promise<void>
  loadSample: (id: string) => Promise<void>
  runReview: () => Promise<void>
  select: (clauseIndex: number | null) => void
  reset: () => void
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  text: '',
  phase: 'idle',
  error: null,
  samples: [],
  steps: [],
  tools: [],
  clauses: [],
  findings: [],
  result: null,
  selected: null,
  streaming: false,

  setText: (text) => set({ text }),

  loadSamples: async () => {
    try {
      const samples = await getSamples()
      set({ samples })
    } catch {
      set({ samples: [] })
    }
  },

  loadSample: async (id) => {
    try {
      const text = await getSample(id)
      set({
        text,
        phase: 'idle',
        findings: [],
        clauses: [],
        result: null,
        steps: [],
        tools: [],
        error: null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '示例载入失败' })
    }
  },

  runReview: async () => {
    const text = get().text.trim()
    if (text.length < 20) {
      set({ error: '请先粘贴合同全文，或从右上角载入示例合同（至少 20 字）' })
      return
    }
    set({
      phase: 'reviewing',
      streaming: true,
      error: null,
      steps: [],
      tools: [],
      clauses: [],
      findings: [],
      result: null,
      selected: null,
    })

    try {
      await streamReview(text, {
        onStep: (step) =>
          set((state) => {
            const index = state.steps.findIndex((s) => s.id === step.id)
            const steps = [...state.steps]
            if (index >= 0) steps[index] = step
            else steps.push(step)
            return { steps }
          }),
        onTool: (tool) => set((state) => ({ tools: [...state.tools, tool] })),
        onClauses: (clauses) => set({ clauses }),
        onFinding: (finding) =>
          set((state) => ({
            findings: state.findings.some((f) => f.clause_index === finding.clause_index)
              ? state.findings.map((f) => (f.clause_index === finding.clause_index ? finding : f))
              : [...state.findings, finding],
          })),
        onResult: (result) =>
          set({
            result,
            clauses: result.clauses,
            findings: result.findings,
            steps: result.steps,
            tools: result.tools,
          }),
        onError: (message) => set({ error: message, phase: 'error', streaming: false }),
        onDone: () =>
          set((state) => ({
            streaming: false,
            phase: state.result ? 'done' : 'error',
          })),
      })
    } catch (err) {
      set({
        phase: 'error',
        streaming: false,
        error: err instanceof Error ? err.message : '审查失败，请稍后重试',
      })
    }
  },

  select: (clauseIndex) => set({ selected: clauseIndex }),

  reset: () =>
    set({
      phase: 'idle',
      steps: [],
      tools: [],
      clauses: [],
      findings: [],
      result: null,
      selected: null,
      error: null,
      streaming: false,
    }),
}))
