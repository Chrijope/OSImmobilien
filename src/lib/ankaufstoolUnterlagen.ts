/**
 * Unterlagen im Ankaufstool auslesen (Christian, 22.10.2026).
 *
 * Exposé, Energieausweis, Flächenberechnung, Grundrisse, Mieterlisten oder
 * Mietverträge werden nur für diese eine Analyse gelesen und nirgends
 * gespeichert. Die KI meldet ausschließlich Hausdaten in festen Feldern;
 * Namen und andere Personendaten haben dort keinen Platz und werden
 * zusätzlich in Textfeldern verworfen.
 *
 * Welche KI liest, legt die Edge Function `ankaufstool-unterlagen` fest
 * (frei einstellbare, OpenAI-kompatible Adresse, gedacht für eine lokale KI).
 */

import type { AnkaufEingaben, AnkaufObjekt } from "./ankaufstool";

export type ZahlFeld = Extract<keyof AnkaufEingaben,
  | "wohnflaeche" | "gewerbeflaeche" | "gesamtflaecheManuell" | "grundstuecksflaeche"
  | "wohneinheiten" | "gewerbeeinheiten" | "stellplaetze"
  | "istMieteWohnenJahr" | "istMieteGewerbeJahr" | "istMieteStellplaetzeJahr" | "bewirtschaftungJahr"
  | "kaufpreis" | "maklerEinkauf">;
export type TextFeld = keyof AnkaufObjekt;
export type AuslesFeld = ZahlFeld | TextFeld;

/** Die Felder, die aus Unterlagen kommen dürfen (Abschnitt „Objektdaten aus Exposé“). */
export const ZAHL_FELDER: readonly ZahlFeld[] = [
  "wohnflaeche", "gewerbeflaeche", "gesamtflaecheManuell", "grundstuecksflaeche",
  "wohneinheiten", "gewerbeeinheiten", "stellplaetze",
  "istMieteWohnenJahr", "istMieteGewerbeJahr", "istMieteStellplaetzeJahr", "bewirtschaftungJahr",
  "kaufpreis", "maklerEinkauf",
];
export const TEXT_FELDER: readonly TextFeld[] = ["objektart", "baujahr", "zustand", "vermietung", "energie", "makler", "lage"];

/** Die KI meldet Prozent als Prozentzahl (3,57); das Tool rechnet mit dem Anteil (0,0357). */
const PROZENT_FELDER: readonly ZahlFeld[] = ["maklerEinkauf"];
const STUECK_FELDER: readonly ZahlFeld[] = ["wohneinheiten", "gewerbeeinheiten", "stellplaetze"];
const MAX_TEXT = 200;

export type Sicherheit = "hoch" | "mittel" | "niedrig";

export interface Vorschlag {
  feld: AuslesFeld;
  wert: number | string;
  /** z. B. „Energieausweis.pdf, Seite 1“ */
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
 * Letzte Sicherung gegen Personendaten in Textfeldern: Anreden, Mieter- oder
 * Eigentümernamen, E-Mail-Adressen und Telefonnummern. Ein solcher Text wird
 * nicht übernommen. Das Feld „makler“ nennt eine Firma; dort sind Anreden
 * ebenfalls ausgeschlossen, damit kein Ansprechpartner hineingerät.
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

function sicherheitLesen(roh: unknown): Sicherheit {
  return roh === "hoch" || roh === "mittel" || roh === "niedrig" ? roh : "niedrig";
}

function zahlLesen(roh: unknown): number | null {
  if (typeof roh === "number") return Number.isFinite(roh) ? roh : null;
  if (typeof roh !== "string") return null;
  // Deutsches Format: Tausenderpunkt, Dezimalkomma; Einheiten und Leerzeichen weg.
  const bereinigt = roh.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const zahl = Number(bereinigt);
  return bereinigt && Number.isFinite(zahl) ? zahl : null;
}

/**
 * Antwort der Function prüfen: nur bekannte Felder, Zahlen endlich und nicht
 * negativ, Prozent als Anteil, Texte kurz und ohne Personendaten.
 */
export function antwortPruefen(roh: unknown): AuslesErgebnis {
  const daten = (roh && typeof roh === "object" ? roh : {}) as { felder?: unknown; hinweise?: unknown };
  const felder = (daten.felder && typeof daten.felder === "object" ? daten.felder : {}) as Record<string, unknown>;
  const vorschlaege: Vorschlag[] = [];
  const hinweise = Array.isArray(daten.hinweise)
    ? daten.hinweise.filter((h): h is string => typeof h === "string" && !enthaeltPersonendaten(h)).map((h) => h.slice(0, 300))
    : [];

  for (const [feld, eintragRoh] of Object.entries(felder)) {
    if (!eintragRoh || typeof eintragRoh !== "object") continue;
    const eintrag = eintragRoh as { wert?: unknown; quelle?: unknown; sicherheit?: unknown };
    const quelle = typeof eintrag.quelle === "string" ? eintrag.quelle.trim().slice(0, 120) : "";
    const sicherheit = sicherheitLesen(eintrag.sicherheit);

    if ((ZAHL_FELDER as readonly string[]).includes(feld)) {
      const zahlFeld = feld as ZahlFeld;
      let wert = zahlLesen(eintrag.wert);
      if (wert === null || wert < 0) continue;
      if (PROZENT_FELDER.includes(zahlFeld)) {
        // Eine Prozentzahl über 100 ist kein Prozentwert, sondern ein Lesefehler.
        if (wert > 100) continue;
        // Über ganze Zahlen teilen, sonst wird aus 3,57 % 0,035699999….
        wert = Math.round(wert * 1e6) / 1e8;
      }
      if (STUECK_FELDER.includes(zahlFeld)) wert = Math.round(wert);
      vorschlaege.push({ feld: zahlFeld, wert, quelle, sicherheit });
    } else if ((TEXT_FELDER as readonly string[]).includes(feld)) {
      if (typeof eintrag.wert !== "string" && typeof eintrag.wert !== "number") continue;
      const text = String(eintrag.wert).replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
      if (!text || enthaeltPersonendaten(text)) continue;
      vorschlaege.push({ feld: feld as TextFeld, wert: text, quelle, sicherheit });
    }
  }
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
/** Text je Dokument, damit auch eine lokale KI mit kleinem Kontext zurechtkommt. */
const MAX_TEXT_JE_DOKUMENT = 40_000;

export interface AnfrageDokument {
  name: string;
  /** Text je Seite, wenn die Datei eine Textebene hat. */
  seiten?: string[];
  /** Scan oder Foto als Daten-URL (image/jpeg, image/png, application/pdf). */
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
 * selbst; Scans und Fotos gehen als Bild mit. Was nicht passt, steht in
 * `uebersprungen` mit Grund.
 */
export async function anfrageZusammenstellen(dateien: readonly File[]): Promise<{ dokumente: AnfrageDokument[]; uebersprungen: string[] }> {
  const dokumente: AnfrageDokument[] = [];
  const uebersprungen: string[] = [];
  let bilder = 0;
  const bildMitnehmen = async (datei: File) => {
    if (bilder >= MAX_BILDER) return uebersprungen.push(`${datei.name}: höchstens ${MAX_BILDER} Scans oder Bilder je Auslesung`);
    if (datei.size > MAX_BILD_BYTES) return uebersprungen.push(`${datei.name}: als Scan oder Bild höchstens 4 MB`);
    bilder += 1;
    dokumente.push({ name: datei.name, bild: await alsDatenUrl(datei) });
  };
  for (const datei of dateien) {
    if (istPdf(datei)) {
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
        dokumente.push({ name: datei.name, seiten: seiten.map((s) => { const t = s.slice(0, Math.max(0, rest)); rest -= t.length; return t; }) });
      } else {
        await bildMitnehmen(datei);
      }
    } else if (istBild(datei)) {
      await bildMitnehmen(datei);
    } else {
      uebersprungen.push(`${datei.name}: nur PDF, JPG, PNG oder WebP`);
    }
  }
  return { dokumente, uebersprungen };
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
