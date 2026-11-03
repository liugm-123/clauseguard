import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { Check, Copy, FileSignature, MessageSquareQuote } from 'lucide-react'
import { useReviewStore } from '@/store/reviewStore'
import { useToast } from '@/store/toastStore'

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.cssText = 'position:fixed;top:-999px;opacity:0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

export function ScriptTab({ onOpenLetter }: { onOpenLetter: () => void }) {
  const findings = useReviewStore((s) => s.findings)
  const selected = useReviewStore((s) => s.selected)
  const select = useReviewStore((s) => s.select)
  const showToast = useToast((s) => s.show)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected == null) return
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
          <MessageSquareQuote className="h-3 w-3" />
          可直接发给对方的协商话术
        </span>
        <button
          className="btn-ghost h-7 px-2 text-[11.5px]"
          onClick={onOpenLetter}
          disabled={findings.length === 0}
          title="把全部风险点汇总成一封书面协商函（流式生成）"
        >
          <FileSignature className="h-3.5 w-3.5" />
          生成协商函
        </button>
      </div>

      <div ref={listRef} className="scroll-area flex-1 space-y-2 p-3">
        {findings.length === 0 && (
          <p className="px-2 py-8 text-center text-[12.5px] leading-relaxed text-slate-500">
            选中风险条款后，这里会生成带法条依据的协商话术
          </p>
        )}
        {findings.map((finding) => (
          <div
            key={finding.clause_index}
            data-index={finding.clause_index}
            onClick={() => select(finding.clause_index)}
            className={clsx(
              'cursor-pointer rounded-lg border p-3 transition-all duration-200',
              selected === finding.clause_index
                ? 'border-accent/70 bg-accent/[0.08]'
                : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20',
            )}
          >
            <div className="mb-1.5 text-[11px] text-slate-500">
              针对「{finding.clause_title} · {finding.scenario}」
            </div>
            <p className="whitespace-pre-wrap text-[12.8px] leading-[1.8] text-slate-200">{finding.script}</p>
            <button
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-accent/50 px-2 py-1 text-[11.5px] text-accent-soft transition hover:bg-accent hover:text-white"
              onClick={(e) => {
                e.stopPropagation()
                copyText(finding.script)
                  .then(() => showToast('已复制，可直接粘贴到微信发送', 'success'))
                  .catch(() => showToast('复制失败，请手动选择文本', 'error'))
              }}
            >
              <Copy className="h-3 w-3" />
              复制话术
            </button>
          </div>
        ))}
      </div>

      {findings.length > 0 && (
        <div className="border-t border-white/[0.06] px-3 py-2 text-[11px] text-slate-500">
          <Check className="mr-1 inline h-3 w-3 text-risk-low" />
          共 {findings.length} 条话术，均已绑定法条依据
        </div>
      )}
    </div>
  )
}
