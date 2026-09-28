import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
    plugins: [react()],
    // `deno task dev` serves the API on 7077; the vite dev server forwards to it
    server: { proxy: { "/api": "http://127.0.0.1:7077", "/app": "http://127.0.0.1:7077" } },
    build: { target: "es2022" },
})
