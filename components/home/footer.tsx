import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/lib/site-config";

export function HomeFooter() {
  return (
    <footer
      data-home-footer
      className="flex flex-col gap-1.5 border-t border-border pt-5 text-fine text-muted"
    >
      <div className="flex items-center gap-1.5 text-label font-extrabold text-foreground">
        <Image
          src="/images/brand/logo-angel-mark.png"
          alt=""
          width={592}
          height={450}
          className="h-[26px] w-auto"
        />
        <span className="min-w-0 wrap-anywhere">{siteConfig.name}</span>
      </div>
      <p className="wrap-anywhere">
        대구 동성로 사주·타로·작명 전문 · 1호점 · 2호점 · 3호점
      </p>
      <nav aria-label="법적 고지">
        <Link
          href="/terms"
          className="inline-flex min-h-11 cursor-pointer items-center font-bold text-foreground underline underline-offset-2"
        >
          이용약관
        </Link>
      </nav>
      <p className="wrap-anywhere">
        상호 {siteConfig.name} · 대표 [대표자명] · 사업자등록번호 [번호]
      </p>
      <p className="wrap-anywhere">통신판매업 신고 [번호] · 주소 [매장 주소]</p>
    </footer>
  );
}
