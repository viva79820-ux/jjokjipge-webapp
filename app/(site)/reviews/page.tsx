import { Suspense } from "react";
import { PublicReviewPage } from "@/components/reviews/public-page";
import { siteConfig } from "@/lib/site-config";
import type { ReviewQuery } from "@/lib/reviews/rules";

export const metadata = { title: `고객 후기 | ${siteConfig.name}` };

export default function Page(props: { searchParams: Promise<ReviewQuery> }) {
  return (
    <Suspense
      fallback={
        <p role="status" className="px-4 pt-6 text-body text-muted">
          후기를 불러오고 있어요.
        </p>
      }
    >
      <PublicReviewPage {...props} />
    </Suspense>
  );
}
