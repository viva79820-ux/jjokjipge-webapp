import { renderEmailLayout } from "./layout";

export type CounselorRelation = { name: string } | { name: string }[] | null;

export function readCounselorName(value: CounselorRelation) {
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.name?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return name || "상담사 정보 없음";
}

export type ReservationConfirmedContent = {
  reservationNo: string;
  counselorName: string;
  productName: string;
  when: string;
  lookupUrl: string;
  phone: string;
};

const guidance = "예약하신 시간에 상담사가 매장 전화로 고객님께 연락드립니다.";

export function reservationConfirmedContent(
  input: ReservationConfirmedContent,
) {
  const lookup = new URL(input.lookupUrl);
  if (lookup.protocol !== "https:" && lookup.protocol !== "http:")
    throw new Error("예약 조회 주소가 올바르지 않습니다.");
  if (lookup.username || lookup.password)
    throw new Error("예약 조회 주소가 올바르지 않습니다.");
  const lookupUrl = lookup.href;
  const subject = "[쪽집게천사 운세통] 예약이 확정되었습니다";
  const text = [
    "예약이 확정되었습니다.",
    guidance,
    "",
    `예약번호: ${input.reservationNo}`,
    `상담사: ${input.counselorName}`,
    `상담 상품: ${input.productName}`,
    `상담 일시: ${input.when}`,
    "",
    `예약 조회: ${lookupUrl}`,
    `대표번호: ${input.phone}`,
  ].join("\n");
  const html = renderEmailLayout({
    title: subject,
    heading: "예약이 확정되었습니다",
    body: guidance,
    details: [
      { label: "예약번호", value: input.reservationNo },
      { label: "상담사", value: input.counselorName },
      { label: "상담 상품", value: input.productName },
      { label: "상담 일시", value: input.when },
    ],
    action: { label: "예약 조회", href: lookupUrl },
    phone: input.phone,
  });
  return { subject, html, text };
}
