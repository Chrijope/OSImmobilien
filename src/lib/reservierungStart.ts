/**
 * Darf für ein Investment eine Reservierung beginnen, und wie steht es in der
 * Ampel des Dialogs „Für Kunden reservieren“?
 *
 * Getrennt von `einheitVormerkung.ts`, weil hier die Investments gelesen
 * werden und jene Datei vom `objekteStore` gebraucht wird.
 */
import { getInvestmentById, getInvestmentMetaField } from "@/lib/investmentsStore";
import { darfAufObjektauswahl } from "@/lib/objektauswahlWaechter";
import { istEndzustand, stufeErreicht } from "@/lib/pipelineStufen";
import { fehlendeMindestunterlagen } from "@/lib/mindestunterlagen";
import { getSelbstauskunftEntfaellt } from "@/lib/selbstauskunftEntfaellt";

/* ────────────────────────────────────────────────────────────────────────
 * Darf für dieses Investment eine Reservierung beginnen?
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Die eine Freigabe für den Weg in die Reservierung.
 *
 * Bis zum 23.09.2026 verlangten Objekt- und Wohnungsseite eine
 * unterschriebene Selbstauskunft, das Kundenprofil ließ zusätzlich den
 * Vermerk „Kunde finanziert selbst“ gelten. Jetzt gilt überall dasselbe:
 * unterschrieben, fertiges PDF oder der Vermerk. Die Bedingung steht in
 * `darfAufObjektauswahl` und wird hier nur beim Namen genannt.
 */
export function darfReservierungStarten(investmentId?: string | null): boolean {
  if (!investmentId) return false;
  try {
    return darfAufObjektauswahl(investmentId) && fehlendeUnterlagenFuerReservierung(investmentId).length === 0;
  } catch {
    return false;
  }
}

/**
 * Welche Mindestunterlagen der Reservierung noch fehlen (seit 16.10.2026).
 *
 * Neuer Ablauf: Die Reservierung faellt im Termin der Objektvorstellung, und
 * bis dahin liegen Personalausweis und letzte Gehaltsabrechnung im Portal
 * (Umsetzungsstrategie Vertrieb, Abschnitt 6). Die Regel steht in
 * `mindestunterlagen.ts`. Laesst sich das Investment nicht lesen, fehlt
 * alles: lieber einmal zu frueh gesperrt als ohne Ausweis reserviert.
 */
export function fehlendeUnterlagenFuerReservierung(investmentId: string): string[] {
  const lies = (key: string) => getInvestmentMetaField<unknown>(investmentId, key, undefined);
  // Der Vermerk „Kunde finanziert selbst" ueber dieselbe Stelle wie der
  // Objektauswahl-Waechter.
  let selbstFinanziert = false;
  try { selbstFinanziert = !!getSelbstauskunftEntfaellt(investmentId).aktiv; } catch { /* gilt als nicht gesetzt */ }
  return fehlendeMindestunterlagen({
    docStatuses: lies("docStatuses"),
    saData: lies("saData"),
    saSnapshot: lies("saSnapshot"),
    selbstauskunftEntfaellt: { aktiv: selbstFinanziert },
  });
}

/** Die Ampel eines Investments im Dialog „Kunde zuordnen“. */
export type InvestmentAmpel = "bereit" | "selbstauskunft_fehlt" | "hat_reservierung" | "beendet";

export interface AmpelEingabe {
  stufe?: string | null;
  /** Selbstauskunft erledigt und, seit 16.10.2026, Ausweis und Gehaltsabrechnung da. */
  saOk: boolean;
  rvSigned?: boolean;
  rvSignaturePending?: boolean;
  /**
   * Die letzte Reservierung ist entfallen, etwa weil die Einheit bei der
   * Unterschrift schon vergeben war (`rvReservierungEntfallenAm`). Dann ist
   * der Weg für eine andere Einheit wieder frei, obwohl die Stufe noch auf
   * „Reservierung“ steht.
   */
  rvEntfallen?: boolean;
}

/**
 * Reine Entscheidung der Ampel, damit sie ohne Zwischenspeicher prüfbar ist.
 *
 * Reihenfolge ist Absicht: Ein beendeter Vorgang zuerst, dann eine schon
 * vorhandene Reservierung (eine zweite Vereinbarung würde die offene des
 * Kunden ungültig machen), erst danach die Selbstauskunft.
 */
export function ampelAus(e: AmpelEingabe): InvestmentAmpel {
  if (istEndzustand(e.stufe) || e.stufe === "abgeschlossen") return "beendet";
  // Hinter der Reservierung (Besichtigung, Finanzierung, Notar) gibt es kein
  // Zurück. Seit 16.10.2026 die Besichtigung: Die Bonitaetsunterlagen teilen
  // den Rang der Reservierung und fallen unten unter "stufeErreicht reservierung".
  if (stufeErreicht(e.stufe, "besichtigung")) return "hat_reservierung";
  if (!e.rvEntfallen && (e.rvSigned || e.rvSignaturePending || stufeErreicht(e.stufe, "reservierung"))) {
    return "hat_reservierung";
  }
  if (!e.saOk) return "selbstauskunft_fehlt";
  return "bereit";
}

export const AMPEL_TEXT: Record<InvestmentAmpel, string> = {
  bereit: "bereit",
  // Seit 16.10.2026 auch, wenn Ausweis oder Gehaltsabrechnung fehlen.
  selbstauskunft_fehlt: "Selbstauskunft oder Unterlagen fehlen",
  hat_reservierung: "hat schon eine Reservierung",
  beendet: "Vorgang beendet",
};

/** Was der Partner tun kann, wenn das Investment nicht bereit ist. */
export const AMPEL_ERKLAERUNG: Record<InvestmentAmpel, string> = {
  bereit: "",
  selbstauskunft_fehlt:
    "Reservieren geht erst mit unterschriebener Selbstauskunft oder mit dem Vermerk „Kunde finanziert selbst“ im Kundenprofil, " +
    "und wenn Personalausweis und letzte Gehaltsabrechnung im Portal liegen.",
  hat_reservierung:
    "Für dieses Investment ist schon eine Reservierungsvereinbarung unterwegs oder unterschrieben. Einen weiteren Kauf legst du im Kundenprofil als neues Investment an.",
  beendet: "Dieser Vorgang ist abgeschlossen oder verloren.",
};

/** Die Ampel eines Investments aus dem Zwischenspeicher. */
export function investmentAmpel(investmentId: string): InvestmentAmpel {
  const inv = getInvestmentById(investmentId);
  return ampelAus({
    stufe: inv?.pipelineStufe,
    saOk: darfReservierungStarten(investmentId),
    rvSigned: getInvestmentMetaField<boolean>(investmentId, "rvSigned", false) === true,
    rvSignaturePending: getInvestmentMetaField<boolean>(investmentId, "rvSignaturePending", false) === true,
    rvEntfallen: !!getInvestmentMetaField<string>(investmentId, "rvReservierungEntfallenAm", ""),
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * Ist die Reservierung eines Investments wirksam?
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Wirksam heißt: unterschrieben, nicht entfallen, und bei gewählter
 * Widerrufsfrist ist sie abgelaufen (`rvReservierungWirksamAm` gesetzt).
 *
 * Gebraucht vom Abgleich auf der Objektseite. Er stellte bis zum 23.09.2026
 * jede Einheit auf „reserviert“, deren Investment auf der Stufe
 * „Reservierung“ stand. Diese Stufe setzt aber schon das Absenden der
 * Vereinbarung, also lange vor der Unterschrift. Wer die Objektseite öffnete,
 * reservierte damit ungewollt eine Einheit, die nach Christians Regeln bis
 * zur Unterschrift frei bleiben muss.
 */
export function rvWirksamAusMeta(meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta || {};
  if (m.rvSigned !== true) return false;
  if (m.rvReservierungEntfallenAm) return false;
  if (m.rvReservierungAb && !m.rvReservierungWirksamAm) return false;
  return true;
}

export function reservierungIstWirksam(investmentId: string): boolean {
  return rvWirksamAusMeta({
    rvSigned: getInvestmentMetaField<boolean>(investmentId, "rvSigned", false),
    rvReservierungEntfallenAm: getInvestmentMetaField<string>(investmentId, "rvReservierungEntfallenAm", ""),
    rvReservierungAb: getInvestmentMetaField<string>(investmentId, "rvReservierungAb", ""),
    rvReservierungWirksamAm: getInvestmentMetaField<string>(investmentId, "rvReservierungWirksamAm", ""),
  });
}
