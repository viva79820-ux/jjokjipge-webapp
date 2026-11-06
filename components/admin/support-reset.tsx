"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function SupportFiltersReset({ href }: { href: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={(e) => {
        e.currentTarget
          .closest("form")
          ?.querySelectorAll("select")
          .forEach((select) => {
            select.value = "";
          });
        router.push(href);
      }}
    >
      필터 초기화
    </Button>
  );
}
