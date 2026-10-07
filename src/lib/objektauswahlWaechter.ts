import { getInvestmentById, getInvestmentMetaField } from "@/lib/investmentsStore";
import { getSelbstauskunftEntfaellt } from "@/lib/selbstauskunftEntfaellt";
import {
  SA_ENTFAELLT_META_SCHLUESSEL,
  selbstauskunftErledigt,
} from "../../supabase/functions/_shared/reservierung-voraussetzungen.ts";

/**
 * Darf dieser Vorgang auf „Objektauswahl" vorrücken?
 *
 * WARUM ES DEN WÄCHTER GIBT
 *
 * Die Pipelinestufe ist ein gespeicherter Wert am Investment, kein berechneter.
 * Bis zum 21.09.2026 konnten mehrere Stellen ihn auf „Objektauswahl" setzen,
 * ohne die Selbstauskunft auch nur anzusehen: das Speichern der Objektdaten,
 * eine über den Buchungslink gebuchte Objektvorstellung, und die Vererbung der
 * Kontaktstufe beim Anlegen eines Investments.
 *
 * Christian ist das an einem Vorgang aufgefallen, dessen Selbstauskunft erst zu
 * achtzig Prozent ausgefüllt und nicht unterschrieben war, der aber trotzdem in
 * der Objektauswahl stand.
 *
 * WAS GEPRÜFT WIRD
 *
 * Dieselbe Bedingung, die auch die Karte im Kundenprofil freischaltet, siehe
 * `objektauswahlFreigeschaltet`: unterschrieben, fertiges PDF vorhanden, oder
 * der Vermerk „Kunde finanziert selbst". Der Vermerk bleibt ausdrücklich ein
 * gültiger Weg, dort gibt es bewusst keine Selbstauskunft.
 *
 * WAS BEWUSST NICHT GEPRÜFT WIRD
 *
 * Die Handeingabe in der Fortschrittsleiste. Sie ist ein ausdrücklicher
 * Override für Admin und Inhaber, mit Warnfenster und Protokolleintrag, und
 * genau dafür gedacht, eine Regel im Einzelfall zu übergehen.
 */
export function darfAufObjektauswahl(investmentId: string): boolean {
  const inv = getInvestmentById(investmentId);
  if (!inv) return false;

  /*
   * Aus der Rohzeile lesen, nicht aus `inv`: `getInvestmentById` liefert das
   * umgewandelte Investment ohne `meta`. Bis zum 29.09.2026 stand hier
   * `inv.meta`; damit galt jede Selbstauskunft als nicht unterschrieben, und
   * auf der Objektseite war seit dem 23.09.2026 keine Reservierung mehr
   * moeglich (ausser mit dem Vermerk „Kunde finanziert selbst").
   */
  const lies = (key: string) => getInvestmentMetaField<unknown>(investmentId, key, undefined);
  /*
   * Der Vermerk steht an derselben Stelle wie im Kundenprofil. Kann er nicht
   * gelesen werden, gilt er als nicht gesetzt: lieber einen Vorgang zu spaet
   * vorruecken als einen zu frueh. Unterschrift und PDF zaehlen trotzdem.
   */
  let vermerk: unknown;
  try {
    vermerk = getSelbstauskunftEntfaellt(investmentId);
  } catch {
    vermerk = undefined;
  }
  /*
   * Die Regel selbst steht in `reservierung-voraussetzungen.ts`, damit
   * `send-reservation-signature` genau dasselbe prüft (29.09.2026). Ein
   * `saPdf` vom Abschluss vor einer Korrektur zählt dort nicht (26.09.2026).
   */
  return selbstauskunftErledigt({
    saSigned: lies("saSigned"),
    saPdf: lies("saPdf"),
    saPapierUpload: lies("saPapierUpload"),
    saNeueUnterschriftSeit: lies("saNeueUnterschriftSeit"),
    [SA_ENTFAELLT_META_SCHLUESSEL]: vermerk,
  });
}
