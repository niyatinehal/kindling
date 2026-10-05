/**
 * @jest-environment node
 */
jest.mock("../../../../../src/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("../../../../../src/api/upstream", () => ({
  callApi: jest.fn(),
}));

import { callApi } from "../../../../../src/api/upstream";
import { createSupabaseServerClient } from "../../../../../src/supabase/server";
import { GET } from "../[jobId]/route";
import { POST } from "../route";

const mockCallApi = callApi as jest.MockedFunction<typeof callApi>;
const JOB = "11111111-2222-3333-4444-555555555555";

function signedIn() {
  (createSupabaseServerClient as jest.Mock).mockResolvedValue({
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session: { access_token: "the-access-token" } } }),
      ),
    },
  });
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const upload = (bytes: Uint8Array, type: string) =>
  POST(
    new Request("http://localhost/api/meals/photo", {
      method: "POST",
      headers: { "content-type": type },
      body: new Blob([new Uint8Array(bytes)]),
    }),
  );

const poll = (jobId: string) =>
  GET(new Request(`http://localhost/api/meals/photo/${jobId}`), {
    params: Promise.resolve({ jobId }),
  });

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/meals/photo", () => {
  it("forwards the photo's bytes with their type", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ job_id: JOB, status: "queued" }, 202));

    const response = await upload(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");

    expect(response.status).toBe(202);
    const [path, token, init] = mockCallApi.mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/meals/parse-photo");
    expect(token).toBe("the-access-token");
    expect(init?.raw?.contentType).toBe("image/jpeg");
    expect(new Uint8Array(init?.raw?.bytes ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
  });

  it("refuses anything that is not an image type, without calling upstream", async () => {
    signedIn();

    const response = await upload(new TextEncoder().encode("<svg/>"), "image/svg+xml");

    expect(response.status).toBe(400);
    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("refuses an empty upload", async () => {
    signedIn();

    expect((await upload(new Uint8Array(), "image/png")).status).toBe(413);
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});

describe("GET /api/meals/photo/[jobId]", () => {
  it("passes a job's status through", async () => {
    signedIn();
    mockCallApi.mockResolvedValue(json({ status: "working" }, 200));

    const response = await poll(JOB);

    expect(await response.json()).toEqual({ status: "working" });
    expect(mockCallApi).toHaveBeenCalledWith(
      `/api/v1/meals/parse-photo/${JOB}`,
      "the-access-token",
    );
  });

  // The id comes from the browser and lands in an upstream URL.
  it("refuses an id that is not a UUID before it reaches a URL", async () => {
    signedIn();

    const response = await poll("../../auth/me");

    expect(response.status).toBe(404);
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});
