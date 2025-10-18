import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

const useHttps = process.env.VITE_USE_HTTPS === "true";

export default defineConfig({
  plugins: useHttps ? [basicSsl()] : [],
  server: {
    https: useHttps,
    host: true,
  },
  preview: {
    https: useHttps,
  },
  build: {
    target: "esnext",
  },
});
