/**
 * Zweite Wiedererkennung ueber die Adresse.
 *
 * Der Import erkennt ein bereits vorhandenes Objekt bisher nur an seiner
 * Investagon-Kennung (`meta.investagonSlug`). Am 16.09.2026 kam mit Platz 6
 * der eigene Investagon-Zugang von More Immo dazu. Diese Organisation fuehrt
 * eigene Kopien derselben Projekte, mit neuen Kennungen. Fuer den Import waren
 * das fremde Haeuser: 35 Objekte mit rund 194 Einheiten lagen danach doppelt
 * im CRM.
 *
 * Deshalb hier eine zweite Wiedererkennung: Findet der Import zu einer Kennung
 * kein Objekt, sieht er nach, ob dieselbe Adresse schon im Bestand steht.
 *
 * ── Warum die Adresse allein nicht reicht ──────────────────────────────────
 *
 * Neun Paare im Bestand haben dieselbe Adresse und sind trotzdem zwei echte,
 * getrennte Angebote: dasselbe Haus in zwei Vermarktungsmodellen, etwa
 * "01. Hof, Ossecker Strasse 42 (Standard-Modell)" neben
 * "01. Hof, Ossecker Strasse 42 (All-inclusive-Modell)", dazu Co-Living und
 * Bestandswohnungen in Wuerzburg. Eine Regel, die nur die Adresse vergleicht,
 * wuerde sie zusammenwerfen und damit ein halbes Angebot vernichten.
 *
 * Der Unterschied liegt genau im Titel: Die echten Dubletten tragen denselben
 * Titel, die Modellvarianten nicht. Der Schluessel besteht deshalb aus
 * Adresse, Postleitzahl UND Titel. Die Normalisierung darf am Titel nur
 * Schreibweise, Leerzeichen und Umlaute glaetten, niemals den Zusatz in
 * Klammern entfernen, denn er ist hier das unterscheidende Merkmal.
 */

/**
 * Kleinschreibung, Umlaute ausgeschrieben, alles Uebrige entfernt.
 *
 * "Ossecker Straße 42" und "Ossecker Str. 42" sind dasselbe Haus, deshalb
 * wird jede Schreibweise von Strasse auf "str" gekuerzt. Das gilt auch fuer
 * den Titel, denn die Titel tragen die Strasse mit sich.
 */
function grundform(wert: string): string {
  return (wert || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    // Leerzeichen und Zeichensetzung fallen weg. Damit sind "22a" und "22 a"
    // dasselbe, ebenso "Str." und "Str".
    .replace(/[^a-z0-9]/g, "")
    .replace(/strasse/g, "str");
}

/**
 * Adresse und Postleitzahl zu einem Schluessel. Fehlt eines der beiden
 * Felder, gibt es keinen Schluessel: lieber kein Treffer als ein falscher.
 */
export function adressSchluessel(
  adresse: string | null | undefined,
  plz: string | null | undefined,
): string {
  const strasse = grundform(adresse || "");
  const postleitzahl = (plz || "").replace(/[^0-9]/g, "");
  if (!strasse || !postleitzahl) return "";
  return `${postleitzahl}|${strasse}`;
}

/**
 * Der Titel als Schluessel.
 *
 * Nur glaetten, nichts weglassen: "(Standard-Modell)" und
 * "(All-inclusive-Modell)" muessen verschieden bleiben.
 */
export function titelSchluessel(titel: string | null | undefined): string {
  return grundform(titel || "");
}

/** Der volle Schluessel eines Hauses. Leer, wenn eine Angabe fehlt. */
export function hausSchluessel(zeile: {
  titel?: string | null;
  adresse?: string | null;
  plz?: string | null;
}): string {
  const adresse = adressSchluessel(zeile.adresse, zeile.plz);
  const titel = titelSchluessel(zeile.titel);
  if (!adresse || !titel) return "";
  return `${adresse}|${titel}`;
}

export interface AdressZeile {
  id: string;
  titel?: string | null;
  adresse?: string | null;
  plz?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface AdressEintrag {
  id: string;
  titel: string;
  /** Die Hauptkennung. Leer bei einem von Hand angelegten Objekt. */
  slug: string;
}

export type AdressIndex = Map<string, AdressEintrag[]>;

/**
 * Alle Kennungen eines Objekts: die Hauptkennung und die spaeter
 * dazugekommenen Zweitkennungen.
 */
export function slugsVon(meta: Record<string, unknown> | null | undefined): string[] {
  const haupt = typeof meta?.investagonSlug === "string"
    ? [meta.investagonSlug]
    : [];
  const weitere = Array.isArray(meta?.investagonSlugsWeitere)
    ? (meta!.investagonSlugsWeitere as unknown[]).filter((s): s is string =>
      typeof s === "string" && s.length > 0
    )
    : [];
  return [...haupt, ...weitere].filter(Boolean);
}

export function eintragen(index: AdressIndex, zeile: AdressZeile): void {
  const schluessel = hausSchluessel(zeile);
  if (!schluessel) return;
  const bisher = index.get(schluessel) || [];
  if (bisher.some((e) => e.id === zeile.id)) return;
  bisher.push({
    id: zeile.id,
    titel: zeile.titel || "",
    slug: typeof zeile.meta?.investagonSlug === "string"
      ? zeile.meta.investagonSlug
      : "",
  });
  index.set(schluessel, bisher);
}

export function baueAdressIndex(zeilen: AdressZeile[]): AdressIndex {
  const index: AdressIndex = new Map();
  for (const zeile of zeilen) eintragen(index, zeile);
  return index;
}

export type Treffer =
  | { art: "keiner" }
  /** Mehrere Objekte teilen sich Adresse und Titel, etwa der heutige
   * Doppelbestand. Dann wird nichts zusammengefuehrt, sondern gemeldet. */
  | { art: "mehrdeutig"; anzahl: number }
  /** Ein vom Import gepflegtes Objekt. Nur das darf eine Zweitkennung bekommen. */
  | { art: "import"; id: string; titel: string; slug: string }
  /** Von Hand angelegt. Wird nicht uebernommen, nur als moegliche Dublette gemeldet. */
  | { art: "handarbeit"; id: string; titel: string };

/**
 * Zu einem Projekt das passende Bestandsobjekt suchen.
 *
 * Ein von Hand angelegtes Objekt wird bewusst nicht uebernommen: Es bekaeme
 * damit eine Investagon-Kennung und geriete in die Bereinigung, die Objekte
 * ohne Gegenstueck in der API loescht. Eine falsche Zusammenfuehrung waere
 * dort nicht mehr nur laestig, sondern wuerde Handarbeit vernichten.
 */
export function findeAdressTreffer(
  index: AdressIndex,
  projekt: { name?: string | null; adresse?: string | null; plz?: string | null },
): Treffer {
  const schluessel = hausSchluessel({
    titel: projekt.name,
    adresse: projekt.adresse,
    plz: projekt.plz,
  });
  if (!schluessel) return { art: "keiner" };
  const treffer = index.get(schluessel) || [];
  if (treffer.length === 0) return { art: "keiner" };
  if (treffer.length > 1) return { art: "mehrdeutig", anzahl: treffer.length };
  const eintrag = treffer[0];
  if (!eintrag.slug) return { art: "handarbeit", id: eintrag.id, titel: eintrag.titel };
  return { art: "import", id: eintrag.id, titel: eintrag.titel, slug: eintrag.slug };
}

/**
 * Das `meta` eines uebernommenen Objekts um die neue Kennung ergaenzen.
 *
 * Die Hauptkennung bleibt, wie sie ist. Sie ist der Schluessel, an dem die
 * Bereinigung und der Abgleich haengen; sie umzuschreiben wuerde das Objekt
 * fuer den urspruenglichen Zugang unsichtbar machen. Die neue Kennung kommt
 * daneben, und im Klartext steht dabei, wann und warum.
 */
export function mitZweitkennung(
  meta: Record<string, unknown> | null | undefined,
  slug: string,
  bautraeger: string,
): Record<string, unknown> {
  const vorhanden = Array.isArray(meta?.investagonSlugsWeitere)
    ? (meta!.investagonSlugsWeitere as unknown[]).filter((s): s is string =>
      typeof s === "string"
    )
    : [];
  if (vorhanden.includes(slug) || meta?.investagonSlug === slug) {
    return { investagonSlugsWeitere: vorhanden };
  }
  return {
    investagonSlugsWeitere: [...vorhanden, slug],
    investagonZweitkennungen: {
      ...(typeof meta?.investagonZweitkennungen === "object" &&
          meta?.investagonZweitkennungen !== null
        ? meta.investagonZweitkennungen as Record<string, unknown>
        : {}),
      [slug]: {
        erkanntAm: new Date().toISOString().slice(0, 10),
        ueber: "Adresse und Titel",
        bautraeger,
      },
    },
  };
}
