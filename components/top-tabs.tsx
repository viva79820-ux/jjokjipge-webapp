"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

const tabs = [
  ["전화상담", "/consult"],
  ["AI 사주", "/ai-saju"],
  ["클래스", "/class"],
  ["매장상담", "/stores"],
  ["타로샵", "/shop"],
  ["콘텐츠", "/contents"],
] as const;

type TabLayout = "scroll" | "fill" | "even";

function contentWidth(link: HTMLElement) {
  const probe = link.cloneNode(true) as HTMLElement;
  const style = getComputedStyle(link);
  probe.className = "";
  probe.style.position = "absolute";
  probe.style.left = "-9999px";
  probe.style.top = "0";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "nowrap";
  probe.style.font = style.font;
  probe.style.paddingLeft = style.paddingLeft;
  probe.style.paddingRight = style.paddingRight;
  probe.style.width = "max-content";
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

// 글자 너비가 들어가면 칸을 늘려 한 줄을 채운다. 더 좁으면 줄이지 않고 스크롤한다.
function readTabLayout(nav: HTMLElement): TabLayout {
  const links = [...nav.querySelectorAll<HTMLAnchorElement>(":scope > a")];
  if (links.length === 0 || nav.clientWidth === 0) return "scroll";
  const style = getComputedStyle(nav);
  const padding =
    Number.parseFloat(style.paddingLeft) +
    Number.parseFloat(style.paddingRight);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const widths = links.map(contentWidth);
  const widest = Math.max(...widths);
  const content = widths.reduce((sum, width) => sum + width, 0);
  const inner = nav.clientWidth - padding - gap * (links.length - 1);
  if (Math.ceil(widest) * links.length <= Math.floor(inner)) return "even";
  const needed = Math.ceil(content + gap * (links.length - 1) + padding);
  if (needed <= nav.clientWidth) return "fill";
  return "scroll";
}

const layoutClass: Record<TabLayout, string> = {
  scroll: "shrink-0",
  fill: "grow shrink-0",
  even: "flex-1",
};

export function TopTabs() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [layout, setLayout] = useState<TabLayout>("scroll");

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      if (!nav.isConnected) return;
      const next = readTabLayout(nav);
      setLayout((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    if (layout === "scroll") {
      activeRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
      return;
    }
    nav.scrollLeft = 0;
  }, [pathname, layout]);

  return (
    <nav
      ref={navRef}
      aria-label="주요 메뉴"
      className="flex h-12 min-w-0 gap-1 overflow-x-auto border-b border-border bg-surface px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(([label, href]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            ref={active ? activeRef : undefined}
            aria-current={active ? "page" : undefined}
            onFocus={(event) => {
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            }}
            className={`flex h-12 cursor-pointer items-center justify-center border-b-3 px-3 text-body whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${layoutClass[layout]} ${active ? "border-brand font-bold text-brand" : "border-transparent font-semibold text-muted"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
