import type { NextConfig } from "next";

type RemotePattern = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>[number];

// 배율 2 이상에서는 CSS로 보이는 폭만 적는다. 브라우저가 배율을 곱해 srcset을 고른다.
// 배율 1은 그 곱이 없어 파일이 거의 1배라 경계가 거칠다. 그때는 object-fit: cover로
// 실제 그려지는 폭의 2배를 적어, 선택되는 파일이 2배 이상이 되게 한다.
export function sharpPhotoSizes(cssWidth: number, paintedWidth: number) {
  const shown = Math.round(cssWidth);
  const sharp = Math.ceil(paintedWidth * 2);
  return `(min-resolution: 2dppx) ${shown}px, ${sharp}px`;
}

export const appFrameSizes =
  "(hover: hover) and (pointer: fine) 560px, (min-width: 1024px) 1024px, 100vw";

// 배너 칸은 160×228. 세로 4:5 사진을 cover로 채우면 그려지는 폭은 228×4/5.
export const homeBannerPhotoSizes = sharpPhotoSizes(160, (228 * 4) / 5);

// 추천 카드는 테두리를 빼면 146×168이다. 칸이 4:5보다 넓어 폭은 잘리지 않는다.
export const homeRecommendPhotoSizes = sharpPhotoSizes(148, 146);

export const homeListPhotoSizes = sharpPhotoSizes(72, 72);

export const consultListPhotoSizes = sharpPhotoSizes(84, 84);

// 외관 파일은 세로로 길다. 정사각 칸에서는 폭이 칸과 같다.
export const homeStoreBandSizes = sharpPhotoSizes(76, 76);

// 내부 참고 사진은 16:9이고 칸은 240×150이라 cover로 폭이 커진다.
export const storeInteriorSizes = sharpPhotoSizes(240, (150 * 16) / 9);

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

// PC 카드 사진은 높이 200에 비해 폭이 넓어 cover가 폭을 늘리지 않는다. 배율 1만 2배.
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

// 관리자 목록 칸은 48×64. 4:5 사진은 cover로 폭이 조금 커진다.
export const adminCounselorPhotoSizes = sharpPhotoSizes(48, (64 * 4) / 5);

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
