/**
 * Auslesung von Objektunterlagen für den Investmentrechner.
 *
 * Energieausweis, Erhaltungsrücklage, Sanierungshistorie und Dokumentart
 * werden per regulären Ausdrücken aus dem Text der Unterlagen gezogen. Die
 * Muster sind eins zu eins aus der Web-App „MORE Immo Investmentrechner"
 * übernommen. Alles läuft lokal im Browser, es wird nichts hochgeladen.
 */

export interface UnterlagenDaten {
  energyClass: string;
  energyValue: number;
  certificateType: string;
  energyCarrier: string;
  certificateValidUntil: string;
  reserveAmount: number;
  reserveUnitShare: number;
  reserveAsOf: string;
  reserveExcerpt: string;
  renovations: string[];
}

export interface UnterlagenAuslesung extends UnterlagenDaten {
  /** Anzahl der erkannten Felder, als grobes Maß für die Trefferqualität. */
  matchedFields: number;
}

export type DokumentStatus = "reading" | "done" | "manual" | "error";

export interface UnterlagenDokument {
  id: string;
  name: string;
  category: string;
  pages: number;
  status: DokumentStatus;
  detail: string;
  text: string;
  /** Text je Seite, damit die KI-Auslesung Seitenzahlen als Quelle nennen kann. */
  seiten?: string[];
  /** Die hochgeladene Datei, nur für Scans ohne Textebene an die KI-Auslesung. */
  datei?: File;
  /**
   * Nur bei Unterlagen aus der Objektablage: gespeicherter Wert, Ebene und
   * Ampel. Rote Unterlagen (Mietvertrag, Grundbuch) liest die Function nur als
   * Faktenauszug (seit dem 28.09.2026).
   */
  ablage?: { url: string; ebene: "objekt" | "einheit"; rot: boolean; investagonKategorie?: string };
}

export interface Ruecklagentreffer {
  amount: number;
  excerpt: string;
}

/** Leerer Ausgangszustand der Unterlagen (Original „re"). */
export const leereUnterlagenDaten: UnterlagenDaten = {
  energyClass: "",
  energyValue: 0,
  certificateType: "",
  energyCarrier: "",
  certificateValidUntil: "",
  reserveAmount: 0,
  reserveUnitShare: 0,
  reserveAsOf: "",
  reserveExcerpt: "",
  renovations: [],
};

/** Weiche Trennzeichen entfernen und Leerraum auf ein Leerzeichen zusammenziehen. */
export const normalisiereText = (text: string): string =>
  text.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();

/** Deutsche Zahl (1.234,56) in eine Zahl umwandeln, unlesbare Werte werden 0. */
export function parseDeutscheZahl(text: string): number {
  const bereinigt = text
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const zahl = Number(bereinigt);
  return Number.isFinite(zahl) ? zahl : 0;
}

/** Erste Fanggruppe des ersten passenden Musters, sonst leerer Text. */
export function ersterTreffer(text: string, muster: RegExp[]): string {
  for (const regex of muster) {
    const treffer = regex.exec(text);
    if (treffer?.[1]) return normalisiereText(treffer[1]);
  }
  return "";
}

/** Alle Rücklagenbeträge im Text finden, absteigend nach Betrag sortiert. */
export function findeRuecklagen(text: string): Ruecklagentreffer[] {
  const treffer: Ruecklagentreffer[] = [];
  const begriff =
    "(?:Instandhaltungsrücklage|Erhaltungsrücklage|Rücklagenbestand|Instandhaltungsrückstellung)";
  const muster = [
    RegExp(
      `${begriff}.{0,180}?([0-9]{1,3}(?:[.\\s][0-9]{3})*(?:,[0-9]{1,2})?)\\s*(?:€|EUR)`,
      "gi",
    ),
    RegExp(
      `([0-9]{1,3}(?:[.\\s][0-9]{3})*(?:,[0-9]{1,2})?)\\s*(?:€|EUR).{0,100}?${begriff}`,
      "gi",
    ),
  ];
  for (const regex of muster)
    for (const fund of text.matchAll(regex)) {
      const betrag = parseDeutscheZahl(fund[1]);
      if (betrag > 0) treffer.push({ amount: betrag, excerpt: normalisiereText(fund[0]).slice(0, 260) });
    }
  return treffer.sort((a, b) => b.amount - a.amount);
}

/** Sanierungsmaßnahmen anhand von Jahreszahlen mit Sanierungsbegriffen im Umfeld erkennen. */
export function findeSanierungen(text: string): string[] {
  const begriffe =
    /(?:sanier|modernisier|erneuer|instandgesetz|renovier|austausch|ausgetausch|Dach|Fassade|Fenster|Heizung|Aufzug|Leitung|Balkon|Treppenhaus|Wärmedämm|Elektro|Strangsanierung)/i;
  const funde: { year: number; text: string }[] = [];
  for (const fund of text.matchAll(/\b(19\d{2}|20\d{2})\b/g)) {
    const jahr = Number(fund[1]);
    if (jahr < 1950 || jahr > new Date().getFullYear() + 3) continue;
    const von = Math.max(0, (fund.index ?? 0) - 105);
    const bis = Math.min(text.length, (fund.index ?? 0) + 145);
    const umfeld = normalisiereText(text.slice(von, bis));
    if (!begriffe.test(umfeld)) continue;
    const beschreibung = umfeld
      .replace(
        /^.*?(?=(?:sanier|modernisier|erneuer|instandgesetzt|renovier|austausch|ausgetausch|Dach|Fassade|Fenster|Heizung|Aufzug|Leitung|Balkon|Treppenhaus|Wärmedämm|Elektro|Strangsanierung))/i,
        "",
      )
      .slice(0, 190)
      .replace(/[,:;\-\s]+$/, "");
    funde.push({ year: jahr, text: `${jahr} · ${beschreibung}` });
  }
  // Doppelte Fundstellen anhand eines normalisierten Schlüssels aussortieren.
  const eindeutig = new Map<string, { year: number; text: string }>();
  for (const fund of funde) {
    const schluessel = fund.text.toLocaleLowerCase("de-DE").replace(/\W/g, "").slice(0, 90);
    if (!eindeutig.has(schluessel)) eindeutig.set(schluessel, fund);
  }
  return [...eindeutig.values()]
    .sort((a, b) => b.year - a.year)
    .slice(0, 8)
    .map((fund) => fund.text);
}

/** So viele Maßnahmen werden aus dem Eingabefeld übernommen. */
const MAX_SANIERUNGEN = 10;

/**
 * Sanierungsliste für die Anzeige aufräumen.
 *
 * Das Eingabefeld speichert die Zeilen bewusst genau so, wie sie getippt
 * werden, sonst könnte man weder ein Leerzeichen setzen noch eine neue Zeile
 * beginnen: Beides würde beim nächsten Tastendruck sofort wieder entfernt.
 * Die Aufräumarbeit gehört deshalb an die Stelle, an der die Liste gelesen
 * wird, nicht an die, an der sie geschrieben wird.
 */
export function sanierungenBereinigt(zeilen: string[]): string[] {
  return zeilen
    .map((zeile) => zeile.trim())
    .filter(Boolean)
    .slice(0, MAX_SANIERUNGEN);
}

/** Alle Kennwerte aus dem zusammengefügten Text der Unterlagen auslesen. */
export function unterlagenAuslesen(rohtext: string): UnterlagenAuslesung {
  const text = normalisiereText(rohtext);
  const energieklasse = ersterTreffer(text, [
    /Energieeffizienzklasse\s*(?:laut Energieausweis)?\s*[:-]?\s*(A\+|A|B|C|D|E|F|G|H)\b/i,
    /Effizienzklasse\s*[:-]?\s*(A\+|A|B|C|D|E|F|G|H)\b/i,
  ]);
  const kennwert = ersterTreffer(text, [
    /(?:Endenergiebedarf|Endenergieverbrauch|Energieverbrauchskennwert)\s*[:-]?\s*([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*kWh/i,
    /([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*kWh\s*\/(?:\s*\(?m[²2].{0,5}a\)?)/i,
  ]);
  const ausweisart = ersterTreffer(text, [
    /(Bedarfsausweis|Verbrauchsausweis)/i,
    /Art des Energieausweises\s*[:-]?\s*([^.;]{3,50})/i,
  ]);
  const energietraeger = ersterTreffer(text, [
    /(?:Wesentlicher Energieträger|Hauptenergieträger|Energieträger für die Heizung)\s*[:-]?\s*([^.;]{2,70})/i,
  ]);
  const gueltigBis = ersterTreffer(text, [
    /(?:gültig bis|Gültigkeitsdatum)\s*[:-]?\s*(\d{1,2}[.]\d{1,2}[.]\d{4})/i,
  ]);
  const ruecklagen = findeRuecklagen(text);
  const anteilEinheit = ersterTreffer(text, [
    /(?:Anteil|davon|entfallen auf|anteilig).{0,80}?(?:Wohnung|Einheit|Sondereigentum).{0,80}?([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{1,2})?)\s*(?:€|EUR)/i,
    /(?:Wohnung|Einheit|Sondereigentum).{0,80}?(?:Anteil|Rücklage).{0,80}?([0-9]{1,3}(?:[.\s][0-9]{3})*(?:,[0-9]{1,2})?)\s*(?:€|EUR)/i,
  ]);
  const stand = ersterTreffer(text, [
    /(?:Instandhaltungsrücklage|Erhaltungsrücklage|Rücklagenbestand).{0,90}?(?:Stand|zum|per)\s*[:-]?\s*(\d{1,2}[.]\d{1,2}[.]\d{2,4}|\d{4})/i,
    /(?:Stand|zum|per)\s*[:-]?\s*(\d{1,2}[.]\d{1,2}[.]\d{2,4}|\d{4}).{0,90}?(?:Instandhaltungsrücklage|Erhaltungsrücklage|Rücklagenbestand)/i,
  ]);
  const sanierungen = findeSanierungen(text);
  const ergebnis: UnterlagenAuslesung = {
    energyClass: energieklasse,
    energyValue: parseDeutscheZahl(kennwert),
    certificateType: ausweisart,
    energyCarrier: energietraeger,
    certificateValidUntil: gueltigBis,
    reserveAmount: ruecklagen[0]?.amount ?? 0,
    reserveUnitShare: parseDeutscheZahl(anteilEinheit),
    reserveAsOf: stand,
    reserveExcerpt: ruecklagen[0]?.excerpt ?? "",
    renovations: sanierungen,
    matchedFields: 0,
  };
  ergebnis.matchedFields = [
    ergebnis.energyClass,
    ergebnis.energyValue,
    ergebnis.certificateType,
    ergebnis.energyCarrier,
    ergebnis.certificateValidUntil,
    ergebnis.reserveAmount,
    ergebnis.reserveUnitShare,
    ergebnis.reserveAsOf,
    ergebnis.renovations.length,
  ].filter(Boolean).length;
  return ergebnis;
}

/** Nur die Datenfelder ohne matchedFields, für den Zustand der Oberfläche. */
export function unterlagenDatenAus(auslesung: UnterlagenAuslesung): UnterlagenDaten {
  return {
    energyClass: auslesung.energyClass,
    energyValue: auslesung.energyValue,
    certificateType: auslesung.certificateType,
    energyCarrier: auslesung.energyCarrier,
    certificateValidUntil: auslesung.certificateValidUntil,
    reserveAmount: auslesung.reserveAmount,
    reserveUnitShare: auslesung.reserveUnitShare,
    reserveAsOf: auslesung.reserveAsOf,
    reserveExcerpt: auslesung.reserveExcerpt,
    renovations: auslesung.renovations,
  };
}

/** Dokumentart anhand von Dateiname und den ersten 5000 Zeichen erkennen. */
export function erkenneKategorie(dateiname: string, text: string): string {
  const probe = `${dateiname} ${text.slice(0, 5e3)}`.toLocaleLowerCase("de-DE");
  return /energieausweis|endenergiebedarf|endenergieverbrauch/.test(probe)
    ? "Energieausweis"
    : /wirtschaftsplan|jahresabrechnung|rücklage|ruecklage/.test(probe)
      ? "WEG / Rücklagen"
      : /protokoll|eigentümerversammlung|beschlusssammlung/.test(probe)
        ? "Protokoll / Beschlüsse"
        : /sanierung|modernisierung|instandhaltung/.test(probe)
          ? "Sanierung / Technik"
          : "Objektunterlage";
}

/**
 * Textebene eines PDFs lokal mit pdf.js auslesen. Das Paket wird erst bei
 * Bedarf geladen, damit es die Seite nicht von Anfang an beschwert.
 */
export async function pdfTextAuslesen(
  datei: File,
): Promise<{ text: string; pages: number; seiten: string[] }> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    // Der Arbeiter muss aus dem eigenen Paket kommen, sonst holt pdf.js ihn
    // aus dem Netz und scheitert ohne Verbindung.
    import("pdfjs-dist/build/pdf.worker.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const dokument = await pdfjs.getDocument({ data: new Uint8Array(await datei.arrayBuffer()) }).promise;
  const seiten: string[] = [];
  for (let nummer = 1; nummer <= dokument.numPages; nummer += 1) {
    const inhalt = await (await dokument.getPage(nummer)).getTextContent();
    const text = inhalt.items
      .map((eintrag) => ("str" in eintrag ? eintrag.str : ""))
      .filter(Boolean)
      .join(" ");
    seiten.push(text);
  }
  return { text: seiten.join("\n"), pages: dokument.numPages, seiten };
}
