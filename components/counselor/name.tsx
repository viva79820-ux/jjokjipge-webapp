import {
  counselorHeading,
  counselorNeedsHonorific,
} from "@/lib/counselors/rules";

export function CounselorName({
  name,
  suffix = "small",
  honorificClassName,
}: {
  name: string;
  suffix?: "small" | "same";
  honorificClassName?: string;
}) {
  if (!counselorNeedsHonorific(name))
    return <span className="wrap-anywhere">{counselorHeading(name)}</span>;
  const honorificClass =
    honorificClassName ??
    (suffix === "small" ? "text-sm font-medium" : undefined);
  return (
    <span className="wrap-anywhere">
      {name.trim()} <span className={honorificClass}>선생님</span>
    </span>
  );
}
