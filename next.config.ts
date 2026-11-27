import type { NextConfig } from "next";
import { supabaseImageConfig } from "./lib/images";

const storageImages = supabaseImageConfig(process.env.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig: NextConfig = {
  /* config options here */
  distDir: process.env.LECTURE_VIEWER_DIST || ".next",
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    qualities: [75, 85],
    remotePatterns: storageImages.remotePatterns,
    dangerouslyAllowLocalIP: storageImages.dangerouslyAllowLocalIP,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
