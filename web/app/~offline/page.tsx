import { useTranslations } from "next-intl";

import { Screen } from "../../src/ui/Screen";

export default function OfflinePage() {
  const t = useTranslations("offline");

  return (
    <Screen title={t("title")}>
      <p className="text-lg text-muted">{t("body")}</p>
    </Screen>
  );
}
