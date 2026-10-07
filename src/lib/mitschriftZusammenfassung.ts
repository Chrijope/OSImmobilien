/**
 * Kurzfassung einer Gespraechs-Mitschrift, ohne Sprachmodell.
 *
 * Dasselbe Vorgehen wie bei `erstgespraechZusammenfassung.ts`: Was schon
 * dasteht, wird gekuerzt gezeigt, nichts wird dazuerfunden. Ein Sprachmodell
 * muesste dafuer erst geladen werden und koennte hoechstens Inhalte
 * hinzudichten, die im Gespraech nie gefallen sind. Fuer die eingeklappte
 * Ansicht in der Kundenakte reichen die ersten Saetze, die Dauer und die Zahl
 * der Wortmeldungen.
 *
 * Die Schnittstelle ist so geschnitten, dass spaeter ein lokal laufendes
 * Modell dieselbe Signatur bedienen koennte, ohne dass sich die Aufrufstellen
 * aendern.
 */

import type { MitschriftZeile } from "./mitschrift";

export interface MitschriftKurzfassungOptionen {
  /** Hoechstlaenge des Kurztexts. */
  maxZeichen?: number;
  /** Wie viele Wortmeldungen hoechstens in den Kurztext einfliessen. */
  maxWortmeldungen?: number;
  /**
   * Dauer des Gespraechs in Sekunden. Ohne Angabe wird sie aus dem letzten
   * Zeitstempel geschaetzt, was bei einem langen Schlusswort etwas zu kurz
   * ausfaellt, aber nie falsch wirkt.
   */
  dauerSekunden?: number;
}

export interface MitschriftKurzfassung {
  /** Die ersten Saetze des Gespraechs, an einer Satzgrenze gekuerzt. */
  text: string;
  /** Zum Beispiel „12 Min · 34 Wortmeldungen“. */
  kennzahlen: string;
  dauerSekunden: number;
  wortmeldungen: number;
  /** Namen der Sprecher in der Reihenfolge ihres ersten Auftretens. */
  sprecher: string[];
  istLeer: boolean;
}

export type MitschriftZusammenfasser = (
  zeilen: MitschriftZeile[] | null | undefined,
  optionen?: MitschriftKurzfassungOptionen,
) => MitschriftKurzfassung;

const MAX_ZEICHEN = 260;
const MAX_WORTMELDUNGEN = 6;

const LEER: MitschriftKurzfassung = {
  text: "",
  kennzahlen: "",
  dauerSekunden: 0,
  wortmeldungen: 0,
  sprecher: [],
  istLeer: true,
};

function normalisiere(roh: unknown): string {
  if (typeof roh !== "string") return "";
  return roh.replace(/\s+/gu, " ").trim();
}

/**
 * Text kuerzen, bevorzugt an einer Satzgrenze.
 *
 * Bewusst dieselbe Regel wie in `erstgespraechZusammenfassung.kuerzeFreitext`:
 * Liegt die letzte Satzgrenze so weit vorne, dass fast alles wegfiele, wird
 * stattdessen an der Wortgrenze getrennt. Mitten im Wort niemals.
 */
export function kuerzeAnSatzgrenze(roh: string, maxZeichen: number = MAX_ZEICHEN): string {
  const text = normalisiere(roh);
  if (maxZeichen <= 0) return "";
  if (text.length <= maxZeichen) return text;

  let satzGrenze = -1;
  for (let i = 0; i < maxZeichen && i < text.length; i++) {
    const z = text[i];
    if (z !== "." && z !== "!" && z !== "?") continue;
    const naechstes = text[i + 1];
    if (naechstes === undefined || naechstes === " ") satzGrenze = i;
  }
  if (satzGrenze >= Math.floor(maxZeichen * 0.4)) return text.slice(0, satzGrenze + 1);

  const ausschnitt = text.slice(0, maxZeichen);
  const wortGrenze = ausschnitt.lastIndexOf(" ");
  const gekuerzt = wortGrenze > 0 ? ausschnitt.slice(0, wortGrenze) : ausschnitt;
  return `${gekuerzt.replace(/[.,;:!?]+$/u, "")}…`;
}

/** Dauer in ganzen Minuten, mindestens eine, sobald ueberhaupt etwas gesagt wurde. */
function dauerText(sekunden: number): string {
  if (sekunden <= 0) return "";
  if (sekunden < 60) return `${Math.round(sekunden)} Sek`;
  return `${Math.round(sekunden / 60)} Min`;
}

/**
 * Baut die Kurzfassung.
 *
 * Der Text sind die ersten Wortmeldungen in der gesprochenen Reihenfolge, mit
 * Sprechernamen davor. Der Anfang eines Gespraechs sagt am meisten darueber
 * aus, worum es ging; das Ende ist meist Verabschiedung.
 */
export const baueMitschriftKurzfassung: MitschriftZusammenfasser = (zeilen, optionen = {}) => {
  if (!Array.isArray(zeilen) || zeilen.length === 0) return { ...LEER, sprecher: [] };

  const maxZeichen = optionen.maxZeichen ?? MAX_ZEICHEN;
  const maxWortmeldungen = Math.max(1, optionen.maxWortmeldungen ?? MAX_WORTMELDUNGEN);

  const sauber = zeilen
    .map((z) => ({
      zeitpunkt: Number.isFinite(z?.zeitpunkt) ? Math.max(0, z.zeitpunkt) : 0,
      sprecher: normalisiere(z?.sprecher),
      text: normalisiere(z?.text),
    }))
    .filter((z) => z.text !== "");

  if (sauber.length === 0) return { ...LEER, sprecher: [] };

  const sprecher: string[] = [];
  for (const z of sauber) {
    if (z.sprecher && !sprecher.includes(z.sprecher)) sprecher.push(z.sprecher);
  }

  const letzter = sauber[sauber.length - 1].zeitpunkt;
  const dauer = optionen.dauerSekunden && optionen.dauerSekunden > 0
    ? optionen.dauerSekunden
    : letzter;

  // Erst zusammensetzen, dann einmal am Ende kuerzen. Wer jede Wortmeldung
  // einzeln kuerzte, bekaeme lauter angeschnittene Halbsaetze.
  const roh = sauber
    .slice(0, maxWortmeldungen)
    .map((z) => (z.sprecher ? `${z.sprecher}: ${z.text}` : z.text))
    .join(" ");

  const kennzahlenTeile = [
    dauerText(dauer),
    `${sauber.length} ${sauber.length === 1 ? "Wortmeldung" : "Wortmeldungen"}`,
  ].filter(Boolean);

  return {
    text: kuerzeAnSatzgrenze(roh, maxZeichen),
    kennzahlen: kennzahlenTeile.join(" · "),
    dauerSekunden: dauer,
    wortmeldungen: sauber.length,
    sprecher,
    istLeer: false,
  };
};
