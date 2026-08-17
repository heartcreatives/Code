/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pikol sa Paayo. See src/lib/brand.ts for the ratios these are used in.
        charcoal: {
          DEFAULT: '#17191C',
          soft: '#1E2227',
        },
        navy: {
          DEFAULT: '#0B2942',
          deep: '#081F33',
          lift: '#0F3453',
        },
        sky: {
          DEFAULT: '#55B8E8',
          dim: '#3E93BD',
        },
        orange: {
          DEFAULT: '#F58220',
          deep: '#D96C11',
        },
        spend: '#E5486B',
        line: '#1E4365', // card borders and dividers
        ink: {
          DEFAULT: '#FFFFFF',
          soft: '#A8C0D4',
          faint: '#7B94A8',
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
        card: '0 1px 2px rgba(0,0,0,0.30), 0 12px 28px -20px rgba(0,0,0,0.75)',
        lift: '0 10px 30px -12px rgba(245,130,32,0.45)',
        glow: '0 0 0 1px rgba(85,184,232,0.18)',
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
