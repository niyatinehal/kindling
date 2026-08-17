import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { FamilyClient } from "../../app/family/FamilyClient";
import type { FamilySummary } from "../family/currentFamily";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => refresh(), push: jest.fn() }),
}));

const originalFetch = global.fetch;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const asAdmin: FamilySummary = {
  id: "fam-1",
  role: "admin",
  members: [
    { user_id: "u1", display_name: "Meera", role: "admin", status: "active" },
    { user_id: "u2", display_name: "Ramesh", role: "elderly", status: "active" },
  ],
};

const asChild: FamilySummary = {
  id: "fam-1",
  role: "child",
  members: [{ user_id: "u3", display_name: "Arjun", role: "child", status: "active" }],
};

function renderFamily(initialFamily: FamilySummary | null) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FamilyClient initialFamily={initialFamily} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  refresh.mockClear();
  global.fetch = jest.fn(() =>
    Promise.resolve(response(201, { family: { id: "fam-1", role: "admin" } })),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("family screen — no family yet", () => {
  it("offers both a way to start one and a way to join one", () => {
    renderFamily(null);

    expect(screen.getByText(messages.family.createTitle)).toBeInTheDocument();
    expect(screen.getByText(messages.family.joinTitle)).toBeInTheDocument();
  });

  it("will not submit an empty name or an empty code", () => {
    renderFamily(null);

    expect(screen.getByRole("button", { name: messages.family.create })).toBeDisabled();
    expect(screen.getByRole("button", { name: messages.family.join })).toBeDisabled();
  });

  it("creates a family and refreshes so the server re-resolves membership", async () => {
    renderFamily(null);

    fireEvent.change(screen.getByLabelText(messages.family.nameLabel), {
      target: { value: "The Nehals" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.family.create }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/family",
      expect.objectContaining({ method: "POST" }),
    );
  });

  // Codes get read aloud, so the field accepts lower case and normalises it.
  it("upper-cases a typed code before sending it", async () => {
    renderFamily(null);

    fireEvent.change(screen.getByLabelText(messages.family.codeLabel), {
      target: { value: "abc123xyz0" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.family.join }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    const call = (global.fetch as jest.Mock).mock.calls.at(-1) as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toEqual({ code: "ABC123XYZ0" });
  });

  // A spent or wrong code answers 410 INVITE_EXPIRED — the user needs to be told
  // to get a new one, not shown a generic failure.
  it("reports a dead code in its own words", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(410, { error: { code: "INVITE_EXPIRED" } })),
    ) as unknown as typeof fetch;

    renderFamily(null);
    fireEvent.change(screen.getByLabelText(messages.family.codeLabel), {
      target: { value: "DEADCODE00" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.family.join }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.INVITE_EXPIRED);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports already being in a family specifically", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(409, { error: { code: "ALREADY_IN_FAMILY" } })),
    ) as unknown as typeof fetch;

    renderFamily(null);
    fireEvent.change(screen.getByLabelText(messages.family.nameLabel), {
      target: { value: "Second" },
    });
    fireEvent.click(screen.getByRole("button", { name: messages.family.create }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(messages.errors.ALREADY_IN_FAMILY);
    });
  });
});

describe("family screen — in a family", () => {
  it("lists the members with their roles", () => {
    renderFamily(asAdmin);

    expect(screen.getByText("Meera")).toBeInTheDocument();
    expect(screen.getByText("Ramesh")).toBeInTheDocument();
    // Scoped to the member list: the same role label also appears as an invite
    // option below, so an unscoped query legitimately matches twice.
    const members = screen.getByRole("list");
    expect(within(members).getByText(messages.family.roles.elderly)).toBeInTheDocument();
    expect(within(members).getByText(messages.family.roles.admin)).toBeInTheDocument();
  });

  it("offers invites to an admin", () => {
    renderFamily(asAdmin);

    expect(screen.getByRole("button", { name: messages.family.invite })).toBeInTheDocument();
  });

  // Hiding the control is a courtesy; the API is the actual guard. But showing a
  // child a button that always 403s would be worse than not showing it.
  it("hides invites from a non-admin", () => {
    renderFamily(asChild);

    expect(screen.queryByRole("button", { name: messages.family.invite })).not.toBeInTheDocument();
  });

  // `admin` is not invitable at all — the API models it with a separate enum.
  it("offers only the three invitable roles, never admin", () => {
    renderFamily(asAdmin);

    expect(screen.getByLabelText(messages.family.roles.adult)).toBeInTheDocument();
    expect(screen.getByLabelText(messages.family.roles.child)).toBeInTheDocument();
    expect(screen.getByLabelText(messages.family.roles.elderly)).toBeInTheDocument();
    expect(screen.queryByLabelText(messages.family.roles.admin)).not.toBeInTheDocument();
  });

  it("shows an issued code once, and says so", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(response(201, { invite: { code: "K7M2QRTV90" } })),
    ) as unknown as typeof fetch;

    renderFamily(asAdmin);
    fireEvent.click(screen.getByRole("button", { name: messages.family.invite }));

    await waitFor(() => {
      expect(screen.getByText("K7M2QRTV90")).toBeInTheDocument();
    });
    expect(screen.getByText(messages.family.inviteOnce)).toBeInTheDocument();
  });

  it("marks a removed member rather than dropping them from the list", () => {
    renderFamily({
      ...asAdmin,
      members: [{ user_id: "u9", display_name: "Gone", role: "adult", status: "removed" }],
    });

    expect(screen.getByText("Gone")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(messages.family.removed))).toBeInTheDocument();
  });
});
