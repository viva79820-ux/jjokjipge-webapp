"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import {
  fieldClass,
  labelClass,
  screenFieldClass,
  screenLabelClass,
} from "./styles";

export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  invalid,
  describedBy,
  disabled,
  screen = false,
  showIcon = true,
  placeholder = "비밀번호",
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
  screen?: boolean;
  showIcon?: boolean;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={screen ? "flex flex-col gap-1.5" : undefined}>
      <label htmlFor={id} className={screen ? screenLabelClass : labelClass}>
        {label}
      </label>
      <div className="relative">
        {screen && showIcon ? (
          <Lock
            aria-hidden="true"
            size={20}
            className="pointer-events-none absolute top-3.5 left-3.5 text-muted"
          />
        ) : null}
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={disabled}
          placeholder={screen ? placeholder : undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={
            screen
              ? `${screenFieldClass(invalid)} pr-18 ${showIcon ? "pl-11" : "pl-3.5"}`
              : `${fieldClass(invalid)} pr-20`
          }
        />
        <button
          type="button"
          className={
            screen
              ? "absolute top-1.5 right-1.5 inline-flex h-11 cursor-pointer items-center px-3 text-caption font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              : "absolute top-1/2 right-1 inline-flex min-h-11 -translate-y-1/2 cursor-pointer items-center px-2 text-caption font-semibold text-brand"
          }
          aria-pressed={visible}
          aria-label={visible ? `${label} 숨기기` : `${label} 표시`}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "숨김" : "표시"}
        </button>
      </div>
    </div>
  );
}
