/**
 * The label WRAPS the input rather than pointing at it with `htmlFor`. That is
 * deliberate: it needs no generated id, it cannot become mismatched, and
 * `getByLabelText` finds it either way — which is how every existing test in
 * this codebase locates a field.
 *
 * `onChange` hands back the value, not the event. Callers store strings; making
 * each one reach into `event.target.value` is repetition with a typo in it.
 */
export function Field({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
  inputMode?: "text" | "tel" | "email" | "numeric";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        {...(maxLength !== undefined && { maxLength })}
        {...(inputMode !== undefined && { inputMode })}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-card border border-line bg-surface px-4 text-[1.0625rem] text-ink"
      />
    </label>
  );
}
