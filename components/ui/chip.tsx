export function Chip({
  children,
  primary = false,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${primary ? "border-transparent bg-brand-soft text-brand" : "border-border bg-surface text-muted"}`}
    >
      {children}
    </span>
  );
}
