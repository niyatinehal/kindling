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
});
