import { create } from 'zustand'

interface ToastState {
  message: string
  tone: 'info' | 'success' | 'error'
  visible: boolean
  show: (message: string, tone?: 'info' | 'success' | 'error') => void
  hide: () => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>((set) => ({
  message: '',
  tone: 'info',
  visible: false,
  show: (message, tone = 'info') => {
    if (timer) clearTimeout(timer)
    set({ message, tone, visible: true })
    timer = setTimeout(() => set({ visible: false }), 2600)
  },
  hide: () => set({ visible: false }),
}))
