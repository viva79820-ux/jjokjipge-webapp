import { Badge } from "@/components/ui/badge";
import { siteConfig } from "@/lib/site-config";

export function RepresentativeBadge({
  counselorId,
  tone,
}: {
  counselorId: string;
  tone: "brand" | "halo";
}) {
  if (counselorId !== siteConfig.representativeCounselorId) return null;
  return (
    <Badge tone={tone} className="shrink-0 whitespace-nowrap">
      대표
    </Badge>
  );
}
