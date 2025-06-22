/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'sonar-ping': 'sonar-ping 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'text-pulse': 'text-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'button-glow': 'button-glow 3s ease-in-out infinite',
      },
      keyframes: {
        'sonar-ping': {
          '0%': { transform: 'scale(0.3)', opacity: '1' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        'text-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'button-glow': {
          '0%, 100%': { 
            boxShadow: '0 0 20px rgba(219, 39, 119, 0.4), 0 0 30px rgba(168, 85, 247, 0.3)' 
          },
          '50%': { 
            boxShadow: '0 0 35px rgba(219, 39, 119, 0.7), 0 0 50px rgba(168, 85, 247, 0.5)' 
          },
        }
      }
    },
  },
  plugins: [],
}

