/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{ts,tsx}',
    './node_modules/@cloudhub-ux/shadcn/esm/components/**/*.js',
    './node_modules/@cloudhub-ux/shadcn/esm/widgets/**/*.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"SF Pro Text"', '-apple-system', '"Segoe UI"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', '"SF Mono"', 'Menlo', 'Consolas', 'monospace']
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        warning: 'hsl(var(--warning))',
        success: 'hsl(var(--success))',
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        sidebar: 'hsl(var(--sidebar))',
        titlebar: 'hsl(var(--titlebar))',
        statusbar: 'hsl(var(--statusbar))',
        grid: {
          header: 'hsl(var(--grid-header))',
          alt: 'hsl(var(--grid-row-alt))',
          line: 'hsl(var(--grid-line))',
          selected: 'hsl(var(--grid-selected))'
        },
        pending: 'hsl(var(--pending))',
        link: 'hsl(var(--link))',
        num: 'hsl(var(--num))',
        bool: 'hsl(var(--bool))',
        time: 'hsl(var(--time))',
        str: 'hsl(var(--str))',
        env: {
          'prod-bg': 'hsl(var(--env-prod-bg))', 'prod-fg': 'hsl(var(--env-prod-fg))', 'prod-bar': 'hsl(var(--env-prod-bar))',
          'staging-bg': 'hsl(var(--env-staging-bg))', 'staging-fg': 'hsl(var(--env-staging-fg))', 'staging-bar': 'hsl(var(--env-staging-bar))',
          'dev-bg': 'hsl(var(--env-dev-bg))', 'dev-fg': 'hsl(var(--env-dev-fg))', 'dev-bar': 'hsl(var(--env-dev-bar))',
          'local-bg': 'hsl(var(--env-local-bg))', 'local-fg': 'hsl(var(--env-local-fg))', 'local-bar': 'hsl(var(--env-local-bar))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        pulse2: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        pulse2: 'pulse2 1.2s ease-in-out infinite'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};
