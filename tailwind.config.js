/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        court: {
          DEFAULT: '#0E4B45',
          deep: '#08332F',
          line: 'rgba(235,240,233,0.22)',
        },
        paper: {
          DEFAULT: '#EBF0E9',
          soft: '#F5F8F3',
          edge: '#DAE2D6',
        },
        optic: '#C7E63F',
        gain: '#0E7A63',
        spend: '#B4472E',
        ink: {
          DEFAULT: '#12211F',
          soft: '#4A5B57',
          faint: '#7C8B86',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(8,51,47,0.06), 0 8px 24px -16px rgba(8,51,47,0.35)',
        lift: '0 10px 30px -12px rgba(8,51,47,0.45)',
      },
      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 220ms cubic-bezier(0.22,1,0.36,1)',
        'toast-in': 'toast-in 220ms cubic-bezier(0.22,1,0.36,1)',
      },
    },
  },
  plugins: [],
}
