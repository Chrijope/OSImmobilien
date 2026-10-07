/**
 * Dateien eines zusammengeführten Kontakts in die Ordner des behaltenen
 * verschieben (Entscheidung Christian, 26.09.2026).
 *
 * Warum: Die Leseregeln des Kundenportals hängen am Ordnernamen, also an der
 * Kontakt-ID (`kundenordner/<Kontakt>/…`, `reservierung/<Kontakt>/…`, …).
 * Nach dem Zusammenführen lagen die Dateien des neueren Kontakts weiter unter
 * seiner ID. Wer den Portalzugang übernahm, sah sie nicht.
 *
 * Reihenfolge, damit nie ein Verweis ins Leere zeigt:
 *   1. kopieren (nie überschreiben, bei Namenskonflikt Suffix „_aus-MI-…“),
 *   2. alle Verweise in der Datenbank in einem Schritt umschreiben,
 *   3. erst dann die alten Dateien löschen.
 * Scheitert Schritt 2, bleiben die alten Dateien und Verweise unverändert,
 * die Kopien werden beim nächsten Versuch wiedererkannt (gleiche Größe und
 * gleicher eTag) und nicht doppelt angelegt. Der Ablauf ist wiederholbar.
 *
 * Rein und ohne Supabase, damit er in Vitest und in Deno läuft. Die Edge
 * Function `kontakte-zusammenfuehren-dateien` reicht den Speicher hinein.
 */

/** Ordner im Eimer `unterlagen`, die mit der Kontakt-ID beginnen ("" = Wurzel). */
export const KONTAKT_ORDNER_PRAEFIXE: readonly string[] = [
  "",
  "kundenordner/",
  "finanzierung/",
  "finanzierung/eigen/",
  "kaufvertrag/",
  "notarfotos/",
  "selbstauskunft-papier/",
  "reservierung/",
  "aftersales/",
  "kunde-dokumente/",
];

/** Platzhalter, den Supabase für leere Ordner anlegt; kein Kundendokument. */
const PLATZHALTER = ".emptyFolderPlaceholder";

/** Höchstens so viele Suffix-Versuche je Datei, danach gilt sie als nicht verschiebbar. */
const MAX_VERSUCHE = 50;

export interface Eintrag {
  name: string;
  istOrdner: boolean;
  size?: number | null;
  etag?: string | null;
}

export interface Speicher {
  /** Alle Einträge eines Ordners (ohne Unterordner-Inhalt). Leerer Ordner = []. */
  liste(ordner: string): Promise<Eintrag[]>;
  /** Kopiert, überschreibt nie (Supabase lehnt ein vorhandenes Ziel ab). */
  kopiere(von: string, nach: string): Promise<void>;
  /** Löscht die Pfade; Rückgabe: Pfade, die nicht gelöscht werden konnten. */
  loesche(pfade: string[]): Promise<string[]>;
}

/** Schreibt alle Datenbankverweise alt → neu in einem Schritt um. Wirft bei Fehler. */
export type Umschreiber = (abbildung: Record<string, string>) => Promise<void>;

export interface VerschiebeErgebnis {
  /** Dateien, die jetzt unter dem behaltenen Kontakt liegen und verwiesen sind. */
  verschoben: number;
  /** Namenskonflikte: die Datei liegt unter einem neuen Namen. */
  umbenannt: { von: string; nach: string }[];
  /** Nicht verschoben; Datei und Verweis sind unverändert am alten Ort. */
  nichtVerschoben: { pfad: string; grund: string }[];
  /** Verschoben und verwiesen, nur die alte Kopie ließ sich nicht löschen. */
  alteNichtEntfernt: string[];
}

/** „MI-00042“ aus meta.moreId bzw. meta.kundenNr, sonst die ersten acht Zeichen der ID. */
export function kontaktKennung(id: string, meta: unknown): string {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const roh = String(m.moreId ?? m.kundenNr ?? "").match(/^\s*(\d{1,18})/)?.[1];
  const nr = roh ? Number(roh) : 0;
  return nr > 0 ? `MI-${String(nr).padStart(5, "0")}` : id.slice(0, 8);
}

/**
 * Der gleiche Pfad unter der ID des behaltenen Kontakts. Ersetzt wird nur ein
 * ganzer Pfadabschnitt, der genau der alten ID entspricht. Ohne ihn: null.
 */
export function zielPfad(pfad: string, vonId: string, nachId: string): string | null {
  const teile = pfad.split("/");
  const i = teile.indexOf(vonId);
  if (i < 0) return null;
  teile[i] = nachId;
  return teile.join("/");
}

/** „a/b/vertrag.pdf“ → „a/b/vertrag_aus-MI-00042.pdf“, ab dem 2. Versuch „…_aus-MI-00042-2.pdf“. */
export function konfliktName(pfad: string, kennung: string, versuch = 1): string {
  const schnitt = pfad.lastIndexOf("/");
  const ordner = pfad.slice(0, schnitt + 1);
  const datei = pfad.slice(schnitt + 1);
  const punkt = datei.lastIndexOf(".");
  const basis = punkt > 0 ? datei.slice(0, punkt) : datei;
  const endung = punkt > 0 ? datei.slice(punkt) : "";
  return `${ordner}${basis}_aus-${kennung}${versuch > 1 ? `-${versuch}` : ""}${endung}`;
}

/** Dieselbe Datei? Nur wenn Größe UND eTag bekannt und gleich sind. Im Zweifel nein. */
export function gleicheDatei(a?: Eintrag, b?: Eintrag): boolean {
  if (!a || !b) return false;
  if (a.size == null || b.size == null || !a.etag || !b.etag) return false;
  return a.size === b.size && a.etag === b.etag;
}

function ordnerVon(pfad: string): string {
  const schnitt = pfad.lastIndexOf("/");
  return schnitt < 0 ? "" : pfad.slice(0, schnitt);
}

function nameVon(pfad: string): string {
  return pfad.slice(pfad.lastIndexOf("/") + 1);
}

async function listeRekursiv(speicher: Speicher, start: string): Promise<{ pfad: string; eintrag: Eintrag }[]> {
  const dateien: { pfad: string; eintrag: Eintrag }[] = [];
  const offen = [start];
  while (offen.length > 0) {
    const ordner = offen.shift()!;
    for (const e of await speicher.liste(ordner)) {
      const pfad = `${ordner}/${e.name}`;
      if (e.istOrdner) offen.push(pfad);
      else if (e.name !== PLATZHALTER) dateien.push({ pfad, eintrag: e });
    }
  }
  return dateien;
}

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function verschiebeKontaktDateien(opts: {
  speicher: Speicher;
  umschreiben: Umschreiber;
  vonId: string;
  nachId: string;
  kennung: string;
}): Promise<VerschiebeErgebnis> {
  const { speicher, umschreiben, vonId, nachId, kennung } = opts;
  const ergebnis: VerschiebeErgebnis = { verschoben: 0, umbenannt: [], nichtVerschoben: [], alteNichtEntfernt: [] };

  // 1) Alle Dateien des aufgelösten Kontakts finden.
  const quellen: { pfad: string; eintrag: Eintrag }[] = [];
  for (const praefix of KONTAKT_ORDNER_PRAEFIXE) {
    try {
      quellen.push(...await listeRekursiv(speicher, `${praefix}${vonId}`));
    } catch (e) {
      ergebnis.nichtVerschoben.push({ pfad: `${praefix}${vonId}/`, grund: `Ordner nicht lesbar: ${fehlerText(e)}` });
    }
  }

  // 2) Kopieren. Zielordner werden einmal gelesen und danach mitgeführt.
  const zielOrdner = new Map<string, Map<string, Eintrag>>();
  const vorhandenIn = async (ordner: string) => {
    let karte = zielOrdner.get(ordner);
    if (!karte) {
      karte = new Map((await speicher.liste(ordner)).filter((e) => !e.istOrdner).map((e) => [e.name, e]));
      zielOrdner.set(ordner, karte);
    }
    return karte;
  };

  const abbildung: Record<string, string> = {};
  const umbenannt: { von: string; nach: string }[] = [];
  for (const { pfad, eintrag } of quellen) {
    const basis = zielPfad(pfad, vonId, nachId);
    if (!basis) {
      ergebnis.nichtVerschoben.push({ pfad, grund: "Zielpfad nicht bestimmbar" });
      continue;
    }
    try {
      const vorhanden = await vorhandenIn(ordnerVon(basis));
      let ziel: string | null = null;
      let kopieren = true;
      for (let versuch = 0; versuch <= MAX_VERSUCHE; versuch++) {
        const kandidat = versuch === 0 ? basis : konfliktName(basis, kennung, versuch);
        const da = vorhanden.get(nameVon(kandidat));
        if (!da) { ziel = kandidat; break; }
        // Schon da und gleich: ein früherer Lauf hat kopiert. Wiederverwenden.
        if (gleicheDatei(da, eintrag)) { ziel = kandidat; kopieren = false; break; }
      }
      if (!ziel) {
        ergebnis.nichtVerschoben.push({ pfad, grund: "Kein freier Dateiname gefunden" });
        continue;
      }
      if (kopieren) {
        await speicher.kopiere(pfad, ziel);
        vorhanden.set(nameVon(ziel), { ...eintrag, name: nameVon(ziel) });
      }
      abbildung[pfad] = ziel;
      if (ziel !== basis) umbenannt.push({ von: pfad, nach: ziel });
    } catch (e) {
      ergebnis.nichtVerschoben.push({ pfad, grund: `Kopieren fehlgeschlagen: ${fehlerText(e)}` });
    }
  }

  const alte = Object.keys(abbildung);
  if (alte.length === 0) return ergebnis;

  // 3) Verweise umschreiben. Scheitert das, bleibt alles beim Alten.
  try {
    await umschreiben(abbildung);
  } catch (e) {
    const grund = `Verweise nicht umgeschrieben: ${fehlerText(e)}`;
    for (const pfad of alte) ergebnis.nichtVerschoben.push({ pfad, grund });
    return ergebnis;
  }
  ergebnis.verschoben = alte.length;
  ergebnis.umbenannt = umbenannt;

  // 4) Erst jetzt die alten Dateien löschen, in Blöcken zu 100.
  for (let i = 0; i < alte.length; i += 100) {
    ergebnis.alteNichtEntfernt.push(...await speicher.loesche(alte.slice(i, i + 100)));
  }
  return ergebnis;
}
