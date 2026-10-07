import type { UserRole } from "@/types/user";
export type StatistikTabId =
  | "overview"
  | "opportunity"
  | "activity"
  | "sales"
  | "conversion"
  | "custom"
  | "recruiting"
  | "finanzierung"
  | "leadzuweisung";
export const STATISTIK_TABS: { id: StatistikTabId; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "opportunity", label: "Pipeline & Abschlüsse" },
  { id: "activity", label: "Aktivitäten" },
  { id: "sales", label: "Umsatz & Provisionen" },
  { id: "conversion", label: "Quellen & Online-Rechner" },
  { id: "custom", label: "Eigene Berichte" },
  { id: "recruiting", label: "Recruiting" },
  { id: "finanzierung", label: "Finanzierung" },
  { id: "leadzuweisung", label: "Lead-Zuweisung" },
];
const FULL = STATISTIK_TABS.map((t) => t.id);
const ROLE_TABS: Partial<Record<UserRole, StatistikTabId[]>> = {
  inhaber: FULL,
  admin: FULL,
  testaccount: FULL,
  vertriebsleiter: [
    "overview",
    "opportunity",
    "activity",
    "sales",
    "conversion",
    "custom",
    "finanzierung",
    // Nur Leitung (29.09.2026): Die Zahlen vergleichen Partner miteinander.
    "leadzuweisung",
  ],
  vertriebspartner: [
    "overview",
    "opportunity",
    "activity",
    "sales",
    "conversion",
    "custom",
  ],
  setterin: ["overview", "opportunity", "activity"],
  buchhaltung: ["sales", "custom"],
  backoffice: ["overview", "opportunity", "activity", "custom"],
  objektpartner: ["overview", "opportunity"],
  finanzierungspartner: ["finanzierung"],
  versicherungsexperte: ["overview", "opportunity", "activity"],
  hr: ["recruiting"],
  marketing: ["conversion"],
};
export function getVisibleStatistikTabs(
  role: UserRole,
  explicit: string[] = [],
): StatistikTabId[] {
  if (role === "individuell")
    return FULL.filter((id) => explicit.includes(`/statistiken?tab=${id}`));
  return ROLE_TABS[role] ?? [];
}
export function getDefaultStatistikTab(
  role: UserRole,
  explicit: string[] = [],
): StatistikTabId {
  return getVisibleStatistikTabs(role, explicit)[0] ?? "overview";
}
