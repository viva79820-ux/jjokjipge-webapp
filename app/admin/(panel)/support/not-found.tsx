import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div>
      <h1 className="text-xl font-bold">항목을 찾을 수 없습니다.</h1>
      <Button href="/admin/support">고객센터로 돌아가기</Button>
    </div>
  );
}
