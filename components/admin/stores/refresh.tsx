"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { refreshStoreViews } from "@/lib/stores/actions";
import { takeStoreRefresh } from "@/lib/stores/navigation";

export function StoreRefresh() {
  const params = useSearchParams();
  useEffect(() => {
    for (const id of takeStoreRefresh())
      void refreshStoreViews(id).catch(() => {
        /* 목록은 요청마다 DB를 다시 읽는다. */
      });
  }, [params]);
  return null;
}
