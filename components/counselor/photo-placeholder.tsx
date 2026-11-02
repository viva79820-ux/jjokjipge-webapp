import { UserRound } from "lucide-react";
export function PhotoPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      aria-label="상담사 사진 자리"
      role="img"
      className={`flex items-center justify-center rounded-card bg-surface-muted text-muted ${className}`}
    >
      <UserRound aria-hidden="true" className="h-1/2 w-1/2" strokeWidth={1} />
    </div>
  );
}
