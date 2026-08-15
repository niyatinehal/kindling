import { getRequestConfig } from "next-intl/server";

/**
 * One locale for now. Hindi copy is out of scope for this slice, so there is no
 * locale routing to configure — `hi.json` exists as the seam, empty. Adding
 * routing later is additive and does not change any call site.
 */
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../../messages/en.json")).default,
}));
