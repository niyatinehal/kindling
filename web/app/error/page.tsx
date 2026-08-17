import { useTranslations } from "next-intl";

import { LinkButton } from "../../src/ui/LinkButton";
import { Screen } from "../../src/ui/Screen";

/**
 * A real route, so `nextStep`'s "/error" destination is a page rather than a
 * 404. Deliberately not `error.tsx`: that is Next's error BOUNDARY for a
 * render that threw, whereas this is somewhere the app routes to on purpose.
 */
export default function ErrorPage() {
  const t = useTranslations("error");
  const tError = useTranslations("errors");

  return (
    <Screen title={t("title")}>
      <p className="text-lg text-muted">{tError("UNKNOWN")}</p>
      {/*
        LinkButton, not a bare <a>: it carries min-h-12 and full-width padding
        for free, which a hand-styled anchor would otherwise have to
        re-implement to clear the 48px tap-target floor. `secondary` because
        this is a recovery action on an error screen, not the shouting green
        of a forward-progress CTA -- it is still the screen's only action, so
        size (not colour) is what makes it unmistakably tappable.
      */}
      <LinkButton href="/" variant="secondary">
        {t("back")}
      </LinkButton>
    </Screen>
  );
}
