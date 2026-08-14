import { beforeAll, describe, expect, it } from "@jest/globals";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey, JWK } from "jose";

import { InvalidTokenError, createTokenVerifier } from "../../src/auth/verifyToken.js";

const ISSUER = "http://127.0.0.1:54321/auth/v1";
const AUDIENCE = "authenticated";
const SUB = "aafc8a5a-3b92-40ff-ae7a-a5e6dce2624b";

let privateKey: CryptoKey;
let verify: (token: string) => Promise<{ authUserId: string; email?: string; phone?: string }>;

type MintOptions = {
  sub?: string | undefined;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  email?: string;
};

async function mint(options: MintOptions = {}): Promise<string> {
  const claims: Record<string, unknown> = {};
  if (options.email !== undefined) {
    claims["email"] = options.email;
  }

  let token = new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m");

  const sub = "sub" in options ? options.sub : SUB;
  if (sub !== undefined) {
    token = token.setSubject(sub);
  }

  return token.sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;

  const jwk: JWK = {
    ...(await exportJWK(pair.publicKey)),
    kid: "test-key",
    alg: "ES256",
    use: "sig",
  };
  verify = createTokenVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe("createTokenVerifier", () => {
  it("accepts a valid token and returns the subject", async () => {
    const result = await verify(await mint({ email: "meera@example.test" }));

    expect(result.authUserId).toBe(SUB);
    expect(result.email).toBe("meera@example.test");
  });

  it("omits email and phone when the token carries neither", async () => {
    const result = await verify(await mint());

    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
  });

  it("rejects an expired token", async () => {
    await expect(verify(await mint({ expiresIn: "-1s" }))).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a tampered signature", async () => {
    const token = await mint();
    const parts = token.split(".");
    const tampered = `${parts[0] ?? ""}.${parts[1] ?? ""}.${"A".repeat((parts[2] ?? "").length)}`;

    await expect(verify(tampered)).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token from the wrong issuer", async () => {
    await expect(verify(await mint({ issuer: "http://evil.test/auth/v1" }))).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it("rejects a token for the wrong audience", async () => {
    await expect(verify(await mint({ audience: "anon" }))).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token with no subject", async () => {
    await expect(verify(await mint({ sub: undefined }))).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token with an empty-string subject", async () => {
    await expect(verify(await mint({ sub: "" }))).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token that is not a JWT at all", async () => {
    await expect(verify("not-a-token")).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token signed with a different algorithm (HS256)", async () => {
    // Not a "kill" test for the `algorithms` option: jose's JWKS key
    // resolvers (createLocalJWKSet/createRemoteJWKSet) refuse symmetric
    // algorithms and bind every asymmetric algorithm to a fixed (kty, crv)
    // pair before `algorithms` is ever consulted, so this rejects with or
    // without that option present against an EC/P-256 key set — confirmed
    // by temporarily deleting `algorithms: ["ES256"]` from the
    // implementation and re-running this suite. It still documents and
    // locks in the required behavior: a differently-algorithmed token must
    // never verify.
    const secret = new TextEncoder().encode("attacker-controlled-secret");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", kid: "test-key" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(SUB)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(secret);

    await expect(verify(token)).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a hand-crafted alg:none token with no signature", async () => {
    // jose's SignJWT refuses to mint an alg:none token at all, so an
    // attacker isn't emulated by jose's own signer here — the compact JWS
    // is assembled by hand, the way an actual attacker would.
    const encode = (value: unknown): string =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const header = encode({ alg: "none", kid: "test-key" });
    const payload = encode({
      iss: ISSUER,
      aud: AUDIENCE,
      sub: SUB,
      iat: nowInSeconds,
      exp: nowInSeconds + 300,
    });
    const token = `${header}.${payload}.`;

    await expect(verify(token)).rejects.toThrow(InvalidTokenError);
  });
});
