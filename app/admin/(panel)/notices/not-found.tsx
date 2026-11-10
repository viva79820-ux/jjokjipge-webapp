import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div>
      <p>공지를 찾을 수 없습니다.</p>
      <Button href="/admin/notices">공지 목록</Button>
    </div>
  );
}
