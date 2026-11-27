export type InquiryAnsweredContent = {
  lookupUrl: string;
  phone: string;
};

const headline = "문의하신 내용에 답변이 등록됐어요";
const guidance = "문의 조회에서 답변을 확인해 주세요.";

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

export function inquiryAnsweredContent(input: InquiryAnsweredContent) {
  const lookup = new URL(input.lookupUrl);
  if (lookup.protocol !== "https:" && lookup.protocol !== "http:")
    throw new Error("문의 조회 주소가 올바르지 않습니다.");
  if (lookup.username || lookup.password)
    throw new Error("문의 조회 주소가 올바르지 않습니다.");
  const lookupUrl = lookup.href;
  const phone = escapeHtml(input.phone);
  const href = escapeHtml(lookupUrl);
  const tel = phoneHref(input.phone);
  const phoneHtml = tel
    ? `<a href="${escapeHtml(tel)}" style="color:#5E2F78;">${phone}</a>`
    : phone;
  const subject = `[쪽집게천사 운세통] ${headline}`;
  const text = [
    headline,
    guidance,
    "",
    `문의 조회: ${lookupUrl}`,
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
<p style="margin:0 0 16px;font-size:20px;font-weight:700;line-height:28px;color:#7C429A;">${headline}</p>
<p style="margin:0 0 16px;">${guidance}</p>
<p style="margin:0 0 16px;"><a href="${href}" style="color:#5E2F78;">문의 조회</a><br>${href}</p>
<p style="margin:0;">대표번호 ${phoneHtml}</p>
</div>
</body>
</html>`;
  return { subject, html, text };
}
