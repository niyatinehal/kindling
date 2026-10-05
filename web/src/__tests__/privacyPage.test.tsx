import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

import messages from "../../messages/en.json";
import PrivacyPage from "../../app/privacy/page";

function renderPolicy() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PrivacyPage />
    </NextIntlClientProvider>,
  );
}

/**
 * A privacy policy is the one document in this product that must not drift
 * into being vague. These tests pin the specific claims — the categories
 * actually stored, where they are stored, and what a person can do about it —
 * because a policy that says "we collect some health information" is worse
 * than none: it records consent to something nobody described.
 */
describe("the privacy policy", () => {
  it("names the sensitive categories it actually stores", () => {
    renderPolicy();

    // The schema has a MedicalCondition enum. A policy that omits it is
    // describing a different app.
    expect(screen.getByText(messages.privacy.collect.health)).toBeInTheDocument();
    expect(screen.getByText(messages.privacy.collect.activity)).toBeInTheDocument();
  });

  // The database is in Mumbai and the API runs in Singapore, so this is a
  // cross-border transfer whether or not anybody planned it that way.
  it("says where the data physically lives", () => {
    renderPolicy();

    expect(screen.getByText(messages.privacy.where.body)).toBeInTheDocument();
  });

  it("explains how to delete an account", () => {
    renderPolicy();

    expect(screen.getByText(messages.privacy.rights.deletion)).toBeInTheDocument();
  });

  // Claimed in the policy, so it has to stay true. If an analytics script is
  // ever added, this is the test that should stop it going out quietly.
  it("states that nothing is tracked for advertising", () => {
    renderPolicy();

    expect(screen.getByText(messages.privacy.sharing.noSelling)).toBeInTheDocument();
  });

  // The one place anything typed leaves this app. The page has to name who
  // receives it, say what is and is not sent, and say who cannot turn it on.
  it("names the AI provider and what smarter reading sends", () => {
    renderPolicy();

    expect(screen.getByText(messages.privacy.why.aiPantry)).toBeInTheDocument();
    expect(messages.privacy.why.aiPantry).toMatch(/Google/);
    expect(messages.privacy.why.aiPantry).toMatch(/off unless you turn it on/);
    expect(messages.privacy.why.aiPantry).toMatch(/under 18/);
    expect(messages.privacy.sharing.processors).toMatch(/Google/);
    expect(messages.privacy.why.aiPantry).toMatch(/Gemini/);
  });

  // Photos are the most personal thing this feature handles: a fridge photo can
  // show a kitchen, a receipt a name. The page has to say they are not kept.
  it("says photos are sent only with smarter reading on, and are not kept", () => {
    renderPolicy();

    expect(messages.privacy.why.aiPantry).toMatch(/photo/);
    expect(messages.privacy.collect.pantry).toMatch(
      /photo you send is never written to our database/,
    );
    expect(messages.privacy.keep.body).toMatch(/Photos are not kept at all/);
    expect(screen.getByText(messages.privacy.collect.pantry)).toBeInTheDocument();
  });

  it("does not claim any more that nothing entered is sent anywhere", () => {
    renderPolicy();

    expect(messages.privacy.why.noProfiling).not.toMatch(/nothing you enter is sent/i);
  });

  /*
    This page went live with "REPLACE-ME@example.com" in it. A placeholder in a
    privacy notice is not a cosmetic problem — it is a published document about
    health data telling the reader the author did not finish. Nothing that
    reads like a stand-in goes out again without failing here first.
  */
  it("publishes no placeholder text", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PrivacyPage />
      </NextIntlClientProvider>,
    );

    for (const placeholder of ["example.com", "REPLACE", "TODO", "TBD", "lorem"]) {
      expect(container.textContent?.toLowerCase()).not.toContain(placeholder.toLowerCase());
    }
  });
});
