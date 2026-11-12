export function Chip({
  children,
  primary = false,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <span
      className={`inline-block max-w-full wrap-anywhere rounded-full px-2 py-0.5 text-xs font-medium ${primary ? "bg-brand-soft text-brand" : "bg-surface-muted text-muted"}`}
    >
      {children}
    </span>
  );
}
