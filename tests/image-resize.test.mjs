import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ts = createRequire(import.meta.url)("typescript");

function loadImages() {
  const exports = {};
  new Function(
    "exports",
    ts.transpileModule(read("lib/images.ts"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )(exports);
  return exports;
}

const images = loadImages();

test("only the public-images storage path can be optimized", () => {
  const remote = images.supabaseImageConfig("https://example.supabase.co");
  assert.equal(remote.dangerouslyAllowLocalIP, false);
  assert.equal(remote.remotePatterns.length, 1);
  assert.deepEqual(remote.remotePatterns[0], {
    protocol: "https",
    hostname: "example.supabase.co",
    port: "",
    pathname: "/storage/v1/object/public/public-images/**",
    search: "",
  });
  assert.deepEqual(images.supabaseImageConfig(undefined), {
    remotePatterns: [],
    dangerouslyAllowLocalIP: false,
  });
  const local = images.supabaseImageConfig("http://127.0.0.1:4331");
  assert.equal(local.dangerouslyAllowLocalIP, true);
  assert.equal(local.remotePatterns[0].protocol, "http");
  assert.equal(local.remotePatterns[0].hostname, "127.0.0.1");
  assert.equal(local.remotePatterns[0].port, "4331");
  assert.equal(
    local.remotePatterns[0].pathname,
    remote.remotePatterns[0].pathname,
  );
});

test("customer photos use next/image at the slot size", () => {
  const counselor = read("components/counselor/photo.tsx");
  const store = read("components/store/photo.tsx");
  const product = read("components/products/photo.tsx");
  const thumbnail = read("components/contents/thumbnail.tsx");
  const poster = read("components/classes/poster.tsx");
  const notice = read("components/notices/image.tsx");
  const popup = read("components/notices/popup-dialog.tsx");
  for (const source of [counselor, store, product, poster, notice, popup]) {
    assert.equal(source.includes("unoptimized"), false);
    assert.equal(source.includes("<img"), false);
  }
  assert.match(read("components/contents/thumbnail.tsx"), /sizes="112px"/);
  // 외부 피드 주소는 img로 두고, public-images만 next/image로 줄인다.
  assert.match(thumbnail, /<img/);
  assert.match(thumbnail, /storage\/v1\/object\/public/);
  const ownImage = thumbnail.slice(thumbnail.lastIndexOf(") : ("));
  assert.match(ownImage, /<Image/);
  assert.match(ownImage, /sizes="112px"/);
  assert.equal(ownImage.includes("unoptimized"), false);
  assert.equal(ownImage.includes("<img"), false);
  assert.equal(ownImage.includes("quality={85}"), false);
  assert.match(counselor, /quality=\{85\}/);
  assert.match(store, /quality=\{85\}/);
  assert.equal(product.includes("quality={85}"), false);
  assert.equal(poster.includes("quality={85}"), false);
  assert.equal(notice.includes("quality={85}"), false);
  assert.equal(popup.includes("quality={85}"), false);
  assert.match(read("components/home/banner.tsx"), /homeBannerPhotoSizes/);
  assert.match(
    read("components/home/recommend.tsx"),
    /homeRecommendPhotoSizes/,
  );
  assert.match(read("components/home/directory.tsx"), /homeListPhotoSizes/);
  assert.match(
    read("components/counselor/consult-list-card.tsx"),
    /consultListPhotoSizes/,
  );
  assert.match(read("components/home/store-band.tsx"), /homeStoreBandSizes/);
  assert.match(read("components/home/store-band.tsx"), /quality=\{85\}/);
  assert.match(
    read("components/store/interior-gallery.tsx"),
    /storeInteriorSizes/,
  );
  assert.match(read("components/store/interior-gallery.tsx"), /quality=\{85\}/);
  assert.match(
    read("app/(site)/consult/[id]/page.tsx"),
    /counselorDetailPhotoSizes/,
  );
  assert.match(
    read("app/(site)/consult/[id]/page.tsx"),
    /object-cover object-\[center_12%\]/,
  );
  assert.match(
    read("components/counselor/consult-list-card.tsx"),
    /object-cover object-\[center_18%\]/,
  );
  assert.match(read("components/home/banner.tsx"), /object-cover object-top/);
  assert.match(
    read("components/home/directory.tsx"),
    /object-cover object-top/,
  );
  assert.match(
    read("components/home/recommend.tsx"),
    /object-cover object-top/,
  );
  assert.match(store, /object-cover object-\[center_35%\]/);
  assert.match(poster, /object-contain/);
  assert.match(poster, /height: "auto"/);
  assert.match(notice, /height: "auto"/);
  assert.match(notice, /object-contain/);
  assert.match(popup, /object-contain/);
  assert.match(popup, /noticePopupSizes/);
  assert.match(read("next.config.ts"), /supabaseImageConfig/);
  assert.match(read("next.config.ts"), /qualities:\s*\[75,\s*85\]/);
});

const imageWidths = [
  32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
];
const pickWidth = (request) =>
  imageWidths.find((width) => width >= request) ??
  imageWidths[imageWidths.length - 1];

test("1x displays get a 2x photo file without inflating 3x displays", () => {
  const fixed = [
    ["homeBannerPhotoSizes", 160, (228 * 4) / 5],
    ["homeRecommendPhotoSizes", 148, 146],
    ["homeListPhotoSizes", 72, 72],
    ["consultListPhotoSizes", 84, 84],
    ["homeStoreBandSizes", 76, 76],
    ["storeInteriorSizes", 240, (150 * 16) / 9],
    ["adminCounselorPhotoSizes", 48, (64 * 4) / 5],
  ];
  for (const [name, css, painted] of fixed) {
    assert.equal(
      images[name],
      `(min-resolution: 2dppx) ${Math.round(css)}px, ${Math.ceil(painted * 2)}px`,
    );
    assert.ok(pickWidth(Math.ceil(painted * 2)) >= painted * 2, `${name} 1x`);
    assert.ok(pickWidth(css * 3) <= 1200, `${name} 3x`);
  }
  assert.match(
    images.counselorDetailPhotoSizes,
    /\(hover: hover\) and \(pointer: fine\) 1120px/,
  );
  assert.equal(pickWidth(1120), 1200);
  assert.equal(pickWidth(360 * 3), 1080);
  assert.match(
    images.storeCardSizes,
    /\(hover: hover\) and \(pointer: fine\) 1056px/,
  );
  assert.ok(pickWidth(1056) >= 526 * 2);
  assert.match(
    images.storeCardHalfSizes,
    /\(hover: hover\) and \(pointer: fine\) 528px/,
  );
  assert.ok(pickWidth(528) >= 264 * 2);
  assert.match(images.storeCardSizes, /calc\(\(100vw - 32px\) \* 2\)/);
  assert.match(
    images.counselorDetailPhotoSizes,
    /\(min-resolution: 2dppx\) 100vw/,
  );
});
