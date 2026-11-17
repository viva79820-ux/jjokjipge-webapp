import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { storePriceConfig } from "../lib/store-price-config.ts";
import {
  formatStorePriceAmounts,
  interiorPhotos,
  isMappableAddress,
  jointStoreExteriors,
  localStoreExterior,
  naverMapSearchUrl,
  resolveStoreSelection,
  storeParamList,
  storePhotoPlan,
  storeSelectionHref,
} from "../components/store/present.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("외관 사진은 호점이 분명할 때만 고르고 순서에는 기대지 않는다", () => {
  assert.equal(
    localStoreExterior("동성로 1호점")?.src,
    "/images/brand/store1.jpg",
  );
  assert.equal(
    localStoreExterior("동성로1호점")?.src,
    "/images/brand/store1.jpg",
  );
  assert.equal(localStoreExterior("제1호점")?.src, "/images/brand/store1.jpg");
  assert.equal(
    localStoreExterior("동성로 2호점")?.src,
    "/images/brand/store2.jpg",
  );
  assert.equal(
    localStoreExterior("2호점 본점")?.src,
    "/images/brand/store2.jpg",
  );
  assert.equal(localStoreExterior("매장 A"), null);
  assert.equal(localStoreExterior("1·2호점"), null);
  assert.equal(localStoreExterior("1호점 2호점"), null);
  assert.equal(localStoreExterior("11호점"), null);
  assert.equal(localStoreExterior("21호점"), null);
  assert.equal(localStoreExterior(""), null);
  assert.equal(localStoreExterior("쪽집게천사 사주타로1,2호점"), null);
  assert.equal(localStoreExterior("쪽집게 사주타로 천사3호점"), null);
  const joint = jointStoreExteriors("쪽집게천사 사주타로1,2호점");
  assert.deepEqual(
    joint?.map((photo) => [photo.src, photo.label]),
    [
      ["/images/brand/store1.jpg", "1호점 외관"],
      ["/images/brand/store2.jpg", "2호점 외관"],
    ],
  );
  assert.equal(
    jointStoreExteriors("쪽집게천사사주타로1,2호점")?.[0].src,
    "/images/brand/store1.jpg",
  );
  assert.equal(jointStoreExteriors("쪽집게천사 사주타로1·2호점"), null);
  assert.equal(jointStoreExteriors("사주타로1,2호점"), null);
  assert.equal(jointStoreExteriors("1·2호점"), null);
  assert.equal(jointStoreExteriors("쪽집게 사주타로 천사3호점"), null);
  assert.equal(
    storePhotoPlan("쪽집게천사 사주타로1,2호점", null).source,
    "joint",
  );
  assert.equal(
    storePhotoPlan("쪽집게천사 사주타로1,2호점", "https://cdn.example/a.png")
      .source,
    "db",
  );
  assert.equal(
    storePhotoPlan(
      "쪽집게천사 사주타로1,2호점",
      "https://cdn.example/a.png",
    ).photos.some((photo) => photo.src.includes("store1")),
    false,
  );
  assert.equal(storePhotoPlan("동성로 2호점", null).source, "local");
  assert.equal(
    storePhotoPlan("쪽집게 사주타로 천사3호점", null).source,
    "empty",
  );
  assert.equal(storePhotoPlan("1·2호점", null).source, "empty");
  assert.deepEqual(
    interiorPhotos.map((photo) => photo.src),
    [
      "/images/brand/interior.jpg",
      "/images/brand/tarotmat.jpg",
      "/images/brand/signs.jpg",
    ],
  );
  assert.equal(
    interiorPhotos.some(
      (photo) => photo.src.includes("store1") || photo.src.includes("store2"),
    ),
    false,
  );
});

test("주소가 없거나 확인 필요 자리표시뿐이면 지도 링크를 만들지 않는다", () => {
  assert.equal(naverMapSearchUrl(""), null);
  assert.equal(naverMapSearchUrl("   "), null);
  assert.equal(naverMapSearchUrl("확인 필요"), null);
  assert.equal(naverMapSearchUrl("[상세 주소 확인 필요]"), null);
  assert.equal(naverMapSearchUrl("상세 주소 확인 필요"), null);
  assert.equal(naverMapSearchUrl("주소 없음"), null);
  assert.equal(isMappableAddress("미정"), false);
  const address = "대구 중구 동성로 2길 20";
  assert.equal(
    naverMapSearchUrl(address),
    `https://map.naver.com/p/search/${encodeURIComponent(address)}`,
  );
  const partial = "대구 중구 동성로 [상세 주소 확인 필요]";
  assert.equal(
    naverMapSearchUrl(partial),
    `https://map.naver.com/p/search/${encodeURIComponent(partial)}`,
  );
  assert.equal(naverMapSearchUrl(address)?.includes("key="), false);
});

test("참고 가격 문구는 설정값에서 만들고 금액 차이를 유지한다", () => {
  const byKey = Object.fromEntries(
    storePriceConfig.items.map((item) => [item.key, item]),
  );
  assert.equal(
    formatStorePriceAmounts(byKey.saju.amounts),
    "일반 30,000원 · 중고등 20,000원",
  );
  assert.equal(
    formatStorePriceAmounts(byKey["tarot-one-shuffle"].amounts),
    "5,000원 (일반·중고등)",
  );
  assert.equal(
    formatStorePriceAmounts(byKey["couple-fortune"].amounts),
    "1인 10,000원 · 커플 15,000원",
  );
  assert.equal(formatStorePriceAmounts(byKey.naming.amounts), "300,000원");
  assert.equal(
    formatStorePriceAmounts(byKey.physiognomy.amounts),
    "각 10,000원",
  );
  assert.equal(byKey.naming.group, "saju");
  const price = read("../components/store/price-table.tsx");
  const page = read("../app/(site)/stores/page.tsx");
  const board = read("../components/store/store-board.tsx");
  const present = read("../components/store/present.ts");
  assert.equal(price.includes("storePriceConfig"), true);
  assert.equal(price.includes('id="store-prices"'), true);
  assert.equal(price.includes("30000"), false);
  assert.equal(price.includes("30,000"), false);
  assert.equal(page.includes("30,000"), false);
  assert.equal(page.includes("새벽"), false);
  assert.equal(page.includes("화요일"), false);
  assert.equal(page.includes("counselor.storeSlug === store.id"), true);
  assert.equal(page.includes("counselor.storeName === store.name"), false);
  assert.equal(page.includes("공개된 매장이 없습니다."), true);
  assert.equal(page.includes("매장 정보를 불러오지 못했습니다."), true);
  assert.equal(page.includes('href="/consult"'), true);
  assert.equal(page.includes("0507-1498-0232"), false);
  assert.equal(page.includes("쪽집게천사 사주타로1,2호점"), false);
  assert.equal(
    board.includes("매장을 선택하면 사진과 참고 가격을 볼 수 있어요"),
    true,
  );
  assert.equal(board.includes("매장 내부 참고 사진"), true);
  assert.equal(board.includes("공통 소개 사진입니다."), true);
  assert.equal(board.includes("window.history.pushState"), true);
  assert.equal(board.includes("useSearchParams"), true);
  assert.equal(board.includes("History.prototype.pushState"), false);
  assert.equal(board.includes("stopImmediatePropagation"), false);
  assert.equal(board.includes("0507"), false);
  assert.equal(price.includes("선택한 매장의 확정 요금이 아닙니다."), true);
  assert.equal(price.includes("매장 방문 상담 참고 가격입니다."), true);
  assert.equal(present.includes("0507"), false);
  assert.equal(present.includes("동성로3길"), false);
  assert.equal(present.includes("쪽집게천사사주타로1,2호점"), true);
  const listed = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(resolveStoreSelection(listed, []), {
    store: null,
    invalid: false,
  });
  assert.deepEqual(resolveStoreSelection(listed, storeParamList("a")), {
    store: { id: "a" },
    invalid: false,
  });
  assert.deepEqual(resolveStoreSelection(listed, ["missing"]), {
    store: null,
    invalid: true,
  });
  assert.deepEqual(resolveStoreSelection(listed, ["a", "b"]), {
    store: null,
    invalid: true,
  });
  assert.deepEqual(resolveStoreSelection(listed, [""]), {
    store: null,
    invalid: true,
  });
  assert.equal(
    storeSelectionHref("https://example.com/stores#store-prices", "a"),
    "/stores?store=a#store-prices",
  );
  assert.equal(
    storeSelectionHref("https://example.com/stores?store=a", "b"),
    "/stores?store=b",
  );
});
