/**
 * Geburtstage für das Dashboard.
 *
 * Die alte Karte hatte drei Schwächen, die hier behoben sind:
 *
 * Sie zeigte nur Teammitglieder. Für ein Vertriebs-CRM ist der Geburtstagsanruf
 * beim Bestandskunden einer der besten Gesprächsaufhänger, der fehlte komplett.
 *
 * Sie rechnete in Wochen- und Monatsgrenzen. An einem Samstag war der
 * Wochenblock leer, und am 29. eines Monats sah man die ersten Tage des
 * Folgemonats nicht. Jetzt gilt ein rollierendes Fenster.
 *
 * Und sie warf das Geburtsjahr beim Einlesen weg, obwohl es in den Daten steht.
 * Das Alter ist genau die Information, die ein Anruf braucht.
 */

export type GeburtstagQuelle = "team" | "kunde";

export interface GeburtstagEintrag {
  id: string;
  name: string;
  /** Rolle beim Team, Bezeichnung wie "Kunde" bei Kontakten. */
  bezeichnung: string;
  quelle: GeburtstagQuelle;
  /** Tage bis zum Geburtstag, 0 bedeutet heute. */
  tageBis: number;
  /** Alter, das die Person an diesem Geburtstag erreicht. Ohne Jahr undefined. */
  alter?: number;
  /** Lesbares Datum, etwa "Mi., 05.06.". */
  datumLabel: string;
}

const WOCHENTAG = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

export interface GeburtsDatum {
  tag: number;
  monat: number;
  jahr?: number;
}

/** Liest TT.MM.JJJJ, TT.MM., JJJJ-MM-TT und MM-TT. */
export function leseGeburtstag(roh?: string | null): GeburtsDatum | null {
  const s = (roh || "").trim();
  if (!s) return null;

  if (s.includes(".")) {
    const teile = s.split(".").filter((t) => t !== "");
    if (teile.length < 2) return null;
    const tag = parseInt(teile[0], 10);
    const monat = parseInt(teile[1], 10);
    const jahr = teile.length >= 3 ? parseInt(teile[2], 10) : undefined;
    if (!gueltig(tag, monat)) return null;
    return { tag, monat, jahr: jahr && jahr > 1900 ? jahr : undefined };
  }

  if (s.includes("-")) {
    const teile = s.split("-");
    if (teile.length === 3) {
      const jahr = parseInt(teile[0], 10);
      const monat = parseInt(teile[1], 10);
      const tag = parseInt(teile[2].slice(0, 2), 10);
      if (!gueltig(tag, monat)) return null;
      return { tag, monat, jahr: jahr > 1900 ? jahr : undefined };
    }
    if (teile.length === 2) {
      const monat = parseInt(teile[0], 10);
      const tag = parseInt(teile[1], 10);
      if (!gueltig(tag, monat)) return null;
      return { tag, monat };
    }
  }
  return null;
}

function gueltig(tag: number, monat: number): boolean {
  return Number.isFinite(tag) && Number.isFinite(monat) && tag >= 1 && tag <= 31 && monat >= 1 && monat <= 12;
}

/**
 * Tage bis zum nächsten Geburtstag, 0 bedeutet heute.
 * Der 29. Februar wird in Nicht-Schaltjahren auf den 28. gelegt, sonst fiele
 * er drei von vier Jahren komplett aus der Anzeige.
 */
export function tageBisGeburtstag(g: GeburtsDatum, heute: Date = new Date()): number {
  const start = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());

  const kandidat = (jahr: number): Date => {
    if (g.monat === 2 && g.tag === 29 && !istSchaltjahr(jahr)) {
      return new Date(jahr, 1, 28);
    }
    return new Date(jahr, g.monat - 1, g.tag);
  };

  let ziel = kandidat(start.getFullYear());
  if (ziel.getTime() < start.getTime()) ziel = kandidat(start.getFullYear() + 1);

  return Math.round((ziel.getTime() - start.getTime()) / 86400000);
}

function istSchaltjahr(jahr: number): boolean {
  return (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
}

/** Alter, das die Person an ihrem nächsten Geburtstag erreicht. */
export function alterAmGeburtstag(g: GeburtsDatum, heute: Date = new Date()): number | undefined {
  if (!g.jahr) return undefined;
  const tage = tageBisGeburtstag(g, heute);
  const zielJahr = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + tage).getFullYear();
  const alter = zielJahr - g.jahr;
  return alter > 0 && alter < 120 ? alter : undefined;
}

export function datumLabel(g: GeburtsDatum, heute: Date = new Date()): string {
  const tage = tageBisGeburtstag(g, heute);
  const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + tage);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${WOCHENTAG[d.getDay()]}, ${dd}.${mm}.`;
}

export interface RohGeburtstag {
  id: string;
  name: string;
  bezeichnung: string;
  quelle: GeburtstagQuelle;
  geburtstag?: string | null;
}

/**
 * Baut die Anzeigeliste: alle Geburtstage innerhalb des Fensters, nach
 * Nähe sortiert.
 *
 * @param fensterTage Wie weit nach vorne geschaut wird. 30 Tage sind der
 *                    Kompromiss zwischen Vorlauf und Länge der Liste.
 */
export function sammleGeburtstage(
  rohe: RohGeburtstag[],
  fensterTage = 30,
  heute: Date = new Date(),
): GeburtstagEintrag[] {
  const out: GeburtstagEintrag[] = [];
  for (const r of rohe) {
    const g = leseGeburtstag(r.geburtstag);
    if (!g) continue;
    const tageBis = tageBisGeburtstag(g, heute);
    if (tageBis > fensterTage) continue;
    out.push({
      id: r.id,
      name: r.name,
      bezeichnung: r.bezeichnung,
      quelle: r.quelle,
      tageBis,
      alter: alterAmGeburtstag(g, heute),
      datumLabel: datumLabel(g, heute),
    });
  }
  out.sort((a, b) => a.tageBis - b.tageBis || a.name.localeCompare(b.name));
  return out;
}

/** Vollständige Rollenbezeichnungen. In der alten Karte fehlten fünf davon. */
export const ROLLEN_LABEL: Record<string, string> = {
  inhaber: "Super Admin",
  admin: "Admin",
  vertriebsleiter: "Vertriebsleiter",
  vertriebspartner: "Vertriebspartner",
  objektpartner: "Objektpartner",
  finanzierungspartner: "Finanzierungspartner",
  versicherungsexperte: "Versicherungsexperte",
  hausverwaltung: "Hausverwaltung",
  buchhaltung: "Buchhaltung",
  backoffice: "Backoffice",
  setterin: "Setter",
  marketing: "Marketing",
  hr: "Personal",
  individuell: "Individuell",
  bewerber: "Bewerber",
  testaccount: "Testaccount",
};
