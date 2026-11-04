"use client";

import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  type InputHTMLAttributes,
} from "react";
import { editPhone, reconcilePhoneInput } from "@/lib/reservations/phone-edit";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onPaste" | "type" | "maxLength"
> & {
  value: string;
  onValueChange: (value: string) => void;
};
export function PhoneInput({ value, onValueChange, ...props }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const [, renderSelection] = useReducer((count) => count + 1, 0);
  function commit(edit: ReturnType<typeof editPhone>) {
    selectionRef.current = edit;
    onValueChange(edit.value);
    // Also restore the selection when the visible value is unchanged (full input).
    renderSelection();
  }
  useLayoutEffect(() => {
    const input = inputRef.current;
    const selection = selectionRef.current;
    if (input && selection && document.activeElement === input)
      input.setSelectionRange(selection.start, selection.end);
    selectionRef.current = null;
  });
  useEffect(() => {
    const input = inputRef.current!;
    function beforeInput(event: InputEvent) {
      if (!event.cancelable || event.isComposing) return;
      const start = input.selectionStart ?? 0,
        end = input.selectionEnd ?? start;
      const direction =
        event.inputType === "deleteContentBackward"
          ? "backward"
          : event.inputType === "deleteContentForward"
            ? "forward"
            : event.inputType.startsWith("delete") && start !== end
              ? "selection"
              : null;
      if (
        direction ||
        (event.inputType.startsWith("insert") && event.data !== null)
      ) {
        event.preventDefault();
        commit(
          editPhone(
            input.value,
            start,
            end,
            event.data ?? "",
            direction ?? "insert",
          ),
        );
      }
    }
    input.addEventListener("beforeinput", beforeInput);
    return () => input.removeEventListener("beforeinput", beforeInput);
  });
  return (
    <input
      {...props}
      ref={inputRef}
      type="tel"
      maxLength={13}
      value={value}
      onKeyDown={(event) => {
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.nativeEvent.isComposing
        )
          return;
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        event.preventDefault();
        const input = event.currentTarget;
        commit(
          editPhone(
            input.value,
            input.selectionStart ?? 0,
            input.selectionEnd ?? 0,
            "",
            event.key === "Backspace" ? "backward" : "forward",
          ),
        );
      }}
      onPaste={(event) => {
        event.preventDefault();
        const input = event.currentTarget;
        commit(
          editPhone(
            input.value,
            input.selectionStart ?? 0,
            input.selectionEnd ?? 0,
            event.clipboardData.getData("text"),
          ),
        );
      }}
      onChange={(event) =>
        commit(
          reconcilePhoneInput(
            value,
            event.currentTarget.value,
            event.currentTarget.selectionStart ?? 0,
            (event.nativeEvent as InputEvent).inputType ?? "",
          ),
        )
      }
    />
  );
}
