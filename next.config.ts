import type { NextConfig } from "next";
import { supabaseImageConfig } from "./lib/images";

const storageImages = supabaseImageConfig(process.env.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
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
