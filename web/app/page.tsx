import { useTranslations } from "next-intl";

import { LinkButton } from "../src/ui/LinkButton";
import { Screen } from "../src/ui/Screen";

export default function LandingPage() {
  const t = useTranslations("landing");

  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <h1 className="text-4xl font-bold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-lg text-muted">{t("subtitle")}</p>
      </div>

      {/*
        LinkButton, not Button: this navigates. A <button> would be the wrong
        element for a destination, and the landing test locates it as a link.
      */}
      <LinkButton href="/signin">{t("signIn")}</LinkButton>
    </Screen>
  );
}
