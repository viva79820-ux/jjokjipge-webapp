import type { PublicCard } from "./rules";

export const blogFeedUrl = "https://rss.blog.naver.com/taro93.xml";
export const youtubeFeedUrl =
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCQW1dFMrN1ndpsT77BK-9KA";
export const blogFeedLimit = 6;
export const youtubeFeedLimit = 3;
export const feedRevalidateSeconds = 3600;

export type FeedItem = PublicCard & { postedAt: number };

type FeedResponse = {
  ok: boolean;
  text: () => Promise<string>;
};

export function addressKeys(href: string) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return [];
  }
  const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, "");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const keys = [`${host}${path}`];
  const videoId = youtubeVideoId(url);
  if (videoId) keys.push(`youtube:${videoId}`);
  return keys;
}

export function parseBlogFeed(xml: string) {
  return parseItems(xml, "item", (block) => {
    const href = firstHttp(tag(block, "guid")) || firstHttp(tag(block, "link"));
    const title = plainText(tag(block, "title"));
    const postedAt = timestamp(tag(block, "pubDate"));
    if (!href || !title || postedAt === null) return null;
    return feedItem({
      id: `feed:blog:${addressKeys(href)[0] ?? href}`,
      title,
      channel: "blog",
      href,
      thumbnail: firstImage(tag(block, "description")),
      postedAt,
    });
  });
}

export function parseYoutubeFeed(xml: string) {
  return parseItems(xml, "entry", (block) => {
    const videoId = tag(block, "yt:videoId");
    const href =
      attribute(block, "link", "rel", "alternate", "href") ||
      (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    const title = plainText(tag(block, "title"));
    const postedAt = timestamp(tag(block, "published"));
    if (!href || !title || postedAt === null) return null;
    return feedItem({
      id: `feed:youtube:${videoId || addressKeys(href)[0] || href}`,
      title,
      channel: "youtube",
      href,
      thumbnail:
        attribute(block, "media:thumbnail", "url") ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
      postedAt,
    });
  });
}

export function recentFeed(items: FeedItem[], limit: number) {
  return [...items].sort(newestFirst).slice(0, limit);
}

export async function readExternalFeed(
  url: string,
  parse: (xml: string) => FeedItem[],
  fetchImpl: (
    input: string,
    init: { signal: AbortSignal; next: { revalidate: number } },
  ) => Promise<FeedResponse>,
) {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: feedRevalidateSeconds },
    });
    if (!response.ok) return [];
    return parse(await response.text());
  } catch {
    return [];
  }
}

export function mergePublicContents(
  admin: PublicCard[],
  feeds: { blog: FeedItem[]; youtube: FeedItem[] },
) {
  const seen = new Set<string>();
  for (const row of admin) {
    for (const key of addressKeys(row.href)) seen.add(key);
  }
  const extra = [...feeds.blog, ...feeds.youtube].filter((item) => {
    const keys = addressKeys(item.href);
    return keys.length > 0 && keys.every((key) => !seen.has(key));
  });
  return [...admin.map(withPostedAt), ...extra].sort(newestFirst).map(cardOnly);
}

function feedItem(input: {
  id: string;
  title: string;
  channel: "blog" | "youtube";
  href: string;
  thumbnail: string | null;
  postedAt: number;
}): FeedItem | null {
  let href: URL;
  try {
    href = new URL(input.href);
  } catch {
    return null;
  }
  if (href.protocol !== "https:") return null;
  const thumbnail = httpsUrl(input.thumbnail);
  return {
    id: input.id,
    title: input.title.slice(0, 300),
    channel: input.channel,
    href: href.toString(),
    thumbnail_path: null,
    thumbnail_alt: thumbnail
      ? input.channel === "youtube"
        ? "유튜브 영상 썸네일"
        : "블로그 글 썸네일"
      : null,
    thumbnail_url: thumbnail,
    posted_on: postedOn(input.postedAt),
    postedAt: input.postedAt,
  };
}

function withPostedAt(row: PublicCard): FeedItem {
  return { ...row, postedAt: postedOnTimestamp(row.posted_on) ?? Number.NaN };
}

function cardOnly(row: FeedItem): PublicCard {
  return {
    id: row.id,
    title: row.title,
    channel: row.channel,
    href: row.href,
    thumbnail_path: row.thumbnail_path,
    thumbnail_alt: row.thumbnail_alt,
    thumbnail_url: row.thumbnail_url,
    posted_on: row.posted_on,
  };
}

function newestFirst(left: FeedItem, right: FeedItem) {
  const leftTime = Number.isFinite(left.postedAt) ? left.postedAt : null;
  const rightTime = Number.isFinite(right.postedAt) ? right.postedAt : null;
  if (leftTime !== rightTime) {
    if (leftTime === null) return 1;
    if (rightTime === null) return -1;
    return rightTime - leftTime;
  }
  return right.id.localeCompare(left.id);
}

function postedOn(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function postedOnTimestamp(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00+09:00`);
  return Number.isNaN(time) ? null : time;
}

function youtubeVideoId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") return videoId(url.pathname.slice(1));
  if (host !== "youtube.com" && host !== "m.youtube.com") return null;
  if (url.pathname === "/watch") return videoId(url.searchParams.get("v"));
  const [, kind, id] = url.pathname.split("/");
  if (kind === "shorts" || kind === "embed" || kind === "v") return videoId(id);
  return null;
}

function videoId(value: string | null | undefined) {
  return value && /^[A-Za-z0-9_-]{6,20}$/.test(value) ? value : null;
}

function parseItems(
  xml: string,
  tagName: string,
  read: (block: string) => FeedItem | null,
) {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`,
    "gi",
  );
  const items: FeedItem[] = [];
  for (const match of xml.matchAll(pattern)) {
    const item = read(match[1]);
    if (item) items.push(item);
  }
  return items;
}

function tag(block: string, name: string) {
  const match = block.match(
    new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"),
  );
  return match ? unwrap(match[1]) : "";
}

function attribute(
  block: string,
  name: string,
  requiredName: string | null,
  requiredValue: string | null,
  attributeName: string,
) {
  const pattern = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  for (const match of block.matchAll(pattern)) {
    const attrs = match[1];
    if (requiredName && attributeValue(attrs, requiredName) !== requiredValue) {
      continue;
    }
    const value = attributeValue(attrs, attributeName);
    if (value) return value;
  }
  return null;
}

function attributeValue(source: string, name: string) {
  const match = source.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return match ? unwrap(match[1] ?? match[2] ?? "") : null;
}

function firstHttp(value: string) {
  const match = value.match(/https:\/\/[^\s<"]+/);
  return match ? match[0] : null;
}

function firstImage(html: string) {
  const match = html.match(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  return match ? unwrap(match[1] ?? match[2] ?? "") : null;
}

function httpsUrl(value: string | null) {
  if (!value) return null;
  const upgraded = value
    .trim()
    .replace(/^http:\/\//i, "https://")
    .replace(/^\/\//, "https://");
  try {
    const url = new URL(upgraded);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrap(value: string) {
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return decodeXml(cdata ? cdata[1] : value).trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => character(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => character(Number(digits)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function character(code: number) {
  return Number.isFinite(code) && code > 0 && code < 0x110000
    ? String.fromCodePoint(code)
    : "";
}

function timestamp(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}
