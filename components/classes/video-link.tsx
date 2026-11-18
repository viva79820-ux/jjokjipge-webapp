import { ExternalLink } from "lucide-react";
import { publicVideoHref } from "@/lib/classes/rules";

export function ClassVideoLink({ url }: { url: string | null }) {
  const href = publicVideoHref(url);
  if (!href) return <p role="status">영상 주소를 확인할 수 없습니다.</p>;
  return (
    <div className="space-y-2">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-brand px-4.5 text-label font-bold text-on-brand"
      >
        <ExternalLink size={16} aria-hidden="true" />
        강의 영상 보기
      </a>
      <p className="text-caption break-all text-muted">{href}</p>
      <p className="text-caption text-muted">
        외부 사이트에서 새 창으로 열립니다.
      </p>
    </div>
  );
}
