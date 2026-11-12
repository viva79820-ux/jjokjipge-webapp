import {
  counselorHeading,
  counselorNeedsHonorific,
} from "@/lib/counselors/rules";

export function CounselorName({
  name,
  suffix = "small",
}: {
  name: string;
  suffix?: "small" | "same";
}) {
  if (!counselorNeedsHonorific(name))
    return <span className="wrap-anywhere">{counselorHeading(name)}</span>;
  return (
    <span className="wrap-anywhere">
      {name.trim()}{" "}
      <span className={suffix === "small" ? "text-sm font-medium" : undefined}>
        선생님
      </span>
    </span>
  );
}
