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
