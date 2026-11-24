import Link from "next/link";
import { BookOpen, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Chip } from "@/components/ui/chip";
import { ClassPoster } from "@/components/classes/poster";
import {
  deliveryLabel,
  parseClassContent,
  tuitionLabel,
} from "@/lib/classes/content";
import {
  fieldLabel,
  publicPosterUrl,
  summarize,
  type PublicClassSummary,
} from "@/lib/classes/rules";

export function PublicClassCard({ row }: { row: PublicClassSummary }) {
  const content = parseClassContent(row.description);
  const poster = publicPosterUrl(row.poster_path);
  const instructors = content.kind === "structured" ? content.instructors : "";
  const duration = content.kind === "structured" ? content.duration : "";
  const schedule = content.kind === "structured" ? content.schedule : "";
  const curriculum =
    content.kind === "structured"
      ? content.curriculum.map((item) => item.title).join(" → ")
      : "";
  const keywords =
    content.kind === "structured"
      ? content.keywords.length
        ? content.keywords
        : content.options.map((option) => option.name)
      : [];
  const summary =
    content.kind === "structured" && content.summary
      ? content.summary
      : summarize(
          content.kind === "free"
            ? content.body
            : content.body || row.description,
        );
  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface">
      <Link
        href={`/class/${row.id}`}
        className="block min-w-0 cursor-pointer text-foreground"
      >
        <ClassPoster
          src={poster}
          alt={row.poster_alt || `${row.title} 포스터`}
          fit="cover"
        />
        <div className="space-y-2 p-3 @3xl/app:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-6 items-center rounded-full bg-brand px-2 text-fine font-bold text-on-brand">
              {fieldLabel(row.field)}
            </span>
            <Badge>{deliveryLabel(row.is_online)}</Badge>
            {instructors && (
              <span className="text-caption text-muted">{instructors}</span>
            )}
          </div>
          <h2 className="text-subtitle font-extrabold wrap-anywhere">
            {row.title}
          </h2>
          {summary && (
            <p className="text-caption wrap-anywhere text-muted">{summary}</p>
          )}
          {(duration || schedule) && (
            <p className="flex items-start gap-1.5 text-caption text-foreground">
              <Calendar
                size={16}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-brand"
              />
              <span className="wrap-anywhere">
                {[duration, schedule].filter(Boolean).join(" · ")}
              </span>
            </p>
          )}
          {curriculum && (
            <p className="flex items-start gap-1.5 text-caption text-foreground">
              <BookOpen
                size={16}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-brand"
              />
              <span className="wrap-anywhere">{curriculum}</span>
            </p>
          )}
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {keywords.map((keyword) => (
                <Chip key={keyword}>{keyword}</Chip>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-price font-extrabold text-pink">
              {tuitionLabel(content)}
            </span>
            <span className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-4 text-label font-bold text-on-brand">
              자세히 보기
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
