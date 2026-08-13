import type { NextConfig } from "next";

// ============================================================
// WEB SERVER CONFIGURATION
// ============================================================
// This builds the Next.js server application for Vercel/deployment.
// It includes all API routes and server-side Supabase access.
// Tauri does NOT use this build.
// ============================================================

const nextConfig: NextConfig = {
  // NOTE: "output: standalone" was removed because Vercel does NOT support
  // standalone output mode — it causes "ENOENT: next-server.js.nft.json"
  // build errors during Vercel's onBuildComplete phase. Vercel uses its
  // own serverless deployment model, not standalone Node containers.
  images: {
    unoptimized: true,
  },
  // Sprint 3: Re-enabled strict TypeScript checking
  // All TypeScript errors have been fixed in Sprint 2 + 3.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Sprint 3: Enable React StrictMode for better development diagnostics
  reactStrictMode: true,
  // Sprint 3: Better production error handling
  productionBrowserSourceMaps: false,
};

export default nextConfig;
