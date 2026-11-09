import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";
import { InquiryForm } from "@/components/support/inquiry-form";

export const metadata: Metadata = {
  title: `1:1 문의 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};
export default function Page() {
  return <InquiryForm />;
}
