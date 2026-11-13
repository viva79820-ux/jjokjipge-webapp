import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StorePhoto } from "@/components/store/photo";
import { cleanupAction } from "@/lib/stores/cleanup";
import { storeAdminDetail, storeAdminList } from "@/lib/stores/data";
import { prepareStoreDelete } from "@/lib/stores/delete-actions";
import {
  filters,
  listUrl,
  pageSize,
  publicImageUrl,
  returnUrl,
  uuid,
  type Query,
} from "@/lib/stores/rules";
import { StoreEditor } from "./editor";
import { StoreRefresh } from "./refresh";

export async function StoreAdminListPage({
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
        <Button href={listUrl()} className="cursor-pointer">
          조건 초기화
        </Button>
      </div>
    );
  const result = await storeAdminList(parsed.page, parsed.status);
  if (!result) return <AdminAccessDenied />;
  if ("error" in result)
    return (
      <div role="alert" className="space-y-3">
        <p>매장 목록을 불러오지 못했습니다.</p>
        <Button
          href={listUrl(parsed.page, parsed.status)}
          className="cursor-pointer"
        >
          다시 불러오기
        </Button>
      </div>
    );
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  const notice = parsed.deleted ? "deleted" : parsed.saved ? "saved" : "";
  if (parsed.page > pages) redirect(listUrl(pages, parsed.status, notice));
  const back = listUrl(parsed.page, parsed.status);
  return (
    <div className="space-y-4 wrap-anywhere">
      <h1 className="text-xl font-bold">매장 관리</h1>
      <StoreRefresh />
      {parsed.saved && (
        <p role="status" className="text-brand">
          매장을 저장했습니다.
        </p>
      )}
      {parsed.deleted && (
        <p role="status" className="text-brand">
          매장을 삭제했습니다.
        </p>
      )}
      <Button
        href={`/admin/stores/new?returnTo=${encodeURIComponent(back)}`}
        className="cursor-pointer"
      >
        매장 등록
      </Button>
      <form action="/admin/stores" className="flex flex-wrap items-end gap-2">
        <label>
          공개 상태
          <select
            name="status"
            defaultValue={parsed.status}
            className="mt-1 block min-h-11 cursor-pointer rounded-button border border-border bg-surface p-2"
          >
            <option value="">전체</option>
            <option value="public">공개</option>
            <option value="private">비공개</option>
          </select>
        </label>
        <Button type="submit" className="cursor-pointer">
          필터 적용
        </Button>
        <Button
          href="/admin/stores"
          variant="secondary"
          className="cursor-pointer"
        >
          초기화
        </Button>
      </form>
      <p className="text-sm text-muted">총 {result.count}건</p>
      {!result.data.length && (
        <p role="status">
          {parsed.status
            ? "해당하는 매장이 없습니다."
            : "등록된 매장이 없습니다."}
        </p>
      )}
      <ul className="space-y-2">
        {result.data.map((store) => (
          <li
            key={store.id}
            data-store-id={store.id}
            className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3 sm:flex-row sm:items-center"
          >
            <StorePhoto
              src={publicImageUrl(store.image_path)}
              alt={`${store.name} 사진`}
              sizes="144px"
              className="w-full sm:w-36 sm:shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-bold wrap-anywhere">{store.name}</p>
              <p className="line-clamp-2 text-sm text-muted wrap-anywhere">
                {store.address?.trim() ? store.address : "주소 없음"}
              </p>
              <div className="flex flex-wrap gap-1">
                <Badge>{store.is_active ? "공개" : "비공개"}</Badge>
                <Badge>정렬 {store.sort_order}</Badge>
              </div>
            </div>
            <Button
              href={`/admin/stores/${store.id}?returnTo=${encodeURIComponent(back)}`}
              variant="secondary"
              className="shrink-0 cursor-pointer"
            >
              편집
            </Button>
          </li>
        ))}
      </ul>
      <nav
        aria-label="매장 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {parsed.page > 1 && (
          <Button
            href={listUrl(parsed.page - 1, parsed.status)}
            className="cursor-pointer"
          >
            이전
          </Button>
        )}
        <span>
          {parsed.page} / {pages}
        </span>
        {parsed.page < pages && (
          <Button
            href={listUrl(parsed.page + 1, parsed.status)}
            className="cursor-pointer"
          >
            다음
          </Button>
        )}
      </nav>
      <p className="text-sm text-muted">
        <Link
          href="/admin"
          className="inline-flex min-h-11 cursor-pointer items-center text-brand"
        >
          관리자 홈
        </Link>
      </p>
    </div>
  );
}

export async function StoreEditorPage({
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
  if (!params)
    return (
      <StoreEditor
        initial={null}
        returnTo={back}
        prepareDeleteAction={prepareStoreDelete}
      />
    );
  const id = (await params).id;
  if (!uuid(id)) notFound();
  const result = await storeAdminDetail(id);
  if (!result) return <AdminAccessDenied />;
  if ("error" in result)
    return (
      <div role="alert" className="space-y-3">
        <p>매장을 불러오지 못했습니다.</p>
        <Button href={back} className="cursor-pointer">
          목록으로 돌아가기
        </Button>
      </div>
    );
  if ("missing" in result) notFound();
  const row = result.row;
  return (
    <StoreEditor
      key={row.id}
      initial={row}
      returnTo={back}
      initialLinkedCounselors={result.linkedCounselors}
      prepareDeleteAction={prepareStoreDelete}
      initialCleanup={
        row.image_path
          ? cleanupAction(row.image_path, admin.userId, undefined, row)
          : undefined
      }
    />
  );
}
