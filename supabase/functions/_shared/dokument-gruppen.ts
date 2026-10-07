/**
 * Die Oberbegriffe im Reiter „Dokumente" von Objekt- und Einheitsseite.
 *
 * Reine Funktionen ohne Deno- oder Browser-Bezug. Sie liegen hier, weil
 * sowohl die Oberfläche (`src/lib/dokumentGruppen.ts` reicht sie weiter) als
 * auch die Edge Functions (`get-expose`, Kundenansicht) dieselbe Einordnung
 * brauchen: Die Ampel in `dokument-freigabe.ts` hängt am Oberbegriff, und eine
 * zweite Liste an anderer Stelle liefe früher oder später auseinander.
 *
 * Christian am 23.09.2026: Die Liste soll nach Oberbegriffen gegliedert sein,
 * jede Gruppe aufklappbar. Ein Haus aus Investagon bringt schnell dreißig und
 * mehr Dateien mit, als flache Liste findet darin niemand den Mietvertrag.
 *
 * Die Reihenfolge ist fachlich und fest, nicht alphabetisch: so, wie ein
 * Berater eine Wohnung prüft. Erst was sie ist (Exposé, Grundriss, Fläche),
 * dann was sie einbringt und kostet (Mietverhältnis, Hausgeld), dann die
 * Rechtslage (Teilungserklärung, Grundbuch), dann Energie, Versicherung und
 * Behörden, am Ende die Vertragsunterlagen des Verkaufs. „Sonstiges" steht
 * immer zuletzt. Die erste nicht leere Gruppe liefert auch die Vorschau beim
 * Öffnen, deshalb steht das Exposé vorn: Es gibt den schnellsten Überblick.
 */
export const DOKUMENT_OBERBEGRIFFE = [
  "Exposé und Beschreibung",
  "Grundrisse und Pläne",
  "Flächen",
  "Mietverhältnis",
  "WEG und Hausgeld",
  "Teilungserklärung",
  "Grundbuch",
  "Energie",
  "Versicherung",
  "Behördliche Auskünfte",
  "Vertragsunterlagen",
  "Sonstiges",
] as const;

export type Oberbegriff = (typeof DOKUMENT_OBERBEGRIFFE)[number];

/**
 * Die Kategorien von Investagon (Rohwert, siehe `KATEGORIE_LABEL` in
 * `src/lib/investagonFelder.ts`) auf die Oberbegriffe.
 *
 * `other_object` („Sonstiges") fehlt bewusst: Es sagt nichts, also entscheidet
 * dort wie bei einer Datei ohne Kategorie der Titel. Ebenso ein neuer, hier
 * noch unbekannter Rohwert.
 *
 * `settlements` heißt bei Investagon „Betriebskostenabrechnung", gemeint sind
 * in der Praxis die Abrechnungen der Gemeinschaft. Deshalb WEG und Hausgeld.
 */
const OBERBEGRIFF_JE_KATEGORIE: Record<string, Oberbegriff> = {
  declaration_of_division: "Teilungserklärung",
  economic_plan: "WEG und Hausgeld",
  energy_certificate: "Energie",
  expose: "Exposé und Beschreibung",
  land_register: "Grundbuch",
  layout: "Grundrisse und Pläne",
  living_area_calculation: "Flächen",
  rental_agreement: "Mietverhältnis",
  settlements: "WEG und Hausgeld",
  site_plan: "Grundrisse und Pläne",
};

/**
 * Die Stichwortliste für Dateien ohne verwertbare Kategorie.
 *
 * Geprüft wird von oben nach unten, die erste passende Regel gewinnt. Die
 * Reihenfolge ist deshalb Absicht und nicht die der Oberbegriffe: Spezifisches
 * vor Allgemeinem. „Exposé_Grundriss_WE09" ist ein Grundriss, deshalb steht
 * das Exposé ganz unten. „Kaufvertrag" steht vor dem Mietverhältnis, weil
 * „Miet" sonst zu viel fängt. Die Abrechnungen der Gemeinschaft stehen vor
 * dem Mietverhältnis, damit eine „Nebenkostenabrechnung Mieter" beim Hausgeld
 * landet und nicht beim Mietvertrag.
 *
 * `teile` sind Wortteile, die irgendwo im Titel stehen dürfen, auch mitten in
 * einem zusammengesetzten Wort („Hausgeldabrechnung"). `woerter` sind
 * Abkürzungen, die nur als eigenes Wort zählen, sonst fände „gb" auch jedes
 * „Abgabe". Beide in der Schreibweise nach `normalisiereTitel`, also klein,
 * mit ae, oe, ue, ss und ohne Akzent.
 */
const STICHWORT_REGELN: ReadonlyArray<{ oberbegriff: Oberbegriff; teile: string[]; woerter?: string[] }> = [
  { oberbegriff: "Vertragsunterlagen", teile: ["reservierung", "kaufvertrag", "muster kv", "kaufangebot", "notarentwurf", "vollmacht"], woerter: ["kv"] },
  { oberbegriff: "Teilungserklärung", teile: ["teilungserklaerung", "aufteilungsplan", "abgeschlossenheit", "gemeinschaftsordnung"] },
  { oberbegriff: "Grundbuch", teile: ["grundbuch"], woerter: ["gb", "gba"] },
  { oberbegriff: "Energie", teile: ["energieausweis", "energiepass", "energiebedarf", "energieverbrauch", "energieeffizienz"] },
  { oberbegriff: "Grundrisse und Pläne", teile: ["grundriss", "lageplan", "bauzeichnung"] },
  { oberbegriff: "Flächen", teile: ["wohnflaeche", "flaechenberechnung", "flaechenaufstellung", "nutzflaeche"], woerter: ["wfl"] },
  {
    oberbegriff: "WEG und Hausgeld",
    teile: ["wirtschaftsplan", "hausgeld", "jahresabrechnung", "eigentuemerversammlung", "beschluss", "ruecklage", "verwaltervertrag", "betriebskosten", "nebenkosten", "weg protokoll", "weg abrechnung"],
    woerter: ["etv"],
  },
  { oberbegriff: "Mietverhältnis", teile: ["miet", "kaution", "uebergabeprotokoll"] },
  { oberbegriff: "Versicherung", teile: ["versicherung", "police"] },
  {
    oberbegriff: "Behördliche Auskünfte",
    teile: ["altlast", "denkmal", "baulast", "baugenehmigung", "erschliessung", "vorkaufsrecht", "negativattest", "sanierungsgebiet", "bebauungsplan", "grundsteuer", "bescheid"],
  },
  { oberbegriff: "Exposé und Beschreibung", teile: ["expose", "beschreibung", "praesentation", "objektvorstellung", "flyer", "broschuere"] },
];

/**
 * Ein Titel in einer Form, in der sich Stichworte verlässlich finden lassen.
 *
 * Klein, Umlaute ausgeschrieben, Akzente weg, alles außer Buchstaben und
 * Ziffern wird zum Leerzeichen. Aus „Magdeburg_Friesenstraße_Grundriss_WE09"
 * wird „magdeburg friesenstrasse grundriss we09". `NFC` vorweg, weil Dateinamen
 * vom Mac Umlaute oft zerlegt speichern (a plus Trema), und die fielen sonst
 * durch das Ersetzen von „ä".
 */
export function normalisiereTitel(titel: string): string {
  return (titel || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Steht die Abkürzung als eigenes Wort da? Eine direkt folgende Ziffer zählt mit („GB115615"). */
function enthaeltWort(normalisiert: string, wort: string): boolean {
  return new RegExp(`(?:^| )${wort}(?= |$|\\d)`).test(normalisiert);
}

/** Der Oberbegriff zu einer Investagon-Kategorie, oder nichts, wenn sie keinen hergibt. */
export function oberbegriffAusKategorie(kategorie: string | null | undefined): Oberbegriff | undefined {
  if (!kategorie) return undefined;
  return OBERBEGRIFF_JE_KATEGORIE[kategorie.trim()];
}

/** Der Oberbegriff allein aus dem Titel, ohne Treffer „Sonstiges". */
export function oberbegriffAusTitel(titel: string): Oberbegriff {
  const normalisiert = normalisiereTitel(titel);
  if (!normalisiert) return "Sonstiges";
  const regel = STICHWORT_REGELN.find((r) =>
    r.teile.some((teil) => normalisiert.includes(teil)) || (r.woerter ?? []).some((w) => enthaeltWort(normalisiert, w)),
  );
  return regel?.oberbegriff ?? "Sonstiges";
}

/**
 * Nennt der Titel irgendwo ein Stichwort dieses Oberbegriffs, unabhängig von
 * der Reihenfolge der Regeln?
 *
 * `oberbegriffAusTitel` nimmt den ersten Treffer, das ist für die Liste
 * richtig. Für die Ampel reicht das nicht: „Mietvertrag Anlage Grundriss"
 * steht in der Liste bei den Grundrissen, nennt aber einen Mieter.
 */
export function titelNenntOberbegriff(titel: string, oberbegriff: Oberbegriff): boolean {
  const normalisiert = normalisiereTitel(titel);
  if (!normalisiert) return false;
  return STICHWORT_REGELN.some((r) => r.oberbegriff === oberbegriff
    && (r.teile.some((teil) => normalisiert.includes(teil)) || (r.woerter ?? []).some((w) => enthaeltWort(normalisiert, w))));
}

/** Erst die Kategorie, wo sie etwas sagt, sonst der Titel. */
export function oberbegriffFuer(dokument: { name: string; investagonKategorie?: string | null }): Oberbegriff {
  return oberbegriffAusKategorie(dokument.investagonKategorie) ?? oberbegriffAusTitel(dokument.name);
}

function textWert(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function dateinameAusAdresse(url: string): string {
  const letztes = url.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(letztes);
  } catch {
    return letztes;
  }
}

/**
 * Die Investagon-Kategorie einer übernommenen Unterlage wiederfinden, aus
 * dem Originaldatensatz (`meta.investagonRaw`) selbst.
 *
 * Dieselbe Suche wie `investagonKategorieSuche` im Browser
 * (`src/lib/dokumentGruppen.ts`), nur ohne dessen Hilfsmodule, damit die
 * Edge Functions sie mitlesen können: Der Import schreibt nur den Namen in
 * die Zeile, und zwar den Titel der Datei oder ersatzweise ihren
 * Originalnamen. Über beides findet die Zeile ihre Kategorie wieder.
 */
export function investagonKategorieAusRohdaten(roh: unknown): (name: string) => string | undefined {
  const nachName = new Map<string, string>();
  const dateien = roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as Record<string, unknown>).files : undefined;
  for (const datei of Array.isArray(dateien) ? dateien : []) {
    if (!datei || typeof datei !== "object") continue;
    const d = datei as Record<string, unknown>;
    const kategorie = textWert(d.category);
    const url = typeof d.filename === "string" ? d.filename.trim() : "";
    if (!kategorie || !url) continue;
    const dateiname = textWert(d.original_filename) ?? dateinameAusAdresse(url);
    for (const schluessel of [textWert(d.title) ?? dateiname, dateiname]) {
      const n = normalisiereTitel(schluessel);
      if (n && !nachName.has(n)) nachName.set(n, kategorie);
    }
  }
  return (name) => (nachName.size === 0 ? undefined : nachName.get(normalisiereTitel(name)));
}
