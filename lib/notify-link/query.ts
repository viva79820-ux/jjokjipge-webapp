export function notifyTokenQuery(value: string | string[] | undefined) {
  if (typeof value === "undefined") return { present: false, token: null };
  if (typeof value !== "string") return { present: true, token: null };
  const token = value.trim();
  if (!token || token.length > 512) return { present: true, token: null };
  return { present: true, token };
}
