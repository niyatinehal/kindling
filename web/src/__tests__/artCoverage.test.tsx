import { render } from "@testing-library/react";
import { StrictMode } from "react";

import messages from "../../messages/en.json";
import { DishArt } from "../art/DishArt";
import { DISHES } from "../art/dishes";
import { ExerciseArt } from "../art/ExerciseArt";
import { POSES } from "../art/exercisePoses";
import { HeroArt } from "../art/HeroArt";

/**
 * Every exercise and dish the app can name has its own picture. The fallback
 * keeps an undrawn one from breaking a screen, but it is a generic figure or
 * bowl — so a new library entry without art should fail here, loudly, rather
 * than ship looking like every other unknown.
 *
 * The keys come from en.json because that is the list the screens can name;
 * the API library and the translations are already kept in step elsewhere.
 */
describe("illustration coverage", () => {
  it.each(Object.keys(messages.plan.exercises))("draws the exercise %s", (key) => {
    expect(POSES[key]).toBeDefined();
  });

  it.each(Object.keys(messages.meals.recipes))("draws the dish %s", (key) => {
    expect(DISHES[key]).toBeDefined();
  });

  it("keeps the pictures out of the accessibility tree", () => {
    const { container } = render(
      <>
        <ExerciseArt exercise="plank" />
        <DishArt recipe="poha" />
      </>,
    );

    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("draws the same dish the same way every time, so hydration matches", () => {
    // Gradient and filter ids come from useId and differ per render by design;
    // everything else — every seeded topping — must be identical.
    const drawing = () =>
      render(<DishArt recipe="chana_masala" />)
        .container.innerHTML.replace(/id="[^"]*"/g, 'id=""')
        .replace(/url\(#[^)]*\)/g, "url()");

    expect(drawing()).toBe(drawing());
  });

  // React renders a component twice in StrictMode, as it does in development.
  // A scatter drawn from one random sequence shared across components carried
  // on where the first pass stopped, so the browser disagreed with the server.
  it("draws the same dish when React renders it twice", () => {
    const strip = (html: string) =>
      html.replace(/id="[^"]*"/g, 'id=""').replace(/url\(#[^)]*\)/g, "url()");
    const once = strip(render(<DishArt recipe="rajma_chawal" />).container.innerHTML);
    const twice = strip(
      render(
        <StrictMode>
          <DishArt recipe="rajma_chawal" />
        </StrictMode>,
      ).container.innerHTML,
    );

    expect(twice).toBe(once);
  });

  it.each(["family", "food"] as const)("draws the %s hero scene", (name) => {
    const { container } = render(<HeroArt name={name} />);
    expect(container.querySelector(`svg[data-hero="${name}"]`)).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("still draws something for a key it has never heard of", () => {
    const { container } = render(
      <>
        <ExerciseArt exercise="not_a_real_exercise" />
        <DishArt recipe="not_a_real_dish" />
      </>,
    );

    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });
});
