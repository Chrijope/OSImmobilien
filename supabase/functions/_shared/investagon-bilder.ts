/**
 * Bild-Erkennung für den Investagon-Import.
 *
 * Liegt im gemeinsamen Ordner, weil die Edge Function in Deno läuft und
 * nichts aus `src/` importieren kann. Der Dialog im CRM nutzt dieselben
 * Funktionen über den Wrapper `src/lib/investagonBilder.ts`, getestet wird
 * von `src/lib/investagonBilder.test.ts` aus, so wie bei `kontakt-dublette`
 * und `standort-messung`. Hier stehen nur reine Funktionen ohne
 * Abhängigkeiten und ohne Deno-Aufrufe.
 *
 * Drei Aufgaben:
 *   1. `findeBildAdressen` beantwortet die Diagnosefrage im Dialog: Liefert
 *      die API überhaupt Spuren von Bildern? (Feldnamen und Dateiendungen)
 *   2. `sammleBildUrls` holt die tatsächlichen Bildadressen heraus, mit
 *      denen der Import arbeitet. Absichtlich strenger als die Diagnose:
 *      nur echte Adressen auf .jpg, .jpeg, .png oder .webp.
 *   3. `istBildDatei` und `stabilerDateiname` trennen im Dokumentenpaket
 *      Bilder von Dokumenten und geben jedem Bild einen Speicherpfad, der
 *      bei jedem Lauf gleich bleibt. Der gleiche Pfad ist der Schlüssel der
 *      Idempotenz: Was schon liegt, wird übersprungen, nicht verdoppelt.
 */

const BILD_FELD = /image|photo|media|attachment|picture|bild|foto|thumbnail|galer/i;
const BILD_URL = /\.(jpe?g|png|webp|gif|svg)([?#]|$)/i;

/**
 * Für den Import zählen nur Formate, die der Browser als Objektfoto zeigen
 * kann. SVG und GIF bleiben draußen: In Dokumentenpaketen sind das Logos und
 * Grundriss-Piktogramme, keine Objektfotos.
 */
const IMPORT_ENDUNG = /\.(jpe?g|png|webp)([?#]|$)/i;

/** Mehr Fundstellen bringen keine neue Erkenntnis, sie machen nur die Liste lang. */
const MAX_FUNDSTELLEN = 12;
const MAX_TIEFE = 15;

/** Mehr Adressen je Projekt braucht kein Import, die Grenze je Einheit liegt ohnehin bei 30. */
const MAX_URLS = 120;

export interface BildBefund {
  gefunden: boolean;
  /** Menschlich lesbare Fundstellen: Feldpfad oder Feldpfad mit Beispieladresse. */
  fundstellen: string[];
}

export function findeBildAdressen(daten: unknown): BildBefund {
  const fundstellen: string[] = [];
  const gesehen = new Set<object>();

  const merke = (text: string) => {
    if (fundstellen.length < MAX_FUNDSTELLEN && !fundstellen.includes(text)) {
      fundstellen.push(text);
    }
  };

  const laufe = (wert: unknown, pfad: string, tiefe: number): void => {
    if (tiefe > MAX_TIEFE || fundstellen.length >= MAX_FUNDSTELLEN) return;

    if (typeof wert === "string") {
      if (BILD_URL.test(wert)) merke(pfad ? `${pfad}: ${wert}` : wert);
      return;
    }
    if (!wert || typeof wert !== "object") return;
    // Zyklen kann geparstes JSON nicht enthalten, aber die Funktion soll auch
    // mit beliebigen Objekten nicht in eine Endlosschleife laufen.
    if (gesehen.has(wert)) return;
    gesehen.add(wert);

    if (Array.isArray(wert)) {
      for (const eintrag of wert) laufe(eintrag, pfad, tiefe + 1);
      return;
    }

    for (const [feld, unterwert] of Object.entries(wert as Record<string, unknown>)) {
      const neuerPfad = pfad ? `${pfad}.${feld}` : feld;
      const hatInhalt = Array.isArray(unterwert)
        ? unterwert.length > 0
        : unterwert !== null && unterwert !== undefined && unterwert !== "";
      if (BILD_FELD.test(feld) && hatInhalt) merke(neuerPfad);
      laufe(unterwert, neuerPfad, tiefe + 1);
    }
  };

  laufe(daten, "", 0);
  return { gefunden: fundstellen.length > 0, fundstellen };
}

/**
 * Alle Bildadressen aus einer API-Antwort, in der Reihenfolge des Fundes.
 *
 * Genommen wird jede Zeichenkette, die auf eine Bilddatei endet (auch mit
 * Query-String) und entweder eine vollständige http-Adresse ist oder mit `/`
 * beginnt, also relativ zur API-Basis aufgelöst werden kann. Alles andere,
 * etwa ein blanker Dateiname in einem Textfeld, ist keine ladbare Adresse.
 * Doppelte Adressen erscheinen nur einmal.
 */
export function sammleBildUrls(daten: unknown): string[] {
  const urls: string[] = [];
  const gesehen = new Set<object>();

  const laufe = (wert: unknown, tiefe: number): void => {
    if (tiefe > MAX_TIEFE || urls.length >= MAX_URLS) return;

    if (typeof wert === "string") {
      const kandidat = wert.trim();
      const istAdresse = /^https?:\/\//i.test(kandidat) || kandidat.startsWith("/");
      if (istAdresse && IMPORT_ENDUNG.test(kandidat) && !urls.includes(kandidat)) {
        urls.push(kandidat);
      }
      return;
    }
    if (!wert || typeof wert !== "object") return;
    if (gesehen.has(wert)) return;
    gesehen.add(wert);

    if (Array.isArray(wert)) {
      for (const eintrag of wert) laufe(eintrag, tiefe + 1);
      return;
    }
    for (const unterwert of Object.values(wert as Record<string, unknown>)) {
      laufe(unterwert, tiefe + 1);
    }
  };

  laufe(daten, 0);
  return urls;
}

/**
 * Trennt im Dokumentenpaket die Bilder von den Dokumenten, allein an der
 * Endung. Ordnereinträge und versteckte Dateien (etwa `__MACOSX/`) fallen
 * ebenfalls heraus.
 */
export function istBildDatei(name: string): boolean {
  if (!name || name.endsWith("/")) return false;
  const basis = name.split("/").pop() || "";
  if (!basis || basis.startsWith(".")) return false;
  if (name.split("/").some((teil) => teil.startsWith("__") || teil.startsWith("."))) return false;
  return IMPORT_ENDUNG.test(basis);
}

/**
 * Kleiner, stabiler Streuwert (djb2) als Hex-Text.
 *
 * Kein Sicherheitsmerkmal, nur ein deterministisches Kürzel, damit zwei
 * verschiedene Quellen mit gleichem Dateinamen nicht denselben Speicherpfad
 * bekommen.
 */
export function kurzHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Nur Zeichen, die in einem Storage-Pfad unproblematisch sind. */
export function sicherName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
}

/**
 * Der Dateiname im Bucket, gleich bei jedem Lauf.
 *
 * `herkunft` ist die vollständige Quellangabe (die Bild-URL oder
 * `zip:<einheit>:<eintrag>`), `anzeigeName` der lesbare Teil daraus, etwa der
 * letzte Pfadabschnitt der URL. Der Streuwert der Herkunft steht vorn und
 * macht den Namen eindeutig, der lesbare Teil dahinter macht ihn im Bucket
 * wiedererkennbar. Weil derselbe Ursprung immer denselben Namen ergibt, kann
 * der Import Vorhandenes am Pfad erkennen und überspringen.
 */
export function stabilerDateiname(herkunft: string, anzeigeName: string): string {
  const ohneQuery = anzeigeName.split(/[?#]/)[0];
  const basis = sicherName(decodeURIComponentSicher(ohneQuery.split("/").pop() || ""));
  return `${kurzHash(herkunft)}-${basis || "bild.jpg"}`;
}

function decodeURIComponentSicher(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Grobe Einordnung eines Bildes nach seinem Namen.
 *
 * Auf der Objektseite sollen zuerst die Außenansichten stehen, danach
 * allgemeine Aufnahmen, ganz zum Schluss Innenaufnahmen und Pläne. Investagon
 * liefert keine Kategorie mit, deshalb entscheidet der Dateiname. Sagt der
 * Name nichts (etwa "WhatsApp Image 2026-04-29..."), bleibt es beim
 * Mittelwert, dann zählt die Reihenfolge aus der Quelle.
 *
 * 0 = Außen/Fassade, 1 = unbestimmt, 2 = Innenaufnahme, 3 = Plan/Grundriss
 */
export function bildRang(name: string): number {
  const text = (name || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ");
  const hat = (...worte: string[]) => worte.some((w) => text.includes(w));

  // Pläne stehen immer hinten, auch wenn sie "Aussenanlage" heißen.
  if (hat("grundriss", "lageplan", "bauplan", "schnitt", "floorplan", "teilungserklaerung")) {
    return 3;
  }
  // Eindeutige Außenaufnahmen gewinnen vor jedem Raumwort im selben Namen.
  if (hat("fassade", "aussenansicht", "aussen", "exterior", "outside", "strassenansicht",
          "vorderansicht", "frontansicht", "rueckansicht", "luftbild", "drohne")) {
    return 0;
  }
  if (hat("bad", "wc", "kueche", "wohnzimmer", "schlafzimmer", "kinderzimmer", "zimmer",
          "flur", "diele", "keller", "treppenhaus", "innenansicht", "innen", "balkon",
          "terrasse", "wohnung")) {
    return 2;
  }
  // Schwächere Hinweise auf das Gebäude von außen.
  if (hat("haus", "gebaeude", "eingang", "hof", "front", "strasse")) return 0;
  return 1;
}
