import Link from "next/link";
import { linkClass } from "@/components/member-auth/styles";

export default function NotFound() {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <div className="mx-auto w-full max-w-md min-w-0">
        <h1 className="text-display font-extrabold">주문을 찾을 수 없어요</h1>
        <p className="mt-3 text-body text-muted">
          이 계정에서 볼 수 있는 주문이 아니에요.
        </p>
        <div className="mt-4">
          <Link href="/mypage" className={linkClass}>
            주문 목록으로
          </Link>
        </div>
      </div>
    </div>
  );
}
