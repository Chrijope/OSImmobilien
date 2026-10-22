/**
 * Unterlagen im Ankaufstool auslesen (Christian, 22.10.2026).
 *
 * Exposé, Energieausweis, Flächenberechnung, Grundrisse, Mieterlisten oder
 * Mietverträge werden nur für diese eine Analyse gelesen und nirgends
 * gespeichert.
 *
 * Personendaten (Codex-Prüfung 22.10.2026): Ein Namensfilter reicht nicht.
 * Deshalb kommt kein Freitext von der KI. Die Edge Function
 * `ankaufstool-unterlagen` liefert nur Zahlen und feste Auswahlwerte, je Feld
 * mit einer Quelle, die sie selbst aus Dokumentart, Unterlagennummer und Seite
 * bildet. Dateinamen verlassen den Browser nicht. Felder, in denen ein Name
 * stehen könnte (Zustand, Lage, Makler), liest die KI nicht aus.
 */

import type { AnkaufEingaben, AnkaufObjekt } from "./ankaufstool";

export type ZahlFeld = Extract<keyof AnkaufEingaben,
  | "wohnflaeche" | "gewerbeflaeche" | "gesamtflaecheManuell" | "grundstuecksflaeche"
  | "wohneinheiten" | "gewerbeeinheiten" | "stellplaetze"
  | "istMieteWohnenJahr" | "istMieteGewerbeJahr" | "istMieteStellplaetzeJahr" | "bewirtschaftungJahr"
  | "kaufpreis" | "maklerEinkauf">;
/** Textfelder des Tools, die aus festen Werten zusammengesetzt werden. */
export type TextFeld = Extract<keyof AnkaufObjekt, "objektart" | "baujahr" | "energie" | "vermietung">;
export type AuslesFeld = ZahlFeld | TextFeld;

export const ZAHL_FELDER: readonly ZahlFeld[] = [
  "wohnflaeche", "gewerbeflaeche", "gesamtflaecheManuell", "grundstuecksflaeche",
  "wohneinheiten", "gewerbeeinheiten", "stellplaetze",
  "istMieteWohnenJahr", "istMieteGewerbeJahr", "istMieteStellplaetzeJahr", "bewirtschaftungJahr",
  "kaufpreis", "maklerEinkauf",
];
export const TEXT_FELDER: readonly TextFeld[] = ["objektart", "baujahr", "energie", "vermietung"];

/** Die KI meldet Prozent als Prozentzahl (3,57); das Tool rechnet mit dem Anteil (0,0357). */
const PROZENT_FELDER: readonly ZahlFeld[] = ["maklerEinkauf"];
const STUECK_FELDER: readonly ZahlFeld[] = ["wohneinheiten", "gewerbeeinheiten", "stellplaetze"];

const OBJEKTARTEN = ["Mehrfamilienhaus", "Wohn- und Geschäftshaus", "Wohnanlage", "Eigentumswohnung", "Gewerbeobjekt", "Sonstiges"];
const ENERGIE_AUSWEIS = ["Bedarfsausweis", "Verbrauchsausweis"];
const ENERGIE_KLASSEN = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];
const ENERGIE_TRAEGER = ["Gas", "Öl", "Fernwärme", "Strom", "Wärmepumpe", "Holz/Pellets", "Solar", "Sonstiges"];

/** Kurztitel je Feld der Function, für Hinweise auf Widersprüche. */
const FELD_TITEL: Record<string, string> = {
  wohnflaeche: "Wohnfläche", gewerbeflaeche: "Gewerbefläche", gesamtflaecheManuell: "Gesamtfläche",
  grundstuecksflaeche: "Grundstücksfläche", wohneinheiten: "Wohneinheiten", gewerbeeinheiten: "Gewerbeeinheiten",
  stellplaetze: "Stellplätze", leerstehendeEinheiten: "Leerstand", istMieteWohnenJahr: "Ist-Miete Wohnen",
  istMieteGewerbeJahr: "Ist-Miete Gewerbe", istMieteStellplaetzeJahr: "Ist-Miete Stellplätze",
  bewirtschaftungJahr: "nicht umlagefähige Kosten", kaufpreis: "Kaufpreis", maklerEinkauf: "Käuferprovision",
  baujahr: "Baujahr", energieKennwert: "Energiekennwert", objektart: "Objektart", energieAusweis: "Ausweisart",
  energieKlasse: "Energieklasse", energieTraeger: "Energieträger",
};

/** So sieht eine Quelle aus, die die Function gebildet hat: „Energieausweis (Unterlage 2), Seite 1“. */
const QUELLE_MUSTER = /^[A-Za-zÄÖÜäöüß \-é]{3,30} \(Unterlage \d{1,2}\), Seite \d{1,3}$/;

export type Sicherheit = "hoch" | "mittel" | "niedrig";

export interface Vorschlag {
  feld: AuslesFeld;
  wert: number | string;
  /** z. B. „Energieausweis (Unterlage 2), Seite 1“ */
  quelle: string;
  sicherheit: Sicherheit;
}

/** Herkunft je Feld: woher der Wert stammt. Fehlt ein Eintrag, ist der Wert eigene Eingabe. */
export type AnkaufHerkunft = Partial<Record<AuslesFeld, { quelle: string; sicherheit: Sicherheit }>>;

export interface AuslesErgebnis {
  vorschlaege: Vorschlag[];
  hinweise: string[];
}

/*
 * Zusätzliche Sicherung, falls die Function je doch Text liefert: Anreden,
 * Rollen mit Doppelpunkt, E-Mail, Telefon, Geburtsdatum. Kein Ersatz für
 * die strukturierte Antwort oben.
 */
const PERSONENDATEN = [
  /\b(Herr|Frau|Hr\.|Fr\.|Familie|Eheleute)\s+\p{Lu}/u,
  /\b(Mieter(in)?|Eigentümer(in)?|Verkäufer(in)?|Ansprechpartner(in)?)\s*:\s*\p{Lu}/u,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /(\+49|\b0)[\d\s/()-]{7,}\d/,
  /\bgeb(oren|\.)\s/i,
];

export function enthaeltPersonendaten(text: string): boolean {
  return PERSONENDATEN.some((muster) => muster.test(text));
}

type Eintrag = { wert: number | string; quelle: string; sicherheit: Sicherheit };

function eintragLesen(roh: unknown): Eintrag | null {
  if (!roh || typeof roh !== "object") return null;
  const e = roh as { wert?: unknown; quelle?: unknown; sicherheit?: unknown };
  if (typeof e.quelle !== "string" || !QUELLE_MUSTER.test(e.quelle)) return null;
  if (typeof e.wert !== "number" && typeof e.wert !== "string") return null;
  const sicherheit = e.sicherheit === "hoch" || e.sicherheit === "mittel" || e.sicherheit === "niedrig" ? e.sicherheit : "niedrig";
  return { wert: e.wert, quelle: e.quelle, sicherheit };
}

const zahl = (e: Eintrag | null): number | null =>
  e && typeof e.wert === "number" && Number.isFinite(e.wert) && e.wert >= 0 ? e.wert : null;
const auswahl = (e: Eintrag | null, erlaubt: string[]): string | null =>
  e && typeof e.wert === "string" && erlaubt.includes(e.wert) ? e.wert : null;
/** Die unsicherste Angabe zählt, wenn ein Feld aus mehreren zusammengesetzt wird. */
const schwaechste = (liste: Sicherheit[]): Sicherheit =>
  liste.includes("niedrig") ? "niedrig" : liste.includes("mittel") ? "mittel" : "hoch";

/**
 * Antwort der Function prüfen und in Vorschläge für das Tool übersetzen: nur
 * bekannte Felder, Quelle im erwarteten Format, Zahlen endlich und nicht
 * negativ, Prozent als Anteil, Auswahlwerte nur aus der festen Liste.
 */
export function antwortPruefen(roh: unknown): AuslesErgebnis {
  const daten = (roh && typeof roh === "object" ? roh : {}) as { felder?: unknown; widersprueche?: unknown };
  const felder = (daten.felder && typeof daten.felder === "object" ? daten.felder : {}) as Record<string, unknown>;
  const e = (k: string) => eintragLesen(felder[k]);
  const vorschlaege: Vorschlag[] = [];

  for (const feld of ZAHL_FELDER) {
    const eintrag = e(feld);
    let wert = zahl(eintrag);
    if (!eintrag || wert === null) continue;
    if (PROZENT_FELDER.includes(feld)) {
      // Eine Prozentzahl über 100 ist kein Prozentwert, sondern ein Lesefehler.
      if (wert > 100) continue;
      // Über ganze Zahlen teilen, sonst wird aus 3,57 % 0,035699999….
      wert = Math.round(wert * 1e6) / 1e8;
    }
    if (STUECK_FELDER.includes(feld)) wert = Math.round(wert);
    vorschlaege.push({ feld, wert, quelle: eintrag.quelle, sicherheit: eintrag.sicherheit });
  }

  const art = e("objektart");
  if (auswahl(art, OBJEKTARTEN)) vorschlaege.push({ feld: "objektart", wert: String(art!.wert), quelle: art!.quelle, sicherheit: art!.sicherheit });

  const bj = e("baujahr");
  const jahr = zahl(bj);
  if (bj && jahr !== null && Number.isInteger(jahr) && jahr >= 1800 && jahr <= 2100) {
    vorschlaege.push({ feld: "baujahr", wert: String(jahr), quelle: bj.quelle, sicherheit: bj.sicherheit });
  }

  // Energie aus festen Teilen: Ausweisart, Kennwert, Klasse, Energieträger.
  const teile = [
    { e: e("energieAusweis"), text: (x: Eintrag) => auswahl(x, ENERGIE_AUSWEIS) },
    { e: e("energieKennwert"), text: (x: Eintrag) => { const z = zahl(x); return z === null ? null : `${z.toLocaleString("de-DE")} kWh/(m²·a)`; } },
    { e: e("energieKlasse"), text: (x: Eintrag) => { const k = auswahl(x, ENERGIE_KLASSEN); return k ? `Klasse ${k}` : null; } },
    { e: e("energieTraeger"), text: (x: Eintrag) => auswahl(x, ENERGIE_TRAEGER) },
  ].flatMap(({ e: x, text }) => { if (!x) return []; const t = text(x); return t ? [{ t, x }] : []; });
  if (teile.length > 0) {
    vorschlaege.push({ feld: "energie", wert: teile.map((p) => p.t).join(", "), quelle: teile[0].x.quelle, sicherheit: schwaechste(teile.map((p) => p.x.sicherheit)) });
  }

  // Vermietungsstand aus der Zahl leerer Einheiten.
  const leer = e("leerstehendeEinheiten");
  const anzahlLeer = zahl(leer);
  if (leer && anzahlLeer !== null) {
    const n = Math.round(anzahlLeer);
    vorschlaege.push({ feld: "vermietung", wert: n === 0 ? "voll vermietet" : `${n} ${n === 1 ? "Einheit" : "Einheiten"} leer`, quelle: leer.quelle, sicherheit: leer.sicherheit });
  }

  const widersprueche = Array.isArray(daten.widersprueche)
    ? daten.widersprueche.filter((w): w is string => typeof w === "string" && w in FELD_TITEL)
    : [];
  const hinweise = widersprueche.length
    ? [`Die Unterlagen widersprechen sich bei: ${[...new Set(widersprueche.map((w) => FELD_TITEL[w]))].join(", ")}. Bitte von Hand prüfen.`]
    : [];
  return { vorschlaege, hinweise };
}

/** Kurzer Satz für das Etikett unter dem Feld. */
export function herkunftText(quelle: string): string {
  return quelle ? `aus ${quelle.replace(/, Seite (\d+)/, ", S. $1")}` : "aus den Unterlagen";
}

/* ───────────────────────── Unterlagen einpacken und senden ───────────────────────── */

/** Scans und Bilder gehen als Bild mit, aber nur bis zu dieser Größe und Anzahl. */
const MAX_BILD_BYTES = 4 * 1024 * 1024;
const MAX_BILDER = 4;
/** PDFs größer als das öffnet der Browser gar nicht erst. */
const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Text je Dokument, damit auch eine lokale KI mit kleinem Kontext zurechtkommt. */
const MAX_TEXT_JE_DOKUMENT = 40_000;

/** Ohne Dateinamen: Der kann Namen enthalten. Die Reihenfolge ist die Unterlagennummer. */
export interface AnfrageDokument {
  /** Text je Seite, wenn die Datei eine Textebene hat. */
  seiten?: string[];
  /** Scan oder Foto als Daten-URL (image/jpeg, image/png, image/webp, application/pdf). */
  bild?: string;
}

export class AuslesFehler extends Error {}

const istPdf = (datei: File) => datei.type === "application/pdf" || datei.name.toLowerCase().endsWith(".pdf");
const istBild = (datei: File) => /^image\/(png|jpe?g|webp)$/.test(datei.type) || /\.(png|jpe?g|webp)$/i.test(datei.name);

export function dateiErlaubt(datei: File): boolean {
  return istPdf(datei) || istBild(datei);
}

async function alsDatenUrl(datei: File): Promise<string> {
  const bytes = new Uint8Array(await datei.arrayBuffer());
  let binaer = "";
  // Stückweise, sonst sprengt String.fromCharCode bei großen Dateien den Stapel.
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binaer += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const typ = istPdf(datei) ? "application/pdf" : datei.type || "image/jpeg";
  return `data:${typ};base64,${btoa(binaer)}`;
}

/**
 * Dateien für die Anfrage vorbereiten. PDFs mit Textebene liest der Browser
 * selbst; Scans und Fotos gehen als Bild mit. `namen[i]` ist der Dateiname
 * von Unterlage i + 1, er bleibt im Browser. Was nicht passt, steht in
 * `uebersprungen` mit Grund.
 */
export async function anfrageZusammenstellen(dateien: readonly File[]): Promise<{ dokumente: AnfrageDokument[]; namen: string[]; uebersprungen: string[] }> {
  const dokumente: AnfrageDokument[] = [];
  const namen: string[] = [];
  const uebersprungen: string[] = [];
  let bilder = 0;
  const bildMitnehmen = async (datei: File) => {
    if (bilder >= MAX_BILDER) return uebersprungen.push(`${datei.name}: höchstens ${MAX_BILDER} Scans oder Bilder je Auslesung`);
    if (datei.size > MAX_BILD_BYTES) return uebersprungen.push(`${datei.name}: als Scan oder Bild höchstens 4 MB`);
    bilder += 1;
    dokumente.push({ bild: await alsDatenUrl(datei) });
    namen.push(datei.name);
  };
  for (const datei of dateien) {
    if (istPdf(datei)) {
      if (datei.size > MAX_PDF_BYTES) {
        uebersprungen.push(`${datei.name}: PDF höchstens 25 MB`);
        continue;
      }
      const { pdfTextAuslesen } = await import("./investmentrechner/unterlagenAuslesen");
      let seiten: string[] = [];
      try {
        seiten = (await pdfTextAuslesen(datei)).seiten;
      } catch {
        uebersprungen.push(`${datei.name}: PDF ließ sich nicht öffnen`);
        continue;
      }
      if (seiten.join("").trim().length >= 40) {
        let rest = MAX_TEXT_JE_DOKUMENT;
        dokumente.push({ seiten: seiten.map((s) => { const t = s.slice(0, Math.max(0, rest)); rest -= t.length; return t; }) });
        namen.push(datei.name);
      } else {
        await bildMitnehmen(datei);
      }
    } else if (istBild(datei)) {
      await bildMitnehmen(datei);
    } else {
      uebersprungen.push(`${datei.name}: nur PDF, JPG, PNG oder WebP`);
    }
  }
  return { dokumente, namen, uebersprungen };
}

/** Unterlagen auslesen lassen. Wirft AuslesFehler mit einer Meldung für die Oberfläche. */
export async function unterlagenAuslesen(dokumente: AnfrageDokument[]): Promise<AuslesErgebnis> {
  if (dokumente.length === 0) throw new AuslesFehler("Keine der Unterlagen ließ sich lesen.");
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke("ankaufstool-unterlagen", { body: { dokumente } });
  if (error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json();
        if (body && typeof body.error === "string") throw new AuslesFehler(body.error);
      } catch (fehler) {
        if (fehler instanceof AuslesFehler) throw fehler;
      }
    }
    console.error("ankaufstool-unterlagen Fehler:", error);
    throw new AuslesFehler("Die Unterlagen konnten nicht ausgelesen werden. Bitte später erneut versuchen.");
  }
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") throw new AuslesFehler(data.error);
  return antwortPruefen(data);
}
