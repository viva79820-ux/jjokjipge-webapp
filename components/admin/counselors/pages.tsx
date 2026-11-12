import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CounselorPhoto } from "@/components/counselor/photo";
import { cleanupAction } from "@/lib/counselors/cleanup";
import {
  adminStores,
  counselorAdminDetail,
  counselorAdminList,
} from "@/lib/counselors/data";
import {
  approvalLabel,
  fieldLabel,
  filters,
  listUrl,
  publicImageUrl,
  returnUrl,
  type Query,
} from "@/lib/counselors/rules";
import { productListUrl } from "@/lib/counselor-products/rules";
import { CounselorEditor } from "./editor";
import { CounselorRefresh } from "./refresh";

export async function CounselorAdminListPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const parsed = filters(await searchParams);
  if (!parsed)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href={listUrl()}>조건 초기화</Button>
      </div>
    );
  const result = await counselorAdminList(parsed.page, parsed.status);
  if (!result) return <AdminAccessDenied />;
  if ("error" in result)
    return (
      <div role="alert" className="space-y-3">
        <p>상담사 목록을 불러오지 못했습니다.</p>
        <Button href={listUrl(parsed.page, parsed.status)}>
          다시 불러오기
        </Button>
      </div>
    );
  const pages = Math.max(1, Math.ceil(result.count / 20));
  if (parsed.page > pages) redirect(listUrl(pages, parsed.status));
  const back = listUrl(parsed.page, parsed.status);
  return (
    <div className="space-y-4 wrap-anywhere">
      <h1 className="text-xl font-bold">상담사 관리</h1>
      <CounselorRefresh />
      {parsed.saved && (
        <p role="status" className="text-brand">
          상담사를 저장했습니다.
        </p>
      )}
      <Button
        href={`/admin/counselors/new?returnTo=${encodeURIComponent(back)}`}
      >
        상담사 등록
      </Button>
      <form
        action="/admin/counselors"
        className="flex flex-wrap items-end gap-2"
      >
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
        <Button href="/admin/counselors" variant="secondary">
          초기화
        </Button>
      </form>
      <p className="text-sm text-muted">총 {result.count}건</p>
      {!result.data.length && <p role="status">등록된 상담사가 없습니다.</p>}
      <ul className="space-y-2">
        {result.data.map((counselor) => {
          const store = counselor.stores;
          const storeLabel = !store
            ? "미지정"
            : store.is_active
              ? store.name
              : `${store.name} (숨김)`;
          return (
            <li
              key={counselor.id}
              className="flex min-w-0 items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <CounselorPhoto
                src={publicImageUrl(counselor.image_path)}
                alt={`${counselor.name} 사진`}
                sizes="48px"
                className="h-16 w-12 shrink-0 rounded-card"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-bold">{counselor.name}</p>
                <p className="text-sm text-muted">
                  전체{" "}
                  {counselor.fields.map((field) => fieldLabel[field]).join("·")}{" "}
                  · 대표 {fieldLabel[counselor.field]}
                </p>
                <p className="text-sm text-muted">소속 {storeLabel}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge>{counselor.is_active ? "공개" : "비공개"}</Badge>
                  <Badge>
                    {counselor.is_recommended ? "추천" : "추천 아님"}
                  </Badge>
                  <Badge>{counselor.is_new ? "신규" : "신규 아님"}</Badge>
                  {counselor.approval_status !== "approved" && (
                    <Badge>{approvalLabel[counselor.approval_status]}</Badge>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Button
                  href={`/admin/counselors/${counselor.id}?returnTo=${encodeURIComponent(back)}`}
                  variant="secondary"
                  className="shrink-0"
                >
                  편집
                </Button>
                <Button
                  href={productListUrl(counselor.id, 1, "", back)}
                  variant="secondary"
                  className="shrink-0"
                >
                  상품 관리
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <nav
        aria-label="상담사 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {parsed.page > 1 && (
          <Button href={listUrl(parsed.page - 1, parsed.status)}>이전</Button>
        )}
        <span>
          {parsed.page} / {pages}
        </span>
        {parsed.page < pages && (
          <Button href={listUrl(parsed.page + 1, parsed.status)}>다음</Button>
        )}
      </nav>
      <p className="text-sm text-muted">
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center text-brand"
        >
          관리자 홈
        </Link>
      </p>
    </div>
  );
}

export async function CounselorEditorPage({
  params,
  searchParams,
}: {
  params?: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  await connection();
  const admin = await requireAdmin();
  if (!admin) return <AdminAccessDenied />;
  const back = returnUrl((await searchParams).returnTo);
  const stores = await adminStores();
  if (!stores) return <AdminAccessDenied />;
  if (!params)
    return <CounselorEditor initial={null} stores={stores} returnTo={back} />;
  const row = await counselorAdminDetail((await params).id);
  if (!row) notFound();
  return (
    <CounselorEditor
      key={row.id}
      initial={row}
      stores={stores}
      returnTo={back}
      initialCleanup={
        row.image_path
          ? cleanupAction(row.image_path, admin.userId, undefined, row)
          : undefined
      }
    />
  );
}
