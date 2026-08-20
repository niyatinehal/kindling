/**
 * Response headers applied to every route.
 *
 * Plain `.mjs` rather than TypeScript because `next.config.mjs` imports it and
 * a Next config cannot import a `.ts` module. Keeping the list here rather
 * than inline in the config is what makes it testable at all.
 *
 * There is no full Content-Security-Policy here, and that is a decision rather
 * than an omission. Next inlines its own bootstrap scripts, so a script-src
 * without per-request nonces breaks the app on the first render — a real CSP
 * needs nonce plumbing through the middleware and the document, which is its
 * own change with its own tests. `frame-ancestors` is included because it is
 * the one directive that costs nothing and cannot break a page.
 */
export const SECURITY_HEADERS = [
  // Two years and includeSubDomains, which is what preload lists require. No
  // `preload` token: submitting to the list is a one-way door for a domain
  // that has not been chosen yet.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Both, deliberately: X-Frame-Options is what older browsers honour, and
  // frame-ancestors is what current ones do. The screens here carry one-tap
  // controls that write health entries, so a framed page is a way to have
  // somebody log data without knowing it.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in this app uses any of them. Denying them here means an injected
  // script cannot ask either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];
