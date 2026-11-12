import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approvalLabel } from "@/lib/counselors/rules";
import {
  counselorProductAdminContext,
  counselorProductAdminList,
} from "@/lib/counselor-products/data";
import {
  counselorAdminUrl,
  pageSize,
  productFilters,
  productFormUrl,
  productListUrl,
  uuid,
  type ProductQuery,
} from "@/lib/counselor-products/rules";
import { ProductEditor } from "./editor";

export async function ProductListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ProductQuery>;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const counselorId = (await params).id;
  if (!uuid(counselorId)) notFound();
  const parsed = productFilters(await searchParams);
  if (!parsed)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href={productListUrl(counselorId)}>조건 초기화</Button>
      </div>
    );
  const result = await counselorProductAdminList(
    counselorId,
    parsed.page,
    parsed.status,
  );
  if (!result) return <AdminAccessDenied />;
  if ("missing" in result) notFound();
  if ("error" in result)
    return (
      <div role="alert" className="space-y-3">
        <p>상담 상품 목록을 불러오지 못했습니다.</p>
        <Button
          href={productListUrl(
            counselorId,
            parsed.page,
            parsed.status,
            parsed.counselorReturn,
          )}
        >
          다시 불러오기
        </Button>
      </div>
    );
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  if (parsed.page > pages)
    redirect(
      productListUrl(counselorId, pages, parsed.status, parsed.counselorReturn),
    );
  const counselor = result.counselor;
  const visible =
    counselor.is_active && counselor.approval_status === "approved";
  return (
    <div className="space-y-4 wrap-anywhere">
      <Button
        href={counselorAdminUrl(counselor.id, parsed.counselorReturn)}
        variant="secondary"
      >
        상담사 관리 화면으로 돌아가기
      </Button>
      <h1 className="text-xl font-bold">{counselor.name} 상담 상품</h1>
      <p className="text-sm text-muted">
        상담사 {counselor.is_active ? "공개" : "비공개"}
        {counselor.approval_status === "approved"
          ? ""
          : ` · ${approvalLabel[counselor.approval_status]}`}
      </p>
      <p className="text-sm text-muted">
        상품을 공개해도 상담사가 비공개이거나 승인되지 않았으면 고객 화면에는
        표시되지 않습니다.
      </p>
      {!visible && (
        <p role="status" className="text-sm text-error">
          이 상담사는 지금 고객 화면에 공개되어 있지 않습니다.
        </p>
      )}
      {parsed.saved && (
        <p role="status" className="text-brand">
          상담 상품을 저장했습니다.
        </p>
      )}
      <Button href={productFormUrl(counselor.id, "new", parsed)}>
        상담 상품 등록
      </Button>
      <form
        action={`/admin/counselors/${counselor.id}/products`}
        className="flex flex-wrap items-end gap-2"
      >
        <input
          type="hidden"
          name="counselorReturn"
          value={parsed.counselorReturn}
        />
        <label>
          공개 상태
          <select
            name="status"
            defaultValue={parsed.status}
            className="mt-1 block min-h-11 rounded-button border border-border bg-surface p-2"
          >
            <option value="">전체</option>
            <option value="public">공개</option>
            <option value="private">비공개</option>
          </select>
        </label>
        <Button type="submit">필터 적용</Button>
        <Button
          href={productListUrl(counselor.id, 1, "", parsed.counselorReturn)}
          variant="secondary"
        >
          초기화
        </Button>
      </form>
      <p className="text-sm text-muted">총 {result.count}건</p>
      {!result.data.length && <p role="status">등록된 상담 상품이 없습니다.</p>}
      <ul className="space-y-2">
        {result.data.map((product) => (
          <li
            key={product.id}
            className="flex min-w-0 items-start gap-3 rounded-card border border-border bg-surface p-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-bold wrap-anywhere">{product.name}</p>
              <p className="text-sm text-muted">
                상담 시간 {product.minutes}분
              </p>
              <p className="text-sm text-muted">
                가격 {product.price.toLocaleString("ko-KR")}원
              </p>
              <p className="text-sm text-muted">
                정렬 순서 {product.sort_order}
              </p>
              <Badge>{product.is_active ? "공개" : "비공개"}</Badge>
            </div>
            <Button
              href={productFormUrl(counselor.id, product.id, parsed)}
              variant="secondary"
              className="shrink-0"
            >
              편집
            </Button>
          </li>
        ))}
      </ul>
      <nav
        aria-label="상담 상품 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {parsed.page > 1 && (
          <Button
            href={productListUrl(
              counselor.id,
              parsed.page - 1,
              parsed.status,
              parsed.counselorReturn,
            )}
          >
            이전
          </Button>
        )}
        <span>
          {parsed.page} / {pages}
        </span>
        {parsed.page < pages && (
          <Button
            href={productListUrl(
              counselor.id,
              parsed.page + 1,
              parsed.status,
              parsed.counselorReturn,
            )}
          >
            다음
          </Button>
        )}
      </nav>
      <p className="text-sm text-muted">
        <Link
          href="/admin/counselors"
          className="inline-flex min-h-11 cursor-pointer items-center text-brand"
        >
          상담사 목록
        </Link>
      </p>
    </div>
  );
}

export async function ProductEditorPage({
  params,
  searchParams,
  creating = false,
}: {
  params: Promise<{ id: string; productId?: string }>;
  searchParams: Promise<ProductQuery>;
  creating?: boolean;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const { id, productId } = await params;
  if (!uuid(id) || (!creating && !uuid(productId || ""))) notFound();
  const parsed = productFilters(await searchParams);
  if (!parsed)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href={productListUrl(id)}>조건 초기화</Button>
      </div>
    );
  const result = await counselorProductAdminContext(
    id,
    creating ? null : productId || null,
  );
  if (!result) return <AdminAccessDenied />;
  if ("missing" in result) notFound();
  if ("error" in result)
    return (
      <div role="alert" className="space-y-3">
        <p>상담 상품을 불러오지 못했습니다.</p>
        <Button
          href={
            creating
              ? productFormUrl(id, "new", parsed)
              : productFormUrl(id, productId || "", parsed)
          }
        >
          다시 불러오기
        </Button>
      </div>
    );
  return (
    <ProductEditor
      key={result.product?.id || "new"}
      counselor={result.counselor}
      initial={result.product}
      page={parsed.page}
      status={parsed.status}
      counselorReturn={parsed.counselorReturn}
    />
  );
}
