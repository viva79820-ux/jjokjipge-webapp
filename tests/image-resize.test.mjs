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
  assert.match(thumbnail, /sizes="112px"/);
  assert.equal(thumbnail.includes("<img"), false);
  assert.match(read("components/home/banner.tsx"), /sizes="160px"/);
  assert.match(read("components/home/recommend.tsx"), /sizes="148px"/);
  assert.match(read("components/home/directory.tsx"), /sizes="72px"/);
  assert.match(
    read("components/counselor/consult-list-card.tsx"),
    /sizes="84px"/,
  );
  assert.match(read("components/home/store-band.tsx"), /sizes="76px"/);
  assert.match(read("app/(site)/consult/[id]/page.tsx"), /appFrameSizes/);
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
});
