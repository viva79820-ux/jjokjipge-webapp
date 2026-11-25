import { AiSajuInputForm } from "@/components/ai-saju/input-form";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = { title: `AI 사주 | ${siteConfig.name}` };

export default function AiSajuPage() {
  return <AiSajuInputForm />;
}
