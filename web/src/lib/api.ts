import type { Clause, Finding, ReviewResult, Sample, Step, ToolCall } from './types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error || `请求失败（HTTP ${res.status}）`
  } catch {
    return `请求失败（HTTP ${res.status}）`
  }
}

export async function getSamples(): Promise<Sample[]> {
  const res = await fetch('/api/samples')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Sample[]
}

export async function getSample(name: string): Promise<string> {
  const res = await fetch(`/api/sample?name=${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { text: string }
  return data.text
}

export async function visionExtract(image: string): Promise<string> {
  const res = await fetch('/api/vision_extract', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ image }),
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { text: string }
  return data.text
}

export interface ToolResult {
  summary: string
  [key: string]: unknown
}

export async function callTool(name: string, args: Record<string, unknown>) {
  const res = await fetch(`/api/tools/${name}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as ToolResult
}

/* -------------------------------------------------------------------------- */
/* SSE 解析：fetch + ReadableStream，逐帧回调，避免 EventSource 无法 POST 的限制 */
/* -------------------------------------------------------------------------- */

interface SseHandlers {
  onStep?: (step: Step) => void
  onTool?: (tool: ToolCall) => void
  onClauses?: (clauses: Clause[]) => void
  onFinding?: (finding: Finding) => void
  onResult?: (result: ReviewResult) => void
  onDone?: (payload: unknown) => void
  onError?: (message: string) => void
}

async function consumeSse(url: string, body: unknown, handlers: SseHandlers, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(await readError(res))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const dispatch = (event: string, data: string) => {
    let payload: unknown = data
    try {
      payload = JSON.parse(data)
    } catch {
      /* 非 JSON 的 data 原样透传 */
    }
    switch (event) {
      case 'step':
        handlers.onStep?.(payload as Step)
        break
      case 'tool':
        handlers.onTool?.(payload as ToolCall)
        break
      case 'clauses':
        handlers.onClauses?.(payload as Clause[])
        break
      case 'finding':
        handlers.onFinding?.(payload as Finding)
        break
      case 'result':
        handlers.onResult?.(payload as ReviewResult)
        break
      case 'done':
        handlers.onDone?.(payload)
        break
      case 'error':
        handlers.onError?.((payload as { message?: string }).message || '审查失败')
        break
      default:
        break
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep = buffer.indexOf('\n\n')
    while (sep >= 0) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const dataLines: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length) dispatch(event, dataLines.join('\n'))
      sep = buffer.indexOf('\n\n')
    }
  }
}

export async function streamReview(text: string, handlers: SseHandlers, signal?: AbortSignal) {
  await consumeSse('/api/review/stream', { text }, handlers, signal)
}

export async function streamLetter(
  body: unknown,
  handlers: { onToken?: (text: string) => void; onDone?: (mode: string) => void; onError?: (msg: string) => void },
  signal?: AbortSignal,
) {
  await consumeSse(
    '/api/letter/stream',
    body,
    {
      onDone: (payload) => handlers.onDone?.((payload as { mode?: string }).mode || 'llm'),
      onError: handlers.onError,
      onResult: () => undefined,
      onStep: () => undefined,
      onTool: () => undefined,
      onFinding: () => undefined,
    },
    signal,
  )
  // 说明：token 事件由 consumeSse 的 data 分支原样透传，这里单独处理
}

/** 协商函专用：复用 consumeSse 但把 token 事件转给调用方。 */
export async function streamLetterTokens(
  body: unknown,
  handlers: { onToken?: (text: string) => void; onDone?: (mode: string) => void; onError?: (msg: string) => void },
  signal?: AbortSignal,
) {
  const res = await fetch('/api/letter/stream', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(await readError(res))
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep = buffer.indexOf('\n\n')
    while (sep >= 0) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const dataLines: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (!dataLines.length) {
        sep = buffer.indexOf('\n\n')
        continue
      }
      const payload = JSON.parse(dataLines.join('\n')) as { text?: string; mode?: string; message?: string }
      if (event === 'token') handlers.onToken?.(payload.text || '')
      else if (event === 'done') handlers.onDone?.(payload.mode || 'llm')
      else if (event === 'error') handlers.onError?.(payload.message || '生成失败')
      sep = buffer.indexOf('\n\n')
    }
  }
}

export type { Clause, Finding, ReviewResult, Sample, Step, ToolCall }
