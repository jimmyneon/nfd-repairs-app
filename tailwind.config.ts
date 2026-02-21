import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#009B4D', // Fresh Forest Green
          dark: '#007A3D',
          light: '#00B95B',
        },
        secondary: {
          DEFAULT: '#FFCC00', // Tangerine Yellow
          dark: '#E6B800',
          light: '#FFE066',
        },
        background: {
          light: '#FAF5E9', // Ivory
        },
        success: '#27AE60',
        warning: '#F39C12',
        error: '#E74C3C',
      },
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      boxShadow: {
        'sm': '0 2px 4px rgba(0, 0, 0, 0.1)',
        'md': '0 4px 8px rgba(0, 0, 0, 0.1)',
        'lg': '0 8px 16px rgba(0, 0, 0, 0.1)',
        'xl': '0 12px 24px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [],
}
export default config
