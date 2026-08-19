import { useTranslations } from "next-intl";

import type { TrackingSummary } from "../../src/tracking/summaryTypes";
import { WATER_TARGET_ML } from "../../src/tracking/targets";
import { Card } from "../../src/ui/Card";
import { LinkButton } from "../../src/ui/LinkButton";
import { Screen } from "../../src/ui/Screen";
import { WeekStrip } from "../../src/ui/WeekStrip";
import { SignOutButton } from "./SignOutButton";
import { TrackingTiles } from "./TrackingTiles";

/**
 * The home screen. It is a separate component because `page.tsx` has to be
 * `async` to run the onboarding guard, and `useTranslations` is a hook — it
 * cannot be called from an async component.
 *
 * The numbers here are real now. They were absent for as long as there was no
 * tracking endpoint, and the rule that kept them absent still holds: every
 * figure on this screen comes from something the user logged. Nothing is
 * inferred, estimated, or filled in to make the layout look complete.
 *
 * There is no Steps tile, and that is deliberate rather than unfinished. No Web
 * API reports step count, a PWA cannot count them in the background, and PRD §5's
 * MVP logging list never included them — so the tile could only ever have shown a
 * dash until wearable sync arrives in v2. Sleep took its place because it is one
 * of the four categories FR-TRK-3 actually computes adherence for.
 */
export function HomeView({
  isGuest = false,
  hasProfile = false,
  summary,
}: {
  isGuest?: boolean;
  hasProfile?: boolean;
  summary: TrackingSummary;
}) {
  const t = useTranslations("home");

  return (
    <Screen>
      {/*
        The greeting and the chip are handed to the hero rather than rendered
        here: the rings beside them own live tracking state, and a heading that
        lived outside that component would sit above numbers it could not keep
        in step.

        The chip is deliberately not a "claim your account" button — claiming is
        not built. The note can promise nothing is lost because a guest is a real
        anonymous user: linking an identity later keeps the same auth.users.id,
        and therefore the same domain row.
      */}
      <TrackingTiles
        initial={summary}
        greeting={t("greeting")}
        guestChip={isGuest ? t("guestChip") : undefined}
      />

      {isGuest && <p className="text-muted">{t("guestNote")}</p>}

      {/*
        The Today card is the one thing on this screen with something to say, so
        it carries the only action, and the action is whatever the journey needs
        next: intake when there is no profile, the plan once there is one. It
        still promises nothing it cannot deliver — the stat tiles below stay
        empty because no tracking endpoint exists yet.
      */}
      <Card>
        <p className="text-sm font-semibold tracking-widest text-emphasis-label uppercase">
          {t("todayLabel")}
        </p>
        <p className="mt-2 text-lg leading-relaxed">
          {hasProfile ? t("todayPlanReady") : t("todayNoProfile")}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {hasProfile ? (
            <>
              <LinkButton href="/plan">{t("viewPlan")}</LinkButton>
              <LinkButton href="/meals" variant="secondary">
                {t("mealsCta")}
              </LinkButton>
              <LinkButton href="/dashboard" variant="secondary">
                {t("viewDashboard")}
              </LinkButton>
            </>
          ) : (
            <LinkButton href="/onboarding/profile">{t("startIntake")}</LinkButton>
          )}
        </div>
      </Card>

      {/*
        Not a chart — /dashboard already draws those. This answers the cruder
        question the home screen is for: did the week happen.
      */}
      <Card>
        <WeekStrip
          days={summary.days.map((day) => ({ date: day.date, value: day.water_ml }))}
          target={WATER_TARGET_ML}
          label={t("weekWater")}
          empty={t("weekEmpty")}
        />
      </Card>

      {/*
        Family setup exists now, so this card stops being a notice and becomes a
        way in. It carries no member preview: the family screen resolves that
        itself, and duplicating it here would mean a second pair of upstream hops
        on every /home render.
      */}
      <Card>
        <p className="text-muted">{t("noFamily")}</p>
        <div className="mt-4">
          <LinkButton href="/family" variant="secondary">
            {t("setUpFamily")}
          </LinkButton>
        </div>
      </Card>

      {/*
        Last on the screen and the quietest variant on it, because signing out
        is the one control here nobody is looking for until they want it — and
        on a shared family device, one they must be able to find.
      */}
      <SignOutButton />
    </Screen>
  );
}
