import { Suspense } from "react";
import type { Metadata } from "next";
import { ClassListPage } from "@/components/classes/pages";
import type { ClassQuery } from "@/lib/classes/rules";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: `클래스 | ${siteConfig.name}` };

export const instant = false;

export default function Page(props: { searchParams: Promise<ClassQuery> }) {
  return (
    <Suspense fallback={<p role="status">클래스 목록을 불러오고 있습니다.</p>}>
      <ClassListPage {...props} />
    </Suspense>
  );
}
