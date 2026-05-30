import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 纯前端、本地优先。没有后端，没有代理。
export default defineConfig({
  plugins: [react()],
})
