/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['UnifrakturMaguntia', 'Cinzel', 'Georgia', 'serif'],
        gothic: ['Cinzel', 'Georgia', 'serif'],
        body: ['Rajdhani', 'system-ui', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'monospace'],
      },
      colors: {
        blood: {
          DEFAULT: '#c1121f',
          neon: '#ff2a3c',
          dim: '#7a0e16',
        },
        chrome: {
          DEFAULT: '#9aa3ad',
          bright: '#e8ecf1',
          dark: '#7a828e',
        },
        void: '#050507',
      },
      keyframes: {
        'reveal-pop': {
          '0%': { transform: 'scale(0.6) rotateY(90deg)', opacity: '0' },
          '100%': { transform: 'scale(1) rotateY(0deg)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'reveal-pop': 'reveal-pop 0.45s ease-out both',
        'fade-in': 'fade-in 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};
