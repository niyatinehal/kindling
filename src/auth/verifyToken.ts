import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

/**
 * The key source jose accepts, injected so unit tests can verify offline with a
 * locally minted keypair. Derived from jwtVerify's own signature rather than
 * named explicitly, so a jose upgrade cannot silently drift from it.
 */
export type KeyResolver = Parameters<typeof jwtVerify>[1];

export type VerifiedToken = {
  authUserId: string;
  email?: string;
  phone?: string;
};

/**
 * Every rejection reason collapses into this one type on purpose. The caller
 * returns a single 401 regardless of cause, so an attacker cannot learn whether
 * a token was expired, forged, or simply malformed.
 */
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
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
      ({ payload } = await jwtVerify(token, options.keys, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ["ES256"],
      }));
    } catch (error) {
      throw new InvalidTokenError(
        error instanceof Error ? error.message : "token verification failed",
      );
    }

    // jose verifies a token with no `sub` without complaint. Left unchecked,
    // the caller would look up a user by undefined.
    const sub = payload.sub;
    if (sub === undefined || sub === "") {
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
