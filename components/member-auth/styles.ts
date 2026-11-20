export const memberHardNavKey = "jjokjipge-member-hard-nav";

export const labelClass = "block text-label font-semibold";

export const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-input border bg-surface px-3 text-body text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50";

export function fieldClass(invalid: boolean) {
  return `${inputClass} ${invalid ? "border-error" : "border-border"}`;
}

export const linkClass =
  "inline-flex min-h-11 max-w-full cursor-pointer items-center text-label font-semibold wrap-anywhere text-brand";

export const alertClass =
  "text-label font-semibold wrap-anywhere text-error outline-none";

export const statusClass =
  "text-body leading-relaxed wrap-anywhere outline-none";

export const noteClass =
  "text-caption leading-relaxed wrap-anywhere text-muted";
