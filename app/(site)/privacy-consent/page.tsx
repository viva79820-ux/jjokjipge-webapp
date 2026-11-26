import { LegalDocument } from "@/components/legal/legal-document";
import { readLegalDocument } from "@/lib/legal/documents";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `개인정보 수집·이용 동의 | ${siteConfig.name}`,
};

export default function Page() {
  return <LegalDocument source={readLegalDocument("privacy-consent-signup")} />;
}
