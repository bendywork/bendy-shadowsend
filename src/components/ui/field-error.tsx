/**
 * Inline field-level validation message. Pair it with
 * `aria-invalid` + `aria-describedby` on the control so screen readers
 * announce the same copy that is rendered below the field.
 */
export function FieldError({
  id,
  message,
}: {
  id: string;
  message?: string | null;
}) {
  if (!message) return null;
  return (
    <span id={id} className="field-error" role="alert">
      {message}
    </span>
  );
}
