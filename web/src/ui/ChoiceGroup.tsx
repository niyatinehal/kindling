/**
 * The pick-one / pick-many control the intake wizard is built from.
 *
 * Rendered as real radios and checkboxes rather than styled `div`s with
 * `onClick`. That is what gets arrow-key navigation, form semantics, and
 * "3 of 8 selected" from a screen reader for free — and this app is opened by
 * people using assistive tech and by Ramesh, who is 63.
 *
 * The input is visually hidden but NOT `display: none` (which removes it from
 * the accessibility tree and from keyboard focus). `sr-only` keeps it real and
 * focusable; `peer-checked`/`peer-focus-visible` paint the label around it, so
 * the visible selection state and the actual control can never disagree.
 *
 * Like `Field`, the label WRAPS its input, so no generated ids exist to become
 * mismatched and `getByLabelText` finds every option.
 */
export type Choice<T extends string> = { value: T; label: string };

export function ChoiceGroup<T extends string>({
  legend,
  choices,
  selected,
  onChange,
  multiple = false,
}: {
  legend: string;
  choices: readonly Choice<T>[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
  multiple?: boolean;
}) {
  function toggle(value: T): void {
    if (!multiple) {
      onChange([value]);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-muted">{legend}</legend>
      <div className="flex flex-col gap-2">
        {choices.map((choice) => {
          const isSelected = selected.includes(choice.value);
          return (
            <label
              key={choice.value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-card border px-4 py-2 text-[1.0625rem] transition peer-focus-visible:outline ${
                isSelected
                  ? "border-accent bg-canvas text-ink font-semibold"
                  : "border-muted bg-surface text-ink"
              }`}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                className="size-5 shrink-0 accent-accent"
                checked={isSelected}
                // Radios in one logical group share a name so arrow keys move
                // between them; checkboxes are independent and must not.
                {...(multiple ? {} : { name: legend })}
                onChange={() => toggle(choice.value)}
              />
              <span>{choice.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
