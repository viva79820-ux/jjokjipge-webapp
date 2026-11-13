"use client";

import { useState } from "react";
import { fieldClass } from "./styles";

export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  invalid,
  describedBy,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`${fieldClass(invalid)} pr-20`}
        />
        <button
          type="button"
          className="absolute top-1/2 right-1 inline-flex min-h-11 -translate-y-1/2 cursor-pointer items-center px-2 text-caption font-semibold text-brand"
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
