import {
  BookOpen,
  Camera,
  CirclePlay,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  channelLabels,
  parseExternalUrl,
  type Channel,
} from "@/lib/contents/rules";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const icons: Record<Channel, LucideIcon> = {
  blog: BookOpen,
  instagram: Camera,
  youtube: CirclePlay,
};

const channelMarks: Record<
  Channel,
  { src: string; width: number; height: number }
> = {
  blog: {
    src: "/images/channels/channel-naver-blog.png",
    width: 244,
    height: 244,
  },
  instagram: {
    src: "/images/channels/channel-instagram.png",
    width: 256,
    height: 256,
  },
  youtube: {
    src: "/images/channels/channel-youtube.png",
    width: 256,
    height: 179,
  },
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

export function OfficialChannelCard({
  channel,
  href,
}: {
  channel: Channel;
  href: string | null;
}) {
  const mark = channelMarks[channel];
  const body = (
    <>
      <Image
        src={mark.src}
        alt=""
        width={mark.width}
        height={mark.height}
        unoptimized
        className="h-11 w-auto shrink-0"
      />
      <span className="max-w-full text-label font-extrabold break-keep text-foreground">
        {channelLabels[channel]}
      </span>
      <span className="max-w-full text-fine font-semibold break-keep text-muted">
        {href ? "새 창으로 열기" : "채널 주소 준비 중"}
      </span>
    </>
  );
  const className =
    "flex min-h-11 min-w-0 flex-col items-center gap-1.5 rounded-card border border-border bg-surface px-1.5 py-3.5 text-center";
  if (!href) return <div className={className}>{body}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} cursor-pointer ${focus}`}
    >
      {body}
    </a>
  );
}

export function ContentChannelArt({ channel }: { channel: Channel }) {
  const Icon = icons[channel];
  return (
    <div
      aria-hidden="true"
      className="flex size-22 shrink-0 items-center justify-center rounded-input bg-brand-soft text-brand"
    >
      <Icon size={28} aria-hidden="true" />
    </div>
  );
}

export function ContentChannelBadge({ channel }: { channel: Channel }) {
  return <Badge icon={icons[channel]}>{channelLabels[channel]}</Badge>;
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
  return (
    <a
      href={parsed.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${channelLabels[channel]} 새 창으로 열기`}
      className={`inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 text-label font-bold text-brand ${focus}`}
    >
      <ExternalLink size={16} aria-hidden="true" className="shrink-0" />새
      창으로 열기
    </a>
  );
}
