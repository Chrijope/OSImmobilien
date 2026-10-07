/**
 * Welche Unterlagen die Objekttexte mitlesen, in welcher Reihenfolge, und
 * welche nie.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Bis zum 23.09.2026 las `objekt-texte-ki` nur Dokumente der Kategorie
 * „objektunterlagen“ am Objekt selbst. Der Investagon-Import legt seine
 * Dateien aber als „intern“ ab (`investagon-import/bilder.ts`), und viele
 * liegen an den Einheiten (`wohnungs_dokumente`). Das Exposé des Bauträgers
 * kam so fast nie beim Modell an. Christian will die Beschreibung aber „aus
 * den gesamten Objektunterlagen“.
 *
 * Gelesen werden deshalb alle Unterlagen von Objekt und Einheiten, mit zwei
 * Filtern davor:
 *
 *   1. Ausgeschlossen sind Unterlagen mit Personendaten oder Vertragsinhalt:
 *      Mietverträge, Mieterhöhungen, Mieterlisten, Grundbuchauszüge,
 *      Reservierungen, Kaufverträge und Muster, Vollmachten, Abrechnungen,
 *      Protokolle, Selbstauskünfte. Sie gehören nicht in einen Werbetext,
 *      und das Modell soll sie gar nicht erst sehen.
 *   2. Nur PDFs. Das Sprachmodell liest über den Gateway PDFs und Bilder; ein
 *      Word- oder Excel-Anhang lässt die ganze Anfrage scheitern.
 *
 * Der Rest wird nach Nutzen sortiert, wie Christian es vorgibt: Exposé,
 * Objektbeschreibung, Baubeschreibung, Lage, Energieausweis, Wirtschaftsplan,
 * danach Grundrisse und Flächen, zuletzt alles Übrige.
 *
 * EIGENE STICHWORTLISTE
 *
 * Die Oberbegriffe der Dokumentenliste (`dokument-gruppen.ts`) entstehen
 * gerade an anderer Stelle. Diese Datei hat bewusst eine eigene, kleine Liste
 * nur für Ausschluss und Reihenfolge. Sie entscheidet nichts darüber, was ein
 * Kunde sieht.
 *
 * Reine Rechnung ohne Deno-Eigenheiten, getestet in
 * `src/lib/objektTexteUnterlagen.test.ts`.
 */
import { sichererSpeicherpfad } from "./speicherpfad.ts";

/**
 * Höchstens so viele Unterlagen je Lauf.
 *
 * Sechs decken Christians Liste ab: Exposé, Objektbeschreibung,
 * Baubeschreibung, Lage, Energieausweis, Wirtschaftsplan. Mehr bringt dem
 * Modell selten Neues, kostet aber Zeit und Guthaben.
 */
export const MAX_UNTERLAGEN = 6;

/**
 * Höchstens so groß darf eine einzelne Unterlage sein.
 *
 * Ein Exposé mit vielen Fotos hat schnell 20 MB und mehr. Es allein würde das
 * ganze Kontingent verbrauchen; kleinere, textreiche Unterlagen helfen mehr.
 */
export const MAX_BYTES_JE_UNTERLAGE = 8 * 1024 * 1024;

/**
 * Höchstens so viele Bytes zusammen, vor der Umwandlung.
 *
 * Begründung für 12 MB: Jedes PDF geht als Base64 in die Anfrage und wird
 * dabei um ein Drittel größer, 12 MB werden also rund 16 MB. Das liegt unter
 * den 20 MB, die Gemini früher für eingebettete Daten je Anfrage erlaubte;
 * wie viel der Lovable AI Gateway annimmt, ist nicht dokumentiert, und so
 * bleibt Luft. Im Arbeitsspeicher der Function (256 MB) liegen die Bytes
 * zeitweise vier- bis fünffach (Datei, Binärtext, Base64, Anfragerumpf), also
 * unter 80 MB. Scheitert eine Anfrage trotzdem, wiederholt die Function sie
 * ohne Anhänge.
 */
export const MAX_BYTES_GESAMT = 12 * 1024 * 1024;

/** Ein Dokument, das als Unterlage in Frage kommt. */
export interface UnterlagenKandidat {
  name: string;
  url: string;
  /** Am Objekt oder an einer Einheit. Objekt zuerst, bei gleichem Rang. */
  herkunft: "objekt" | "einheit";
  /** Die Investagon-Kategorie, falls bekannt, etwa „expose“ oder „rental_agreement“. */
  investagonKategorie?: string;
  /** Die Einheit einer Einheitsunterlage, für die Ablageprüfung in `dokumentAblage`. */
  wohnungId?: string;
}

/** Warum eine Unterlage nicht mitgelesen wird. */
export interface AusgelasseneUnterlage {
  name: string;
  grund: string;
}

/**
 * Ein Titel in einer Form, in der sich Stichworte verlässlich finden lassen:
 * klein, Umlaute ausgeschrieben, Akzente weg, alles außer Buchstaben und
 * Ziffern wird zum Leerzeichen. „Mietvertrag_WE 03.pdf“ wird zu
 * „mietvertrag we 03 pdf“.
 */
export function normalisiereName(name: string): string {
  return (name || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Steht die Abkürzung als eigenes Wort da? Eine folgende Ziffer zählt mit („GB115615“). */
function enthaeltWort(normalisiert: string, wort: string): boolean {
  return new RegExp(`(?:^| )${wort}(?= |$|\\d)`).test(normalisiert);
}

/** Beginnt eines der Wörter mit diesem Anfang? „Lageplan“ ja, „Anlage“ nein. */
function wortBeginntMit(normalisiert: string, anfang: string): boolean {
  return normalisiert.split(" ").some((w) => w.startsWith(anfang));
}

/**
 * Wortteile, die eine Unterlage ausschließen.
 *
 * „miet“ fängt Mietvertrag, Mieterhöhung, Mieterliste und Mietaufstellung,
 * „vertrag“ jeden Vertrag. Beides mit Absicht breit: Lieber eine harmlose
 * Unterlage zu wenig als ein Mietername im Werbetext.
 */
const AUSSCHLUSS_TEILE: ReadonlyArray<{ teil: string; grund: string }> = [
  { teil: "miet", grund: "Mietunterlage mit Personendaten" },
  { teil: "kaution", grund: "Mietunterlage mit Personendaten" },
  { teil: "uebergabeprotokoll", grund: "Mietunterlage mit Personendaten" },
  { teil: "grundbuch", grund: "Grundbuchauszug mit Personendaten" },
  { teil: "reservierung", grund: "Vertragsunterlage" },
  { teil: "kaufvertrag", grund: "Vertragsunterlage" },
  { teil: "kaufangebot", grund: "Vertragsunterlage" },
  { teil: "vertrag", grund: "Vertragsunterlage" },
  { teil: "muster kv", grund: "Vertragsunterlage" },
  { teil: "notar", grund: "Vertragsunterlage" },
  { teil: "vollmacht", grund: "Vertragsunterlage" },
  { teil: "selbstauskunft", grund: "Unterlage mit Personendaten" },
  { teil: "personalausweis", grund: "Unterlage mit Personendaten" },
  { teil: "ausweiskopie", grund: "Unterlage mit Personendaten" },
  { teil: "schufa", grund: "Unterlage mit Personendaten" },
  { teil: "bonitaet", grund: "Unterlage mit Personendaten" },
  { teil: "gehalt", grund: "Unterlage mit Personendaten" },
  { teil: "kontoauszug", grund: "Unterlage mit Personendaten" },
  { teil: "abrechnung", grund: "Abrechnung mit Personendaten" },
  { teil: "protokoll", grund: "Protokoll mit Personendaten" },
  { teil: "eigentuemerversammlung", grund: "Protokoll mit Personendaten" },
  { teil: "beschluss", grund: "Protokoll mit Personendaten" },
];

/**
 * Wortanfänge, die ausschließen. „Rechnung“ nur am Wortanfang, sonst fiele
 * auch die Wohnflächenberechnung heraus, und die ist erwünscht.
 */
const AUSSCHLUSS_ANFAENGE: ReadonlyArray<{ anfang: string; grund: string }> = [
  { anfang: "rechnung", grund: "Unterlage mit Personendaten" },
];

/** Abkürzungen, die nur als eigenes Wort ausschließen, sonst fände „gb“ auch „Abgabe“. */
const AUSSCHLUSS_WOERTER: ReadonlyArray<{ wort: string; grund: string }> = [
  { wort: "kv", grund: "Vertragsunterlage" },
  { wort: "gb", grund: "Grundbuchauszug mit Personendaten" },
  { wort: "gba", grund: "Grundbuchauszug mit Personendaten" },
  { wort: "etv", grund: "Protokoll mit Personendaten" },
];

/** Investagon-Kategorien, die ausgeschlossen sind, gleich wie die Datei heißt. */
const AUSSCHLUSS_KATEGORIEN: Readonly<Record<string, string>> = {
  rental_agreement: "Mietunterlage mit Personendaten",
  land_register: "Grundbuchauszug mit Personendaten",
  settlements: "Abrechnung mit Personendaten",
};

/**
 * Die Ränge, kleiner zuerst. Christians Reihenfolge, danach Grundrisse und
 * Flächen, zuletzt alles, was keine Regel trifft.
 */
export const UNTERLAGEN_RAENGE = [
  "Exposé",
  "Objektbeschreibung",
  "Baubeschreibung",
  "Lage",
  "Energieausweis",
  "Wirtschaftsplan",
  "Grundriss und Fläche",
  "Sonstiges",
] as const;

export type UnterlagenArt = (typeof UNTERLAGEN_RAENGE)[number];

const ART_JE_KATEGORIE: Readonly<Record<string, UnterlagenArt>> = {
  expose: "Exposé",
  energy_certificate: "Energieausweis",
  economic_plan: "Wirtschaftsplan",
  layout: "Grundriss und Fläche",
  site_plan: "Lage",
  living_area_calculation: "Grundriss und Fläche",
};

/** Die Art einer Unterlage aus ihrem Namen, geprüft von oben nach unten. */
function artAusName(n: string): UnterlagenArt {
  // Baubeschreibung vor der allgemeinen Beschreibung, sonst landet sie dort.
  if (["baubeschreibung", "leistungsbeschreibung", "ausstattung", "sanierung", "modernisierung"].some((t) => n.includes(t))) {
    return "Baubeschreibung";
  }
  if (["expose", "objektvorstellung", "praesentation", "broschuere", "flyer", "verkaufsprospekt"].some((t) => n.includes(t))) {
    return "Exposé";
  }
  if (n.includes("objektbeschreibung")) return "Objektbeschreibung";
  // Lage vor der allgemeinen Beschreibung, sonst wird die Lagebeschreibung zur Objektbeschreibung.
  if (wortBeginntMit(n, "lage") || ["mikrolage", "makrolage", "standort", "umgebung"].some((t) => n.includes(t))) {
    return "Lage";
  }
  if (["beschreibung", "objektinfo", "objektdaten", "steckbrief"].some((t) => n.includes(t))) {
    return "Objektbeschreibung";
  }
  if (wortBeginntMit(n, "energie")) return "Energieausweis";
  if (n.includes("wirtschaftsplan")) return "Wirtschaftsplan";
  if (["grundriss", "flaeche", "wohnflaeche", "aufteilungsplan"].some((t) => n.includes(t)) || enthaeltWort(n, "wfl")) {
    return "Grundriss und Fläche";
  }
  return "Sonstiges";
}

/**
 * Wie eine Unterlage eingeordnet wird: ausgeschlossen mit Grund, oder mit
 * Art und Rang.
 */
export function ordneUnterlageEin(
  name: string,
  investagonKategorie?: string,
): { ausschluss: string } | { art: UnterlagenArt; rang: number } {
  const kategorie = (investagonKategorie || "").trim();
  if (AUSSCHLUSS_KATEGORIEN[kategorie]) return { ausschluss: AUSSCHLUSS_KATEGORIEN[kategorie] };
  const n = normalisiereName(name);
  const teil = AUSSCHLUSS_TEILE.find((a) => n.includes(a.teil));
  if (teil) return { ausschluss: teil.grund };
  const anfang = AUSSCHLUSS_ANFAENGE.find((a) => wortBeginntMit(n, a.anfang));
  if (anfang) return { ausschluss: anfang.grund };
  const wort = AUSSCHLUSS_WOERTER.find((a) => enthaeltWort(n, a.wort));
  if (wort) return { ausschluss: wort.grund };
  const art = ART_JE_KATEGORIE[kategorie] ?? artAusName(n);
  return { art, rang: UNTERLAGEN_RAENGE.indexOf(art) };
}

/** Die Endung aus Name oder Ablageadresse, klein, ohne Punkt. */
function endung(wert: string): string {
  const ohneAnhang = (wert || "").split(/[?#]/)[0];
  const letztes = ohneAnhang.split("/").pop() || "";
  const treffer = /\.([a-z0-9]{2,5})$/i.exec(letztes);
  return treffer ? treffer[1].toLowerCase() : "";
}

/**
 * Ist die Unterlage erkennbar kein PDF?
 *
 * Entschieden wird an der Endung von Adresse oder Name. Ohne Endung bleibt die
 * Antwort offen, dann entscheidet nach dem Laden der Dateianfang
 * (`beginntWiePdf`).
 */
export function erkennbarKeinPdf(kandidat: Pick<UnterlagenKandidat, "name" | "url">): boolean {
  const art = endung(kandidat.url) || endung(kandidat.name);
  return !!art && art !== "pdf";
}

/** Beginnt der Inhalt wie ein PDF („%PDF-“)? */
export function beginntWiePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/**
 * Die Reihenfolge der Unterlagen, bevor eine einzige geladen wird.
 *
 * Doppelte fallen heraus: dieselbe Ablage und derselbe Name. Investagon hängt
 * dasselbe Exposé gern an jede Einheit. Die Liste ist länger als
 * `MAX_UNTERLAGEN`, denn beim Laden fallen noch welche weg (zu groß, nicht
 * lesbar, doch kein PDF). Die Function hört auf, sobald genug beisammen sind.
 */
export function ordneUnterlagen(
  kandidaten: UnterlagenKandidat[],
): { reihenfolge: Array<UnterlagenKandidat & { art: UnterlagenArt }>; ausgelassen: AusgelasseneUnterlage[] } {
  const ausgelassen: AusgelasseneUnterlage[] = [];
  const gesehenUrl = new Set<string>();
  const gesehenName = new Set<string>();
  const liste: Array<UnterlagenKandidat & { art: UnterlagenArt; rang: number; platz: number }> = [];

  (kandidaten || []).forEach((k, platz) => {
    if (!k || typeof k.url !== "string" || !k.url.trim()) return;
    const name = (k.name || "").trim() || "Unterlage";
    const einordnung = ordneUnterlageEin(name, k.investagonKategorie);
    if ("ausschluss" in einordnung) {
      ausgelassen.push({ name, grund: einordnung.ausschluss });
      return;
    }
    if (erkennbarKeinPdf(k)) {
      ausgelassen.push({ name, grund: "kein PDF" });
      return;
    }
    const nameSchluessel = normalisiereName(name.replace(/\.[a-z0-9]{2,5}$/i, ""));
    if (gesehenUrl.has(k.url) || (nameSchluessel && gesehenName.has(nameSchluessel))) return;
    gesehenUrl.add(k.url);
    if (nameSchluessel) gesehenName.add(nameSchluessel);
    liste.push({ ...k, name, art: einordnung.art, rang: einordnung.rang, platz });
  });

  liste.sort((a, b) =>
    a.rang - b.rang ||
    (a.herkunft === b.herkunft ? 0 : a.herkunft === "objekt" ? -1 : 1) ||
    a.platz - b.platz
  );
  return { reihenfolge: liste.map(({ rang: _rang, platz: _platz, ...rest }) => rest), ausgelassen };
}

/**
 * Die Investagon-Kategorie je Dateiname, aus `meta.investagonRaw.files`.
 *
 * Der Import schreibt in die Dokumentzeile nur den Titel der Datei oder
 * ersatzweise ihren Originalnamen. Über beides findet die Zeile ihre
 * Kategorie wieder. Kleine eigene Fassung derselben Suche wie in
 * `dokument-gruppen.ts`, damit diese Datei nicht an einer entstehenden hängt.
 */
export function investagonKategorien(roh: unknown): (name: string) => string | undefined {
  const nachName = new Map<string, string>();
  const dateien = roh && typeof roh === "object" && !Array.isArray(roh)
    ? (roh as Record<string, unknown>).files
    : Array.isArray(roh) ? roh : undefined;
  for (const datei of Array.isArray(dateien) ? dateien : []) {
    if (!datei || typeof datei !== "object") continue;
    const d = datei as Record<string, unknown>;
    const kategorie = typeof d.category === "string" ? d.category.trim() : "";
    if (!kategorie) continue;
    const pfad = typeof d.filename === "string" ? d.filename : "";
    const original = typeof d.original_filename === "string" ? d.original_filename : pfad.split(/[?#]/)[0].split("/").pop() || "";
    for (const schluessel of [typeof d.title === "string" ? d.title : "", original]) {
      const n = normalisiereName(schluessel);
      if (n && !nachName.has(n)) nachName.set(n, kategorie);
    }
  }
  return (name) => (nachName.size === 0 ? undefined : nachName.get(normalisiereName(name)));
}

/** Zeiger auf die geschützten Eimer, siehe `src/lib/storage.ts`. */
const OBJEKT_DOKUMENT_ZEIGER = "/objekt-dokument/";
const INVESTAGON_DOKUMENT_ZEIGER = "/investagon-dokument/";

/** Wozu eine Unterlage gehört: das Objekt und, bei einer Einheitsunterlage, die Einheit. */
export interface DokumentBezug {
  objektId: string;
  wohnungId?: string | null;
  ebene: "objekt" | "einheit";
}

/** Seit dem 28.09.2026 die gemeinsame strenge Prüfung (`speicherpfad.ts`, LOTSE-R5-001). */
const sichererPfad = sichererSpeicherpfad;

/**
 * Liegt der Pfad dort, wo die Schreiber Unterlagen genau dieses Bezugs ablegen?
 *
 *   objekt-dokumente, objekt-medien (Altbestand):
 *     objekte/<objektId>/dokumente/…                 Objektunterlage (`ObjektNeu`, `ObjektDetail`)
 *     objekte/<objektId>/wohnungen/<wohnungId>/…     Einheitsunterlage (`ObjektNeu`)
 *   investagon-dokumente:
 *     <objektId>/…                                   Objekt- und Einheitsunterlagen (`investagon-import/bilder.ts`)
 */
function passtZumBezug(eimer: string, pfad: string, b: DokumentBezug): boolean {
  if (!b.objektId) return false;
  if (eimer === "investagon-dokumente") return pfad.startsWith(`${b.objektId}/`);
  if (b.ebene === "objekt") return pfad.startsWith(`objekte/${b.objektId}/dokumente/`);
  return !!b.wohnungId && pfad.startsWith(`objekte/${b.objektId}/wohnungen/${b.wohnungId}/`);
}

/**
 * Eimer und Ablagepfad hinter dem gespeicherten Wert eines Dokuments.
 *
 * Geladen wird mit dem Dienstschlüssel, und die Adressen stehen in Tabellen
 * und in `wohnungen.meta`, die jede interne Rolle schreiben darf. Deshalb seit
 * dem 28.09.2026 (Befund LOTSE-001) nur noch:
 *   - die Eimer, in denen Objekt- und Einheitsunterlagen wirklich liegen,
 *   - ein Pfad ohne „..“ und ohne führenden Schrägstrich,
 *   - ein Pfad, der zum angefragten Objekt beziehungsweise zur Einheit gehört.
 * Alles andere ergibt null und wird nicht geladen. Eine fremde oder beliebige
 * Adresse lässt sich so nicht in einen Download mit Dienstschlüssel verwandeln.
 *
 * Bis zum 28.09.2026 stand die Funktion ohne diese Prüfung in
 * `objekt-texte-ki/lauf.ts`.
 */
export function dokumentAblage(url: string, bezug: DokumentBezug): { eimer: string; pfad: string } | null {
  const wert = (url || "").trim();
  let eimer = "";
  let roh = "";
  if (wert.startsWith(OBJEKT_DOKUMENT_ZEIGER)) {
    eimer = "objekt-dokumente";
    roh = wert.slice(OBJEKT_DOKUMENT_ZEIGER.length);
  } else if (wert.startsWith(INVESTAGON_DOKUMENT_ZEIGER)) {
    eimer = "investagon-dokumente";
    roh = wert.slice(INVESTAGON_DOKUMENT_ZEIGER.length);
  } else {
    // Ältere Objektunterlagen liegen als dauerhafte Adresse im öffentlichen Eimer.
    const treffer = wert.match(/^https:\/\/[^/?#]+\/storage\/v1\/object\/public\/(objekt-medien|objekt-dokumente)\/([^?#]+)$/);
    if (!treffer) return null;
    eimer = treffer[1];
    try {
      roh = decodeURIComponent(treffer[2]);
    } catch {
      return null;
    }
  }
  const pfad = sichererPfad(roh);
  return pfad && passtZumBezug(eimer, pfad, bezug) ? { eimer, pfad } : null;
}
