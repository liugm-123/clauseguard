import { AlertTriangle, Check, ChevronRight, Cpu, Loader2, MinusCircle, Wrench } from 'lucide-react'
import clsx from 'clsx'
import { useReviewStore } from '@/store/reviewStore'

const STATUS_ICON = {
  running: <Loader2 className="h-3 w-3 animate-spin" />,
  done: <Check className="h-3 w-3" />,
  skipped: <MinusCircle className="h-3 w-3" />,
  failed: <AlertTriangle className="h-3 w-3" />,
}

const STATUS_STYLE = {
  running: 'border-accent/60 bg-accent/15 text-white animate-pulse-ring',
  done: 'border-risk-low/40 bg-risk-low/[0.08] text-risk-low',
  skipped: 'border-white/10 text-slate-500',
  failed: 'border-risk-high/50 bg-risk-high/10 text-risk-high',
}

export function PipelineBar() {
  const steps = useReviewStore((s) => s.steps)
  const tools = useReviewStore((s) => s.tools)
  const phase = useReviewStore((s) => s.phase)
  const streaming = useReviewStore((s) => s.streaming)
  const result = useReviewStore((s) => s.result)

  if (phase === 'idle' && steps.length === 0) return null

  const expected = 8
  const doneCount = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const progress = Math.min(100, Math.round((doneCount / expected) * 100))

  return (
    <section className="px-4 pt-3 md:px-6">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="flex items-center gap-2 text-[12px] font-medium text-accent-soft">
            <Cpu className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{streaming ? 'Agent 工作流执行中' : 'Agent 工作流已完成'}</span>
            {result && (
              <span className="hidden truncate text-slate-500 md:inline">
                · {result.stats.elapsed_ms} ms · {result.retrieval.method}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="tabular-nums">{doneCount}/8 步</span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-risk-low transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {steps.map((step, i) => (
            <div key={step.id} className="group relative">
              <div
                className={clsx(
                  'chip cursor-default',
                  STATUS_STYLE[step.status] || STATUS_STYLE.skipped,
                )}
              >
                {STATUS_ICON[step.status] || STATUS_ICON.skipped}
                <span className="max-w-[140px] truncate">{step.title}</span>
                {step.status === 'done' && step.detail && (
                  <ChevronRight className="h-3 w-3 opacity-40" />
                )}
              </div>
              {step.detail && (
                <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-white/10 bg-[#111828] p-2.5 text-[11.5px] leading-relaxed text-slate-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  {step.detail}
                </div>
              )}
              {i === steps.length - 1 && null}
            </div>
          ))}
        </div>

        {tools.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-4 py-2">
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              <Wrench className="h-3 w-3" />
              工具调用
            </span>
            {tools.map((tool, i) => (
              <span
                key={`${tool.name}-${i}`}
                className={clsx(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]',
                  tool.ok
                    ? 'border-accent/30 bg-accent/10 text-accent-soft'
                    : 'border-risk-high/40 bg-risk-high/10 text-risk-high',
                )}
                title={`${JSON.stringify(tool.args)} · ${tool.summary}`}
              >
                {tool.name}
                <span className="text-slate-500">{tool.source === 'llm' ? 'LLM 决策' : '规则计划'}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
