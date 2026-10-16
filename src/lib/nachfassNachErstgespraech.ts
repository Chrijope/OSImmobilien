/**
 * Der Nachfass-Anruf nach einem stattgefundenen Erstgespräch (seit 15.10.2026).
 *
 * Früher legte die Follow-up-Kette "Nach Erstgespräch" schon beim Wechsel der
 * Pipelinestufe einen Nachfass-Anruf an, bevor überhaupt ein Gespräch
 * stattgefunden hatte, und ohne Empfänger. Jetzt entsteht er erst, wenn das
 * Erstgespräch als stattgefunden abgeschlossen wird, auf jedem Weg dorthin:
 * fester Termin am Kontakt, Buchung oder Meeting, Videocall-Buchungen und
 * der Haken an einem Termin ohne Ergebnisfeld. Alle rufen diese eine
 * Funktion, damit Titel, Fälligkeit und Duplikatschutz an einer Stelle stehen.
 *
 * Er ist eine Aufgabe und kein Follow-up, weil nur die Aufgabentabelle einen
 * Empfänger kennt.
 */
import { addGeteilteAufgabe } from "./aktivitaetenStore";
import { getAufgaben } from "./aufgabenStore";
import { cacheLadeZeilenFuer, isTableLoaded, ladeTabellen } from "./dataCache";
import { aufgabenEmpfaenger } from "./prozessAufgabe";

export const NACHFASS_TITEL = "Nach dem Erstgespräch: Kunden anrufen und Fragen klären";
export const NACHFASS_FEHLER_TITEL = "Nachfass-Anruf fehlt";
export const NACHFASS_FEHLER_TEXT =
  "Der Nachfass-Anruf nach dem Erstgespräch konnte nicht angelegt werden. Bitte lege ihn als Aufgabe von Hand an.";

export type NachfassErgebnis = "angelegt" | "vorhanden" | "fehler";

/** Ein Erstgespräch: bei Buchungen zählt der Anlass, sonst der Titel. */
export function istErstgespraech(titel?: string, anlass?: string): boolean {
  if (anlass) return anlass === "erstgespraech";
  return /erstgespr/i.test(titel || "");
}

function alsTag(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Drei Tage nach dem Gesprächstag (JJJJ-MM-TT, Ortszeit), auch über den Monatswechsel. */
export function nachfassTag(gespraechstag: string): string {
  const [j, m, t] = gespraechstag.slice(0, 10).split("-").map(Number);
  return alsTag(new Date(j, (m || 1) - 1, (t || 1) + 3));
}

export function nachfassSchluessel(kontaktId: string, gespraechstag: string): string {
  return `nachfass_erstgespraech:${kontaktId}:${gespraechstag.slice(0, 10)}`;
}

export interface NachfassAnlass {
  kontaktId: string;
  kundeName: string;
  /** Tag des Gesprächs, als Date (Ortszeit) oder JJJJ-MM-TT. */
  gespraech: Date | string;
  /** Kennung des Zuständigen, falls der Kontakt im Zwischenspeicher fehlt. */
  rueckfallZustaendig?: string;
  erstelltVonName?: string;
  investmentId?: string;
}

/**
 * Legt den Nachfass-Anruf für jeden Empfänger an, sofern es ihn nicht schon
 * gibt. Eine offene oder schon erledigte Aufgabe desselben Schlüssels zählt
 * als vorhanden, eine abgesagte nicht.
 *
 * Lädt vorher nach, denn wer die Videocall-Buchungen direkt öffnet, hat
 * Aufgaben und Kontakt noch nicht im Speicher. Ohne geladene Aufgaben, ohne
 * Empfänger oder wenn das Speichern scheitert: "fehler". Der Aufrufer meldet
 * das mit `NACHFASS_FEHLER_TEXT`; das Terminergebnis selbst ist dann schon
 * gespeichert und darf daran nicht scheitern.
 */
export async function legeNachfassNachErstgespraechAn(anlass: NachfassAnlass): Promise<NachfassErgebnis> {
  try {
    await ladeTabellen(["aufgaben", "kontakte", "user_roles"]);
    await cacheLadeZeilenFuer("aufgaben", "kontakt_id", anlass.kontaktId);
    await cacheLadeZeilenFuer("kontakte", "id", anlass.kontaktId);
  } catch (fehler) {
    console.error("Nachfass: Nachladen gescheitert:", fehler);
  }
  if (!isTableLoaded("aufgaben")) return "fehler";

  const tag = typeof anlass.gespraech === "string" ? anlass.gespraech.slice(0, 10) : alsTag(anlass.gespraech);
  const schluessel = nachfassSchluessel(anlass.kontaktId, tag);
  const empfaenger = aufgabenEmpfaenger(anlass.kontaktId, anlass.rueckfallZustaendig);
  if (empfaenger.length === 0) return "fehler";

  const vorhanden = (uid: string) => getAufgaben().some((a) =>
    a.ausloeserSchluessel === schluessel && a.zugewiesenAn === uid && a.status !== "abgesagt");

  let angelegt = false;
  for (const uid of empfaenger) {
    if (vorhanden(uid)) continue;
    const ok = await addGeteilteAufgabe({
      titel: NACHFASS_TITEL,
      beschreibung: `Erstgespräch mit ${anlass.kundeName} am ${tag.split("-").reverse().join(".")}. Offene Fragen klären und den nächsten Schritt vereinbaren.`,
      prioritaet: "hoch",
      typ: "anruf",
      faellig_am: nachfassTag(tag),
      uhrzeit: "09:00",
      kundeId: anlass.kontaktId,
      kundeName: anlass.kundeName,
      zugewiesenAn: uid,
      erstelltVonName: anlass.erstelltVonName,
      investmentId: anlass.investmentId,
      ausloeserSchluessel: schluessel,
    });
    if (!ok) return "fehler";
    angelegt = true;
  }
  return angelegt ? "angelegt" : "vorhanden";
}
