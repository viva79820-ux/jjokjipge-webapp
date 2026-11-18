import { Button } from "@/components/ui/button";

export function ClassMissing({ admin = false }: { admin?: boolean }) {
  return (
    <div className="space-y-3">
      <p>강의를 찾을 수 없습니다.</p>
      <Button href={admin ? "/admin/classes" : "/class"} variant="secondary">
        클래스 목록
      </Button>
    </div>
  );
}
