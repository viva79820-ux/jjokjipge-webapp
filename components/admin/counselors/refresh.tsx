"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { refreshCounselorViews } from "@/lib/counselors/actions";
import { takeCounselorRefresh } from "@/lib/counselors/navigation";

export function CounselorRefresh() {
  const params = useSearchParams();
  useEffect(() => {
    for (const id of takeCounselorRefresh())
      void refreshCounselorViews(id).catch(() => {
        /* 목록은 요청마다 DB를 다시 읽는다. */
      });
  }, [params]);
  return null;
}
