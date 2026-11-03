import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FileText, Mic, MicOff } from 'lucide-react'
import clsx from 'clsx'
import { useReviewStore } from '@/store/reviewStore'
import { useToast } from '@/store/toastStore'

type SpeechCtor = new () => {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

export function ContractInput() {
  const text = useReviewStore((s) => s.text)
  const setText = useReviewStore((s) => s.setText)
  const phase = useReviewStore((s) => s.phase)
  const result = useReviewStore((s) => s.result)
  const [collapsed, setCollapsed] = useState(false)
  const [listening, setListening] = useState(false)
  const recognition = useRef<InstanceType<SpeechCtor> | null>(null)
  const showToast = useToast((s) => s.show)

  useEffect(() => {
    if (result) setCollapsed(true)
  }, [result])

  const toggleSpeech = () => {
    const Ctor = (window as unknown as { webkitSpeechRecognition?: SpeechCtor; SpeechRecognition?: SpeechCtor })
      .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition
    if (!Ctor) {
      showToast('当前浏览器不支持语音输入，请使用 Chrome / Edge', 'error')
      return
    }
    if (listening) {
      recognition.current?.stop()
      setListening(false)
      return
    }
    const rec = new Ctor()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1]
      const transcript = last?.[0]?.transcript ?? ''
      if (transcript) {
        useReviewStore.setState({ text: `${useReviewStore.getState().text}${transcript}` })
      }
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognition.current = rec
    rec.start()
    setListening(true)
    showToast('语音输入已开启：按住说话，内容会追加到合同末尾', 'info')
  }

  return (
    <section className="px-4 pt-3 md:px-6">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2">
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            <span>合同原文</span>
            <span className="text-slate-600">·</span>
            <span className="tabular-nums">{text.length} 字</span>
            {text.length > 0 && text.length < 20 && (
              <span className="text-risk-medium">（至少 20 字才能审查）</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              className={clsx('btn-ghost h-7 px-2 text-[11.5px]', listening && 'text-risk-high')}
              onClick={toggleSpeech}
              title="语音输入（Web Speech API）"
            >
              {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{listening ? '停止' : '语音'}</span>
            </button>
            <button
              className="btn-ghost h-7 px-2 text-[11.5px]"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? '展开编辑' : '收起'}
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{collapsed ? '展开' : '收起'}</span>
            </button>
          </div>
        </div>

        <div className={clsx('transition-all duration-300', collapsed ? 'max-h-0 opacity-0' : 'max-h-[280px] opacity-100')}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                void useReviewStore.getState().runReview()
              }
            }}
            spellCheck={false}
            placeholder="粘贴合同全文，或从右上角「载入示例合同」开始；也可以直接拍纸质合同照片上传。&#10;&#10;支持：房屋租赁合同 / 实习协议 / 三方就业协议 / 培训贷合同"
            className="scroll-area h-[132px] w-full resize-none bg-transparent px-4 py-3 text-[13.5px] leading-[1.85] text-slate-200 outline-none placeholder:text-slate-600"
          />
        </div>

        {collapsed && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-[12px] text-slate-500">
            <span className="truncate">{text.slice(0, 60) || '（暂无内容）'}…</span>
            <span className="shrink-0 text-slate-600">{phase === 'reviewing' ? '审查进行中' : '已生成报告'}</span>
          </div>
        )}
      </div>
    </section>
  )
}
