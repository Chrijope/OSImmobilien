/**
 * Welche Pipeline-Stufe eine Änderung der Abwicklung auslöst (Christian,
 * 17.10.2026). Als Bauträger stellen wir keine Provisionsrechnung; die Haken
 * „Provisionsrechnung gestellt“ und „Auszahlung bestätigt“ sind entfallen.
 * Seitdem gilt:
 *
 * - „Kaufpreis eingegangen“ setzt „Abrechnung“ (die Partnerprovision wird fällig),
 * - „Kaufpreis eingegangen“ und „Grundbucheintrag erfolgt“ setzen „Abgeschlossen“.
 *
 * Beides nur für die Geldrollen (Admin, Inhaber, Backoffice), wie zuvor; die
 * Datenbank prüft dieselbe Grenze. Kundenprofil und Objektdaten rufen beide
 * `abwicklungStufeNachziehen` auf, damit die Regel nur hier steht.
 */
import { abwicklungGespeichert, type AbwicklungDaten } from "./abwicklungStore";
import { notifyKundePipelineStufe } from "./bellNotifications";
import { updateInvestment } from "./investmentsStore";
import { updateKontakt } from "./kundenStore";

export function zielStufeNachAbwicklung(d: AbwicklungDaten, stufe: string, darfGeldfelder: boolean): "abrechnung" | "abgeschlossen" | null {
  if (!darfGeldfelder || !d.kaufpreisEingegangen) return null;
  if (d.grundbuchEingetragen && stufe !== "abgeschlossen") return "abgeschlossen";
  if (["notar", "faelligkeit"].includes(stufe)) return "abrechnung";
  return null;
}

/**
 * Stellt die Stufe nach, wenn die Abwicklung es verlangt. Erst wenn die
 * Abwicklung wirklich gespeichert ist, dann die Stufe, dann die Kundenmeldung
 * (M19, 04.10.2026). Gibt die neue Stufe zurück oder null.
 */
export async function abwicklungStufeNachziehen(
  inv: { id: string; kontaktId: string; pipelineStufe: string },
  daten: AbwicklungDaten,
  darfGeldfelder: boolean,
): Promise<string | null> {
  const ziel = zielStufeNachAbwicklung(daten, inv.pipelineStufe, darfGeldfelder);
  if (!ziel) return null;
  if (!(await abwicklungGespeichert(inv.id))) return null;
  if (!(await updateInvestment(inv.id, { pipelineStufe: ziel }))) return null;
  try {
    await updateKontakt(inv.kontaktId, ziel === "abgeschlossen" ? { pipelineStufe: ziel, status: "kunde" } : { pipelineStufe: ziel });
  } catch {
    return null;
  }
  if (ziel === "abgeschlossen") notifyKundePipelineStufe(inv.kontaktId, "abgeschlossen");
  return ziel;
}
