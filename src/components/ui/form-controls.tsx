"use client";

import {
  createContext,
  forwardRef,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import clsx from "clsx";

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

export type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  counter?: ReactNode;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
};

/**
 * Shared form field shell from ui-15: label + control + hint + inline error.
 * Hint and error ids are wired to the control through context so every
 * control gets `aria-describedby` without repeating ids at the call site.
 */
export function Field({
  id,
  label,
  hint,
  error,
  counter,
  required,
  className,
  labelClassName,
  children,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div
      className={clsx("form-field", className)}
      data-invalid={error ? "true" : undefined}
    >
      <label className={clsx("form-label", labelClassName)} htmlFor={id}>
        <span>{label}</span>
        {required ? (
          <span className="form-required" aria-hidden="true">
            *
          </span>
        ) : null}
        {counter ? <span className="form-counter">{counter}</span> : null}
      </label>
      <FieldContext.Provider
        value={{ id, describedBy, invalid: Boolean(error), required: Boolean(required) }}
      >
        {children}
      </FieldContext.Provider>
      {hint ? (
        <p className="form-hint" id={hintId}>
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

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, ...props }, ref) {
  const fieldProps = useFieldControl();
  return (
    <input
      ref={ref}
      {...fieldProps}
      {...props}
      className={clsx("field", className)}
    />
  );
});

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
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  fullWidth,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        "segmented items-center p-1",
        fullWidth ? "flex w-full" : "inline-flex",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={clsx(
              "segmented-item inline-flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
              fullWidth && "flex-1",
            )}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
