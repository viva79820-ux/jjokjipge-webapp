import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassAdminFilter } from "@/components/classes/admin-filter";
import { ClassDetailBody } from "@/components/classes/detail-body";
import { ClassDetailFrame } from "@/components/classes/detail-frame";
import { ClassDetailHeader } from "@/components/classes/detail-header";
import { ClassEditor } from "@/components/classes/editor";
import { ClassInquiryBar } from "@/components/classes/inquiry-bar";
import { ClassPoster } from "@/components/classes/poster";
import { PublicClassCard } from "@/components/classes/public-card";
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
  publicFieldFilters,
  fieldLabel,
  pageSize,
  summarize,
  type ClassQuery,
} from "@/lib/classes/rules";
import { deliveryLabel } from "@/lib/classes/content";
import {
  listPublicLectures,
  type PublicLectureSummary,
} from "@/lib/lectures/public";
import { fieldLabel as lectureFieldLabel } from "@/lib/lectures/rules";

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
    : await publicClassList(filters.page, filters.field);
  if (!result) return <AdminAccessDenied />;
  const lectureRows = admin ? [] : await listPublicLectures(filters.field);
  const visibleLectures = filters.page === 1 ? lectureRows : [];
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  if (filters.page > pages)
    redirect(classListUrl(admin, pages, filters.status, "", filters.field));
  return (
    <div className="space-y-7 wrap-anywhere">
      <div className="space-y-2">
        <h1 className="text-display font-extrabold">클래스</h1>
        <p className="text-body text-muted">
          {admin
            ? "강의를 등록하고 공개 여부를 관리합니다."
            : "사주·타로 수강 과정과 공개 강의입니다. 카드의 온라인·오프라인 표시로 수업 형태를 확인합니다."}
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
      {!admin && (
        <div
          className="flex max-w-full gap-2 overflow-x-auto"
          aria-label="분야"
        >
          {publicFieldFilters.map((item) => {
            const selected = filters.field === item.value;
            return (
              <Button
                key={item.label}
                href={classListUrl(false, 1, "", "", item.value)}
                variant={selected ? "primary" : "secondary"}
                className="shrink-0"
              >
                {item.label}
              </Button>
            );
          })}
        </div>
      )}
      <p className="text-caption text-muted">
        {admin
          ? `총 ${result.count}건`
          : `과정 ${result.count + lectureRows.length}개`}
      </p>
      {!result.data.length && !lectureRows.length && (
        <p role="status">등록된 클래스가 없습니다.</p>
      )}
      <div className="space-y-3">
        {!admin &&
          visibleLectures.map((row) => <LectureCard key={row.id} row={row} />)}
        {!admin &&
          result.data.map((row) =>
            "is_online" in row && !("is_published" in row) ? (
              <PublicClassCard key={row.id} row={row} />
            ) : null,
          )}
        {admin &&
          result.data.map((row) => {
            const href = classEditUrl(row.id, filters.page, filters.status);
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
                  {admin && "is_online" in row && (
                    <Badge>{deliveryLabel(row.is_online)}</Badge>
                  )}
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
            href={classListUrl(
              admin,
              filters.page - 1,
              filters.status,
              "",
              filters.field,
            )}
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
            href={classListUrl(
              admin,
              filters.page + 1,
              filters.status,
              "",
              filters.field,
            )}
            variant="secondary"
          >
            다음
          </Button>
        )}
      </nav>
    </div>
  );
}

function LectureCard({ row }: { row: PublicLectureSummary }) {
  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface">
      <Link
        href={`/class/lectures/${row.id}`}
        className="block min-w-0 cursor-pointer text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <ClassPoster
          src={row.thumbnailUrl}
          alt={`${row.title} 썸네일`}
          fit="cover"
        />
        <div className="space-y-2 p-3 @3xl/app:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-6 items-center rounded-full bg-brand px-2 text-fine font-bold text-on-brand">
              {lectureFieldLabel(row.field)}
            </span>
            <span className="text-caption text-muted">{row.teacherName}</span>
          </div>
          <h2 className="text-subtitle font-extrabold wrap-anywhere">
            {row.title}
          </h2>
          <p className="text-caption text-muted">
            차시 {row.lessonCount}개 · 조회 {row.viewCount}
          </p>
        </div>
      </Link>
    </article>
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
    <ClassDetailFrame>
      <article className="-mx-4 -mt-6 min-w-0 wrap-anywhere @3xl/app:-mx-6">
        <ClassDetailHeader />
        <ClassDetailBody row={row} />
        <ClassInquiryBar videoUrl={row.video_url} />
      </article>
    </ClassDetailFrame>
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
