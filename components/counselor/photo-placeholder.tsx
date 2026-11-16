import Image from "next/image";

export function PhotoPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div
      aria-label="상담사 사진 자리"
      role="img"
      className={`flex items-center justify-center overflow-hidden bg-brand-soft ${className}`}
    >
      <Image
        src="/images/brand/logo-angel-mark.png"
        alt=""
        width={592}
        height={450}
        className="h-auto w-3/5 object-contain"
      />
    </div>
  );
}
