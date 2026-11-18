"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-3">
      <p>콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      <Button type="button" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
