import { useTranslations } from "next-intl";

import type { MemberPanel } from "../../../src/family/familyDashboard";
import { BackLink } from "../../../src/ui/BackLink";
import { Card } from "../../../src/ui/Card";
import { Meter } from "../../../src/ui/Meter";
import { Screen } from "../../../src/ui/Screen";

/**
 * What the admin can see of everyone else's week.
 *
 * The screen renders exactly what the API sent and infers nothing. Every measure
 * is optional, and a missing one means the member has that category set to
 * private — so it is drawn as "not shared", never as a zero. A zero and a secret
 * look identical in a bar chart, which is why sharing state is written in words
 * here rather than encoded in a mark.
 *
 * There is deliberately no override for the admin. Creating the family buys the
 * ability to see what members choose to share, not the ability to see everything;
 * FR-FAM-3 makes visibility the member's setting, and a dashboard that ignored it
 * would make the setting a lie.
 */
export function FamilyDashboardView({ members }: { members: MemberPanel[] | null }) {
  const t = useTranslations("familyDashboard");
  const tRole = useTranslations("familyDashboard.roles");

  return (
    <Screen title={t("title")}>
      <BackLink href="/family">{t("back")}</BackLink>

      {members === null ? (
        <Card tone="emphasis">
          <p className="text-lg leading-relaxed">{t("notAdmin")}</p>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted">{t("intro")}</p>

          {members.map((member) => (
            <Card key={member.user_id}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">{member.display_name}</h2>
                <span className="text-sm text-muted">
                  {tRole.has(member.role) ? tRole(member.role) : member.role}
                </span>
              </div>

              {sharesNothing(member) ? (
                <p className="mt-3 text-muted">{t("sharesNothing")}</p>
              ) : (
                <dl className="mt-3 flex flex-col gap-2">
                  {member.water !== undefined && (
                    <Row
                      term={t("water")}
                      value={t("waterValue", {
                        litres: (member.water.water_ml / 1000).toFixed(1),
                      })}
                    />
                  )}
                  {member.sleep !== undefined && (
                    <Row
                      term={t("sleep")}
                      value={
                        member.sleep.sleep_nights === 0
                          ? t("nothingYet")
                          : t("sleepValue", {
                              hours: (
                                member.sleep.sleep_minutes /
                                member.sleep.sleep_nights /
                                60
                              ).toFixed(1),
                              nights: member.sleep.sleep_nights,
                            })
                      }
                    />
                  )}
                  {member.workout_detail !== undefined && (
                    <Row
                      term={t("workouts")}
                      value={
                        // Same rule as the summary above: nothing scheduled is not
                        // nothing done. "0 of 0 done" is arithmetically true and
                        // says nothing anyone can act on.
                        member.workout_detail.workouts_scheduled === 0
                          ? t("noPlanScheduled")
                          : t("workoutValue", {
                              done: member.workout_detail.workouts_completed,
                              scheduled: member.workout_detail.workouts_scheduled,
                            })
                      }
                    />
                  )}
                  {member.meal_detail !== undefined && (
                    <Row
                      term={t("meals")}
                      value={t("mealValue", { count: member.meal_detail.meals_logged })}
                    />
                  )}

                  {/*
                    The summary is a coarser grant than the detail: a member can
                    share "how they are doing" without sharing what they ate. It
                    only earns a meter when the detail is absent, otherwise the same
                    ratio would appear twice on one card.
                  */}
                  {member.adherence_summary !== undefined &&
                    member.workout_detail === undefined &&
                    (member.adherence_summary.workout_adherence === null ? (
                      /*
                        No plan means no ratio. The API sends null here rather than
                        0 precisely so this case can be told apart, and a 0% meter
                        would accuse someone of skipping workouts that were never
                        scheduled — so the row reports what IS known: whether they
                        have been logging anything at all.
                      */
                      <Row
                        term={t("adherence")}
                        value={t("noPlanYet", {
                          days: member.adherence_summary.days_logged,
                        })}
                      />
                    ) : (
                      <div className="mt-1">
                        <Meter
                          value={member.adherence_summary.workout_adherence}
                          max={100}
                          label={t("adherence")}
                          caption={t("adherenceCaption", {
                            days: member.adherence_summary.days_logged,
                          })}
                        />
                      </div>
                    ))}
                </dl>
              )}

              {member.shared.length > 0 && (
                <p className="mt-3 text-xs text-muted">
                  {t("sharedNote", { count: member.shared.length })}
                </p>
              )}
            </Card>
          ))}

          <p className="text-sm text-muted">{t("footnote")}</p>
        </>
      )}
    </Screen>
  );
}

/**
 * True when the API sent no panel at all — every category hidden.
 *
 * Derived from the panels rather than from `shared`, because the caller's own row
 * arrives full with an empty `shared` list: seeing your own data is not a sharing
 * grant. Listing the panels here keeps the check in one place, so a new category
 * cannot slip past it.
 */
function sharesNothing(member: MemberPanel): boolean {
  return (
    member.adherence_summary === undefined &&
    member.water === undefined &&
    member.sleep === undefined &&
    member.workout_detail === undefined &&
    member.meal_detail === undefined
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{term}</dt>
      <dd className="text-[1.0625rem] font-medium text-ink">{value}</dd>
    </div>
  );
}
