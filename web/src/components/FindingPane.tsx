import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { BookOpen, Braces, ShieldAlert, Sparkles } from 'lucide-react'
import { useReviewStore } from '@/store/reviewStore'
import type { Finding } from '@/lib/types'
import { RiskDot } from './RiskTag'

function FindingCard({
  finding,
  active,
  onSelect,
}: {
  finding: Finding
  active: boolean
  onSelect: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={clsx(
        'w-full rounded-xl border p-3 text-left transition-all duration-200',
        active
          ? 'border-accent/70 bg-accent/[0.09] shadow-glow'
          : 'border-white/[0.07] bg-white/[0.015] hover:border-white/20',
      )}
    >
      <div className="flex items-start gap-2">
        <RiskDot level={finding.risk_level} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold leading-snug text-slate-100">
              {finding.clause_title}
            </span>
            <span className="text-[11.5px] text-slate-400">· {finding.scenario}</span>
            {finding.llm_verified && (
              <span className="rounded bg-risk-low/15 px-1.5 py-[1px] text-[10px] text-risk-low">LLM 复核 ✓</span>
            )}
            {finding.provisional && !finding.llm_verified && (
              <span className="rounded bg-risk-medium/15 px-1.5 py-[1px] text-[10px] text-risk-medium">
                规则初筛 · 复核中
              </span>
            )}
            <span className="ml-auto shrink-0 text-[10.5px] text-slate-500">置信度 {finding.confidence}</span>
          </div>

          <p className="mt-1.5 text-[12.8px] leading-[1.75] text-slate-200">{finding.advice}</p>

          <div className="mt-2 space-y-1.5">
            {finding.citations.map((citation) => (
              <div
                key={citation.law_id}
                className="rounded-md border-l-2 border-accent bg-white/[0.03] px-2.5 py-1.5"
              >
                <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-accent-soft">
                  <BookOpen className="h-3 w-3" />
                  {citation.law_name} {citation.article}
                  <span className="ml-auto font-mono text-[10px] text-slate-500">
                    {citation.law_id} · 相关度 {citation.score.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-4 text-[11.5px] leading-relaxed text-slate-400">{citation.text}</p>
                {citation.matched_keywords.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {citation.matched_keywords.slice(0, 4).map((keyword) => (
                      <span key={keyword} className="rounded bg-white/[0.06] px-1.5 py-[1px] text-[10px] text-slate-400">
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {finding.extra_checks.length > 0 && (
            <div className="mt-2 space-y-1">
              {finding.extra_checks.map((check, i) => (
                <div key={i} className="flex gap-1.5 text-[11.5px] leading-relaxed text-risk-medium">
                  <Braces className="mt-[2px] h-3 w-3 shrink-0" />
                  <span>{check}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export function FindingPane() {
  const findings = useReviewStore((s) => s.findings)
  const result = useReviewStore((s) => s.result)
  const selected = useReviewStore((s) => s.selected)
  const select = useReviewStore((s) => s.select)
  const phase = useReviewStore((s) => s.phase)
  const streaming = useReviewStore((s) => s.streaming)

  return (
    <section className="panel flex min-h-0 flex-col">
      <div className="panel-head">
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-risk-medium" />
          风险 · 法条依据
        </span>
        <div className="flex items-center gap-2">
          {result && (
            <span
              className={clsx(
                'rounded px-2 py-0.5 text-[10.5px]',
                result.engine_mode === 'llm'
                  ? 'bg-risk-low/15 text-risk-low'
                  : 'bg-risk-medium/15 text-risk-medium',
              )}
              title={result.notes.join('；')}
            >
              {result.engine_mode === 'llm' ? 'DeepSeek 已接入' : '规则引擎模式'}
            </span>
          )}
          {result && (
            <span className="text-[11px] tabular-nums text-slate-400">
              风险值 {result.risk_score} · 检出 {findings.length} 处
            </span>
          )}
        </div>
      </div>

      {result?.injection.detected && (
        <div className="mx-3 mt-2 rounded-lg border border-risk-high/40 bg-risk-high/[0.1] px-3 py-2 text-[11.5px] leading-relaxed text-risk-high">
          <Sparkles className="mr-1 inline h-3 w-3" />
          检测到合同文本中包含疑似针对 AI 的指令（{result.injection.hits.join('、')}），已按「数据而非指令」隔离处理。
        </div>
      )}

      <div className="scroll-area flex-1 space-y-2 p-3">
        {findings.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            {streaming ? (
              <>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                <p className="text-[12.5px] text-slate-500">正在逐条复核条款…</p>
              </>
            ) : (
              <>
                <ShieldAlert className="h-8 w-8 text-slate-700" />
                <p className="text-[12.5px] leading-relaxed text-slate-500">
                  {phase === 'done' ? '未发现明显风险条款，仍建议逐条核对' : '审查完成后，风险条款与法条依据会出现在这里'}
                </p>
              </>
            )}
          </div>
        )}
        {findings.map((finding) => (
          <FindingCard
            key={finding.clause_index}
            finding={finding}
            active={selected === finding.clause_index}
            onSelect={() => select(selected === finding.clause_index ? null : finding.clause_index)}
          />
        ))}
      </div>
    </section>
  )
}
