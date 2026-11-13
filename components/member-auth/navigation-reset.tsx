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

export function HardNavigation() {
  useLayoutEffect(() => {
    if (sessionStorage.getItem(memberHardNavKey) !== "1") return;
    sessionStorage.removeItem(memberHardNavKey);
    window.location.replace("/login");
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
