"use client";

import { useEffect } from "react";

// Chromium matches :focus-visible when a text field is clicked.
// The attribute limits the auth field ring to Tab.
export function KeyboardFocus() {
  useEffect(() => {
    const root = document.documentElement;
    const mark = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      root.setAttribute("data-keyboard-focus", "");
    };
    const clear = () => {
      root.removeAttribute("data-keyboard-focus");
    };
    window.addEventListener("keydown", mark, true);
    window.addEventListener("pointerdown", clear, true);
    window.addEventListener("mousedown", clear, true);
    return () => {
      window.removeEventListener("keydown", mark, true);
      window.removeEventListener("pointerdown", clear, true);
      window.removeEventListener("mousedown", clear, true);
      root.removeAttribute("data-keyboard-focus");
    };
  }, []);
  return null;
}
