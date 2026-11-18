"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ContentRetry({ label = "다시 시도" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}
