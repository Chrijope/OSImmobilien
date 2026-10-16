/**
 * Die Prüfaufgabe für Unterlagen aus dem Kundenportal (seit 15.10.2026).
 *
 * Früher entstand eine Aufgabe je Upload ("Unterlagen prüfen: {Name}") und
 * noch eine beim Einreichen ("Bonitätsunterlagen prüfen: {Name}"). Jetzt gibt
 * es je Investment genau eine: "Neue Unterlagen im Portal: prüfen und
 * freigeben". Die Glocke an den Zuständigen kommt weiter je Upload.
 *
 * Anlegen darf sie nur die Datenbank (`unterlagen_pruefaufgabe_sichern`,
 * Migration 20261016205000): Der Kunde sieht im Browser weder fremde Aufgaben
 * noch die Rollen der Leitung. Die Funktion gleicht unter einer Sperre alle
 * offenen Prüfaufgaben des Investments ab, auch nach einem Wechsel des
 * Zuständigen. Solange die Migration nicht gelaufen ist, gibt es einen
 * Rückfall im Browser, der nur mit einem Zuständigen arbeitet.
 */
import { supabase } from "@/integrations/supabase/client";
import { addAufgabe, getAufgaben, updateAufgabe } from "./aufgabenStore";
import { funktionFehlt } from "./supportTicketStore";

export const UNTERLAGEN_PRUEF_TITEL = "Neue Unterlagen im Portal: prüfen und freigeben";

export function unterlagenPruefSchluessel(kontaktId: string, investmentId: string): string {
  return `portal:unterlagen_pruefen:${kontaktId}:${investmentId}`;
}

/** Der Schlüssel der früheren Aufgabe beim Einreichen. Wird mit übernommen. */
export function alterEinreichSchluessel(kontaktId: string, investmentId: string): string {
  return `portal:bonitaet:${kontaktId}:${investmentId}`;
}

export interface PruefaufgabeAnlass {
  kontaktId: string;
  investmentId: string;
  beschreibung: string;
  /** 0 beim Hochladen, 2 beim Einreichen. */
  tageBisFaellig: number;
  /** Der Zuständige am Kontakt, nur für den Rückfall. */
  zustaendigId?: string;
  erstelltVonName?: string;
}

function heutePlus(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ohne gelaufene Migration: nur mit Zuständigem, nie für den Kunden. */
async function rueckfall(anlass: PruefaufgabeAnlass): Promise<void> {
  const zustaendig = anlass.zustaendigId;
  if (!zustaendig) return;
  const neu = unterlagenPruefSchluessel(anlass.kontaktId, anlass.investmentId);
  const alt = alterEinreichSchluessel(anlass.kontaktId, anlass.investmentId);
  const offen = getAufgaben().find((a) =>
    (a.ausloeserSchluessel === neu || a.ausloeserSchluessel === alt) &&
    a.status !== "erledigt" && a.status !== "abgesagt");
  if (offen) {
    if (offen.zugewiesenAn !== zustaendig) await updateAufgabe(offen.id, { zugewiesenAn: zustaendig });
    return;
  }
  // Ein 23505 (paralleler Upload hat sie eben angelegt) nimmt cacheInsert als Erfolg.
  await addAufgabe({
    kontaktId: anlass.kontaktId,
    investmentId: anlass.investmentId,
    typ: "aufgabe",
    prioritaet: "hoch",
    titel: UNTERLAGEN_PRUEF_TITEL,
    beschreibung: anlass.beschreibung,
    faelligAm: heutePlus(anlass.tageBisFaellig),
    uhrzeit: "09:00",
    zugewiesenAn: zustaendig,
    erstelltVonName: anlass.erstelltVonName,
    ausloeserSchluessel: neu,
  });
}

/** Stellt die eine Prüfaufgabe dieses Investments sicher. Fehler nur in der Konsole. */
export async function sichereUnterlagenPruefaufgabe(anlass: PruefaufgabeAnlass): Promise<void> {
  try {
    const { error } = await (supabase as any).rpc("unterlagen_pruefaufgabe_sichern", {
      _investment_id: anlass.investmentId,
      _beschreibung: anlass.beschreibung,
      _tage_bis_faellig: anlass.tageBisFaellig,
    });
    if (!error) return;
    if (!funktionFehlt(error)) {
      console.error("Prüfaufgabe für Unterlagen nicht gesichert:", error);
      return;
    }
    await rueckfall(anlass);
  } catch (fehler) {
    console.error("Prüfaufgabe für Unterlagen nicht gesichert:", fehler);
  }
}
