import type { Metadata } from "next";
import { InquiryLookup } from "@/components/support/inquiry-lookup";

export const metadata: Metadata = {
  title: "문의 조회 | 쪽집게천사",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <InquiryLookup />;
}
