import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <p>콘텐츠가 없습니다.</p>
      <Button href="/admin/contents">콘텐츠 목록</Button>
    </div>
  );
}
