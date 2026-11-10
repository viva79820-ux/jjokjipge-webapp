"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { takeNoticeRefresh } from "@/lib/notices/navigation";
import { refreshNotices } from "@/lib/notices/actions";
export function NoticeRefresh() {
  const params = useSearchParams();
  useEffect(() => {
    for (const id of takeNoticeRefresh())
      void refreshNotices(id).catch(() => {
        /* Uncached reads still show current DB rows. */
      });
  }, [params]);
  return null;
}
