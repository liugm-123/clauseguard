import { useEffect, useRef, useState } from 'react'
import { Copy, FileSignature, Loader2, X } from 'lucide-react'
import { streamLetterTokens } from '@/lib/api'
import { useReviewStore } from '@/store/reviewStore'
import { useToast } from '@/store/toastStore'

export function LetterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const result = useReviewStore((s) => s.result)
  const [letter, setLetter] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [mode, setMode] = useState<'llm' | 'template' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const showToast = useToast((s) => s.show)

  useEffect(() => {
    if (!open || !result) return
    const controller = new AbortController()
    abortRef.current = controller
    setLetter('')
    setError(null)
    setMode(null)
    setStreaming(true)

    const payload = {
      category_name: result.category_name,
      findings: result.findings.map((f) => ({
        clause_title: f.clause_title,
        advice: f.advice,
        risk_level_name: f.risk_level_name,
        citations: f.citations.map((c) => ({ law_name: c.law_name, article: c.article })),
      })),
    }

    streamLetterTokens(
      payload,
      {
        onToken: (text) => setLetter((prev) => prev + text),
        onDone: (m) => {
          setMode(m === 'template' ? 'template' : 'llm')
          setStreaming(false)
        },
        onError: (message) => {
          setError(message)
          setStreaming(false)
        },
      },
      controller.signal,
    ).catch((err: Error) => {
      if (err.name === 'AbortError') return
      setError(err.message)
      setStreaming(false)
    })

    return () => controller.abort()
  }, [open, result])

  if (!open) return null

  const copy = () => {
    navigator.clipboard
      .writeText(letter)
      .then(() => showToast('协商函已复制，可直接发邮件或微信', 'success'))
      .catch(() => showToast('复制失败，请手动选择文本', 'error'))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="panel flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden animate-fade-up">
        <div className="panel-head">
          <span className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-accent" />
            协商函（流式生成）
            {mode && (
              <span className="rounded bg-white/[0.06] px-1.5 py-[1px] text-[10px] text-slate-400">
                {mode === 'llm' ? 'DeepSeek 生成' : '规则模板'}
              </span>
            )}
          </span>
          <button className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-area flex-1 whitespace-pre-wrap px-5 py-4 text-[13px] leading-[1.95] text-slate-200">
          {letter || (streaming ? '正在整理审查要点…' : '暂无内容')}
          {streaming && <span className="stream-caret" />}
          {error && <span className="text-risk-high">{error}</span>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
          <span className="text-[11px] text-slate-500">
            {streaming ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                逐字生成中，可先阅读已生成部分
              </span>
            ) : (
              `${letter.length} 字 · 请核对后发送`
            )}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost h-8" onClick={onClose}>
              关闭
            </button>
            <button className="btn-primary h-8" onClick={copy} disabled={streaming || !letter}>
              <Copy className="h-3.5 w-3.5" />
              复制全文
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
