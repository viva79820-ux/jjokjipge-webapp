// 제공 외관 사진은 간판의 호점 번호와 매장명이 하나만 맞을 때만 쓴다.
// 목록 순서대로 store1/store2를 배정하지 않는다.
const exteriors = [
  { marker: "1", src: "/images/brand/store1.jpg" },
  { marker: "2", src: "/images/brand/store2.jpg" },
] as const;

export const interiorPhotos = [
  { src: "/images/brand/interior.jpg", alt: "상담 부스" },
  { src: "/images/brand/tarotmat.jpg", alt: "타로 매트" },
  { src: "/images/brand/signs.jpg", alt: "상담사 번호 간판" },
] as const;

export function localStoreExterior(name: string) {
  const compact = name.replace(/\s+/g, "");
  const matched = exteriors.filter((item) =>
    new RegExp(`(?:^|[^0-9])${item.marker}호점`).test(compact),
  );
  if (matched.length !== 1) return null;
  if (/[12][^0-9호]{0,6}[12]호점/.test(compact)) return null;
  return { src: matched[0].src, alt: `${name} 외관` };
}

// 네이버에 등록된 1·2호점 공동 안내 이름만 두 외관을 함께 쓴다.
// 다른 모호한 이름에는 사진을 추정하지 않는다.
const confirmedJointStoreCompact = "쪽집게천사사주타로1,2호점";

export function jointStoreExteriors(name: string) {
  if (name.replace(/\s+/g, "") !== confirmedJointStoreCompact) return null;
  return [
    {
      src: "/images/brand/store1.jpg",
      alt: "1호점 외관",
      label: "1호점 외관",
    },
    {
      src: "/images/brand/store2.jpg",
      alt: "2호점 외관",
      label: "2호점 외관",
    },
  ];
}

export function storePhotoPlan(name: string, imageUrl: string | null) {
  if (imageUrl) {
    return {
      source: "db" as const,
      photos: [{ src: imageUrl, alt: `${name} 사진`, label: "" }],
    };
  }
  const joint = jointStoreExteriors(name);
  if (joint) return { source: "joint" as const, photos: joint };
  const local = localStoreExterior(name);
  if (local) {
    return {
      source: "local" as const,
      photos: [{ src: local.src, alt: local.alt, label: "" }],
    };
  }
  return { source: "empty" as const, photos: [] };
}

export const storeQueryKey = "store";

export function storeParamList(value: string | string[] | undefined) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value;
  return [];
}

export function resolveStoreSelection<T extends { id: string }>(
  stores: readonly T[],
  values: readonly string[],
) {
  if (values.length === 0) return { store: null as T | null, invalid: false };
  if (values.length !== 1 || values[0].length === 0) {
    return { store: null as T | null, invalid: true };
  }
  const store = stores.find((item) => item.id === values[0]) ?? null;
  return store
    ? { store, invalid: false }
    : { store: null as T | null, invalid: true };
}

const storeSlugPattern = /^[a-z0-9-]+$/;

export function storeSlugFromHash(hash: string) {
  if (!hash.startsWith("#store-")) return null;
  let slug = hash.slice("#store-".length);
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  if (slug === "prices" || !storeSlugPattern.test(slug)) return null;
  return slug;
}

export function resolveStoreLocation<T extends { id: string }>(
  stores: readonly T[],
  values: readonly string[],
  hash: string,
) {
  const slug = storeSlugFromHash(hash);
  if (slug) return resolveStoreSelection(stores, [slug]);
  return resolveStoreSelection(stores, values);
}

export function storeSelectionHref(currentHref: string, id: string) {
  const url = new URL(currentHref);
  url.searchParams.set(storeQueryKey, id);
  url.hash = `store-${id}`;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function naverMapSearchUrl(address: string) {
  const trimmed = address.trim();
  if (!isMappableAddress(trimmed)) return null;
  return `https://map.naver.com/p/search/${encodeURIComponent(trimmed)}`;
}

export function isMappableAddress(address: string) {
  const trimmed = address.trim();
  if (!trimmed) return false;
  const withoutMarkers = trimmed
    .replace(/\[[^\]]*]/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/\([^)]*\)/g, " ");
  const leftover = withoutMarkers
    .replace(/상세\s*주소/g, "")
    .replace(/주소\s*없음/g, "")
    .replace(/확인\s*필요/g, "")
    .replace(/미입력/g, "")
    .replace(/미정/g, "")
    .replace(/없음/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return leftover.length > 0;
}

export function formatStorePriceAmounts(
  amounts: readonly { readonly label: string; readonly amount: number }[],
) {
  if (amounts.length === 0) return "";
  const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
  const same = amounts.every((item) => item.amount === amounts[0].amount);
  if (amounts.length > 1 && same)
    return `${won(amounts[0].amount)} (${amounts.map((item) => item.label).join("·")})`;
  return amounts
    .map((item) =>
      item.label === "기본"
        ? won(item.amount)
        : `${item.label} ${won(item.amount)}`,
    )
    .join(" · ");
}
