import { Mail } from "lucide-react";
import { screenFieldClass, screenLabelClass } from "./styles";

export function EmailField({
  id,
  invalid,
  describedBy,
  disabled,
  autoComplete,
  defaultValue,
}: {
  id: string;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
  autoComplete: "username" | "email";
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={screenLabelClass}>
        이메일
      </label>
      <div className="relative">
        <Mail
          aria-hidden="true"
          size={20}
          className="pointer-events-none absolute top-3.5 left-3.5 text-muted"
        />
        <input
          id={id}
          name="email"
          type="email"
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={disabled}
          defaultValue={defaultValue}
          placeholder="example@email.com"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`${screenFieldClass(invalid)} pr-3.5 pl-11`}
        />
      </div>
    </div>
  );
}
