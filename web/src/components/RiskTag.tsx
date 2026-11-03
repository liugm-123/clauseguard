import clsx from 'clsx'
import type { RiskLevel } from '@/lib/types'

const LEVEL_STYLE: Record<RiskLevel, { dot: string; text: string; ring: string; label: string }> = {
  high: { dot: 'bg-risk-high', text: 'text-risk-high', ring: 'border-risk-high/40', label: '高风险' },
  medium: { dot: 'bg-risk-medium', text: 'text-risk-medium', ring: 'border-risk-medium/40', label: '中风险' },
  low: { dot: 'bg-risk-low', text: 'text-risk-low', ring: 'border-risk-low/40', label: '提示' },
}

export function RiskDot({ level, className }: { level: RiskLevel; className?: string }) {
  return <span className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', LEVEL_STYLE[level].dot, className)} />
}

export function RiskPill({ level, children }: { level: RiskLevel; children?: React.ReactNode }) {
  const style = LEVEL_STYLE[level]
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] font-medium',
        style.ring,
        style.text,
      )}
    >
      <RiskDot level={level} className="h-1.5 w-1.5" />
      {children ?? style.label}
    </span>
  )
}

export function LevelLabel({ level }: { level: RiskLevel }) {
  return <span className={clsx('text-[11px] font-medium', LEVEL_STYLE[level].text)}>{LEVEL_STYLE[level].label}</span>
}
