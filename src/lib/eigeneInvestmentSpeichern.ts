/**
 * Schreibweg fuer "Eigene Immobilien" (Tabelle externe_investments).
 *
 * Der Bearbeiten-Dialog und die Stifte im Steuer-Cockpit speichern ueber
 * genau diese Funktionen. Damit gibt es fuer jede Angabe nur EINEN
 * gespeicherten Wert: Was im Cockpit eingetragen wird, steht danach auch im
 * Dialog, und umgekehrt.
 *
 * Anlage-V-Werte liegen in eigenen Spalten und zusaetzlich in meta.anlageV
 * (Uebergangspfad, solange die Migration 20260818100000 nicht gelaufen ist).
 * Gelesen wird ueber leseAnlageV, bevorzugt die Spalte.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  gebaeudeAnteilAusBodenwert, hausgeldEuroAusProzent, leseAnlageV, type ExternesInvestment,
} from "@/lib/eigeneInvestmentBerechnungen";
import { zahlOderNull } from "@/lib/eigeneInvestmentValidierung";

/** Die acht Anlage-V-Spalten, gleiche Schluessel wie im Formular des Dialogs. */
export const ANLAGE_V_FORMULARFELDER = [
  "gebaeude_anteil_prozent",
  "afa_satz_prozent",
  "grundsteuer_jahr",
  "versicherung_jahr",
  "verwaltungskosten_jahr",
  "hausgeld_nicht_umlage_monat",
  "umlagen_monat",
  "miteigentumsanteil_prozent",
] as const;

export type AnlageVFormularfeld = (typeof ANLAGE_V_FORMULARFELDER)[number];
export type AnlageVSpaltenwerte = Record<AnlageVFormularfeld, number | null>;

/** Felder, die der Stift im Cockpit schreiben darf. Schluessel wie im Dialog. */
export type CockpitFeld = AnlageVFormularfeld | "baujahr" | "erste_miete";

/** Formularwerte als Text, so wie Eingabefelder sie liefern. */
export type Formularwerte = Partial<Record<string, string>>;

/** Anlage-V-Werte aus Formulartexten. Leeres Feld bleibt NULL, nie 0. */
export function anlageVAusFormular(form: Formularwerte): AnlageVSpaltenwerte {
  const erg = {} as AnlageVSpaltenwerte;
  for (const feld of ANLAGE_V_FORMULARFELDER) erg[feld] = zahlOderNull(form[feld]);
  return erg;
}

/** Aktuelle Anlage-V-Werte eines Investments, als Spaltenwerte. */
function anlageVAusInvestment(inv: ExternesInvestment): AnlageVSpaltenwerte {
  const av = leseAnlageV(inv);
  return {
    gebaeude_anteil_prozent: av.gebaeudeAnteilProzent,
    afa_satz_prozent: av.afaSatzProzent,
    grundsteuer_jahr: av.grundsteuerJahr,
    versicherung_jahr: av.versicherungJahr,
    verwaltungskosten_jahr: av.verwaltungskostenJahr,
    hausgeld_nicht_umlage_monat: av.hausgeldNichtUmlageMonat,
    umlagen_monat: av.umlagenMonat,
    miteigentumsanteil_prozent: av.miteigentumsanteilProzent,
  };
}

/**
 * Migration 20260818100000 noch nicht gelaufen: PostgREST meldet dann eine
 * unbekannte Spalte. In dem Fall wird ohne die neuen Spalten gespeichert,
 * die Werte stehen trotzdem in meta.anlageV.
 */
export const istSpaltenFehler = (e: { code?: string; message?: string } | null) =>
  e?.code === "PGRST204" || e?.code === "42703" || /column/i.test(String(e?.message || ""));

export interface InvestmentAenderung {
  /** Normale Spalten wie baujahr oder kaufpreis. */
  payload: Record<string, unknown>;
  /** Anlage-V-Spalten, landen zusaetzlich in meta.anlageV. */
  anlageV: AnlageVSpaltenwerte;
  /** Vollstaendiges neues meta (bereits mit dem Bestand zusammengefuehrt). */
  meta: Record<string, unknown>;
}

/**
 * Schreibt eine Aenderung an einem eigenen Investment. Das Recht dazu prueft
 * die Datenbank (RLS: nur die eigene Zeile, user_id = auth.uid()).
 */
export async function aktualisiereEigenesInvestment(
  id: string,
  aenderung: InvestmentAenderung,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const { payload, anlageV, meta } = aenderung;
  let { error } = await supabase.from("externe_investments")
    .update({ ...payload, ...anlageV, meta } as TablesUpdate<"externe_investments">).eq("id", id);
  if (error && istSpaltenFehler(error)) {
    ({ error } = await supabase.from("externe_investments")
      .update({ ...payload, meta } as TablesUpdate<"externe_investments">).eq("id", id));
  }
  return { error };
}

/**
 * Baut aus einzelnen Formularwerten (Stift im Cockpit) dieselbe Aenderung,
 * die der Bearbeiten-Dialog schreiben wuerde: gleiche Spalten, gleiche
 * meta-Schluessel, gleiche Umwandlung. Nicht genannte Felder behalten ihren
 * gespeicherten Wert.
 */
export function einzelwerteZuAenderung(
  inv: ExternesInvestment,
  werte: Partial<Record<CockpitFeld, string>>,
): InvestmentAenderung {
  const anlageV = { ...anlageVAusInvestment(inv) };
  for (const feld of ANLAGE_V_FORMULARFELDER) {
    if (feld in werte) anlageV[feld] = zahlOderNull(werte[feld]);
  }
  const payload: Record<string, unknown> = {};
  // Wie im Dialog: leeres Baujahr wird NULL, sonst ganze Zahl.
  if ("baujahr" in werte) payload.baujahr = werte.baujahr ? parseInt(werte.baujahr, 10) : null;
  const meta: Record<string, unknown> = { ...(inv.meta || {}), anlageV };
  if ("erste_miete" in werte) meta.erste_miete = werte.erste_miete || null;
  return { payload, anlageV, meta };
}

/**
 * Wendet eine gespeicherte Aenderung lokal auf das Investment an, so wie es
 * nach dem Neuladen aussieht. Gebraucht fuer Tests und sofortiges Neurechnen.
 */
export function wendeAenderungAn<T extends object>(inv: T, aenderung: InvestmentAenderung): T {
  return { ...inv, ...aenderung.payload, ...aenderung.anlageV, meta: aenderung.meta } as T;
}

/**
 * Einmalige Uebernahme der Altwerte aus meta.steuerCockpit in die Felder des
 * Bearbeiten-Dialogs (Entscheidung Christian, 25.09.2026: ein Wert).
 *
 *  - Bodenwert-Anteil in % wird zu gebaeude_anteil_prozent = 100 minus Bodenwert.
 *  - Verwaltungsanteil in % wird zu hausgeld_nicht_umlage_monat in Euro je
 *    Monat, aber nur mit Gesamthausgeld je Monat. Ohne das bleibt der Altwert
 *    liegen, bis ein Hausgeld eingetragen ist; gerechnet wird nichts.
 *
 * Uebernommen wird nur in ein leeres Dialogfeld. Ist das Dialogfeld schon
 * gefuellt oder eben uebernommen, wird der Altwert entfernt. Sonst kaeme er
 * wieder hervor, sobald jemand das Dialogfeld leert, und es gaebe wieder zwei
 * Werte. null heisst: nichts zu tun.
 */
export function altwerteZuAenderung(inv: ExternesInvestment): InvestmentAenderung | null {
  const alt = { ...((inv.meta?.steuerCockpit || {}) as Record<string, unknown>) };
  const av = leseAnlageV(inv);
  const werte: Partial<Record<CockpitFeld, string>> = {};
  let aufgeraeumt = false;

  if (alt.bodenwertAnteil != null) {
    const gebaeude = av.gebaeudeAnteilProzent == null ? gebaeudeAnteilAusBodenwert(alt.bodenwertAnteil) : null;
    if (gebaeude != null) werte.gebaeude_anteil_prozent = String(gebaeude);
    if (av.gebaeudeAnteilProzent != null || gebaeude != null) {
      delete alt.bodenwertAnteil;
      aufgeraeumt = true;
    }
  }
  if (alt.hausgeldNichtUmlagefaehig != null) {
    const euro = av.hausgeldNichtUmlageMonat == null
      ? hausgeldEuroAusProzent(alt.hausgeldNichtUmlagefaehig, inv.hausgeld)
      : null;
    if (euro != null) werte.hausgeld_nicht_umlage_monat = String(euro);
    if (av.hausgeldNichtUmlageMonat != null || euro != null) {
      delete alt.hausgeldNichtUmlagefaehig;
      aufgeraeumt = true;
    }
  }
  if (!aufgeraeumt) return null;

  const aenderung = einzelwerteZuAenderung(inv, werte);
  return { ...aenderung, meta: { ...aenderung.meta, steuerCockpit: alt } };
}

/**
 * Fuehrt die Uebernahme fuer ein geladenes Investment aus und liefert es so,
 * wie es danach in der Datenbank steht. Schlaegt das Schreiben fehl, bleibt
 * das Investment unveraendert; das Cockpit rechnet dann ueber cockpitWerte
 * trotzdem mit demselben Wert, und beim naechsten Laden wird es erneut versucht.
 */
export async function uebernimmAltwerte<T extends ExternesInvestment>(inv: T): Promise<T> {
  const aenderung = altwerteZuAenderung(inv);
  if (!aenderung) return inv;
  const { error } = await aktualisiereEigenesInvestment(inv.id, aenderung);
  if (error) {
    console.warn("Altwerte des Steuer-Cockpits nicht uebernommen:", error.message || error.code);
    return inv;
  }
  return wendeAenderungAn(inv, aenderung);
}
