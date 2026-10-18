"use client";

import {
  createContext,
  forwardRef,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

type FieldContextValue = {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

function useFieldControl() {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: field.id,
    "aria-invalid": field.invalid || undefined,
    "aria-describedby": field.describedBy,
    "aria-required": field.required || undefined,
  };
}

type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  hintClassName?: string;
  children: ReactNode;
};

export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  className,
  labelClassName,
  hintClassName,
  children,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={clsx("form-field", className)} data-invalid={error ? "true" : undefined}>
      <label className={clsx("form-label", labelClassName)} htmlFor={id}>
        <span>{label}</span>
        {required ? (
          <span className="form-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <FieldContext.Provider
        value={{ id, describedBy, invalid: Boolean(error), required }}
      >
        {children}
      </FieldContext.Provider>
      {hint ? (
        <p className={clsx("form-hint", hintClassName)} id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    const fieldProps = useFieldControl();
    return <input ref={ref} {...fieldProps} {...props} className={clsx("field", className)} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...props }, ref) {
    const fieldProps = useFieldControl();
    return <textarea ref={ref} {...fieldProps} {...props} className={clsx("field", className)} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    const fieldProps = useFieldControl();
    return (
      <span className="select-wrap">
        <select ref={ref} {...fieldProps} {...props} className={clsx("field", className)}>
          {children}
        </select>
        <ChevronDown className="select-chevron" aria-hidden="true" />
      </span>
    );
  },
);

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
};

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
  size = "md",
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-checked={checked ? "true" : "false"}
      onClick={() => onCheckedChange(!checked)}
      className={clsx("switch", size === "sm" && "switch--sm", className)}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  fullWidth?: boolean;
  className?: string;
  /** tablist 的 DOM id，按钮会派生为 `${id}-${value}`。 */
  id?: string;
  /** 对应 tabpanel 的 DOM id，用于 aria-controls。 */
  panelId?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  fullWidth,
  className,
  id,
  panelId,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      id={id}
      aria-label={ariaLabel}
      className={clsx("segmented", fullWidth && "segmented--full", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            id={id ? `${id}-${option.value}` : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            data-active={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className="segmented-item"
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
