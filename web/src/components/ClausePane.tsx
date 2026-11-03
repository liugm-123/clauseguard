import { useMemo } from 'react'
import clsx from 'clsx'
import { AlertTriangle, ScrollText } from 'lucide-react'
import { useReviewStore } from '@/store/reviewStore'
import type { Clause, Finding } from '@/lib/types'
import { RiskPill } from './RiskTag'

function highlight(text: string, quote: string) {
  const q = quote?.replace(/\s+/g, '')
  if (!q || q.length < 4) return text
  const compact = text.replace(/\s+/g, '')
  const at = compact.indexOf(q)
  if (at < 0) return text
  // 在去空白坐标上定位，再映射回原文（合同里换行较多，不能直接 indexOf）
  let cursor = 0
  let originalStart = -1
  let originalEnd = -1
  for (let i = 0; i < text.length; i += 1) {
    if (/\s/.test(text[i])) continue
    if (cursor === at && originalStart < 0) originalStart = i
    if (cursor === at + q.length - 1) {
      originalEnd = i + 1
      break
    }
    cursor += 1
  }
  if (originalStart < 0 || originalEnd < 0) return text
  return (
    <>
      {text.slice(0, originalStart)}
      <mark className="evidence">{text.slice(originalStart, originalEnd)}</mark>
      {text.slice(originalEnd)}
    </>
  )
}

function ClauseCard({
  clause,
  finding,
  active,
  onSelect,
}: {
  clause: Clause
  finding?: Finding
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!finding}
      className={clsx(
        'group relative w-full rounded-lg border-l-[3px] px-3 py-2.5 text-left text-[13.5px] leading-[1.9] transition-all duration-200',
        finding ? 'cursor-pointer' : 'cursor-default',
        finding ? `clause-${finding.risk_level}` : 'border-l-transparent',
        active ? 'ring-1 ring-accent/70 bg-white/[0.04]' : 'hover:bg-white/[0.03]',
      )}
    >
      <span className="whitespace-pre-wrap text-slate-200">
        {active && finding?.evidence_quote ? highlight(clause.text, finding.evidence_quote) : clause.text}
      </span>
      {finding && (
        <span className="mt-1.5 flex items-center gap-2">
          <RiskPill level={finding.risk_level}>
            {finding.risk_level_name} · {finding.scenario}
          </RiskPill>
          {finding.llm_verified && (
            <span className="text-[10.5px] text-risk-low/80">LLM 复核 ✓</span>
          )}
        </span>
      )}
    </button>
  )
}

export function ClausePane() {
  const result = useReviewStore((s) => s.result)
  const clauses = useReviewStore((s) => s.clauses)
  const findings = useReviewStore((s) => s.findings)
  const selected = useReviewStore((s) => s.selected)
  const select = useReviewStore((s) => s.select)
  const phase = useReviewStore((s) => s.phase)

  const byIndex = useMemo(() => {
    const map = new Map<number, Finding>()
    findings.forEach((f) => map.set(f.clause_index, f))
    return map
  }, [findings])

  const activeFinding = selected != null ? byIndex.get(selected) : undefined

  return (
    <section className="panel flex min-h-0 flex-col">
      <div className="panel-head">
        <span className="flex items-center gap-1.5">
          <ScrollText className="h-3.5 w-3.5 text-slate-400" />
          合同原文
        </span>
        <div className="flex items-center gap-2">
          {result && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent-soft">
              {result.category_name}
            </span>
          )}
          <span className="text-[11px] text-slate-500">{clauses.length} 条</span>
        </div>
      </div>

      {result && (
        <div
          className={clsx(
            'mx-3 mt-2 rounded-lg px-3 py-2 text-[12.5px] font-medium',
            result.verdict_level === 'high' && 'bg-risk-high/[0.13] text-risk-high',
            result.verdict_level === 'medium' && 'bg-risk-medium/[0.12] text-risk-medium',
            result.verdict_level === 'low' && 'bg-risk-low/[0.12] text-risk-low',
          )}
        >
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          {result.verdict}
        </div>
      )}

      <div className="scroll-area flex-1 space-y-1.5 p-3">
        {clauses.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <ScrollText className="h-8 w-8 text-slate-700" />
            <p className="text-[12.5px] leading-relaxed text-slate-500">
              {phase === 'reviewing' ? '正在解析合同条款…' : '载入合同并开始审查后，这里会逐条展示原文与风险热区'}
            </p>
          </div>
        )}
        {clauses.map((clause) => {
          const finding = byIndex.get(clause.index)
          return (
            <ClauseCard
              key={clause.index}
              clause={clause}
              finding={finding}
              active={selected === clause.index}
              onSelect={() => select(finding && selected !== clause.index ? clause.index : null)}
            />
          )
        })}
        {activeFinding?.evidence_quote && (
          <div className="mt-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5 text-[11.5px] leading-relaxed text-slate-400">
            <span className="text-slate-500">AI 认定的关键原文：</span>
            <span className="text-[#ffe9a8]">{activeFinding.evidence_quote}</span>
          </div>
        )}
      </div>
    </section>
  )
}

export { highlight }
