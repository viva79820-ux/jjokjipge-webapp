export const memberHardNavKey = "jjokjipge-member-hard-nav";

export const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-button border bg-surface px-3 text-body outline-none focus:border-brand focus:ring-2 focus:ring-brand md:text-base";

export function fieldClass(invalid: boolean) {
  return `${inputClass} ${invalid ? "border-error" : "border-border"}`;
}

export const linkClass =
  "inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand";
