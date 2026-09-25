import { defineConfig } from "vite";

// Multi-page static site: each tool is its own folder with an index.html,
// served at labs.xfina.dev/<tool>/. Add a tool by adding an entry here.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        backtest: "backtest/index.html",
      },
    },
  },
});
