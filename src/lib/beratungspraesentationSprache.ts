/**
 * Sprache der Beratungspräsentation MOREImmo (`/beratungspraesentation-moreimmo`).
 *
 * Die Präsentation hat einen eigenen Sprachwechsel und hängt bewusst nicht am
 * i18n des Kundenportals. Dessen Sprache liegt unter `moreimmo-crm-lang` und
 * gilt für den ganzen Browser: Schaltet ein Berater die Präsentation auf
 * Englisch, soll nicht nebenbei das Portal eines Kunden, der am selben Gerät
 * angemeldet war, mitwechseln. Die Wahl wird deshalb je Nutzer unter einem
 * eigenen Schlüssel gemerkt.
 */

export type PraesentationsSprache = "de" | "en";

export const PRAESENTATIONS_SPRACHEN: readonly PraesentationsSprache[] = ["de", "en"];

/** Schlüssel im localStorage, je angemeldetem Nutzer. */
export function spracheSchluessel(nutzerKennung?: string | null): string {
  return `beratungspraesentation-sprache:${nutzerKennung || "ohne-nutzer"}`;
}

function istSprache(wert: unknown): wert is PraesentationsSprache {
  return wert === "de" || wert === "en";
}

/**
 * Liest die gemerkte Wahl. `null`, wenn nichts gemerkt ist oder der Speicher
 * nicht erreichbar ist (privates Fenster, gesperrte Website-Daten).
 */
export function leseSprache(schluessel: string): PraesentationsSprache | null {
  try {
    const wert = window.localStorage.getItem(schluessel);
    return istSprache(wert) ? wert : null;
  } catch {
    return null;
  }
}

/** Merkt die Wahl. Schlägt das Speichern fehl, gilt sie trotzdem für diese Sitzung. */
export function merkeSprache(schluessel: string, sprache: PraesentationsSprache): void {
  try {
    window.localStorage.setItem(schluessel, sprache);
  } catch {
    /* Speicher voll oder gesperrt: die Wahl gilt dann nur bis zum Neuladen */
  }
}

/**
 * Mit welcher Sprache die Präsentation startet.
 *
 * Seit dem 25.09.2026 (Plan Kundensprache, K10): Wird sie mit einem Kunden
 * geöffnet (`?kundeId=`), startet sie in der Sprache aus seinem Profil, denn
 * sie wird ihm gezeigt. Ohne Kunden gilt wie bisher die gemerkte Wahl des
 * Beraters, sonst Deutsch.
 */
export function startSprache(
  kundenSprache: PraesentationsSprache | null | undefined,
  gemerkt: PraesentationsSprache | null | undefined,
): PraesentationsSprache {
  if (istSprache(kundenSprache)) return kundenSprache;
  return istSprache(gemerkt) ? gemerkt : "de";
}

/* ── Zahlen und Beträge ─────────────────────────────────────── */

/*
 * Seit dem 25.09.2026 aus der gemeinsamen Formatierung `sprachFormat.ts`
 * (Plan Kundensprache, Etappe 0). Die Präsentation war die erste Stelle mit
 * Englisch, ihre Schreibweise ist die Vorlage für alle anderen: Deutsch
 * „4.000 €“, Englisch „€4,000“, negativ „−€354“ mit echtem Minuszeichen.
 */
export { zahlText, euroText, prozentText } from "./sprachFormat";

/**
 * Liest eine im Termin getippte Zahl, egal in welcher Schreibweise.
 *
 * "4.000", "4000 €", "4.000,50", "4,000.50", "4,5" und "4.5". Die Eingaben
 * bleiben beim Sprachwechsel stehen, ein auf Deutsch getipptes "4.000" muss
 * auf Englisch also dieselbe Zahl ergeben und umgekehrt. Deshalb entscheidet
 * nicht die Sprache, sondern die Eingabe selbst:
 *
 * Stehen Punkt und Komma beide drin, trennt das hintere die Nachkommastellen.
 * Steht nur eines drin und folgen jedem genau drei Ziffern, ist es ein
 * Tausendertrenner, sonst das Dezimalzeichen. Leere oder negative Eingaben
 * ergeben 0.
 */
export function zuZahl(text?: string | null): number {
  if (!text) return 0;
  let s = text.replace(/[^0-9,.-]/g, "");
  const komma = s.lastIndexOf(",");
  const punkt = s.lastIndexOf(".");

  if (komma >= 0 && punkt >= 0) {
    const dezimal = komma > punkt ? "," : ".";
    const tausender = dezimal === "," ? "." : ",";
    s = s.split(tausender).join("").replace(dezimal, ".");
  } else if (komma >= 0 || punkt >= 0) {
    const zeichen = komma >= 0 ? "," : ".";
    const teile = s.split(zeichen);
    const tausender = teile.slice(1).every((t) => t.length === 3);
    s = tausender ? teile.join("") : `${teile.slice(0, -1).join("")}.${teile[teile.length - 1]}`;
  }

  const wert = parseFloat(s);
  return Number.isFinite(wert) && wert > 0 ? wert : 0;
}
