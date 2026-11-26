import { Suspense } from "react";
import { AdminReviewsPage } from "@/components/admin/reviews-page";
import type { ReviewQuery } from "@/lib/reviews/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<ReviewQuery> }) {
  return (
    <Suspense fallback={<p role="status">후기 목록을 불러오고 있습니다.</p>}>
      <AdminReviewsPage {...props} />
    </Suspense>
  );
}
