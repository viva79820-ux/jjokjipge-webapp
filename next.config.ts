import type { NextConfig } from "next";
import { sharpImageSizes, supabaseImageConfig } from "./lib/images";

const storageImages = supabaseImageConfig(process.env.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    imageSizes: sharpImageSizes,
    qualities: [75, 90],
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
