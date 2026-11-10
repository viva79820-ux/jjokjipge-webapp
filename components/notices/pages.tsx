import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/admin/reservation-rules";
import { noticeList, noticeDetail } from "@/lib/notices/data";
import {
  filters,
  listUrl,
  returnUrl,
  publicImageUrl,
  type Query,
} from "@/lib/notices/rules";
import { NoticeEditor } from "./editor";
import { NoticeImage } from "./image";
import { NoticeRefresh } from "./refresh";
import { cleanupAction } from "@/lib/notices/cleanup";
export async function NoticeListPage({
  searchParams,
  admin = false,
}: {
  searchParams: Promise<Query>;
  admin?: boolean;
}) {
  await connection();
  if (admin && !(await requireAdmin())) return <AdminAccessDenied />;
  const f = filters(await searchParams, admin);
  if (!f)
    return (
      <div role="alert">
        목록 조건이 올바르지 않습니다.{" "}
        <Button href={listUrl(admin)}>조건 초기화</Button>
      </div>
    );
  const result = await noticeList(f.page, f.status, admin);
  if (!result) return <AdminAccessDenied />;
  const pages = Math.max(1, Math.ceil(result.count / 20));
  if (f.page > pages) redirect(listUrl(admin, pages, f.status, f.saved));
  const back = listUrl(admin, f.page, f.status);
  return (
    <div className="space-y-4 wrap-anywhere">
      <h1 className="text-xl font-bold">공지사항</h1>
      {admin && <NoticeRefresh />}
      {f.saved && (
        <p role="status" className="text-brand">
          공지를 저장했습니다.
        </p>
      )}
      {admin && (
        <>
          <Button
            href={`/admin/notices/new?returnTo=${encodeURIComponent(back)}`}
          >
            공지 등록
          </Button>
          <form action="/admin/notices" className="flex flex-wrap gap-2">
            <label>
              공개 상태
              <select
                name="status"
                defaultValue={f.status}
                className="ml-2 min-h-11 rounded-button border border-border bg-surface p-2"
              >
                <option value="">전체</option>
                <option value="public">공개</option>
                <option value="private">비공개</option>
              </select>
            </label>
            <Button type="submit">필터 적용</Button>
            <Button href="/admin/notices" variant="secondary">
              초기화
            </Button>
          </form>
        </>
      )}
      <p className="text-sm text-muted">총 {result.count}건</p>
      {!result.data.length && <p role="status">등록된 공지사항이 없습니다.</p>}
      {result.data.map((n) => (
        <article
          key={n.id}
          className="space-y-2 rounded-card border border-border bg-surface p-4"
        >
          <Link
            className="flex min-h-11 items-center font-bold text-brand"
            href={`${admin ? "/admin" : ""}/notices/${n.id}?returnTo=${encodeURIComponent(back)}`}
          >
            {n.title}
          </Link>
          {n.is_pinned && <Badge>고정</Badge>}
          {admin && <Badge>{n.is_published ? "공개" : "비공개"}</Badge>}
          <p className="text-sm text-muted">
            {n.published_at ? formatTime(n.published_at) : "공개 전"}
          </p>
        </article>
      ))}
      <nav
        aria-label="공지 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {f.page > 1 && (
          <Button href={listUrl(admin, f.page - 1, f.status)}>이전</Button>
        )}
        <span>
          {f.page} / {pages}
        </span>
        {f.page < pages && (
          <Button href={listUrl(admin, f.page + 1, f.status)}>다음</Button>
        )}
      </nav>
    </div>
  );
}
export async function NoticeDetailPage({
  params,
  searchParams,
  admin = false,
}: {
  params?: Promise<{ id: string }>;
  searchParams: Promise<Query>;
  admin?: boolean;
}) {
  await connection();
  const access = admin ? await requireAdmin() : null;
  if (admin && !access) return <AdminAccessDenied />;
  const back = returnUrl((await searchParams).returnTo, admin);
  if (!params) return <NoticeEditor initial={null} returnTo={back} />;
  const row = await noticeDetail((await params).id, admin);
  if (!row) notFound();
  if (admin)
    return (
      <NoticeEditor
        key={row.id}
        initial={row}
        returnTo={back}
        initialCleanup={
          row.image_path
            ? cleanupAction(row.image_path, access!.userId, undefined, row)
            : undefined
        }
      />
    );
  const src = publicImageUrl(row.image_path);
  return (
    <article className="space-y-6 wrap-anywhere md:space-y-8">
      <Button href={back} variant="secondary">
        목록으로 돌아가기
      </Button>
      <header className="space-y-3 border-b border-border pb-4 md:pb-6">
        <h1 className="text-2xl leading-tight font-extrabold md:text-3xl">
          {row.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {row.is_pinned && <Badge>고정</Badge>}
          <p className="text-sm text-muted">
            {row.published_at && formatTime(row.published_at)}
          </p>
        </div>
      </header>
      <p className="whitespace-pre-wrap text-body leading-7 md:text-base md:leading-8">
        {row.body}
      </p>
      {src && (
        <div className="border-t border-border pt-6 md:pt-8">
          <NoticeImage
            key={src}
            src={src}
            alt={row.image_alt || "공지 이미지"}
          />
        </div>
      )}
    </article>
  );
}
