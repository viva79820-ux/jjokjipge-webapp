import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassAdminFilter } from "@/components/classes/admin-filter";
import { ClassEditor } from "@/components/classes/editor";
import {
  adminClassDetail,
  adminClassList,
  publicClassDetail,
  publicClassList,
} from "@/lib/classes/data";
import {
  classEditUrl,
  classFilters,
  classListUrl,
  classNewUrl,
  fieldLabel,
  pageSize,
  summarize,
  type ClassQuery,
} from "@/lib/classes/rules";
import { ClassVideoLink } from "./video-link";

export async function ClassListPage({
  searchParams,
  admin = false,
}: {
  searchParams: Promise<ClassQuery>;
  admin?: boolean;
}) {
  await connection();
  if (admin && !(await requireAdmin())) return <AdminAccessDenied />;
  const filters = classFilters(await searchParams, admin);
  if (!filters)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href={classListUrl(admin)} variant="secondary">
          조건 초기화
        </Button>
      </div>
    );
  const result = admin
    ? await adminClassList(filters.page, filters.status)
    : await publicClassList(filters.page);
  if (!result) return <AdminAccessDenied />;
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  if (filters.page > pages)
    redirect(classListUrl(admin, pages, filters.status));
  return (
    <div className="space-y-7 wrap-anywhere">
      <div className="space-y-2">
        <h1 className="text-display font-extrabold">클래스</h1>
        <p className="text-body text-muted">
          {admin
            ? "강의를 등록하고 공개 여부를 관리합니다."
            : "사주·타로 강의를 외부 영상으로 볼 수 있습니다."}
        </p>
      </div>
      {admin && filters.result === "deleted" && (
        <p role="status" className="text-body text-brand">
          클래스를 삭제했습니다.
        </p>
      )}
      {admin && (
        <>
          <Button href={classNewUrl(filters.page, filters.status)}>
            클래스 등록
          </Button>
          <ClassAdminFilter
            status={filters.status}
            page={filters.page}
            result={filters.result}
          />
        </>
      )}
      <p className="text-caption text-muted">총 {result.count}건</p>
      {!result.data.length && <p role="status">등록된 클래스가 없습니다.</p>}
      <div className="space-y-3">
        {result.data.map((row) => {
          const href = admin
            ? classEditUrl(row.id, filters.page, filters.status)
            : `/class/${row.id}`;
          return (
            <article
              key={row.id}
              className="space-y-2 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
            >
              <Link
                href={href}
                className="inline-flex min-h-11 items-center text-subtitle font-bold wrap-anywhere text-brand"
              >
                {row.title}
              </Link>
              <div className="flex flex-wrap gap-2">
                <Badge>{fieldLabel(row.field)}</Badge>
                {admin && "is_published" in row && (
                  <Badge>{row.is_published ? "공개" : "비공개"}</Badge>
                )}
                {admin && "sort_order" in row && (
                  <Badge>표시 순서 {row.sort_order}</Badge>
                )}
              </div>
              <p className="text-body wrap-anywhere text-foreground">
                {summarize(row.description)}
              </p>
            </article>
          );
        })}
      </div>
      <nav
        aria-label="클래스 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {filters.page > 1 && (
          <Button
            href={classListUrl(admin, filters.page - 1, filters.status)}
            variant="secondary"
          >
            이전
          </Button>
        )}
        <span className="text-body">
          {filters.page} / {pages}
        </span>
        {filters.page < pages && (
          <Button
            href={classListUrl(admin, filters.page + 1, filters.status)}
            variant="secondary"
          >
            다음
          </Button>
        )}
      </nav>
    </div>
  );
}

export async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const row = await publicClassDetail((await params).id);
  if (!row) notFound();
  return (
    <article className="space-y-7 wrap-anywhere">
      <Button href="/class" variant="secondary">
        목록으로
      </Button>
      <header className="space-y-3">
        <h1 className="text-display font-extrabold wrap-anywhere">
          {row.title}
        </h1>
        <Badge>{fieldLabel(row.field)}</Badge>
      </header>
      <p className="text-body wrap-anywhere whitespace-pre-wrap">
        {row.description}
      </p>
      <ClassVideoLink url={row.video_url} />
    </article>
  );
}

export async function ClassEditorPage({
  params,
  searchParams,
}: {
  params?: Promise<{ id: string }>;
  searchParams: Promise<ClassQuery>;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const filters = classFilters(await searchParams, true);
  if (!filters)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href="/admin/classes" variant="secondary">
          클래스 목록
        </Button>
      </div>
    );
  if (!params)
    return (
      <ClassEditor
        initial={null}
        page={filters.page}
        status={filters.status}
        initialMessage=""
      />
    );
  const loaded = await adminClassDetail((await params).id);
  if (!loaded) return <AdminAccessDenied />;
  if ("missing" in loaded) notFound();
  if ("error" in loaded) throw Error("클래스를 불러오지 못했습니다.");
  return (
    <ClassEditor
      key={loaded.row.id}
      initial={loaded.row}
      page={filters.page}
      status={filters.status}
      initialMessage={
        filters.result === "saved" ? "클래스를 저장했습니다." : ""
      }
    />
  );
}
