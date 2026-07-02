import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function readRuntimePorts(): Record<string, string> {
  const file = path.join(ROOT, ".metapostgui", "ports.env");
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, ROOT, ""),
    ...loadEnv(mode, __dirname, ""),
    ...readRuntimePorts(),
  };

  const webPort = Number(env.METAPOSTGUI_WEB_PORT || 5173);
  const webHost = env.METAPOSTGUI_WEB_HOST || "127.0.0.1";
  const apiPort = Number(env.METAPOSTGUI_API_PORT || 18765);
  const apiHost = env.METAPOSTGUI_API_HOST || "127.0.0.1";

  const apiProxy = {
    "/api": {
      target: `http://${apiHost}:${apiPort}`,
      changeOrigin: true,
    },
  };

  return {
    server: {
      host: webHost,
      port: webPort,
      strictPort: false,
      proxy: apiProxy,
    },
    preview: {
      host: webHost,
      port: webPort,
      strictPort: false,
      proxy: apiProxy,
    },
  };
});
