import { useTranslations } from "next-intl";

import { Card } from "../../src/ui/Card";
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
      <Card>
        <a href="/" className="font-semibold text-accent">
          {t("back")}
        </a>
      </Card>
    </Screen>
  );
}
