import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { MealsClient } from "../../app/meals/MealsClient";
import type { MealSuggestion, PantryConsent, PantryParse } from "../meals/mealTypes";

const originalFetch = global.fetch;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const cookable: MealSuggestion = {
  recipe_key: "dal_chawal",
  slot: "lunch",
  uses_on_hand: ["toor_dal", "rice"],
  missing: [],
  approx_kcal: 420,
  protein_g: 14,
  minutes: 30,
  cautions: [],
  meets_protein: true,
  pair_with: null,
  protein_target_g: 12,
};

const needsShopping: MealSuggestion = {
  recipe_key: "palak_paneer",
  slot: "dinner",
  uses_on_hand: ["spinach"],
  missing: ["paneer"],
  approx_kcal: 350,
  protein_g: 18,
  minutes: 30,
  cautions: [],
  meets_protein: true,
  pair_with: null,
  protein_target_g: 12,
};

/** Thin on protein — the case the pairing rule exists for. */
const thin: MealSuggestion = {
  recipe_key: "cabbage_poriyal",
  slot: "lunch",
  uses_on_hand: ["cabbage"],
  missing: [],
  approx_kcal: 160,
  protein_g: 4,
  minutes: 20,
  cautions: [],
  meets_protein: false,
  pair_with: "dal_chawal",
  protein_target_g: 12,
};

const flagged: MealSuggestion = {
  recipe_key: "jeera_rice",
  slot: "lunch",
  uses_on_hand: ["rice"],
  missing: [],
  approx_kcal: 300,
  protein_g: 5,
  minutes: 20,
  cautions: ["type_2_diabetes"],
  meets_protein: false,
  pair_with: "dal_chawal",
  protein_target_g: 12,
};

const NOT_OFFERED: PantryConsent = { enabled: false, available: false };

function renderMeals(hasProfile = true, pantryConsent: PantryConsent = NOT_OFFERED) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MealsClient hasProfile={hasProfile} pantryConsent={pantryConsent} />
    </NextIntlClientProvider>,
  );
}

const suggestButton = () => screen.getByRole("button", { name: messages.meals.suggest });

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve(response(200, { suggestions: [cookable, needsShopping] })),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("meals screen — the pantry", () => {
  it("offers the kitchen as a checklist", () => {
    renderMeals();

    expect(screen.getByText(messages.meals.groups.grains)).toBeInTheDocument();
    expect(screen.getByText(messages.meals.groups.pulses)).toBeInTheDocument();
    expect(screen.getByLabelText(messages.meals.ingredients.rice)).toBeInTheDocument();
    expect(screen.getByLabelText(messages.meals.ingredients.toor_dal)).toBeInTheDocument();
  });

  // Diet lives on the profile so the API can enforce it; asking again here would
  // let a client send a flag that contradicts what the person declared.
  it("never asks for dietary preferences", () => {
    renderMeals();

    expect(screen.queryByText(/vegetarian/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vegan/i)).not.toBeInTheDocument();
  });

  it("warns that suggestions are unfiltered without a profile", () => {
    renderMeals(false);

    expect(screen.getByText(messages.meals.noProfileNote)).toBeInTheDocument();
  });

  it("sends the ticked ingredients and the chosen meal", async () => {
    renderMeals();

    fireEvent.click(screen.getByLabelText(messages.meals.ingredients.rice));
    fireEvent.click(screen.getByLabelText(messages.meals.ingredients.toor_dal));
    fireEvent.click(screen.getByLabelText(messages.meals.slots.lunch));
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByText(messages.meals.recipes.dal_chawal)).toBeInTheDocument();
    });
    const call = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }];
    expect(call[0]).toBe("/api/meals");
    expect(JSON.parse(call[1].body)).toEqual({
      ingredients: ["rice", "toor_dal"],
      slot: "lunch",
    });
  });
});

describe("meals screen — suggestions", () => {
  it("says which dishes can be cooked right now", async () => {
    renderMeals();
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByText(messages.meals.canCookNow)).toBeInTheDocument();
    });
  });

  // Naming the gap is more useful than hiding the dish — "buy paneer" is an
  // actionable answer.
  it("names what is still missing rather than dropping the dish", async () => {
    renderMeals();
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByText(messages.meals.recipes.palak_paneer)).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        messages.meals.needsMore.replace("{items}", messages.meals.ingredients.paneer),
      ),
    ).toBeInTheDocument();
  });

  // §16.2: nutrition is always labelled an estimate.
  it("labels nutrition as an estimate and never as fact", async () => {
    renderMeals();
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByText(/About 420 kcal/)).toBeInTheDocument();
    });
    expect(screen.getByText(messages.meals.disclaimer)).toBeInTheDocument();
  });

  // A dish that suits a condition poorly is advice, not a hazard — unlike a
  // contraindicated exercise, it is shown with the caution attached.
  it("shows a flagged dish with its caution rather than withholding it", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(200, { suggestions: [flagged] })),
    ) as unknown as typeof fetch;

    renderMeals();
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByText(messages.meals.recipes.jeera_rice)).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        messages.meals.caution.replace("{reasons}", messages.plan.reasons.type_2_diabetes),
      ),
    ).toBeInTheDocument();
  });

  it("logs a dish as eaten so it counts toward adherence", async () => {
    renderMeals();
    fireEvent.click(suggestButton());
    await waitFor(() => {
      expect(screen.getByText(messages.meals.recipes.dal_chawal)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: messages.meals.markEaten })[0]!);

    await waitFor(() => {
      expect(screen.getByText(messages.meals.eaten)).toBeInTheDocument();
    });
    const trackingCall = (global.fetch as jest.Mock).mock.calls.find(
      (call) => call[0] === "/api/tracking",
    ) as [string, { body: string }];
    // A library dish travels as a KEY with a null name. It used to go into
    // `notes`, which made "poha" ambiguous between a recipe and something someone
    // typed — the two paths FR-TRK-2 names have to stay distinguishable.
    expect(JSON.parse(trackingCall[1].body)).toMatchObject({
      type: "meal",
      status: "completed",
      recipe_key: "dal_chawal",
      notes: null,
    });
  });

  it("says so plainly when nothing matches", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(200, { suggestions: [] })),
    ) as unknown as typeof fetch;

    renderMeals();
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByText(messages.meals.noneFound)).toBeInTheDocument();
    });
  });

  it("reports a failure rather than showing an empty result", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(502, { error: { code: "UPSTREAM_UNAVAILABLE" } })),
    ) as unknown as typeof fetch;

    renderMeals();
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.MEAL_SUGGEST_FAILED);
    });
    expect(screen.queryByText(messages.meals.noneFound)).not.toBeInTheDocument();
  });
});

// "There should be at least one source of protein for every meal."
describe("meals screen — protein", () => {
  it("says so when a dish carries its own protein", async () => {
    renderMeals();
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByText(messages.meals.recipes.dal_chawal)).toBeInTheDocument();
    });
    expect(screen.getAllByText(messages.meals.proteinOk).length).toBeGreaterThan(0);
  });

  // Named, not dropped: cabbage poriyal is a side people cook, not an error.
  it("names what to serve alongside a thin dish rather than hiding it", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(200, { suggestions: [thin] })),
    ) as unknown as typeof fetch;

    renderMeals();
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(screen.getByText(messages.meals.recipes.cabbage_poriyal)).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        messages.meals.pairWith.replace("{dish}", messages.meals.recipes.dal_chawal),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(messages.meals.proteinOk)).not.toBeInTheDocument();
  });
});

// "There should be an option to add a dish as well if not mentioned."
describe("meals screen — a dish of your own", () => {
  it("offers the field before any suggestion is asked for", () => {
    renderMeals();

    expect(screen.getByText(messages.meals.customTitle)).toBeInTheDocument();
    expect(screen.getByLabelText(messages.meals.customLabel)).toBeInTheDocument();
  });

  it("will not log an empty or whitespace-only name", () => {
    renderMeals();

    expect(screen.getByRole("button", { name: messages.meals.customLog })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(messages.meals.customLabel), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: messages.meals.customLog })).toBeDisabled();
  });

  // A typed dish goes in `notes` with a null `recipe_key`, so a history view knows
  // to show it verbatim instead of trying to translate it.
  it("logs a typed dish as freeform, not as a library key", async () => {
    renderMeals();

    fireEvent.change(screen.getByLabelText(messages.meals.customLabel), {
      target: { value: "  Amma's avial  " },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.meals.customLog }));

    await waitFor(() => {
      expect(screen.getByText(messages.meals.customLogged)).toBeInTheDocument();
    });
    const call = (global.fetch as jest.Mock).mock.calls.find(
      (entry) => entry[0] === "/api/tracking",
    ) as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toMatchObject({
      type: "meal",
      status: "completed",
      recipe_key: null,
      notes: "Amma's avial",
    });
  });

  it("clears the field after logging, ready for the next meal", async () => {
    renderMeals();

    fireEvent.change(screen.getByLabelText(messages.meals.customLabel), {
      target: { value: "Avial" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.meals.customLog }));

    await waitFor(() => {
      expect(screen.getByLabelText(messages.meals.customLabel)).toHaveValue("");
    });
  });

  it("keeps the typed name when the write fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(502, { error: { code: "UPSTREAM_UNAVAILABLE" } })),
    ) as unknown as typeof fetch;

    renderMeals();
    fireEvent.change(screen.getByLabelText(messages.meals.customLabel), {
      target: { value: "Avial" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.meals.customLog }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.TRACKING_FAILED);
    });
    expect(screen.getByLabelText(messages.meals.customLabel)).toHaveValue("Avial");
  });
});

describe("meals screen — typing the pantry", () => {
  const parsedText: PantryParse = {
    recognised: ["rice", "toor_dal"],
    unrecognised: ["maggi"],
    source: "synonyms",
    degraded: false,
    parser: "synonyms@1",
  };

  /** Answers the parse call with `parse`, and every other call with suggestions. */
  function routeFetch(parse: Response) {
    global.fetch = jest.fn((url: string) =>
      Promise.resolve(
        url === "/api/meals/parse"
          ? parse
          : response(200, { suggestions: [cookable, needsShopping] }),
      ),
    ) as unknown as typeof fetch;
  }

  const typeAndRead = (text: string) => {
    fireEvent.change(screen.getByLabelText(messages.meals.typeLabel), {
      target: { value: text },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.meals.typeRead }));
  };

  const suggestBody = () => {
    const calls = (global.fetch as jest.Mock).mock.calls as [string, { body: string }][];
    const call = calls.find(([url]) => url === "/api/meals");
    return JSON.parse(call?.[1].body ?? "{}") as { ingredients: string[] };
  };

  it("will not read an empty box", () => {
    renderMeals();

    expect(screen.getByRole("button", { name: messages.meals.typeRead })).toBeDisabled();
  });

  it("ticks what it read and shows what it could not, before suggesting anything", async () => {
    routeFetch(response(200, parsedText));
    renderMeals();

    typeAndRead("chawal, dal, maggi");

    await waitFor(() => {
      expect(screen.getByText(messages.meals.typeFound)).toBeInTheDocument();
    });
    expect(screen.getByText("Not in our list yet: maggi")).toBeInTheDocument();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ text: "chawal, dal, maggi" });

    fireEvent.click(suggestButton());
    await waitFor(() => {
      expect(suggestBody().ingredients).toEqual(["rice", "toor_dal"]);
    });
  });

  // A wrong guess costs one tap, never a wrong meal.
  it("lets a wrong guess be unticked before suggestions run", async () => {
    routeFetch(response(200, parsedText));
    renderMeals();

    typeAndRead("chawal, dal");
    await waitFor(() => {
      expect(screen.getByText(messages.meals.typeFound)).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getAllByLabelText(messages.meals.ingredients.toor_dal)[0] as HTMLElement,
    );
    fireEvent.click(suggestButton());

    await waitFor(() => {
      expect(suggestBody().ingredients).toEqual(["rice"]);
    });
  });

  it("says so when nothing typed matched the list", async () => {
    routeFetch(response(200, { ...parsedText, recognised: [], unrecognised: [] }));
    renderMeals();

    typeAndRead("nothing much");

    await waitFor(() => {
      expect(screen.getByText(messages.meals.typeNoneFound)).toBeInTheDocument();
    });
  });

  it("reports a failed read and leaves the checklist usable", async () => {
    routeFetch(response(502, { error: { code: "UPSTREAM_UNAVAILABLE" } }));
    renderMeals();

    typeAndRead("chawal");

    await waitFor(() => {
      expect(screen.getByText(messages.errors.PANTRY_PARSE_FAILED)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(messages.meals.ingredients.rice)).toBeInTheDocument();
  });
});

describe("meals screen — AI reading consent", () => {
  const consentToggle = () => screen.queryByLabelText(messages.meals.aiConsent);

  it("is not offered when it cannot apply", () => {
    renderMeals(true, NOT_OFFERED);

    expect(consentToggle()).not.toBeInTheDocument();
  });

  it("is offered off by default, saying what is and is not sent", () => {
    renderMeals(true, { enabled: false, available: true });

    expect(consentToggle()).not.toBeChecked();
    expect(messages.meals.aiConsent).toMatch(/Nothing about your health or family is sent/);
  });

  it("saves consent when ticked", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(200, { enabled: true, available: true })),
    ) as unknown as typeof fetch;
    renderMeals(true, { enabled: false, available: true });

    fireEvent.click(consentToggle() as HTMLElement);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/meals/consent", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
    });
    expect(consentToggle()).toBeChecked();
  });

  // The toggle must never claim a consent the server does not hold.
  it("puts the toggle back when the save fails", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(403, { error: { code: "FORBIDDEN_ROLE" } })),
    ) as unknown as typeof fetch;
    renderMeals(true, { enabled: false, available: true });

    fireEvent.click(consentToggle() as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText(messages.errors.PANTRY_CONSENT_FAILED)).toBeInTheDocument();
    });
    expect(consentToggle()).not.toBeChecked();
  });
});
