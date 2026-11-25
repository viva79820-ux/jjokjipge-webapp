import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  blogFeedLimit,
  blogFeedUrl,
  feedRevalidateSeconds,
  mergePublicContents,
  parseBlogFeed,
  parseYoutubeFeed,
  readExternalFeed,
  recentFeed,
  youtubeFeedLimit,
  youtubeFeedUrl,
} from "../lib/contents/feeds.ts";

const blogXml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>새 글</title>
    <link>https://blog.naver.com/taro93/20?fromRss=true&amp;trackingCode=rss</link>
    <guid>https://blog.naver.com/taro93/20</guid>
    <description><![CDATA[<img src="http://blogthumb.pstatic.net/a.jpg">본문]]></description>
    <pubDate>Wed, 25 Nov 2026 10:00:00 +0900</pubDate>
  </item>
  <item>
    <title>그림 없는 글</title>
    <link>https://blog.naver.com/taro93/10</link>
    <pubDate>Tue, 24 Nov 2026 10:00:00 +0900</pubDate>
  </item>
</channel></rss>`;

const youtubeXml = `<?xml version="1.0"?>
<feed>
  <entry>
    <yt:videoId>KKyYRAbmLkk</yt:videoId>
    <title>새 영상</title>
    <published>2026-11-25T02:00:00+00:00</published>
    <link rel="alternate" href="https://www.youtube.com/shorts/KKyYRAbmLkk"/>
    <media:thumbnail url="https://i.ytimg.com/vi/KKyYRAbmLkk/hqdefault.jpg"/>
  </entry>
</feed>`;

test("피드 주소와 건수·갱신 주기를 고정한다", () => {
  assert.equal(blogFeedUrl, "https://rss.blog.naver.com/taro93.xml");
  assert.equal(
    youtubeFeedUrl,
    "https://www.youtube.com/feeds/videos.xml?channel_id=UCQW1dFMrN1ndpsT77BK-9KA",
  );
  assert.equal(blogFeedLimit, 6);
  assert.equal(youtubeFeedLimit, 3);
  assert.equal(feedRevalidateSeconds, 3600);
  const loader = readFileSync("lib/contents/feed-load.ts", "utf8");
  assert.match(loader, /"use cache"/);
  assert.match(loader, /cacheLife\(\{ revalidate: feedRevalidateSeconds \}\)/);
  assert.match(loader, /recentFeed\(blog, blogFeedLimit\)/);
  assert.match(loader, /recentFeed\(youtube, youtubeFeedLimit\)/);
});

test("블로그는 첫 이미지를, 유튜브는 영상 썸네일을 읽는다", () => {
  const blog = parseBlogFeed(blogXml);
  assert.equal(blog.length, 2);
  assert.equal(blog[0].href, "https://blog.naver.com/taro93/20");
  assert.equal(blog[0].thumbnail_url, "https://blogthumb.pstatic.net/a.jpg");
  assert.equal(blog[0].posted_on, "2026-11-25");
  assert.equal(blog[1].thumbnail_url, null);

  const youtube = parseYoutubeFeed(youtubeXml);
  assert.equal(youtube.length, 1);
  assert.equal(youtube[0].href, "https://www.youtube.com/shorts/KKyYRAbmLkk");
  assert.equal(
    youtube[0].thumbnail_url,
    "https://i.ytimg.com/vi/KKyYRAbmLkk/hqdefault.jpg",
  );
  assert.equal(youtube[0].posted_on, "2026-11-25");
});

test("관리자 글과 주소가 같으면 한 번만 보이고 최신순으로 정렬한다", () => {
  const admin = [
    card({
      id: "admin-old",
      title: "관리자 옛 글",
      channel: "blog",
      href: "https://blog.naver.com/taro93/20?utm_source=admin",
      posted_on: "2026-11-20",
    }),
    card({
      id: "admin-new",
      title: "관리자 영상",
      channel: "youtube",
      href: "https://www.youtube.com/watch?v=KKyYRAbmLkk",
      posted_on: "2026-11-26",
    }),
  ];
  const merged = mergePublicContents(admin, {
    blog: parseBlogFeed(blogXml),
    youtube: parseYoutubeFeed(youtubeXml),
  });
  assert.deepEqual(
    merged.map((row) => row.title),
    ["관리자 영상", "그림 없는 글", "관리자 옛 글"],
  );
  assert.equal(merged.filter((row) => row.href.includes("/20")).length, 1);
  assert.equal(merged.filter((row) => row.title === "관리자 영상").length, 1);
});

test("채널별 최근 건수만 남긴다", () => {
  const items = Array.from({ length: 8 }, (_, index) =>
    feed(index, `2026-11-${String(index + 1).padStart(2, "0")}`),
  );
  const recent = recentFeed(items, 6);
  assert.deepEqual(
    recent.map((row) => row.title),
    ["7", "6", "5", "4", "3", "2"],
  );
});

test("피드를 읽지 못하면 빈 목록을 반환한다", async () => {
  const failed = await readExternalFeed(
    blogFeedUrl,
    parseBlogFeed,
    async () => {
      throw new Error("network");
    },
  );
  const rejected = await readExternalFeed(
    blogFeedUrl,
    parseBlogFeed,
    async () => ({ ok: false, text: async () => blogXml }),
  );
  assert.deepEqual(failed, []);
  assert.deepEqual(rejected, []);
});

function card(input) {
  return {
    thumbnail_path: null,
    thumbnail_alt: null,
    thumbnail_url: null,
    ...input,
  };
}

function feed(index, postedOn) {
  return {
    id: `feed:${index}`,
    title: String(index),
    channel: "blog",
    href: `https://blog.naver.com/taro93/${index}`,
    thumbnail_path: null,
    thumbnail_alt: null,
    thumbnail_url: null,
    posted_on: postedOn,
    postedAt: Date.parse(`${postedOn}T00:00:00+09:00`),
  };
}
