/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#10b981',
          emerald: '#10b981',
          light: '#34d399',
          dark: '#059669',
        },
        secondary: '#06b6d4',
        solar: '#f59e0b',
        thermal: '#f43f5e',
        frequency: '#a855f7',
        'text-muted': '#64748b',
        'text-secondary': '#94a3b8',
        'text-primary': '#f8fafc',
        'border-strong': '#334155',
        'border-subtle': '#1e293b',
        'surface-base': '#0b0f19',
        'surface-card': '#111827',
        'surface-card-elevated': '#1a2234',
        'surface-container-lowest': '#0a0e18',
        'surface-container-low': '#171b26',
        'surface-container': '#1c1f2a',
        'surface-container-high': '#262a35',
        'surface-container-highest': '#313540',
        'grid-connected': '#10b981',
        'solar-amber': '#f59e0b',
        'battery-cyan': '#06b6d4',
        'thermal-coral': '#f43f5e',
        'frequency-purple': '#a855f7',
      }
    },
  },
  plugins: [],
}
