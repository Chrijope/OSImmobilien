import type { KundeData } from "@/lib/kundenStore";
import { istEigenKontakt } from "@/lib/karriereStufeHelper";
import { User, Zap } from "lucide-react";

/**
 * Vertragliche Einordnung eines Kontakts (§ 7 des Vertriebspartnervertrags):
 * Eigenkontakt des Partners oder Lead der Gesellschaft. Wer den Kontakt
 * betreut (meiner oder eines Kollegen), ist eine andere Frage und steht nicht
 * in diesem Etikett, sondern in der Zuständigkeit (kontaktOwnership.ts).
 */
export type KontaktTyp = "eigen" | "lead";

/** Die gültigen Werte, etwa zum Bereinigen gespeicherter Filter. */
export const KONTAKT_TYPEN: readonly KontaktTyp[] = ["eigen", "lead"];

/**
 * Ein gespeicherter oder per Adresse übergebener Filterwert. Bis zum
 * 29.09.2026 gab es "team"; alles Unbekannte wird zu "Alle" ("-"), sonst
 * bliebe die Liste leer.
 */
export function kontaktTypFilterWert(wert: unknown): KontaktTyp | "-" {
  return KONTAKT_TYPEN.includes(wert as KontaktTyp) ? (wert as KontaktTyp) : "-";
}

const LEAD_QUELLEN = [
  "zapier",
  "analysetool",
  "webhook",
  "api",
  "webformular",
  "webform",
  "extern",
  "lead",
  "meta",
  "facebook",
  "instagram",
  "tiktok",
  "google",
  "landing",
];

function isLeadQuelle(quelle?: string | null): boolean {
  if (!quelle) return false;
  const q = quelle.toLowerCase();
  return LEAD_QUELLEN.some(k => q.includes(k));
}

/**
 * Eigenkontakt oder Lead der Gesellschaft?
 *
 * Christians Freigabe vom 29.09.2026: Eigenkontakt ist allein, was der
 * zuständige Partner selbst angelegt hat, nach derselben Regel wie beim
 * Provisionssatz (istEigenKontakt): ein Setter heißt zugewiesen, sonst
 * entscheidet die Kennung des Erstellers, ohne Kennung nur ein eindeutiger
 * Name. Zuständigkeit allein, ein gespeichertes `meta.kontaktTyp` oder ein
 * Namensvergleich mit dem Betrachter machen einen Kontakt nicht mehr zum
 * Eigenkontakt. Kontakte aus Schnittstellen und Kampagnen bleiben immer
 * Lead der Gesellschaft.
 */
export function getKontaktTyp(kunde: KundeData): KontaktTyp {
  if (isLeadQuelle(kunde.quelle)) return "lead";
  const partnerId = (kunde.zustaendig_id || "").trim() || null;
  return istEigenKontakt(partnerId, kunde) ? "eigen" : "lead";
}

export interface KontaktTypBadgeConfig {
  label: string;
  shortLabel: string;
  /** Erklärung für den Tooltip, mit Fundstelle im Vertrag. */
  tooltip: string;
  className: string;
  Icon: typeof User;
}

export function getKontaktTypBadge(typ: KontaktTyp): KontaktTypBadgeConfig {
  if (typ === "eigen") {
    return {
      label: "Eigenkontakt",
      shortLabel: "Eigen",
      tooltip: "Von dir selbst angelegt (§ 7 Absatz 3). Bleibt dein Kontakt, auch nach Vertragsende.",
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200",
      Icon: User,
    };
  }
  return {
    label: "Lead der Gesellschaft",
    shortLabel: "Lead",
    tooltip: "Lead der Gesellschaft (§ 5 Absatz 1, § 7 Absatz 2). Bleibt Kontakt der Gesellschaft.",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200",
    Icon: Zap,
  };
}
