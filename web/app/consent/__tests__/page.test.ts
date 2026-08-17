/**
 * @jest-environment node
 */
jest.mock("../../../src/onboarding/isGuestSession", () => ({ isGuestSession: jest.fn() }));

import { isGuestSession } from "../../../src/onboarding/isGuestSession";
import { ConsentClient } from "../ConsentClient";
import ConsentPage from "../page";

describe("/consent", () => {
  it("tells the form the caller is a guest", async () => {
    (isGuestSession as jest.Mock).mockResolvedValue(true);

    const page = await ConsentPage();

    expect(page.type).toBe(ConsentClient);
    expect(page.props.isGuest).toBe(true);
  });

  it("tells the form the caller is not a guest", async () => {
    (isGuestSession as jest.Mock).mockResolvedValue(false);

    const page = await ConsentPage();

    expect(page.props.isGuest).toBe(false);
  });
});
