/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#080b12',
          900: '#0d1220',
          850: '#111828',
          800: '#161f33',
          700: '#1f2b45',
          600: '#2c3b5c',
        },
        risk: {
          high: '#ff5c6c',
          medium: '#ffb454',
          low: '#4ecb8f',
        },
        accent: {
          DEFAULT: '#5b8cff',
          soft: '#8aa8ff',
          deep: '#3b6ae0',
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 18px 48px -24px rgba(0,0,0,.9)',
        glow: '0 0 0 1px rgba(91,140,255,.35), 0 0 28px -8px rgba(91,140,255,.55)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(91,140,255,.45)' },
          '100%': { boxShadow: '0 0 0 10px rgba(91,140,255,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        shimmer: 'shimmer 1.8s linear infinite',
        'pulse-ring': 'pulseRing 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
}
