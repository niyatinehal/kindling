/**
 * The label WRAPS the input rather than pointing at it with `htmlFor`. That is
 * deliberate: it needs no generated id, it cannot become mismatched, and
 * `getByLabelText` finds it either way — which is how every existing test in
 * this codebase locates a field.
 *
 * `onChange` hands back the value, not the event. Callers store strings; making
 * each one reach into `event.target.value` is repetition with a typo in it.
 *
 * The input's border is `border-muted`, not `border-line`. `--color-line`
 * measures 1.27:1 against white — nowhere near the 3:1 WCAG 1.4.11 requires
 * for a non-text boundary that is the sole means of identifying a control,
 * which for an input the border is. `--color-line` stays as-is everywhere
 * else (a Card's edge is decorative, not the only cue a control exists).
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
        className="min-h-13 w-full rounded-control border border-line bg-raised px-4 text-[1.0625rem] text-ink transition focus:border-accent focus:ring-4 focus:ring-accent/15"
      />
    </label>
  );
}
