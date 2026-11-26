import "server-only";
import { cacheLife } from "next/cache";
import {
  blogFeedLimit,
  blogFeedUrl,
  feedRevalidateSeconds,
  parseBlogFeed,
  parseYoutubeFeed,
  readExternalFeed,
  recentFeed,
  youtubeFeedLimit,
  youtubeFeedUrl,
  type FeedItem,
} from "./feeds";

export async function loadExternalContents(): Promise<{
  blog: FeedItem[];
  youtube: FeedItem[];
}> {
  "use cache";
  cacheLife({ revalidate: feedRevalidateSeconds });
  const [blog, youtube] = await Promise.all([
    readExternalFeed(blogFeedUrl, parseBlogFeed, fetch),
    readExternalFeed(youtubeFeedUrl, parseYoutubeFeed, fetch),
  ]);
  return {
    blog: recentFeed(blog, blogFeedLimit),
    youtube: recentFeed(youtube, youtubeFeedLimit),
  };
}
