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

function splitEnvList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hostFromOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).hostname;
  } catch {
    const withoutProto = trimmed.replace(/^https?:\/\//i, "");
    const host = withoutProto.split("/")[0]?.split(":")[0]?.trim();
    return host || null;
  }
}

function allowedHosts(env: Record<string, string>): string[] | undefined {
  const hosts = [
    ...splitEnvList(env.METAPOSTGUI_ALLOWED_HOSTS),
    ...splitEnvList(env.METAPOSTGUI_CORS_ORIGINS).map(hostFromOrigin).filter((h): h is string => !!h),
  ];
  return hosts.length > 0 ? Array.from(new Set(hosts)) : undefined;
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
  const viteAllowedHosts = allowedHosts(env);

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
      allowedHosts: viteAllowedHosts,
      proxy: apiProxy,
    },
  };
});
