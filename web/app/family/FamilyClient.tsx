"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { readJsonBody } from "../../src/api/readJsonBody";
import type { FamilySummary } from "../../src/family/currentFamily";
import { Alert } from "../../src/ui/Alert";
import { BackLink } from "../../src/ui/BackLink";
import { Button } from "../../src/ui/Button";
import { Avatar } from "../../src/ui/Avatar";
import { Card } from "../../src/ui/Card";
import { LinkButton } from "../../src/ui/LinkButton";
import { ChoiceGroup } from "../../src/ui/ChoiceGroup";
import { Field } from "../../src/ui/Field";
import { Screen } from "../../src/ui/Screen";

/** The three writes this screen can make, and therefore the three it can report on. */
type FamilyAction = "create" | "join" | "invite";

const INVITABLE_ROLES = ["adult", "child", "elderly"] as const;

/** Pulls the error code out of a proxied envelope, whatever shape it arrived in. */
function errorCode(body: unknown): string | undefined {
  return typeof body === "object" && body !== null && "error" in body
    ? (body as { error?: { code?: string } }).error?.code
    : undefined;
}

/**
 * The family screen: create one, join one by code, or see who is in it.
 *
 * Client-side because all three actions need progress and failure states. The
 * family itself is resolved on the server and handed in, so the screen renders
 * populated rather than empty-then-filled.
 */
export function FamilyClient({ initialFamily }: { initialFamily: FamilySummary | null }) {
  const t = useTranslations("family");
  const tError = useTranslations("errors");
  const tRole = useTranslations("family.roles");
  const router = useRouter();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [invitedRole, setInvitedRole] = useState<string[]>(["adult"]);
  const [issuedCode, setIssuedCode] = useState<string | undefined>(undefined);
  // Which action is in flight, not merely that one is. A single boolean put
  // every button into the working state at once, so creating a family told the
  // user that joining one was also underway.
  const [pending, setPending] = useState<FamilyAction | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  async function post(
    action: FamilyAction,
    path: string,
    body: unknown,
    onOk: (body: unknown) => void,
  ): Promise<void> {
    setPending(action);
    setError(undefined);

    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = await readJsonBody(response);
    setPending(null);

    if (!response.ok) {
      const code = errorCode(parsed);
      setError(code !== undefined && tError.has(code) ? code : "FAMILY_ACTION_FAILED");
      return;
    }
    onOk(parsed);
  }

  const family = initialFamily;
  const isAdmin = family?.role === "admin";

  return (
    <Screen title={t("title")}>
      <BackLink href="/home">{t("backHome")}</BackLink>

      {error !== undefined && (
        <Alert>{tError.has(error) ? tError(error) : tError("UNKNOWN")}</Alert>
      )}

      {family === null ? (
        <>
          <Card tone="emphasis">
            <p className="text-lg leading-relaxed">{t("noFamilyBody")}</p>
          </Card>

          <Card>
            <div className="flex flex-col gap-4">
              <h2 className="font-semibold text-ink">{t("createTitle")}</h2>
              <Field label={t("nameLabel")} value={name} onChange={setName} maxLength={120} />
              <Button
                disabled={pending !== null || name.trim() === ""}
                loading={pending === "create"}
                onClick={() => {
                  void post("create", "/api/family", { name: name.trim() }, () => {
                    router.refresh();
                  });
                }}
              >
                {pending === "create" ? t("working") : t("create")}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4">
              <h2 className="font-semibold text-ink">{t("joinTitle")}</h2>
              <p className="text-sm text-muted">{t("joinHint")}</p>
              <Field
                label={t("codeLabel")}
                value={code}
                onChange={(value) => setCode(value.toUpperCase())}
                maxLength={12}
              />
              <Button
                disabled={pending !== null || code.trim() === ""}
                loading={pending === "join"}
                onClick={() => {
                  void post("join", "/api/family/join", { code: code.trim() }, () => {
                    router.refresh();
                  });
                }}
              >
                {pending === "join" ? t("working") : t("join")}
              </Button>
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <h2 className="font-semibold text-ink">{t("membersTitle")}</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {family.members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3">
                  <Avatar name={m.display_name} size="sm" />
                  <div className="flex flex-col">
                    <span className="text-[1.0625rem] font-semibold text-ink">
                      {m.display_name}
                    </span>
                    <span className="text-sm text-muted">
                      {tRole.has(m.role) ? tRole(m.role) : m.role}
                      {m.status !== "active" && ` · ${t("removed")}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {/*
              Admin-only, mirroring the endpoint. What the admin then sees is still
              each member's choice — the link opens a view of shared categories, not
              a bypass of them.
            */}
            {isAdmin && (
              <div className="mt-4">
                <LinkButton href="/family/dashboard" variant="secondary">
                  {t("viewDashboard")}
                </LinkButton>
              </div>
            )}
          </Card>

          {/*
            Invite issuing is admin-only in the UI because it is admin-only in the
            API. The button's absence is a courtesy, not the control — a non-admin
            calling the endpoint directly still gets a 403 FORBIDDEN_ROLE.
          */}
          {isAdmin && (
            <Card>
              <div className="flex flex-col gap-4">
                <h2 className="font-semibold text-ink">{t("inviteTitle")}</h2>
                <ChoiceGroup
                  legend={t("inviteRoleLabel")}
                  choices={INVITABLE_ROLES.map((value) => ({ value, label: tRole(value) }))}
                  selected={invitedRole}
                  onChange={setInvitedRole}
                />
                <Button
                  disabled={pending !== null}
                  loading={pending === "invite"}
                  onClick={() => {
                    void post(
                      "invite",
                      "/api/family/invite",
                      { invited_role: invitedRole[0] ?? "adult", invited_contact: null },
                      (body) => {
                        const issued =
                          typeof body === "object" && body !== null && "invite" in body
                            ? (body as { invite?: { code?: string } }).invite?.code
                            : undefined;
                        setIssuedCode(issued);
                      },
                    );
                  }}
                >
                  {pending === "invite" ? t("working") : t("invite")}
                </Button>

                {issuedCode !== undefined && (
                  <div>
                    <p className="text-sm text-muted">{t("inviteIssued")}</p>
                    <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em] text-ink">
                      {issuedCode}
                    </p>
                    <p className="mt-1 text-sm text-muted">{t("inviteOnce")}</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
