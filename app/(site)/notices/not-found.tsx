import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="space-y-3">
      <p>공지를 찾을 수 없습니다.</p>
      <Button href="/notices">공지 목록</Button>
    </div>
  );
}
