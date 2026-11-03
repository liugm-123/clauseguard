import { useState } from 'react'
import clsx from 'clsx'
import { GitCompare, MessageSquareQuote, Calculator as CalcIcon } from 'lucide-react'
import { CalculatorTab } from './CalculatorTab'
import { DiffTab } from './DiffTab'
import { ScriptTab } from './ScriptTab'

type TabKey = 'script' | 'diff' | 'calc'

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'script', label: '沟通话术', icon: <MessageSquareQuote className="h-3.5 w-3.5" /> },
  { key: 'diff', label: '对照示范文本', icon: <GitCompare className="h-3.5 w-3.5" /> },
  { key: 'calc', label: '违约金计算器', icon: <CalcIcon className="h-3.5 w-3.5" /> },
]

export function RightPane({ onOpenLetter }: { onOpenLetter: () => void }) {
  const [tab, setTab] = useState<TabKey>('script')

  return (
    <section className="panel flex min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-white/[0.07] px-2 py-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors',
              tab === item.key
                ? 'bg-white/[0.07] text-white'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
            )}
          >
            {item.icon}
            <span className="hidden lg:inline">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'script' && <ScriptTab onOpenLetter={onOpenLetter} />}
        {tab === 'diff' && <DiffTab />}
        {tab === 'calc' && <CalculatorTab />}
      </div>
    </section>
  )
}
