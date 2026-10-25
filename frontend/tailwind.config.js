/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Disable automatic dark mode based on OS preferences
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: '#F8FAFC',
        surface: '#FFFFFF',
        'border-light': '#E2E8F0',
        'text-primary': '#0F172A',
        'text-secondary': '#475569',
        'text-muted': '#64748B',
        accent: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
        },
        success: {
          DEFAULT: '#16A34A',
          bg: '#F0FDF4',
          border: '#BBF7D0',
        },
        warning: {
          DEFAULT: '#D97706',
          bg: '#FFFBEB',
          border: '#FDE68A',
        },
        error: {
          DEFAULT: '#DC2626',
          bg: '#FEF2F2',
          border: '#FECACA',
        },
      },
      boxShadow: {
        soft: '0 1px 3px rgba(15, 23, 42, 0.06)',
        card: '0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
        card: '12px',
      }
    },
  },
  plugins: [],
}
