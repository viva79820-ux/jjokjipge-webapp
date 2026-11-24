// Active router pathname only. Hidden Activity pages stay in the DOM,
// so detail chrome must not be inferred from elements inside the document.
export function isCounselorDetailPath(pathname: string | null) {
  if (!pathname) return false;
  const path = pathname.split("?")[0]?.split("#")[0] ?? "";
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const parts = normalized.split("/");
  return parts.length === 3 && parts[0] === "" && parts[1] === "consult";
}

export function isAiSajuResultPath(pathname: string | null) {
  if (!pathname) return false;
  const path = pathname.split("?")[0]?.split("#")[0] ?? "";
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return normalized === "/ai-saju/result";
}

export function hidesSharedSiteChrome(pathname: string | null) {
  return isCounselorDetailPath(pathname) || isAiSajuResultPath(pathname);
}
