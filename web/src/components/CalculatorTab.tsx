import { useState } from 'react'
import { Calculator, Loader2 } from 'lucide-react'
import { callTool } from '@/lib/api'

interface PenaltyResult {
  actual_penalty: number
  benchmark: number
  excess: number
  reasonable: boolean
  note: string
}

export function CalculatorTab() {
  const [rent, setRent] = useState('2000')
  const [months, setMonths] = useState('6')
  const [data, setData] = useState<PenaltyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const calc = async () => {
    const rentValue = Number(rent)
    const monthValue = Number(months)
    if (!rentValue || !monthValue) {
      setError('请填写完整的月租金与违约金月数')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await callTool('penalty_calc', { monthly_rent: rentValue, penalty_months: monthValue })
      setData(res as unknown as PenaltyResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : '计算失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="scroll-area h-full space-y-3 p-3">
      <p className="text-[11.5px] leading-relaxed text-slate-500">
        司法实践中，租房违约金一般支持 1 个月租金左右；超过实际损失 30% 可请求法院调减（《民法典》第585条）。
      </p>
      <label className="block text-[11.5px] text-slate-400">
        月租金（元）
        <input
          type="number"
          value={rent}
          onChange={(e) => setRent(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-accent"
        />
      </label>
      <label className="block text-[11.5px] text-slate-400">
        约定违约金（几个月租金）
        <input
          type="number"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-accent"
        />
      </label>
      <button className="btn-primary w-full" onClick={() => void calc()} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
        计算合理性
      </button>

      {error && <p className="text-[12px] text-risk-high">{error}</p>}

      {data && (
        <div
          className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3 text-[12.5px] leading-[1.9]"
          style={{ borderLeft: `3px solid ${data.reasonable ? '#4ecb8f' : '#ff5c6c'}` }}
        >
          <div>
            约定违约金：<b className="text-slate-100">{data.actual_penalty} 元</b>
          </div>
          <div>司法实践基准：约 {data.benchmark} 元</div>
          <div className={data.reasonable ? 'text-risk-low' : 'text-risk-high'}>
            {data.reasonable ? '✅ 该约定在合理范围内' : `❌ 超出基准 ${data.excess} 元`}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{data.note}</p>
        </div>
      )}
    </div>
  )
}
