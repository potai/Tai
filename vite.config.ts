import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 讓打包結果可以放在任何子路徑（例如 GitHub Pages 的 /Tai/）
export default defineConfig({
  base: './',
  plugins: [react()],
})
