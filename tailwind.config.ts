import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './lib/**/*.{js,ts,jsx,tsx,mdx}'],
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
      }
    }
  },
  plugins: []
};

export default config;

