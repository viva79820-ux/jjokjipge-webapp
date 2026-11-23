import { Button } from "@/components/ui/button";

export function ProductMissing({ admin = false }: { admin?: boolean }) {
  return (
    <div className="space-y-3">
      <p>상품을 찾을 수 없습니다.</p>
      <Button
        href={admin ? "/admin/shop-products" : "/shop"}
        variant="secondary"
      >
        상품 목록
      </Button>
    </div>
  );
}
