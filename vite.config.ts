import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { rename } from "node:fs/promises";
import { join } from "node:path";

/**
 * Production builds emit the SPA shell as `app.html` instead of `index.html`.
 * No host can then serve the shell for "/" by itself: every page is delivered
 * through server/http/spa-shell.js, which adds the page security headers
 * (frame-ancestors, ...). The dev server (`npm run dev`) is unaffected.
 */
const SHELL_FILE = process.env.APP_SHELL_FILE || "app.html";
function securedShell(): Plugin {
  return {
    name: "integration-hub:secured-shell",
    apply: "build",
    async writeBundle(options) {
      const dir = options.dir || "dist";
      await rename(join(dir, "index.html"), join(dir, SHELL_FILE));
    },
  };
}

export default defineConfig({
  plugins: [react(), securedShell()],

  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
});
