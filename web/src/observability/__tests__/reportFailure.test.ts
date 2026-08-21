/**
 * @jest-environment node
 */
import { reportFailure } from "../reportFailure";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.restoreAllMocks();
});

function configured() {
  process.env["API_BASE_URL"] = "https://api.test";
  process.env["INTERNAL_REPORT_TOKEN"] = "a-sufficiently-long-secret";
}

describe("reportFailure", () => {
  /*
    The failure this exists for: Brevo's daily quota runs out, `signInWithOtp`
    returns an error, and this app answers OTP_REQUEST_FAILED. That is handled,
    so it never reaches the API's error handler and never got written down —
    the user is told to check their email address, and nobody learns the real
    reason.
  */
  it("reports a handled failure to the API", async () => {
    configured();
    const fetchMock = jest.fn(() => Promise.resolve({ ok: true } as Response));
    global.fetch = fetchMock as unknown as typeof fetch;

    await reportFailure({ code: "OTP_REQUEST_FAILED", status: 502, path: "/api/auth/otp" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/v1/internal/error-reports",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-internal-token": "a-sufficiently-long-secret" }),
      }),
    );
  });

  it("does nothing when no token is configured", async () => {
    process.env["API_BASE_URL"] = "https://api.test";
    delete process.env["INTERNAL_REPORT_TOKEN"];
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await reportFailure({ code: "OTP_REQUEST_FAILED", status: 502 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  /*
    The contract that matters. This is called on a path that is already
    failing, to make that failure visible — if it can throw, it replaces a
    handled 502 the user understands with an unhandled one they do not, and
    reporting the problem becomes a worse problem.
  */
  it("never throws, whatever the API does", async () => {
    configured();
    global.fetch = jest.fn(() =>
      Promise.reject(new Error("the API is down too")),
    ) as unknown as typeof fetch;
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      reportFailure({ code: "OTP_REQUEST_FAILED", status: 502 }),
    ).resolves.toBeUndefined();
  });
});
