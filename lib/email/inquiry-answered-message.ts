import { renderEmailLayout } from "./layout";

export type InquiryAnsweredContent = {
  lookupUrl: string;
  phone: string;
};

const headline = "문의하신 내용에 답변이 등록됐어요";
const guidance = "문의 조회에서 답변을 확인해 주세요.";

export function inquiryAnsweredContent(input: InquiryAnsweredContent) {
  const lookup = new URL(input.lookupUrl);
  if (lookup.protocol !== "https:" && lookup.protocol !== "http:")
    throw new Error("문의 조회 주소가 올바르지 않습니다.");
  if (lookup.username || lookup.password)
    throw new Error("문의 조회 주소가 올바르지 않습니다.");
  const lookupUrl = lookup.href;
  const subject = `[쪽집게천사 운세통] ${headline}`;
  const text = [
    headline,
    guidance,
    "",
    `문의 조회: ${lookupUrl}`,
    `대표번호: ${input.phone}`,
  ].join("\n");
  const html = renderEmailLayout({
    title: subject,
    heading: headline,
    body: guidance,
    action: { label: "문의 조회", href: lookupUrl },
    phone: input.phone,
  });
  return { subject, html, text };
}
