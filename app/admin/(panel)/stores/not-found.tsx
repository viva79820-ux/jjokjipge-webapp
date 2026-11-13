import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <p>매장을 찾을 수 없습니다.</p>
      <Button href="/admin/stores" className="cursor-pointer">
        매장 목록
      </Button>
    </div>
  );
}
