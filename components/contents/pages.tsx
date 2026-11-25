import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site-config";
import {
  adminContent,
  adminContentList,
  publicContentList,
} from "@/lib/contents/data";
import { cleanupAction } from "@/lib/contents/cleanup";
import {
  adminEditUrl,
  adminFilters,
  adminListUrl,
  channelLabels,
  confirmedSocialHref,
  formatPostedOn,
  isChannel,
  pageSize,
  publicChannels,
  publicFilters,
  publicListUrl,
  returnUrl,
  type Query,
} from "@/lib/contents/rules";
import { AdminContentFilter, ContentListSettled } from "./admin-filter";
import {
  ChannelMark,
  ContentChannelBadge,
  OfficialChannelCard,
} from "./channel";
import { ContentDeletedCleanup, ContentEditor } from "./editor";
import { ContentRetry } from "./retry";
import { ContentThumbnail } from "./thumbnail";

const filterClass =
  "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-4 text-label font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export async function ContentListPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  await connection();
  const filters = publicFilters(await searchParams);
  if (!filters)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href={publicListUrl()}>조건 초기화</Button>
      </div>
    );
  const result = await publicContentList(filters.page, filters.channel);
  if (result.error)
    return (
      <div role="alert" className="space-y-3">
        <p>콘텐츠 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <ContentRetry />
      </div>
    );
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  if (filters.page > pages) redirect(publicListUrl(pages, filters.channel));
  const emptyCatalog = result.catalogTotal === 0;
  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <h1 className="text-display font-extrabold">콘텐츠</h1>
        <p className="text-body text-muted">
          쪽집게천사의 블로그·인스타그램·유튜브 소식을 모아 봤어요.
        </p>
      </header>
      <section aria-label="공식 채널" className="grid grid-cols-3 gap-2">
        {publicChannels.map((channel) => (
          <OfficialChannelCard
            key={channel}
            channel={channel}
            href={confirmedSocialHref(siteConfig.social[channel])}
          />
        ))}
      </section>
      <nav aria-label="콘텐츠 채널" className="flex flex-wrap gap-2">
        <Link
          href={publicListUrl(1, "")}
          aria-current={filters.channel === "" ? "page" : undefined}
          className={`${filterClass} ${filters.channel === "" ? "bg-brand text-on-brand" : "border border-brand bg-surface text-brand"}`}
        >
          전체
        </Link>
        {publicChannels.map((channel) => (
          <Link
            key={channel}
            href={publicListUrl(1, channel)}
            aria-current={filters.channel === channel ? "page" : undefined}
            className={`${filterClass} ${filters.channel === channel ? "bg-brand text-on-brand" : "border border-brand bg-surface text-brand"}`}
          >
            {channelLabels[channel]}
          </Link>
        ))}
      </nav>
      <div className="space-y-3">
        <p className="text-caption font-medium text-muted">
          총 {result.count}건
        </p>
        {result.count === 0 && emptyCatalog && (
          <div
            role="status"
            className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-4 py-8 text-center"
          >
            <Image
              src="/images/brand/logo-angel-mark.png"
              alt=""
              width={592}
              height={450}
              className="h-auto w-24"
            />
            <p>아직 올라온 소식이 없어요.</p>
          </div>
        )}
        {result.count === 0 && !emptyCatalog && (
          <div
            role="status"
            className="space-y-3 rounded-card border border-border bg-surface px-4 py-8 text-center"
          >
            <p>선택한 채널의 콘텐츠가 없습니다.</p>
            <Button href={publicListUrl()} variant="secondary">
              전체 채널 보기
            </Button>
          </div>
        )}
        <div className="grid min-w-0 grid-cols-1 gap-2.5 @3xl/app:grid-cols-2">
          {result.rows.map((row) => {
            const body = (
              <>
                <ContentThumbnail
                  src={row.thumbnail_url}
                  alt={row.thumbnail_alt}
                  channel={row.channel}
                />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                  <ContentChannelBadge channel={row.channel} />
                  <span className="text-body font-bold wrap-anywhere">
                    {row.title}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1 text-fine font-semibold text-muted">
                    <span>{formatPostedOn(row.posted_on)}</span>
                    <span aria-hidden="true">·</span>
                    {row.href ? (
                      <>
                        <span>새 창으로 열기</span>
                        <ExternalLink
                          size={13}
                          aria-hidden="true"
                          className="shrink-0"
                        />
                      </>
                    ) : (
                      <span>외부 주소를 사용할 수 없습니다.</span>
                    )}
                  </span>
                </span>
              </>
            );
            const className =
              "flex min-w-0 items-start gap-3 rounded-card border border-border bg-surface p-3 text-foreground @3xl/app:p-4";
            return row.href ? (
              <a
                key={row.id}
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${className} min-h-11 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
              >
                {body}
              </a>
            ) : (
              <article key={row.id} className={className}>
                {body}
              </article>
            );
          })}
        </div>
        {result.count > 0 && (
          <nav
            aria-label="콘텐츠 페이지"
            className="flex flex-wrap items-center justify-center gap-3"
          >
            {filters.page > 1 && (
              <Button href={publicListUrl(filters.page - 1, filters.channel)}>
                이전
              </Button>
            )}
            <span className="text-label font-semibold">
              {filters.page} / {pages}
            </span>
            {filters.page < pages && (
              <Button href={publicListUrl(filters.page + 1, filters.channel)}>
                다음
              </Button>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

export async function AdminContentListPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const filters = adminFilters(await searchParams);
  if (!filters)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href={adminListUrl()}>조건 초기화</Button>
      </div>
    );
  const result = await adminContentList(filters.page, filters.status);
  if (!result)
    return (
      <>
        <ContentListSettled token="denied" />
        <AdminAccessDenied />
      </>
    );
  if (result.error)
    return (
      <div role="alert" className="space-y-3">
        <ContentListSettled token="error" />
        <p>콘텐츠 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <ContentRetry />
      </div>
    );
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  if (filters.page > pages)
    redirect(adminListUrl(pages, filters.status, filters.deleted));
  const back = adminListUrl(filters.page, filters.status);
  const emptyCatalog = result.catalogTotal === 0;
  return (
    <div className="min-w-0 space-y-4">
      <ContentListSettled
        token={`${filters.status}:${filters.page}:${filters.deleted}:${result.count}`}
      />
      <h1 className="text-title font-bold">콘텐츠</h1>
      {filters.deleted && (
        <p role="status" className="text-brand">
          콘텐츠를 삭제했습니다.
        </p>
      )}
      <Button href={`/admin/contents/new?returnTo=${encodeURIComponent(back)}`}>
        콘텐츠 등록
      </Button>
      <AdminContentFilter
        status={filters.status}
        page={filters.page}
        deleted={filters.deleted}
      />
      <p className="text-caption font-medium text-muted">총 {result.count}건</p>
      {result.count === 0 && emptyCatalog && (
        <p role="status">등록된 콘텐츠가 없습니다.</p>
      )}
      {result.count === 0 && !emptyCatalog && (
        <p role="status">선택한 공개 상태의 콘텐츠가 없습니다.</p>
      )}
      {result.rows.map((row) => (
        <article
          key={row.id}
          className="min-w-0 space-y-2 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
        >
          <Link
            href={adminEditUrl(row.id, back)}
            className="flex min-h-11 cursor-pointer items-center font-bold wrap-anywhere text-brand"
          >
            {row.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {isChannel(row.channel) ? (
              <ChannelMark channel={row.channel} />
            ) : (
              <span className="text-caption text-muted">채널 확인 필요</span>
            )}
            <Badge>{row.is_published ? "공개" : "비공개"}</Badge>
            <span className="text-caption font-medium text-muted">
              순서 {row.sort_order}
            </span>
          </div>
        </article>
      ))}
      <nav
        aria-label="콘텐츠 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {filters.page > 1 && (
          <Button href={adminListUrl(filters.page - 1, filters.status)}>
            이전
          </Button>
        )}
        <span className="text-label font-semibold">
          {filters.page} / {pages}
        </span>
        {filters.page < pages && (
          <Button href={adminListUrl(filters.page + 1, filters.status)}>
            다음
          </Button>
        )}
      </nav>
    </div>
  );
}

export async function AdminContentEditorPage({
  params,
  searchParams,
  creating = false,
}: {
  params?: Promise<{ id: string }>;
  searchParams: Promise<Query>;
  creating?: boolean;
}) {
  await connection();
  const admin = await requireAdmin();
  if (!admin) return <AdminAccessDenied />;
  const query = await searchParams;
  const back = returnUrl(query.returnTo);
  if (creating)
    return <ContentEditor initial={null} returnTo={back} saved={false} />;
  const contentId = (await params)!.id;
  const loaded = await adminContent(contentId);
  if (!loaded) return <AdminAccessDenied />;
  if ("missing" in loaded)
    return <ContentDeletedCleanup id={contentId} returnTo={back} />;
  if ("error" in loaded)
    return (
      <div role="alert" className="space-y-3">
        <p>콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <ContentRetry />
      </div>
    );
  return (
    <ContentEditor
      key={loaded.row.id}
      initial={loaded.row}
      returnTo={back}
      saved={query.saved === "1"}
      initialCleanup={
        loaded.row.thumbnail_path
          ? cleanupAction(
              loaded.row.thumbnail_path,
              admin.userId,
              undefined,
              loaded.row,
            )
          : undefined
      }
    />
  );
}
