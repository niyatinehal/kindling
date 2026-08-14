import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload, JWTVerifyGetKey } from "jose";

/**
 * The key source jose accepts. `JWTVerifyGetKey` is jose's own named export
 * for this, and both `createLocalJWKSet(...)` (used by tests) and
 * `createRemoteJWKSet(...)` (used in production) satisfy it. Named
 * deliberately instead of derived via `Parameters<typeof jwtVerify>[1]`:
 * `jwtVerify` is overloaded, and TypeScript's `Parameters<>` resolves an
 * overloaded function against its *last* signature only, so a jose release
 * that reorders overloads would silently change a derived type. The named
 * export does not have that failure mode.
 */
export type KeyResolver = JWTVerifyGetKey;

export type VerifiedToken = {
  authUserId: string;
  email?: string;
  phone?: string;
};

/**
 * Every rejection reason — expired, forged, malformed, wrong issuer/audience,
 * missing/invalid subject — collapses into this one error type. That is as
 * far as this class's guarantee goes: it does not itself keep the underlying
 * reason from an attacker. The original error is attached as `cause` for
 * logging; it is the caller's (Task 5 middleware's) responsibility to return
 * a single opaque 401 rather than echo `cause` back to the client.
 */
export class InvalidTokenError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidTokenError";
  }
}

export function createTokenVerifier(options: {
  issuer: string;
  audience: string;
  keys: KeyResolver;
}): (token: string) => Promise<VerifiedToken> {
  return async function verify(token: string): Promise<VerifiedToken> {
    let payload: JWTPayload;

    try {
      // `algorithms` and `requiredClaims` are both explicit on purpose.
      //
      // `algorithms: ["ES256"]` is defense-in-depth rather than the thing
      // that actually closes the algorithm-confusion hole here: jose's own
      // JWKS key resolvers (createLocalJWKSet / createRemoteJWKSet, which is
      // all `KeyResolver` ever is in this codebase) bind every JWS algorithm
      // to a fixed (kty, crv) pair internally and refuse all symmetric algs
      // outright, so an EC/P-256 key can only ever satisfy "ES256" regardless
      // of this option — verified by deleting this line and confirming the
      // algorithm-confusion tests below still reject. This option earns its
      // keep only if `KeyResolver` is ever pointed at something other than
      // jose's own JWKS constructors.
      //
      // `requiredClaims: ["exp", "sub"]` is load-bearing: jose does not
      // require `exp` unless told to, so an unexpired-forever token would
      // otherwise verify. `sub` presence is asserted here too, though the
      // explicit check below still does the real work of rejecting an empty
      // or non-string subject that `requiredClaims` would let through.
      ({ payload } = await jwtVerify(token, options.keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["ES256"],
        requiredClaims: ["exp", "sub"],
      }));
    } catch (error) {
      throw new InvalidTokenError("token verification failed", { cause: error });
    }

    // jose only type-checks `sub` when `options.subject` is passed (it is not,
    // here — the subject is exactly what we're extracting). A payload with
    // `"sub": 123` or `"sub": null` verifies successfully and would otherwise
    // flow through as a non-string `authUserId`. `requiredClaims` above only
    // asserts presence, not shape or non-emptiness, so this check still does
    // the real work of rejecting a missing, non-string, or empty subject.
    const sub = payload.sub;
    if (typeof sub !== "string" || sub === "") {
      throw new InvalidTokenError("token has no subject");
    }

    const email = typeof payload["email"] === "string" ? payload["email"] : undefined;
    const phone = typeof payload["phone"] === "string" ? payload["phone"] : undefined;

    return {
      authUserId: sub,
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
    };
  };
}

/**
 * Production wiring. The remote key set is cached and refreshed by jose, so
 * Supabase rotating its signing key needs no deploy.
 */
export function createSupabaseVerifier(
  supabaseUrl: string,
): (token: string) => Promise<VerifiedToken> {
  const issuer = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;

  return createTokenVerifier({
    issuer,
    audience: "authenticated",
    keys: createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),
  });
}
