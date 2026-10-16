/**
 * Die Aufgabe zu einer Empfehlung aus dem Kundenportal (seit 15.10.2026).
 *
 * Bisher legte der Browser des Kunden sie an. Ohne Zuständigen landete sie
 * damit beim Kunden selbst, und eine Leitung kann der Kunde nicht bestimmen.
 * Jetzt legt sie die Datenbank an (`empfehlung_aufgabe_anlegen`, Migration
 * 20261016205000): für den Zuständigen, ohne ihn für jede Person der Leitung,
 * je Empfehlung genau einmal, auch nach dem Abhaken.
 */
import { supabase } from "@/integrations/supabase/client";
import { addAufgabe } from "./aufgabenStore";
import { funktionFehlt } from "./supportTicketStore";

export const EMPFEHLUNG_TITEL = "Empfehlung erhalten: Empfohlenen anrufen";

export interface EmpfehlungAnlass {
  kontaktId: string;
  /** Aus `create_empfehlung_kontakt`; fehlt sie, bildet die Datenbank einen Ersatz aus der Beschreibung. */
  empfehlungId?: string | null;
  beschreibung: string;
  /** Der Zuständige am Kontakt, nur für den Rückfall. */
  zustaendigId?: string;
  erstelltVonName?: string;
}

function morgen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function legeEmpfehlungAufgabeAn(anlass: EmpfehlungAnlass): Promise<void> {
  try {
    const { error } = await (supabase as any).rpc("empfehlung_aufgabe_anlegen", {
      _kontakt_id: anlass.kontaktId,
      _empfehlung_id: anlass.empfehlungId || null,
      _beschreibung: anlass.beschreibung,
    });
    if (!error) return;
    if (!funktionFehlt(error)) {
      console.error("Aufgabe zur Empfehlung nicht angelegt:", error);
      return;
    }
    // Rueckfall ohne Migration: nur mit Zustaendigem, nie fuer den Kunden.
    if (!anlass.zustaendigId) return;
    await addAufgabe({
      kontaktId: anlass.kontaktId,
      typ: "anruf",
      prioritaet: "hoch",
      titel: EMPFEHLUNG_TITEL,
      beschreibung: anlass.beschreibung,
      faelligAm: morgen(),
      uhrzeit: "09:00",
      zugewiesenAn: anlass.zustaendigId,
      erstelltVonName: anlass.erstelltVonName,
      ausloeserSchluessel: anlass.empfehlungId ? `empfehlung_erhalten:${anlass.kontaktId}:${anlass.empfehlungId}` : undefined,
    });
  } catch (fehler) {
    console.error("Aufgabe zur Empfehlung nicht angelegt:", fehler);
  }
}
