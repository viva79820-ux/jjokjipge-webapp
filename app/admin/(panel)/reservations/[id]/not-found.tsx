import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">예약을 찾을 수 없습니다.</h1>
      <p className="text-muted">예약 주소를 다시 확인해 주세요.</p>
      <Button href="/admin/reservations" variant="secondary">
        예약 목록으로
      </Button>
    </div>
  );
}
