import { useTranslations } from "next-intl";

import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";

/**
 * The home screen. It is a separate component because `page.tsx` has to be
 * `async` to run the onboarding guard, and `useTranslations` is a hook — it
 * cannot be called from an async component.
 *
 * Everything here is an EMPTY state, deliberately. There is no tracking
 * endpoint yet (Epics 4–6), so the structure is real and the numbers are
 * absent. Inventing a step count would be fiction rendered as fact, and a
 * test asserts this screen renders no digits at all.
 */
export function HomeView({ isGuest = false }: { isGuest?: boolean }) {
  const t = useTranslations("home");

  return (
    <Screen>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("greeting")}</h1>
        {/*
          A chip and a note, deliberately not a "claim your account" button:
          claiming is not built. The note can promise nothing is lost because a
          guest is a real anonymous user — linking an identity later keeps the
          same auth.users.id, and therefore the same domain row.
        */}
        {isGuest && (
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-muted">
            {t("guestChip")}
          </span>
        )}
      </header>

      {isGuest && <p className="text-muted">{t("guestNote")}</p>}

      <Card tone="ink">
        <p className="text-sm font-semibold tracking-widest text-accent-glow uppercase">
          {t("todayLabel")}
        </p>
        <p className="mt-2 text-lg leading-relaxed">{t("todayEmpty")}</p>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-widest text-muted uppercase">
          {t("statsLabel")}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("stepsLabel") },
            { label: t("waterLabel") },
            { label: t("workoutsLabel") },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-card border border-line bg-surface p-4 text-center"
            >
              <div className="text-2xl font-bold text-muted">{t("empty")}</div>
              <div className="mt-1 text-xs text-muted">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <Card>
        <p className="text-muted">{t("noFamily")}</p>
      </Card>
    </Screen>
  );
}
