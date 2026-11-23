import { AiSajuResult } from "@/components/ai-saju/result-screen";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `AI 사주 결과 | ${siteConfig.name}`,
};

export default function AiSajuResultPage() {
  return <AiSajuResult />;
}
