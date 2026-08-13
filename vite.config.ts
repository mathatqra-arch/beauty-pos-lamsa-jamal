import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/postcss'
import path from 'path'

// ============================================================
// VITE CONFIGURATION — TAURI FRONTEND BUILD
// ============================================================
// This builds the static frontend for the Tauri desktop app.
// It uses the SAME React components as the Next.js web app,
// but outputs pure HTML/JS that Tauri can bundle.
//
// The desktop frontend talks to:
//   1. Local SQLite (via Tauri Rust commands) — offline
//   2. Deployed Next.js API (via HTTP) — online sync
// ============================================================

// The production API URL that the desktop app will call
const API_URL = process.env.VITE_API_URL || 'https://beauty-pos-lamsa-jamal.vercel.app'

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  build: {
    outDir: 'src-tauri/dist',
    emptyOutDir: true,
  },
  server: {
    watch: {
      // Never watch Rust build output — cargo writes to this constantly
      // while compiling, which causes EBUSY/locked-file errors from Vite's
      // file watcher on Windows.
      ignored: ['**/src-tauri/target/**', '**/src-tauri/gen/**'],
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    // Inject environment variables at build time
    'process.env.VITE_API_URL': JSON.stringify(API_URL),
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL || ''),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
  },
})
