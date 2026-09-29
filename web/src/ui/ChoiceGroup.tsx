/**
 * The pick-one / pick-many control the intake wizard is built from.
 *
 * Rendered as real radios and checkboxes rather than styled `div`s with
 * `onClick`. That is what gets arrow-key navigation, form semantics, and
 * "3 of 8 selected" from a screen reader for free — and this app is opened by
 * people using assistive tech and by Ramesh, who is 63.
 *
 * In the `chips` layout the input is visually hidden but NOT `display: none`
 * (which removes it from the accessibility tree and from keyboard focus).
 * `sr-only` keeps it real and focusable, and the label is painted from the
 * same `checked` state, so the visible selection and the actual control can
 * never disagree.
 *
 * Like `Field`, the label WRAPS its input, so no generated ids exist to become
 * mismatched and `getByLabelText` finds every option.
 */
import { Icon } from "./Icon";

export type Choice<T extends string> = { value: T; label: string };

export function ChoiceGroup<T extends string>({
  legend,
  choices,
  selected,
  onChange,
  multiple = false,
  layout = "list",
}: {
  legend: string;
  choices: readonly Choice<T>[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
  multiple?: boolean;
  /**
   * `list` is one full-width row per option, for short sets where each answer
   * deserves its own line ("Just starting out"). `chips` wraps short labels
   * into rows, for long pick-many sets — the kitchen has 38 items, and as a
   * list that was four screens of scrolling past checkboxes.
   */
  layout?: "list" | "chips";
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
      <legend className="mb-2.5 block text-sm font-medium text-muted">{legend}</legend>
      <div className={layout === "chips" ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}>
        {choices.map((choice) => {
          const isSelected = selected.includes(choice.value);
          const input = (
            <input
              type={multiple ? "checkbox" : "radio"}
              className={layout === "chips" ? "sr-only" : "size-5 shrink-0 accent-accent"}
              checked={isSelected}
              // Radios in one logical group share a name so arrow keys move
              // between them; checkboxes are independent and must not.
              {...(multiple ? {} : { name: legend })}
              onChange={() => toggle(choice.value)}
            />
          );

          // The chip's input is `sr-only`, so the focus ring has to be drawn on
          // the label instead — `has-[:focus-visible]` is what keeps keyboard
          // users able to see where they are.
          if (layout === "chips") {
            return (
              <label
                key={choice.value}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-base transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent motion-safe:active:scale-95 ${
                  isSelected
                    ? "border-accent bg-move-soft font-semibold text-ink"
                    : "border-line bg-surface text-ink hover:border-accent/50"
                }`}
              >
                {input}
                {isSelected && <Icon name="check" className="size-4 text-accent" />}
                <span>{choice.label}</span>
              </label>
            );
          }

          return (
            <label
              key={choice.value}
              className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-control border px-4 py-2 text-[1.0625rem] transition ${
                isSelected
                  ? "border-accent bg-move-soft font-semibold text-ink"
                  : "border-line bg-surface text-ink hover:border-accent/50"
              }`}
            >
              {input}
              <span>{choice.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
