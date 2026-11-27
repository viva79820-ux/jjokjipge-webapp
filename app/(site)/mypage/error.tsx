"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="min-w-0 space-y-3 px-4 py-6 @3xl/app:px-6">
      <p className="text-body">
        마이페이지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
      <Button type="button" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
