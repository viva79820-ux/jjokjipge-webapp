import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-title font-bold">주문을 찾을 수 없습니다.</h1>
      <p className="text-muted">주문이 없거나 확인할 수 없는 주소입니다.</p>
      <Button href="/admin/orders" variant="secondary">
        주문 목록으로
      </Button>
    </div>
  );
}
