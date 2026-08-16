import { useTranslations } from "next-intl";

/**
 * The home screen itself. It is a separate component because `page.tsx` has to
 * be `async` to run the onboarding guard, and `useTranslations` is a hook — it
 * cannot be called from an async component.
 */
export function HomeView() {
  const t = useTranslations("home");

  return (
    <main>
      <h1>{t("title")}</h1>
      <p>{t("noFamily")}</p>
    </main>
  );
}
