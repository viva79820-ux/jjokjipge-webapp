import type { NextConfig } from "next";

type RemotePattern = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>[number];

// 배율 2 이상에서는 CSS로 보이는 폭만 적는다. 브라우저가 배율을 곱해 srcset을 고른다.
// 배율 1은 그 곱이 없어, sharpImageSizes에 넣어 둔 파일 폭을 적는다.
// 그 폭은 그려지는 폭의 1.8~2.2배다. 그보다 많이 줄이면 가는 선이 다시 거칠어진다.
export function sharpPhotoSizes(cssWidth: number, fileWidth: number) {
  const shown = Math.round(cssWidth);
  return `(min-resolution: 2dppx) ${shown}px, ${fileWidth}px`;
}

// Next 기본 폭에 칸에서 계산한 2배 폭을 더한다. 지정하면 기본 목록을 대체하므로 32~384도 남긴다.
// 640보다 큰 값도 srcset에 들어가므로 상세·매장 카드의 2배 폭을 여기 둔다.
export const sharpImageSizes = [
  32, 48, 64, 96, 128, 144, 152, 224, 256, 288, 292, 336, 384, 528, 534, 1056,
  1120,
];

export const appFrameSizes =
  "(hover: hover) and (pointer: fine) 560px, (min-width: 1024px) 1024px, 100vw";

// 배너 칸은 160×228. 4:5 사진은 cover로 폭이 182.4까지 늘고, 더 긴 사진은 칸 폭 160이다.
// 336이면 182.4의 1.84배, 160의 2.1배다.
export const homeBannerPhotoSizes = sharpPhotoSizes(160, 336);

// 추천 카드는 테두리를 빼면 146×168이다. 칸이 4:5보다 넓어 폭은 잘리지 않는다.
export const homeRecommendPhotoSizes = sharpPhotoSizes(146, 292);

export const homeListPhotoSizes = sharpPhotoSizes(72, 144);

// 목록 칸은 112라 배율 1 파일은 224다.
// 배율 3에서 112를 적으면 336을 물어 384로 커진다. 85를 적어 255를 묻고 256을 유지한다.
export const consultListPhotoSizes = [
  "(min-resolution: 3dppx) 85px",
  "(min-resolution: 2dppx) 112px",
  "224px",
].join(", ");

// 외관 파일은 세로로 길다. 정사각 칸에서는 폭이 칸과 같다.
export const homeStoreBandSizes = sharpPhotoSizes(76, 152);

// 내부 참고 사진은 16:9이고 칸은 240×150이라 cover로 그려지는 폭은 266.67이다.
export const storeInteriorSizes = sharpPhotoSizes(240, 534);

// 상세 칸은 앱 폭×20/19. 가지고 있는 인물 사진보다 칸이 넓어 폭은 앱 폭과 같다.
export const counselorDetailPhotoSizes = [
  "(min-resolution: 2dppx) and (hover: hover) and (pointer: fine) 560px",
  "(hover: hover) and (pointer: fine) 1120px",
  "(min-resolution: 2dppx) and (min-width: 1024px) 1024px",
  "(min-width: 1024px) 2048px",
  "(min-resolution: 2dppx) 100vw",
  "200vw",
].join(", ");

export const appContentSizes =
  "(hover: hover) and (pointer: fine) 528px, (min-width: 1024px) 976px, calc(100vw - 32px)";

export const productGridSizes =
  "(hover: hover) and (pointer: fine) 258px, (min-width: 1024px) 482px, calc(50vw - 22px)";

// PC 카드 사진은 높이 200에 비해 폭이 넓어 cover가 폭을 늘리지 않는다.
// 배율 1의 1056은 sharpImageSizes에 있어 그 파일이 선택된다.
export const storeCardSizes = [
  "(min-resolution: 2dppx) and (hover: hover) and (pointer: fine) 528px",
  "(hover: hover) and (pointer: fine) 1056px",
  "(min-resolution: 2dppx) and (min-width: 1024px) 480px",
  "(min-width: 1024px) 960px",
  "(min-resolution: 2dppx) and (min-width: 768px) calc(50vw - 32px)",
  "(min-width: 768px) calc((50vw - 32px) * 2)",
  "(min-resolution: 2dppx) calc(100vw - 32px)",
  "calc((100vw - 32px) * 2)",
].join(", ");

// 반칸은 공동 외관(세로 사진)만 쓴다. 칸보다 좁아서 그려지는 폭은 칸과 같다.
// 배율 1의 528은 sharpImageSizes에 있어 그 파일이 선택된다.
export const storeCardHalfSizes = [
  "(min-resolution: 2dppx) and (hover: hover) and (pointer: fine) 264px",
  "(hover: hover) and (pointer: fine) 528px",
  "(min-resolution: 2dppx) and (min-width: 1024px) 240px",
  "(min-width: 1024px) 480px",
  "(min-resolution: 2dppx) and (min-width: 768px) calc(25vw - 16px)",
  "(min-width: 768px) calc((25vw - 16px) * 2)",
  "(min-resolution: 2dppx) calc(50vw - 16px)",
  "calc((50vw - 16px) * 2)",
].join(", ");

// 관리자 목록 칸은 48×64. 4:5 사진은 cover로 폭이 51.2가 되고, 96이 1.88배다.
export const adminCounselorPhotoSizes = sharpPhotoSizes(48, 96);

// 넓은 화면의 관리자 매장 칸은 144. 288이 2배다.

export const adminStorePhotoSizes = [
  "(min-resolution: 2dppx) and (min-width: 640px) 144px",
  "(min-width: 640px) 288px",
  "(min-resolution: 2dppx) calc(100vw - 64px)",
  "calc((100vw - 64px) * 2)",
].join(", ");

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
