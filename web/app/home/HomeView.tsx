import { useTranslations } from "next-intl";

import type { TrackingSummary } from "../../src/tracking/summaryTypes";
import { WATER_TARGET_ML } from "../../src/tracking/targets";
import { Card } from "../../src/ui/Card";
import { IconChip } from "../../src/ui/Icon";
import { LinkButton } from "../../src/ui/LinkButton";
import { Screen } from "../../src/ui/Screen";
import { Tile } from "../../src/ui/Tile";
import { WeekStrip } from "../../src/ui/WeekStrip";
import { ClaimAccountCard } from "./ClaimAccountCard";
import { DeleteAccountButton } from "./DeleteAccountButton";
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
  inFamily = null,
  summary,
}: {
  isGuest?: boolean;
  hasProfile?: boolean;
  /**
   * Whether this user belongs to a family, or `null` when the answer could not
   * be fetched. Defaults to `null` because "we did not ask" and "there is no
   * family" are different facts, and this card spent its whole life conflating
   * them.
   */
  inFamily?: boolean | null;
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

      {/*
        This was a note telling a guest their data lives only in this browser.
        Saying that and offering nothing to do about it is a warning; the same
        sentence with a field under it is a way out, and it attaches to the
        identity the guest already has rather than moving anything.
      */}
      {isGuest && <ClaimAccountCard />}

      {/*
        The Today card is the one thing on this screen with something to say, so
        it carries the only action, and the action is whatever the journey needs
        next: intake when there is no profile, the plan once there is one. It
        still promises nothing it cannot deliver — the stat tiles below stay
        empty because no tracking endpoint exists yet.
      */}
      <Card>
        <div className="flex items-center gap-3">
          <IconChip name="activity" tone="move" size="sm" />
          <p className="text-sm font-bold tracking-widest text-accent uppercase">
            {t("todayLabel")}
          </p>
        </div>
        <p className="mt-3 text-lg leading-relaxed">
          {hasProfile ? t("todayPlanReady") : t("todayNoProfile")}
        </p>
        <div className="mt-4">
          {hasProfile ? (
            <LinkButton href="/plan">{t("viewPlan")}</LinkButton>
          ) : (
            <LinkButton href="/onboarding/profile">{t("startIntake")}</LinkButton>
          )}
        </div>
      </Card>

      {/*
        What used to be two more full-width buttons under "See my plan". As a
        stack, three equal buttons asked the reader to read all three to find
        the one they wanted; as tiles, the colour and the icon get there first.
      */}
      {hasProfile && (
        <div className="grid grid-cols-2 gap-3">
          <Tile href="/meals" icon="utensils" tone="meal">
            {t("mealsCta")}
          </Tile>
          <Tile href="/dashboard" icon="chart" tone="water">
            {t("viewDashboard")}
          </Tile>
        </div>
      )}

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
        on every /home render. `hasFamily` costs one hop precisely so that
        holds — it reads the membership off /auth/me and stops there.

        What it must NOT do is what it used to: render "You're not in a family
        yet." as a hardcoded string on a screen that never asked. That sentence
        was shown to every user forever, including the families who had already
        set one up on the screen it was offering to take them to.

        Hence three branches rather than two. When the answer could not be
        fetched the way in stays and the claim goes — an unreachable API is not
        evidence that somebody has no family.
      */}
      <Card>
        <div className="flex items-center gap-3">
          <IconChip name="users" tone="family" />
          {inFamily !== null && (
            <p className="text-muted">{inFamily ? t("inFamily") : t("noFamily")}</p>
          )}
        </div>
        <div className="mt-4">
          <LinkButton href="/family" variant="secondary">
            {inFamily === null ? t("openFamily") : inFamily ? t("viewFamily") : t("setUpFamily")}
          </LinkButton>
        </div>
      </Card>

      {/*
        Last on the screen and the quietest variant on it, because signing out
        is the one control here nobody is looking for until they want it — and
        on a shared family device, one they must be able to find.
      */}
      <SignOutButton />

      {/*
        Below sign-out, because leaving is the thing people come to this corner
        for and erasing is not. It asks before it does anything, which is what
        makes it safe to put within reach of the control beside it.
      */}
      <DeleteAccountButton />
    </Screen>
  );
}
