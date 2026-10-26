/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    spacing: {
      '0': '0px',
      'px': '1px',
      '0.5': '2px',
      '1': '4px',
      '1.5': '6px',
      '2': '8px',
      '2.5': '10px',
      '3': '12px',
      '4': '16px',
      '5': '20px',
      '6': '24px',
      '8': '32px',
      '10': '40px',
      '11': '44px',
      '12': '48px',
      '14': '56px',
    },
    extend: {
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Newsreader"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        raised: 'var(--bg-raised)',
        'row-hover': 'var(--bg-row-hover)',
        hairline: 'var(--border-hairline)',
        strong: 'var(--border-strong)',
        ink: 'var(--text-ink)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        cocoa: {
          DEFAULT: 'var(--brand-cocoa)',
          hover: 'var(--brand-cocoa-hover)',
          pressed: 'var(--brand-cocoa-pressed)',
          tint: 'var(--brand-cocoa-tint)',
        },
        terracotta: {
          DEFAULT: 'var(--accent-terracotta)',
          tint: 'var(--accent-terracotta-tint)',
        },
        sage: {
          DEFAULT: 'var(--support-sage)',
          tint: 'var(--support-sage-tint)',
        },
        status: {
          success: 'var(--status-success)',
          'success-tint': 'var(--status-success-tint)',
          warning: 'var(--status-warning)',
          'warning-tint': 'var(--status-warning-tint)',
          error: 'var(--status-error)',
          'error-tint': 'var(--status-error-tint)',
        },
      },
      borderRadius: {
        card: '14px',
        control: '10px',
        sm: '6px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(60, 40, 20, 0.05), 0 10px 28px rgba(60, 40, 20, 0.05)',
      },
      maxWidth: {
        workbench: '1440px',
      },
    },
  },
  plugins: [],
}
