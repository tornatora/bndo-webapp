import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0A2540',
          steel: '#123C63',
          mint: '#2AB3A6',
          sand: '#F2EEE6',
          ink: '#121D2A'
        }
      },
      boxShadow: {
        glow: '0 25px 50px -25px rgba(10, 37, 64, 0.35)'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' }
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0px)' }
        }
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        rise: 'rise 0.7s ease forwards'
      }
    }
  },
  plugins: []
};

export default config;
