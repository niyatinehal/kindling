import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { ConsentForm } from "../../app/consent/ConsentForm";

function renderForm(onSubmit = jest.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConsentForm onSubmit={onSubmit} policyVersion="2026-08-15" />
    </NextIntlClientProvider>,
  );
  return onSubmit;
}

function submitButton() {
  return screen.getByRole("button", { name: messages.consent.submit });
}

function nameInput() {
  return screen.getByLabelText(messages.consent.nameLabel);
}

function consentCheckbox() {
  return screen.getByRole("checkbox", { name: messages.consent.healthDataLabel });
}

describe("consent form", () => {
  it("disables submission until health data consent is given", () => {
    renderForm();

    fireEvent.change(nameInput(), { target: { value: "Meera" } });

    expect(submitButton()).toBeDisabled();
  });

  it("disables submission until a name is given", () => {
    renderForm();

    fireEvent.click(consentCheckbox());

    expect(submitButton()).toBeDisabled();
  });

  // A name of spaces is not a name. Without the trim the account would be
  // created with a blank display name and the API would reject it with a
  // VALIDATION_FAILED the user cannot act on.
  it("treats a whitespace-only name as no name", () => {
    renderForm();

    fireEvent.change(nameInput(), { target: { value: "   " } });
    fireEvent.click(consentCheckbox());

    expect(submitButton()).toBeDisabled();
  });

  it("submits the trimmed name and the policy version alongside the consent", () => {
    const onSubmit = renderForm();

    fireEvent.change(nameInput(), { target: { value: "  Meera  " } });
    fireEvent.click(consentCheckbox());
    fireEvent.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith({
      displayName: "Meera",
      consents: [{ consent_type: "health_data", policy_version: "2026-08-15" }],
    });
  });

  // The API caps display_name at 120 characters. A form that lets a longer one
  // through turns a preventable client-side limit into a server rejection.
  it("caps the name at the length the API accepts", () => {
    renderForm();

    expect(nameInput()).toHaveAttribute("maxLength", "120");
  });

  // Without this the button stays clickable for the whole POST, and the second
  // click posts a second registration.
  it("disables submission while one is already in flight", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsentForm onSubmit={jest.fn()} policyVersion="2026-08-15" submitting />
      </NextIntlClientProvider>,
    );

    fireEvent.change(nameInput(), { target: { value: "Meera" } });
    fireEvent.click(consentCheckbox());

    expect(submitButton()).toBeDisabled();
  });

  it("renders the error envelope's code rather than a raw failure", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsentForm onSubmit={jest.fn()} policyVersion="2026-08-15" error="VALIDATION_FAILED" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.VALIDATION_FAILED);
  });

  it("falls back to the unknown-error copy for a code it has no message for", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConsentForm onSubmit={jest.fn()} policyVersion="2026-08-15" error="TEAPOT" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.UNKNOWN);
  });
});
