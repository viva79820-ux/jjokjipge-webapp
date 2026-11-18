export type HomeNoticeLine =
  | { status: "ready"; id: string; title: string }
  | { status: "empty" }
  | { status: "error" };

export function homeNoticeFromList(
  notice:
    { id: string; title: string; is_published: boolean } | null | undefined,
): HomeNoticeLine {
  if (!notice?.is_published) return { status: "empty" };
  const title = notice.title.trim();
  if (!notice.id || !title) return { status: "empty" };
  return { status: "ready", id: notice.id, title };
}
