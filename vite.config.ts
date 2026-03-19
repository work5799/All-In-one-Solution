import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: {
      "/api/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/openai/, ""),
      },
      "/api/qwen": {
        target: "https://dashscope-intl.aliyuncs.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/qwen/, ""),
      },
      "/api/supabase/functions/v1/ai-image-proxy": {
        target: "https://example.supabase.co",
        changeOrigin: true,
        secure: true,
        rewrite: () => "/functions/v1/ai-image-proxy",
        router: (req) => {
          const target = req.headers["x-supabase-url"];
          if (typeof target === "string" && /^https?:\/\//i.test(target)) {
            return target.replace(/\/$/, "");
          }
          return "https://example.supabase.co";
        },
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
}));
