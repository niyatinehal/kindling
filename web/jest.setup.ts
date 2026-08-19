import "@testing-library/jest-dom";

/**
 * jsdom implements no CSS media engine, so `window.matchMedia` simply does not
 * exist there — and every screen renders the theme toggle, which asks it what
 * the system preference is when no explicit choice has been stored.
 *
 * The stub answers "light", which is jsdom's honest position: it has no system
 * preference to report. A test that cares about the dark branch overrides this
 * for itself rather than relying on a global default.
 *
 * This belongs here rather than as a `?.` in the component. Every real browser
 * has had `matchMedia` for a decade; guarding the production path would be
 * writing around a gap in the test environment and calling it defensive code.
 */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});
