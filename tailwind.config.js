/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        gurmukhi: ['Noto Sans Gurmukhi', 'sans-serif'],
        sans: ['Noto Sans Gurmukhi', 'Poppins', 'sans-serif'],
      },
      colors: {
        royal: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        deep: {
          900: '#0f0a1e',
          800: '#1a1035',
          700: '#25174d',
          600: '#2e1d66',
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(139, 92, 246, 0.4)',
        'glow-gold': '0 0 20px rgba(245, 158, 11, 0.4)',
        'glow-lg': '0 0 40px rgba(139, 92, 246, 0.5)',
        'card-3d': '0 20px 60px rgba(0,0,0,0.5), 0 6px 20px rgba(139,92,246,0.3)',
        'card-hover': '0 30px 80px rgba(0,0,0,0.6), 0 10px 30px rgba(139,92,246,0.4)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.1)',
      },
      backgroundImage: {
        'gradient-royal': 'linear-gradient(135deg, #6d28d9 0%, #4c1d95 50%, #1e1b4b 100%)',
        'gradient-gold': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        'gradient-dark': 'linear-gradient(135deg, #0f0a1e 0%, #1a1035 40%, #0f172a 100%)',
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '33%': { transform: 'translateY(-15px) rotate(1deg)' },
          '66%': { transform: 'translateY(-8px) rotate(-1deg)' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInScale: {
          from: { opacity: '0', transform: 'scale(0.9)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulse3d: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(139,92,246,0.4)' },
          '50%': { boxShadow: '0 0 40px rgba(139,92,246,0.8), 0 0 60px rgba(245,158,11,0.3)' },
        },
        orb: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -30px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
        },
        scoreUp: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-40px) scale(1.4)' },
        },
        spin3d: {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(360deg)' },
        },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        fadeInUp: 'fadeInUp 0.6s ease-out forwards',
        fadeInScale: 'fadeInScale 0.4s ease-out forwards',
        shimmer: 'shimmer 2s linear infinite',
        pulse3d: 'pulse3d 3s ease-in-out infinite',
        orb: 'orb 8s ease-in-out infinite',
        scoreUp: 'scoreUp 1.2s ease-out forwards',
        spin3d: 'spin3d 2s linear infinite',
      },
      perspective: {
        '1000': '1000px',
      },
    },
  },
  plugins: [],
}
