import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { AlertTriangle, MessageSquareQuote, ScrollText, ShieldAlert, X } from 'lucide-react'
import { ClausePane } from '@/components/ClausePane'
import { ContractInput } from '@/components/ContractInput'
import { FindingPane } from '@/components/FindingPane'
import { Header } from '@/components/Header'
import { LetterModal } from '@/components/LetterModal'
import { PipelineBar } from '@/components/PipelineBar'
import { RightPane } from '@/components/RightPane'
import { useReviewStore } from '@/store/reviewStore'
import { useToast } from '@/store/toastStore'

type MobileTab = 'clause' | 'finding' | 'right'

function Toast() {
  const { message, tone, visible, hide } = useToast()
  if (!message) return null
  return (
    <div
      className={clsx(
        'fixed bottom-14 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] shadow-xl transition-all duration-300',
        tone === 'error' ? 'bg-risk-high text-white' : tone === 'success' ? 'bg-risk-low text-[#04220f]' : 'bg-accent text-white',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
      onClick={hide}
    >
      {message}
    </div>
  )
}

function ErrorBanner() {
  const error = useReviewStore((s) => s.error)
  const phase = useReviewStore((s) => s.phase)
  if (!error || phase === 'reviewing') return null
  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-risk-high/40 bg-risk-high/[0.1] px-3 py-2 text-[12.5px] text-risk-high md:mx-6">
      <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{error}</span>
      <button
        className="rounded p-0.5 hover:bg-white/10"
        onClick={() => useReviewStore.setState({ error: null })}
        aria-label="关闭提示"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export default function App() {
  const loadSamples = useReviewStore((s) => s.loadSamples)
  const runReview = useReviewStore((s) => s.runReview)
  const phase = useReviewStore((s) => s.phase)
  const findings = useReviewStore((s) => s.findings)
  const [letterOpen, setLetterOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('finding')

  useEffect(() => {
    void loadSamples()
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void useReviewStore.getState().runReview()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loadSamples, runReview])

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <Header />
      <ErrorBanner />
      <ContractInput />
      <PipelineBar />

      <div className="flex items-center gap-1 px-4 pt-3 lg:hidden">
        {(
          [
            { key: 'clause', label: '合同原文', icon: <ScrollText className="h-3.5 w-3.5" /> },
            { key: 'finding', label: `风险 ${findings.length}`, icon: <ShieldAlert className="h-3.5 w-3.5" /> },
            { key: 'right', label: '话术 / 工具', icon: <MessageSquareQuote className="h-3.5 w-3.5" /> },
          ] as Array<{ key: MobileTab; label: string; icon: React.ReactNode }>
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setMobileTab(item.key)}
            className={clsx(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px]',
              mobileTab === item.key
                ? 'border-accent/60 bg-accent/10 text-white'
                : 'border-white/10 text-slate-400',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      <main className="grid min-h-0 flex-1 gap-3 px-4 py-3 md:px-6 lg:grid-cols-[5fr_4fr_4fr]">
        <div className={clsx('min-h-0', mobileTab !== 'clause' && 'hidden lg:block')}>
          <ClausePane />
        </div>
        <div className={clsx('min-h-0', mobileTab !== 'finding' && 'hidden lg:block')}>
          <FindingPane />
        </div>
        <div className={clsx('min-h-0', mobileTab !== 'right' && 'hidden lg:block')}>
          <RightPane onOpenLetter={() => setLetterOpen(true)} />
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/[0.07] px-4 py-2 text-center text-[11px] text-slate-500">
        <span>AI 生成内容仅供参考，不构成法律意见。重大合同请咨询专业律师</span>
        <span className="text-slate-600">·</span>
        <span>
          公共法律服务热线 <b className="text-slate-400">12348</b>
        </span>
        <span className="hidden text-slate-600 sm:inline">·</span>
        <span className="hidden sm:inline">
          {phase === 'reviewing' ? 'Agent 执行中' : '就绪'} · Ctrl / ⌘ + Enter 快速审查
        </span>
      </footer>

      <LetterModal open={letterOpen} onClose={() => setLetterOpen(false)} />
      <Toast />
    </div>
  )
}
