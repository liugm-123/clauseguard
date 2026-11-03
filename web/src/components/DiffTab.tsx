import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Columns2, Loader2 } from 'lucide-react'
import { callTool } from '@/lib/api'
import { useReviewStore } from '@/store/reviewStore'

export function DiffTab() {
  const result = useReviewStore((s) => s.result)
  const text = useReviewStore((s) => s.text)
  const [diff, setDiff] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!result || result.category !== 'rental' || !text.trim()) {
      setDiff([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    callTool('template_diff', { text, template: 'rental_standard' })
      .then((data) => {
        if (!cancelled) setDiff((data.diff as string[]) || [])
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [result, text])

  if (!result) {
    return <p className="px-3 py-8 text-center text-[12.5px] text-slate-500">审查完成后自动与官方示范文本比对</p>
  }
  if (result.category !== 'rental') {
    return (
      <p className="px-3 py-8 text-center text-[12.5px] leading-relaxed text-slate-500">
        当前合同类型为「{result.category_name}」，示范文本对照目前支持房屋租赁合同
      </p>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2 text-[11px] text-slate-500">
        <Columns2 className="h-3 w-3" />
        你的合同 vs 住建部《房屋租赁合同》示范文本
        <span className="ml-auto text-risk-low">+ 新增</span>
        <span className="text-risk-high">− 缺失</span>
      </div>
      <div className="scroll-area flex-1 p-3">
        {loading && (
          <div className="flex items-center gap-2 px-2 py-6 text-[12px] text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在比对示范文本…
          </div>
        )}
        {error && <p className="px-2 py-6 text-[12px] text-risk-high">{error}</p>}
        {!loading && !error && (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.75]">
            {diff.length === 0 ? (
              <span className="font-sans text-slate-500">两份文本结构一致，未发现差异</span>
            ) : (
              diff.map((line, i) => (
                <span
                  key={i}
                  className={clsx(
                    'block',
                    line.startsWith('+') && !line.startsWith('+++') && 'text-risk-low',
                    line.startsWith('-') && !line.startsWith('---') && 'text-risk-high',
                    line.startsWith('@@') && 'mt-1 text-accent-soft',
                    line.startsWith('---') || line.startsWith('+++') ? 'text-slate-500' : '',
                  )}
                >
                  {line || ' '}
                </span>
              ))
            )}
          </pre>
        )}
      </div>
    </div>
  )
}
