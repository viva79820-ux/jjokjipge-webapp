export const siteConfig = {
  name: "쪽집게천사 운세통",
  phone: "0507-1498-0232",
  representativeCounselorId: "db5580e4-cffb-4b0e-8bec-5d012c06f9f7",
  social: {
    blog: "https://blog.naver.com/taro93",
    instagram: "https://www.instagram.com/kjm_chnam/",
    youtube: "https://www.youtube.com/channel/UCQW1dFMrN1ndpsT77BK-9KA",
  },
} as const;

// 고객 확정 전의 임시 대표번호. 이 번호이거나 쓸 수 있는 번호가 없으면 전화로 연결하지 않는다.
const temporaryRepresentativeDigits = "01000000000";

export function representativeContact(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  const compact = `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
  const callable =
    /^\+?(?:\(\d+\)|\d)[\d\s()-]*$/.test(trimmed) &&
    digits !== temporaryRepresentativeDigits &&
    /^\+?\d{8,15}$/.test(compact);
  if (!callable) return { href: "/stores", label: "매장 정보 보기" } as const;
  return { href: `tel:${compact}`, label: "매장 문의" } as const;
}
