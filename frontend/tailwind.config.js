/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ops-bg': '#0B0F17',
        'ops-card': '#111827',
        'ops-primary': '#047857',
        'ops-primary-hover': '#065f46',
        'ops-border': '#1F2937',
        'ops-text': '#F9FAFB',
        'ops-muted': '#9CA3AF',
      }
    },
  },
  plugins: [],
}
