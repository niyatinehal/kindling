import { useTranslations } from "next-intl";

/**
 * The home screen itself. It is a separate component because `page.tsx` has to
 * be `async` to run the onboarding guard, and `useTranslations` is a hook — it
 * cannot be called from an async component.
 */
export function HomeView({ isGuest = false }: { isGuest?: boolean }) {
  const t = useTranslations("home");

  return (
    <main>
      {/*
        A chip and a sentence, deliberately not a "claim your account" button:
        claiming is not built. The sentence can promise that nothing is lost
        because a guest is a real anonymous user — linking an identity later
        keeps the same auth.users.id, and therefore the same domain row.
      */}
      {isGuest && (
        <>
          <span>{t("guestChip")}</span>
          <p>{t("guestNote")}</p>
        </>
      )}

      <h1>{t("title")}</h1>
      <p>{t("noFamily")}</p>
    </main>
  );
}
