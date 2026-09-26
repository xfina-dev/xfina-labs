import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// Multi-page site: each tool is a folder with its own index.html, served at
// labs.xfina.dev/<tool>/. Register a new tool in `input` below.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        backtest: path.resolve(import.meta.dirname, 'backtest/index.html'),
      },
    },
  },
})
