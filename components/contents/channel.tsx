import { BookOpen, Camera, CirclePlay, type LucideIcon } from "lucide-react";
import {
  channelLabels,
  channelLinkLabels,
  parseExternalUrl,
  type Channel,
} from "@/lib/contents/rules";

const icons: Record<Channel, LucideIcon> = {
  blog: BookOpen,
  instagram: Camera,
  youtube: CirclePlay,
};

export function ChannelMark({ channel }: { channel: Channel }) {
  const Icon = icons[channel];
  return (
    <span className="inline-flex max-w-full min-h-6 items-center gap-1 text-caption font-medium text-brand-deep">
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      <span>{channelLabels[channel]}</span>
    </span>
  );
}

export function ContentExternalLink({
  href,
  channel,
}: {
  href: string | null;
  channel: Channel;
}) {
  const parsed = href ? parseExternalUrl(href) : { state: "invalid" as const };
  if (parsed.state !== "ok")
    return (
      <p className="text-caption text-muted">
        주소를 확인할 수 없어 링크를 표시하지 않습니다.
      </p>
    );
  const Icon = icons[channel];
  return (
    <div className="min-w-0 space-y-2">
      <a
        href={parsed.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Icon size={16} aria-hidden="true" className="shrink-0" />
        <span>{channelLinkLabels[channel]}</span>
        <span className="text-fine font-semibold"> 새 창</span>
      </a>
      <p className="text-caption break-all text-muted">{parsed.href}</p>
    </div>
  );
}
