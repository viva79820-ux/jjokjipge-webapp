export function Chip({
  children,
  primary = false,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${primary ? "bg-brand-soft text-brand" : "bg-surface-muted text-muted"}`}
    >
      {children}
    </span>
  );
}
