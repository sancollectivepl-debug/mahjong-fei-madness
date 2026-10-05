import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Ensures external modules like Firebase are safely resolved
      external: [],
    },
  },
  optimizeDeps: {
    include: ['firebase/app', 'firebase/firestore'],
  },
})