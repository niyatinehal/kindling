/**
 * The way back.
 *
 * Every screen below `/home` gets one. A PWA installed to a home screen has no
 * browser chrome — no back button, no address bar — so a screen without an
 * explicit way out is a dead end on the device this app is built for. It renders
 * as a link rather than a `history.back()` button so it works on a cold load,
 * when there is no history to go back through.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-12 items-center gap-2 self-start text-[1.0625rem] font-medium text-accent"
    >
      <span aria-hidden="true">←</span>
      {children}
    </a>
  );
}
