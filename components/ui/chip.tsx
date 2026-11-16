export function Chip({
  children,
  primary = false,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <span
      className={`inline-flex min-h-6 max-w-full items-center rounded-full bg-brand-soft px-2.25 py-1 text-fine wrap-anywhere text-brand-deep ${primary ? "font-bold" : "font-semibold"}`}
    >
      {children}
    </span>
  );
}
