/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          green: '#39FF14',
          blue: '#00F0FF',
          pink: '#FF1493',
        },
        pitch: {
          dark: '#0a0a1a',
          card: '#111122',
          card2: '#1a1a33',
        }
      },
      fontFamily: {
        display: ['"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'bounce-in': 'bounceIn 0.3s ease-out',
        'score-pop': 'scorePop 0.4s ease-out',
        'fade-up': 'fadeUp 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-neon': 'pulseNeon 2s infinite',
        'celebration': 'celebration 0.6s ease-out',
      },
      keyframes: {
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        scorePop: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.3)', color: '#39FF14' },
          '100%': { transform: 'scale(1)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        pulseNeon: {
          '0%, 100%': { boxShadow: '0 0 5px #39FF14, 0 0 10px #39FF14' },
          '50%': { boxShadow: '0 0 10px #39FF14, 0 0 20px #39FF14, 0 0 30px #39FF14' },
        },
        celebration: {
          '0%': { transform: 'scale(1) rotate(0deg)' },
          '25%': { transform: 'scale(1.2) rotate(-5deg)' },
          '50%': { transform: 'scale(1.3) rotate(5deg)' },
          '75%': { transform: 'scale(1.2) rotate(-3deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)' },
        }
      }
    },
  },
  plugins: [],
}
