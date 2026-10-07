/**
 * Die Inaktivitätsampel eines Kunden, an genau einer Stelle berechnet.
 *
 * Sie erscheint zweimal im Kundenprofil: hinter dem Namen im Seitenkopf und
 * in der Kachel "Nächste Aktion" zwischen den Kennzahlen. Beide sollen
 * dasselbe zeigen, deshalb rechnet keine der beiden Stellen selbst. Die
 * Regeln stehen weiter in `pipelineAmpel.ts`, hier werden nur die Quellen
 * eingesammelt und das Ergebnis in Farbton, Überschrift und Kurztext
 * übersetzt. Vorher lag genau diese Zusammenstellung im Bauteil
 * `InactivityAmpel`, und die Kachel hätte sie abschreiben müssen.
 */

import type { KundeData } from "./kundenStore";
import type { PipelineStufe } from "./kontaktPipeline";
import { getEffectivePipelineStufe } from "./kontaktPipeline";
import { getDaysSinceUpdate } from "./inactivityThresholds";
import { bewertePipelineKachel, type AmpelErgebnis } from "./pipelineAmpel";
import { kontaktQuellen } from "./kontaktTermine";
import { hatGeplantenTermin, naechsterKontakt, type GeplanterKontakt } from "./naechsterKontakt";

/**
 * Der Farbton des Punkts. Rot und Orange sind die Warnstufen, Grün heißt
 * eingeplant oder aktiv, Blau ist die bewusst geparkte Wartephase, Grau
 * bedeutet: für diese Stufe gibt es keine Regel.
 */
export type AmpelTon = "rot" | "orange" | "gruen" | "blau" | "grau";

export interface InaktivitaetsAmpel {
  stufe: PipelineStufe;
  /** Ganze Tage seit der letzten Änderung am Kontakt. */
  tage: number;
  naechster: GeplanterKontakt | null;
  bewertung: AmpelErgebnis;
  ton: AmpelTon;
  /** Überschrift für Tooltip und Vorleseprogramm, etwa "Handlungsbedarf". */
  titel: string;
  /** Derselbe Kurztext wie auf der Pipeline-Kachel, etwa "Termin 3d überfällig". */
  kurztext: string | null;
}

export interface AmpelOptionen {
  stufeOverride?: PipelineStufe;
  /** Investment, auf das sich der Status bezieht. */
  investmentId?: string;
  jetzt?: number;
}

function tonAus(bewertung: AmpelErgebnis): AmpelTon {
  if (bewertung.farbe === "red") return "rot";
  if (bewertung.farbe === "orange") return "orange";
  if (bewertung.grund === "wartephase") return "blau";
  if (bewertung.grund === "keine_regel") return "grau";
  return "gruen";
}

function titelAus(bewertung: AmpelErgebnis): string {
  if (bewertung.farbe === "red") return "Handlungsbedarf";
  if (bewertung.farbe === "orange") return "Warnung";
  // "Aufgabe geplant", "Follow-Up geplant" oder "Termin geplant",
  // je nachdem, was tatsächlich ansteht.
  if (bewertung.grund === "eingeplant") return bewertung.text || "Termin geplant";
  if (bewertung.grund === "keine_regel") return "Keine Ampel für diese Stufe";
  return "Aktiv";
}

export function berechneInaktivitaetsAmpel(kunde: KundeData, optionen: AmpelOptionen = {}): InaktivitaetsAmpel {
  const jetzt = optionen.jetzt ?? Date.now();
  const stufe = optionen.stufeOverride || getEffectivePipelineStufe(kunde);
  const quellen = kontaktQuellen(kunde, optionen.investmentId);
  const naechster = naechsterKontakt(quellen, jetzt);
  const tage = getDaysSinceUpdate(kunde);

  const bewertung = bewertePipelineKachel({
    stufe,
    tageSeitAenderung: tage,
    naechsterKontakt: naechster
      ? {
          zeitpunkt: naechster.zeitpunkt,
          ueberfaellig: naechster.ueberfaellig,
          // Die Herkunft entscheidet mit: eine Sperrfrist ist kein Termin.
          quelle: naechster.quelle,
          bezeichnung: naechster.titel?.trim() || naechster.bezeichnung,
        }
      : null,
    hatZukuenftigenTermin: hatGeplantenTermin(quellen, jetzt),
    jetzt,
  });

  return {
    stufe,
    tage,
    naechster,
    bewertung,
    ton: tonAus(bewertung),
    titel: titelAus(bewertung),
    kurztext: bewertung.text || (tage >= 1 ? `${tage}d inaktiv` : null),
  };
}
