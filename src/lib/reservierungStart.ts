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
    return darfAufObjektauswahl(investmentId);
  } catch {
    return false;
  }
}

/** Die Ampel eines Investments im Dialog „Kunde zuordnen“. */
export type InvestmentAmpel = "bereit" | "selbstauskunft_fehlt" | "hat_reservierung" | "beendet";

export interface AmpelEingabe {
  stufe?: string | null;
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
  // Hinter der Reservierung (Bonität, Finanzierung, Notar) gibt es kein Zurück.
  if (stufeErreicht(e.stufe, "bonitaetsunterlagen")) return "hat_reservierung";
  if (!e.rvEntfallen && (e.rvSigned || e.rvSignaturePending || stufeErreicht(e.stufe, "reservierung"))) {
    return "hat_reservierung";
  }
  if (!e.saOk) return "selbstauskunft_fehlt";
  return "bereit";
}

export const AMPEL_TEXT: Record<InvestmentAmpel, string> = {
  bereit: "bereit",
  selbstauskunft_fehlt: "Selbstauskunft fehlt",
  hat_reservierung: "hat schon eine Reservierung",
  beendet: "Vorgang beendet",
};

/** Was der Partner tun kann, wenn das Investment nicht bereit ist. */
export const AMPEL_ERKLAERUNG: Record<InvestmentAmpel, string> = {
  bereit: "",
  selbstauskunft_fehlt:
    "Reservieren geht erst mit unterschriebener Selbstauskunft oder mit dem Vermerk „Kunde finanziert selbst“ im Kundenprofil.",
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
