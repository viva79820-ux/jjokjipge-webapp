import type { NextConfig } from "next";

type RemotePattern = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>[number];

// sizes는 CSS로 보이는 너비다. 브라우저는 기기 배율(2배·3배)을 곱해 srcset에서 고른다.
export const appFrameSizes =
  "(hover: hover) and (pointer: fine) 560px, (min-width: 1024px) 1024px, 100vw";

export const appContentSizes =
  "(hover: hover) and (pointer: fine) 528px, (min-width: 1024px) 976px, calc(100vw - 32px)";

export const productGridSizes =
  "(hover: hover) and (pointer: fine) 258px, (min-width: 1024px) 482px, calc(50vw - 22px)";

export const storeCardSizes =
  "(hover: hover) and (pointer: fine) 528px, (min-width: 1024px) 480px, (min-width: 768px) calc(50vw - 32px), calc(100vw - 32px)";

export const storeCardHalfSizes =
  "(hover: hover) and (pointer: fine) 264px, (min-width: 1024px) 240px, (min-width: 768px) calc(25vw - 16px), calc(50vw - 16px)";

export const noticePopupSizes = "(min-width: 544px) 480px, calc(100vw - 64px)";

const publicImagesPath = "/storage/v1/object/public/public-images/**";

export function supabaseImageConfig(raw: string | undefined): {
  remotePatterns: RemotePattern[];
  dangerouslyAllowLocalIP: boolean;
} {
  if (!raw) return { remotePatterns: [], dangerouslyAllowLocalIP: false };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { remotePatterns: [], dangerouslyAllowLocalIP: false };
  }
  const protocol = url.protocol === "http:" ? "http" : "https";
  const hostname = url.hostname;
  const local =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";
  return {
    remotePatterns: [
      {
        protocol,
        hostname,
        port: url.port,
        pathname: publicImagesPath,
        search: "",
      },
    ],
    dangerouslyAllowLocalIP: local,
  };
}
