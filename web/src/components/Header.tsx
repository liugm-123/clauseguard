import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, Play, ShieldCheck, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { visionExtract } from '@/lib/api'
import { useReviewStore } from '@/store/reviewStore'
import { useToast } from '@/store/toastStore'

interface Health {
  ok: boolean
  engine: 'llm' | 'rule'
  vision: boolean
  model: string | null
}

export function Header() {
  const samples = useReviewStore((s) => s.samples)
  const loadSample = useReviewStore((s) => s.loadSample)
  const runReview = useReviewStore((s) => s.runReview)
  const phase = useReviewStore((s) => s.phase)
  const text = useReviewStore((s) => s.text)
  const showToast = useToast((s) => s.show)
  const fileRef = useRef<HTMLInputElement>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data: Health) => setHealth(data))
      .catch(() => setHealth(null))
  }, [])

  const onPickPhoto = async (file: File) => {
    setUploading(true)
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('读取图片失败'))
        reader.readAsDataURL(file)
      })
      const extracted = await visionExtract(dataUri)
      useReviewStore.setState({ text: extracted, error: null })
      showToast(`识别完成（${extracted.length} 字），请核对后开始审查`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : '识别失败，请改用粘贴文本', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#121a2b]/90 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-deep shadow-[0_8px_22px_-10px_rgba(79,124,255,.9)]">
          <ShieldCheck className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-semibold tracking-wide">契约哨兵 ClauseGuard</h1>
            <span className="hidden rounded border border-white/10 px-1.5 py-[1px] text-[10px] text-slate-400 sm:inline">
              v2.0
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-slate-400">不是帮你读合同，而是在签字前告诉你哪一条会让你赔钱</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={clsx(
            'hidden items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex',
            health?.engine === 'llm'
              ? 'border-risk-low/40 bg-risk-low/10 text-risk-low'
              : 'border-risk-medium/40 bg-risk-medium/10 text-risk-medium',
          )}
          title={health?.model ? `模型：${health.model}` : '未配置 Key 时为规则引擎'}
        >
          <Sparkles className="h-3 w-3" />
          {health?.engine === 'llm' ? 'DeepSeek 已接入' : health ? '规则引擎模式' : '连接中…'}
        </span>

        <select
          className="h-9 max-w-[190px] rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[12.5px] text-slate-200 outline-none transition hover:border-white/25 focus:border-accent"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) void loadSample(e.target.value)
            e.currentTarget.value = ''
          }}
          aria-label="载入示例合同"
        >
          <option value="">载入示例合同…</option>
          {samples.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onPickPhoto(file)
            e.currentTarget.value = ''
          }}
        />
        <button className="btn-ghost h-9" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          <span className="hidden sm:inline">{uploading ? '识别中…' : '拍照上传'}</span>
        </button>

        <button
          className="btn-primary h-9"
          onClick={() => void runReview()}
          disabled={phase === 'reviewing' || !text.trim()}
          title="Ctrl / ⌘ + Enter"
        >
          {phase === 'reviewing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {phase === 'reviewing' ? '审查中…' : '开始审查'}
        </button>
      </div>
    </header>
  )
}
