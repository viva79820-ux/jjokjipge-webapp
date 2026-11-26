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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function phoneHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
}

export function reservationConfirmedContent(
  input: ReservationConfirmedContent,
) {
  const lookup = new URL(input.lookupUrl);
  if (lookup.protocol !== "https:" && lookup.protocol !== "http:")
    throw new Error("예약 조회 주소가 올바르지 않습니다.");
  if (lookup.username || lookup.password)
    throw new Error("예약 조회 주소가 올바르지 않습니다.");
  const lookupUrl = lookup.href;
  const reservationNo = escapeHtml(input.reservationNo);
  const counselorName = escapeHtml(input.counselorName);
  const productName = escapeHtml(input.productName);
  const when = escapeHtml(input.when);
  const phone = escapeHtml(input.phone);
  const href = escapeHtml(lookupUrl);
  const tel = phoneHref(input.phone);
  const phoneHtml = tel
    ? `<a href="${escapeHtml(tel)}" style="color:#5E2F78;">${phone}</a>`
    : phone;
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
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F7F3FA;">
<div style="max-width:480px;margin:0 auto;padding:24px 16px;overflow-wrap:anywhere;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#2A1F33;font-size:15px;line-height:22px;">
<p style="margin:0 0 16px;font-size:20px;font-weight:700;line-height:28px;color:#7C429A;">예약이 확정되었습니다</p>
<p style="margin:0 0 16px;">${guidance}</p>
<p style="margin:0 0 8px;"><strong>예약번호</strong><br>${reservationNo}</p>
<p style="margin:0 0 8px;"><strong>상담사</strong><br>${counselorName}</p>
<p style="margin:0 0 8px;"><strong>상담 상품</strong><br>${productName}</p>
<p style="margin:0 0 16px;"><strong>상담 일시</strong><br>${when}</p>
<p style="margin:0 0 16px;"><a href="${href}" style="color:#5E2F78;">예약 조회</a><br>${href}</p>
<p style="margin:0;">대표번호 ${phoneHtml}</p>
</div>
</body>
</html>`;
  return { subject, html, text };
}
