import { useTranslations } from "next-intl";

import { BackLink } from "../../src/ui/BackLink";
import { Card } from "../../src/ui/Card";
import { Screen } from "../../src/ui/Screen";

/**
 * The document the consent screen asks people to agree to.
 *
 * It lived nowhere for as long as consent has been collected: `ConsentClient`
 * records `policy_version: "2026-08-15"` against a page that did not exist,
 * which is a consent record pointing at nothing.
 *
 * The copy goes through `next-intl` like every other screen rather than being
 * inlined here. A privacy notice is the LAST thing that should be readable in
 * only one language when the product is aimed at families in India — the Hindi
 * file being empty today is a gap to fill, not a reason to hardcode English
 * into the component and make filling it harder.
 *
 * Sections are declared as a list so the order is visible in one place and a
 * new one cannot be added to the messages file and silently never rendered.
 */
const SECTIONS = [
  { id: "collect", keys: ["account", "health", "activity", "family", "consent"] },
  { id: "why", keys: ["body", "noProfiling"] },
  { id: "sharing", keys: ["body", "noSelling", "processors"] },
  { id: "where", keys: ["body"] },
  { id: "keep", keys: ["body"] },
  { id: "rights", keys: ["access", "correct", "deletion", "withdraw"] },
  { id: "children", keys: ["body"] },
  { id: "guests", keys: ["body"] },
  { id: "security", keys: ["body"] },
  { id: "changes", keys: ["body"] },
] as const;

export default function PrivacyPage() {
  const t = useTranslations("privacy");

  return (
    <Screen title={t("title")}>
      <BackLink href="/home">{t("backHome")}</BackLink>

      <p className="text-sm text-muted">{t("version")}</p>
      <p className="text-lg leading-relaxed text-ink">{t("intro")}</p>

      {SECTIONS.map((section) => (
        <Card key={section.id}>
          <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">
            {t(`${section.id}.heading` as "collect.heading")}
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {section.keys.map((key) => (
              <p key={key} className="leading-relaxed text-ink">
                {t(`${section.id}.${key}` as "collect.account")}
              </p>
            ))}
          </div>
        </Card>
      ))}
    </Screen>
  );
}
