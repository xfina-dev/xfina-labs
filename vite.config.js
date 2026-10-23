import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import xfina from 'xfina-ui/vite'
import path from 'path'

// Multi-page site: each tool is a folder with its own index.html, served at
// labs.xfina.dev/<tool>/. Register a new tool in `input` below.
export default defineConfig({
  // xfina() puts the shared theme script first in every page's <head>, so
  // light or dark is set before the first paint, on every xfina.dev site alike.
  plugins: [vue(), xfina()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        portfolioEngine: path.resolve(import.meta.dirname, 'portfolio-engine/index.html'),
        getData: path.resolve(import.meta.dirname, 'portfolio-engine/get-data/index.html'),
      },
    },
  },
})
