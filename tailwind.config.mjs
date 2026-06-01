/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        heading: ['DM Serif Display', 'serif'],
      },
      colors: {
        leaf: {
          50: '#ecf5ec',
          100: '#d8e8d8',
          200: '#b5d5b5',
          600: '#3d8a5c',
          700: '#2d6a4f',
        },
        ember: {
          50: '#f8eaea',
          100: '#f0d5d5',
          200: '#e5b5b5',
          600: '#a54545',
          700: '#8b3a3a',
        },
        stone: {
          50: '#f4f2ef',
          100: '#eae6e0',
          200: '#ddd6cc',
          300: '#ccc2b5',
          400: '#b8a88e',
          500: '#6e6e7a',
          600: '#565662',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
