import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifact = path.join(here, "build", "contracts", "ReleaseGuard.json");

// Serves the freshly compiled contract (ABI + deployed address) on every request, never from cache.
function contractPlugin() {
  return {
    name: "releaseguard-contract",
    configureServer(server) {
      server.middlewares.use("/contracts/ReleaseGuard.json", (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        try { res.end(fs.readFileSync(artifact)); }
        catch (e) { res.statusCode = 404; res.end(JSON.stringify({ error: "Contract not compiled yet. Run npm run compile and npm run migrate." })); }
      });
    },
    generateBundle() {
      try { this.emitFile({ type: "asset", fileName: "contracts/ReleaseGuard.json", source: fs.readFileSync(artifact) }); } catch (e) {}
    },
  };
}

export default defineConfig({
  root: path.join(here, "web"),
  plugins: [react(), contractPlugin()],
  server: { port: 3000, strictPort: true, host: "127.0.0.1" },
  build: { outDir: path.join(here, "web-dist"), emptyOutDir: true },
  cacheDir: path.join(here, "node_modules", ".vite"),
});
