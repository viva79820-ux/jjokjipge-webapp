import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClassPoster } from "@/components/classes/poster";
import { ClassVideoLink } from "@/components/classes/video-link";
import {
  deliveryLabel,
  parseClassContent,
  tuitionLabel,
  type ClassContent,
} from "@/lib/classes/content";
import {
  fieldLabel,
  publicPosterUrl,
  type PublicClassDetail,
} from "@/lib/classes/rules";
import { appFrameSizes } from "@/lib/images";

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 border-b border-border py-2.5 text-body">
      <dt className="w-16 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 font-semibold wrap-anywhere">{value}</dd>
    </div>
  );
}

function StructuredDetail({
  content,
}: {
  content: Extract<ClassContent, { kind: "structured" }>;
}) {
  return (
    <>
      {content.summary && (
        <p className="text-body wrap-anywhere text-muted">{content.summary}</p>
      )}
      <dl>
        <InfoRow label="강사" value={content.instructors} />
        <InfoRow label="기간" value={content.duration} />
        <InfoRow label="수업" value={content.schedule} />
        <InfoRow label="수강료" value={tuitionLabel(content)} />
      </dl>
      {content.curriculum.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-title font-bold">커리큘럼</h2>
          <ol className="m-0 list-none p-0">
            {content.curriculum.map((item, index) => (
              <li key={`${item.title}-${index}`} className="flex gap-3 pb-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-caption font-extrabold text-on-brand">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-subtitle font-bold wrap-anywhere">
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="block text-caption wrap-anywhere text-muted">
                      {item.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {content.options.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-title font-bold">선택할 수 있는 과정</h2>
          <ul className="m-0 list-none space-y-2 p-0">
            {content.options.map((option) => (
              <li
                key={`${option.name}-${option.schedule}`}
                className="rounded-card border border-border bg-surface p-3"
              >
                <p className="text-subtitle font-bold wrap-anywhere">
                  {option.name}
                </p>
                {option.instructor && (
                  <p className="text-caption wrap-anywhere text-muted">
                    강사 {option.instructor}
                  </p>
                )}
                {option.schedule && (
                  <p className="text-caption wrap-anywhere text-foreground">
                    {option.schedule}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {content.learnings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-title font-bold">이런 걸 배워요</h2>
          <ul className="m-0 list-none space-y-2 p-0">
            {content.learnings.map((item) => (
              <li key={item} className="flex gap-2 text-body">
                <Check
                  size={18}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-brand"
                />
                <span className="wrap-anywhere">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {content.body && (
        <p className="text-body wrap-anywhere whitespace-pre-wrap">
          {content.body}
        </p>
      )}
    </>
  );
}

export function ClassDetailBody({ row }: { row: PublicClassDetail }) {
  const content = parseClassContent(row.description);
  const poster = publicPosterUrl(row.poster_path);
  return (
    <div className="space-y-7">
      <ClassPoster
        src={poster}
        alt={row.poster_alt || `${row.title} 포스터`}
        fit="contain"
        sizes={appFrameSizes}
      />
      <div className="space-y-7 px-4 @3xl/app:px-6">
        <header className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex min-h-6 items-center rounded-full bg-brand px-2 text-fine font-bold text-on-brand">
              {fieldLabel(row.field)}
            </span>
            <Badge>{deliveryLabel(row.is_online)}</Badge>
          </div>
          <h1 className="text-display font-extrabold wrap-anywhere">
            {row.title}
          </h1>
        </header>
        {content.kind === "free" ? (
          <>
            <p className="text-body wrap-anywhere whitespace-pre-wrap">
              {content.body}
            </p>
            <dl>
              <InfoRow label="수강료" value={tuitionLabel(content)} />
            </dl>
          </>
        ) : (
          <StructuredDetail content={content} />
        )}
        {row.video_url && (
          <section className="space-y-3">
            <h2 className="text-title font-bold">강의 영상</h2>
            <ClassVideoLink url={row.video_url} />
          </section>
        )}
      </div>
    </div>
  );
}
