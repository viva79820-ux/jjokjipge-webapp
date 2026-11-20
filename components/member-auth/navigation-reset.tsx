"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { memberHardNavKey } from "./styles";

// 인라인 ref는 렌더마다 정리 함수가 실행되어 오류 후에도 입력이 지워진다.
// 같은 함수를 유지하면 화면이 숨겨지거나 벗어날 때만 비밀번호가 지워진다.
export function useFormResetRef() {
  const formRef = useRef<HTMLFormElement>(null);
  const ref = useCallback((node: HTMLFormElement | null) => {
    formRef.current = node;
    return () => {
      node?.reset();
    };
  }, []);
  return [formRef, ref] as const;
}

function browserStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberHardNavigation() {
  const store = browserStore();
  if (!store) return false;
  try {
    store.setItem(memberHardNavKey, "1");
    return true;
  } catch {
    return false;
  }
}

export function forgetHardNavigation() {
  const store = browserStore();
  if (!store) return;
  try {
    store.removeItem(memberHardNavKey);
  } catch {
    // 마커를 지우지 못해도 로그아웃 안내와 재시도는 계속한다.
  }
}

export function HardNavigation() {
  useLayoutEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("member-nav")) {
      url.searchParams.delete("member-nav");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
      return;
    }
    const store = browserStore();
    if (!store) return;
    let marked = false;
    try {
      marked = store.getItem(memberHardNavKey) === "1";
    } catch {
      return;
    }
    if (!marked) return;
    let cleared = false;
    try {
      store.removeItem(memberHardNavKey);
      cleared = true;
    } catch {
      cleared = false;
    }
    window.location.replace(cleared ? "/login" : "/login?member-nav=1");
  }, []);
  return null;
}

export function ReloadRestoredPage() {
  useLayoutEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return null;
}
