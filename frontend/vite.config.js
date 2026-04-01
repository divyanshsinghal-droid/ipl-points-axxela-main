import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:8000',
      '/teams': 'http://localhost:8000',
      '/matches': 'http://localhost:8000',
      '/picks': 'http://localhost:8000',
      '/leaderboard': 'http://localhost:8000',
      '/players': 'http://localhost:8000',
      '/admin': 'http://localhost:8000',
    }
  }
})
