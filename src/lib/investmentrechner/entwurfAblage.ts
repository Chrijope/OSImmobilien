/**
 * Automatisches Speichern des Rechners im Browser, seit dem 23.10.2026
 * (Christian): Alle Eingaben bleiben beim Neuladen, beim Seitenwechsel und
 * beim Schließen erhalten, im CRM wie auf der Artefaktseite. Gespeichert wird
 * im localStorage dieses Browsers; ist er gesperrt (privates Fenster, volle
 * Ablage), läuft der Rechner ohne Entwurf weiter. Am Investment speichert
 * das CRM wie bisher über „Am Investment speichern“.
 *
 * Gelesen wird über dieselben Prüfungen wie bei gespeicherten Berechnungen
 * (`eingabeAusJson` samt Versionsumrechnung), ein alter Entwurf rechnet also
 * wie eine alte Berechnung. Bilder liegen unter einem eigenen Schlüssel: Sie
 * sind groß, und passen sie nicht mehr hinein, bleibt wenigstens die Eingabe.
 */
import { eingabeAusJson, knkAusJson, unterlagenAusJson } from "@/lib/investmentBerechnungenStore";
import { herkunftAusJson, type Herkunft } from "./herkunft";
import { standardEingabe, type InvestmentEingabe } from "./rechenkern";
import type { Kaufnebenkostenauswahl } from "./kaufnebenkostenAuswahl";
import { leereUnterlagenDaten, type UnterlagenDaten } from "./unterlagenAuslesen";

const PRAEFIX = "investmentrechner-entwurf-v1";

export interface Entwurfsobjekt {
  eingabe: InvestmentEingabe;
  knk: Kaufnebenkostenauswahl;
  herkunft: Herkunft;
  documentData: UnterlagenDaten;
  photos: string[];
  vergleich?: boolean;
}

export interface Rechnerentwurf {
  objekte: Entwurfsobjekt[];
  kundeId: string | null;
  investmentId: string | null;
  berechnungId: string | null;
  berechnungName: string;
  aktivIndex: number;
}

/** Ein Schlüssel je Zusammenhang, damit die Wohnung A nicht den Entwurf von Wohnung B öffnet. */
export function entwurfSchluessel(kontext: string): string {
  return `${PRAEFIX}:${kontext}`;
}

const text = (wert: unknown): string | null => (typeof wert === "string" && wert ? wert : null);

export function entwurfLaden(kontext: string): Rechnerentwurf | null {
  try {
    const roh = localStorage.getItem(entwurfSchluessel(kontext));
    if (!roh) return null;
    const daten = JSON.parse(roh) as Record<string, unknown>;
    const liste = Array.isArray(daten.objekte) ? daten.objekte.slice(0, 2) : [];
    if (liste.length === 0) return null;
    let bilder: unknown[] = [];
    try {
      bilder = JSON.parse(localStorage.getItem(`${entwurfSchluessel(kontext)}:bilder`) ?? "[]");
    } catch {
      bilder = [];
    }
    const felder = Object.keys(standardEingabe);
    const objekte = liste.map((o, index): Entwurfsobjekt => {
      const z = (o ?? {}) as Record<string, unknown>;
      const fotos = Array.isArray(bilder[index]) ? (bilder[index] as unknown[]).filter((b): b is string => typeof b === "string") : [];
      return {
        eingabe: eingabeAusJson(z.eingabe),
        knk: knkAusJson(z.knk),
        herkunft: herkunftAusJson(z.herkunft, felder),
        documentData: unterlagenAusJson(z.documentData) ?? leereUnterlagenDaten,
        photos: fotos.slice(0, 6),
        ...(z.vergleich === true ? { vergleich: true } : {}),
      };
    });
    const aktiv = Number(daten.aktivIndex);
    return {
      objekte,
      kundeId: text(daten.kundeId),
      investmentId: text(daten.investmentId),
      berechnungId: text(daten.berechnungId),
      berechnungName: typeof daten.berechnungName === "string" ? daten.berechnungName : "",
      aktivIndex: Number.isInteger(aktiv) && aktiv >= 0 && aktiv < objekte.length ? aktiv : 0,
    };
  } catch {
    return null;
  }
}

/** Speichert die Eingabe. `mitBildern` nur, wenn sich die Bilder geändert haben: Sie sind groß. */
export function entwurfSpeichern(kontext: string, entwurf: Rechnerentwurf, mitBildern: boolean): void {
  try {
    const { objekte, ...rest } = entwurf;
    localStorage.setItem(
      entwurfSchluessel(kontext),
      JSON.stringify({ ...rest, objekte: objekte.map(({ photos: _fotos, ...o }) => o) }),
    );
  } catch {
    return; // gesperrt oder voll: ohne Entwurf weiter
  }
  if (!mitBildern) return;
  try {
    localStorage.setItem(`${entwurfSchluessel(kontext)}:bilder`, JSON.stringify(entwurf.objekte.map((o) => o.photos)));
  } catch {
    // Zu groß für die Ablage: lieber ohne Bilder als mit einem alten Stand.
    try {
      localStorage.removeItem(`${entwurfSchluessel(kontext)}:bilder`);
    } catch {
      /* gesperrt */
    }
  }
}

export function entwurfLoeschen(kontext: string): void {
  try {
    localStorage.removeItem(entwurfSchluessel(kontext));
    localStorage.removeItem(`${entwurfSchluessel(kontext)}:bilder`);
  } catch {
    /* gesperrt */
  }
}
