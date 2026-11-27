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
  assert.equal(ownImage.includes("quality={90}"), false);
  assert.equal(ownImage.includes("quality={85}"), false);
  assert.match(counselor, /quality=\{90\}/);
  assert.match(store, /quality=\{90\}/);
  assert.equal(product.includes("quality={90}"), false);
  assert.equal(poster.includes("quality={90}"), false);
  assert.equal(notice.includes("quality={90}"), false);
  assert.equal(popup.includes("quality={90}"), false);
  assert.match(
    read("components/counselor/consult-list-card.tsx"),
    /size-28 rounded-xl/,
  );
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
  assert.match(read("components/home/store-band.tsx"), /quality=\{90\}/);
  assert.match(
    read("components/store/interior-gallery.tsx"),
    /storeInteriorSizes/,
  );
  assert.match(read("components/store/interior-gallery.tsx"), /quality=\{90\}/);
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
  assert.match(read("next.config.ts"), /sharpImageSizes/);
  assert.match(read("next.config.ts"), /qualities:\s*\[75,\s*90\]/);
  assert.equal(read("next.config.ts").includes("85"), false);
});

const deviceSizes = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const oldWidths = [
  32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
];
const allWidths = [...images.sharpImageSizes, ...deviceSizes].sort(
  (a, b) => a - b,
);
const pickWidth = (widths, request) =>
  widths.find((width) => width >= request) ?? widths[widths.length - 1];

test("1x displays get about a 2x photo file without growing 2x and 3x files", () => {
  const fixed = [
    ["homeBannerPhotoSizes", 160, (228 * 4) / 5, 336],
    ["homeRecommendPhotoSizes", 146, 146, 292],
    ["homeListPhotoSizes", 72, 72, 144],
    ["homeStoreBandSizes", 76, 76, 152],
    ["storeInteriorSizes", 240, (150 * 16) / 9, 534],
    ["adminCounselorPhotoSizes", 48, (64 * 4) / 5, 96],
  ];
  for (const [name, css, painted, file] of fixed) {
    assert.equal(images[name], `(min-resolution: 2dppx) ${css}px, ${file}px`);
    assert.equal(pickWidth(allWidths, file), file, `${name} sizes`);
    const ratio = file / painted;
    assert.ok(ratio >= 1.8 && ratio <= 2.2, `${name} ${ratio}`);
    if (name === "homeBannerPhotoSizes") {
      assert.ok(file / css <= 2.2, `${name} slot ${file / css}`);
    }
    assert.ok(
      pickWidth(allWidths, css * 2) <= pickWidth(oldWidths, css * 2),
      `${name} 2x`,
    );
    assert.ok(
      pickWidth(allWidths, css * 3) <= pickWidth(oldWidths, css * 3),
      `${name} 3x`,
    );
  }
  assert.equal(
    images.consultListPhotoSizes,
    "(min-resolution: 3dppx) 85px, (min-resolution: 2dppx) 112px, 224px",
  );
  assert.equal(pickWidth(allWidths, 224), 224);
  assert.ok(224 / 112 >= 1.8 && 224 / 112 <= 2.2);
  assert.ok(pickWidth(allWidths, 112 * 2) <= pickWidth(oldWidths, 84 * 2));
  assert.ok(pickWidth(allWidths, 85 * 3) <= pickWidth(oldWidths, 84 * 3));
  assert.match(
    images.counselorDetailPhotoSizes,
    /\(hover: hover\) and \(pointer: fine\) 1120px/,
  );
  assert.equal(pickWidth(allWidths, 1120), 1120);
  assert.equal(1120 / 560, 2);
  assert.ok(pickWidth(allWidths, 560 * 2) <= pickWidth(oldWidths, 560 * 2));
  assert.ok(pickWidth(allWidths, 360 * 2) <= pickWidth(oldWidths, 360 * 2));
  assert.ok(pickWidth(allWidths, 360 * 3) <= pickWidth(oldWidths, 360 * 3));
  assert.match(
    images.storeCardSizes,
    /\(hover: hover\) and \(pointer: fine\) 1056px/,
  );
  assert.equal(pickWidth(allWidths, 1056), 1056);
  assert.ok(1056 / 526 >= 1.8 && 1056 / 526 <= 2.2);
  assert.ok(pickWidth(allWidths, 528 * 2) <= pickWidth(oldWidths, 528 * 2));
  assert.ok(pickWidth(allWidths, 328 * 2) <= pickWidth(oldWidths, 328 * 2));
  assert.ok(pickWidth(allWidths, 328 * 3) <= pickWidth(oldWidths, 328 * 3));
  assert.match(
    images.storeCardHalfSizes,
    /\(hover: hover\) and \(pointer: fine\) 528px/,
  );
  assert.equal(pickWidth(allWidths, 528), 528);
  assert.ok(528 / 264 >= 1.8 && 528 / 264 <= 2.2);
  assert.ok(pickWidth(allWidths, 264 * 2) <= pickWidth(oldWidths, 264 * 2));
  assert.ok(pickWidth(allWidths, 164 * 2) <= pickWidth(oldWidths, 164 * 2));
  assert.ok(pickWidth(allWidths, 164 * 3) <= pickWidth(oldWidths, 164 * 3));
  assert.match(images.adminStorePhotoSizes, /\(min-width: 640px\) 288px/);
  assert.equal(pickWidth(allWidths, 288), 288);
  assert.equal(288 / 144, 2);
  assert.ok(pickWidth(allWidths, 144 * 2) <= pickWidth(oldWidths, 144 * 2));
  assert.ok(pickWidth(allWidths, 144 * 3) <= pickWidth(oldWidths, 144 * 3));
  assert.match(images.storeCardSizes, /calc\(\(100vw - 32px\) \* 2\)/);
  assert.match(
    images.counselorDetailPhotoSizes,
    /\(min-resolution: 2dppx\) 100vw/,
  );
});
