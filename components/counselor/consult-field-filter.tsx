"use client";

import { useLayoutEffect, useState, type MouseEvent } from "react";
import type { Counselor } from "@/lib/data/counselors";
import { consultFieldParam, filterByField } from "@/lib/counselors/rules";
import { ConsultListCard } from "./consult-list-card";

const filters = [
  { label: "전체", href: "/consult", value: "all" },
  { label: "타로", href: "/consult?type=tarot", value: "tarot" },
  { label: "사주", href: "/consult?type=saju", value: "saju" },
] as const;
const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function selectedField() {
  const values = new URLSearchParams(window.location.search).getAll("type");
  return consultFieldParam(values.length === 1 ? values[0] : values);
}

export function ConsultFieldFilter({
  counselors,
  initialSelected,
}: {
  counselors: Counselor[];
  initialSelected: "all" | "tarot" | "saju";
}) {
  const [selected, setSelected] = useState(initialSelected);
  useLayoutEffect(() => {
    const sync = () => {
      if (window.location.pathname !== "/consult") return;
      setSelected(selectedField());
    };
    sync();
    // Other /consult links, such as the top tab, change the URL without
    // remounting this list. Read that click before the router handles it.
    const onClick = (event: globalThis.MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a");
      if (!link || link.closest('nav[aria-label="상담 분야"]')) return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === "/consult" &&
        url.search === ""
      )
        setSelected("all");
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("click", onClick, true);
    };
  }, [initialSelected]);
  function choose(
    event: MouseEvent<HTMLAnchorElement>,
    filter: (typeof filters)[number],
  ) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (selected === filter.value) return;
    setSelected(filter.value);
    // Keep the App Router history marker without starting a route transition.
    // A normal pushState is observed by Next.js and reloads this list.
    const current = window.history.state;
    History.prototype.pushState.call(
      window.history,
      current ? { ...current } : { __NA: true },
      "",
      filter.href,
    );
  }
  const filtered = filterByField(counselors, selected);
  return (
    <>
      <nav aria-label="상담 분야" className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = selected === filter.value;
          return (
            <a
              key={filter.value}
              href={filter.href}
              aria-current={active ? "page" : undefined}
              onClick={(event) => choose(event, filter)}
              className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4.5 text-label font-bold ${focus} ${active ? "border-brand bg-brand text-on-brand" : "border-border bg-surface text-foreground"}`}
            >
              {filter.label}
            </a>
          );
        })}
      </nav>
      <p className="text-caption font-semibold text-muted">
        선생님 {filtered.length}명
      </p>
      {filtered.length ? (
        <ul
          data-counselor-list
          className="grid min-w-0 gap-3 @3xl/app:grid-cols-2"
        >
          {filtered.map((counselor) => (
            <ConsultListCard key={counselor.id} counselor={counselor} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-muted">해당 분야 상담사가 아직 없어요.</p>
      )}
    </>
  );
}
