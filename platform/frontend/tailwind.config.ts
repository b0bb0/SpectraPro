import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1600px',
      },
    },
    extend: {
      fontFamily: {
        heading: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      colors: {
        background: {
          DEFAULT: '#02020d',
          elevated: '#08082a',
          card: '#0e0e3a',
        },
        surface: {
          DEFAULT: '#08082a',
          elevated: '#0e0e3a',
          hover: 'rgba(157,95,255,0.06)',
        },
        primary: {
          DEFAULT: '#f0b840',
        },
        accent: {
          DEFAULT: '#9d5fff',
          primary: '#f0b840',
        },
        gold: {
          DEFAULT: '#f0b840',
          light: '#ffe08a',
        },
        purple: {
          DEFAULT: '#9d5fff',
          light: '#c8a0ff',
        },
        text: {
          primary: '#e0d6f6',
          secondary: '#8878a9',
          muted: '#6b5f8a',
        },
        border: {
          DEFAULT: 'rgba(157,95,255,0.14)',
          hover: 'rgba(240,184,64,0.25)',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-premium': 'linear-gradient(135deg, #f0b840 0%, #9d5fff 55%, #ffe08a 100%)',
        'gradient-dark': 'linear-gradient(180deg, #02020d 0%, #08082a 100%)',
        'gradient-cosmic': 'linear-gradient(135deg, #f0b840 0%, #9d5fff 100%)',
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(240, 184, 64, 0.25)',
        'glow-md': '0 0 20px rgba(157, 95, 255, 0.3)',
        'glow-lg': '0 0 30px rgba(240, 184, 64, 0.35)',
        'glow-gold': '0 0 16px rgba(240, 184, 64, 0.3)',
        'glow-purple': '0 0 16px rgba(157, 95, 255, 0.3)',
        'card': '0 4px 24px rgba(2, 2, 13, 0.6)',
        'cosmic': '0 4px 24px rgba(2, 2, 13, 0.5), 0 0 16px rgba(157, 95, 255, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.6s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'scale-in': 'scaleIn 0.5s ease-out',
        'glow': 'gemglow 3s ease-in-out infinite',
        'drift': 'drift 20s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
