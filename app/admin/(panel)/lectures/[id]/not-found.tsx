import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-title font-bold">강의를 찾을 수 없어요.</h1>
      <p className="text-muted">강의가 없거나 확인할 수 없는 주소입니다.</p>
      <Button href="/admin/lectures" variant="secondary">
        강의 목록
      </Button>
    </div>
  );
}
