import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = { title: `AI 사주 | ${siteConfig.name}` };

export default function AiSajuPage() {
  return (
    <div className="px-4 pt-6 @3xl/app:px-6">
      <h1 className="text-display font-extrabold">AI 사주</h1>
      <p className="mt-3 text-body text-muted">AI 사주는 준비 중입니다.</p>
    </div>
  );
}
