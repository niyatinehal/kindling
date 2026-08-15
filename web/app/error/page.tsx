import { useTranslations } from "next-intl";

/**
 * A real route, so `nextStep`'s "/error" destination is a page rather than a
 * 404. Deliberately not `error.tsx`: that is Next's error BOUNDARY for a
 * render that threw, whereas this is somewhere the app routes to on purpose.
 */
export default function ErrorPage() {
  const t = useTranslations("error");
  const tError = useTranslations("errors");

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{tError("UNKNOWN")}</p>
    </main>
  );
}
