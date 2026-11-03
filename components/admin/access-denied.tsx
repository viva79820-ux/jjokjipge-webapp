import { Button } from "@/components/ui/button";
import { logout } from "@/lib/admin/actions";

export function AdminAccessDenied() {
  return (
    <div className="space-y-3 p-4 md:p-6">
      <p className="font-semibold">관리자 권한이 없어요.</p>
      <form action={logout}>
        <Button type="submit">로그아웃</Button>
      </form>
    </div>
  );
}
