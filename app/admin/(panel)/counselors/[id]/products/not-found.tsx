import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <p>상담사 또는 상담 상품을 찾을 수 없습니다.</p>
      <Button href="/admin/counselors">상담사 목록</Button>
    </div>
  );
}
