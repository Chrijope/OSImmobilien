/**
 * Die Dokumenten-Ampel: Welche Unterlage darf ein Kunde sehen?
 *
 * Freigegeben von Christian am 23.09.2026 (Bauplan Kundenansicht, Teil 2.4):
 *
 *   Grün  = Exposé und Beschreibung, Grundrisse und Pläne, Flächen,
 *           Teilungserklärung, Energie, Versicherung. Von Haus aus frei,
 *           Admin oder Inhaber können einzeln sperren.
 *   Gelb  = WEG und Hausgeld, Behördliche Auskünfte, Vertragsunterlagen,
 *           Sonstiges. Von Haus aus gesperrt, Admin oder Inhaber geben
 *           einzeln frei.
 *   Rot   = Mietverhältnis, Grundbuch. Nie im Original. Höchstens eine Kopie,
 *           die ein Admin als „geschwärzt geprüft" markiert UND freigegeben hat.
 *
 * Reine Funktionen ohne Deno- oder Browser-Bezug: Dieselbe Entscheidung fällt
 * im Server (`get-expose`, Kundenansicht) und in der Oberfläche. Maßgeblich
 * ist immer der Server, die Oberfläche zeigt nur an.
 *
 * VERTRAG: Die Exporte `Ampel`, `FreigabeDokument`, `dokumentOberbegriff`,
 * `dokumentAmpel` und `darfZumKunden` sind mit anderen Stellen abgesprochen.
 * Signaturen nicht ändern, nur erweitern.
 */
import { oberbegriffAusKategorie, oberbegriffAusTitel, titelNenntOberbegriff, type Oberbegriff } from "./dokument-gruppen.ts";

export type Ampel = "gruen" | "gelb" | "rot";

export interface FreigabeDokument {
  /** Titel oder Dateiname. */
  name: string;
  /** CRM-Kategorie, etwa "objektunterlagen". Für die Ampel selbst ohne Belang, siehe `internVonHand`. */
  kategorie?: string | null;
  investagonKategorie?: string | null;
  /** Beim Hochladen ausdrücklich intern markiert. Investagon-Dateien zählen nicht dazu. */
  internVonHand?: boolean;
  /** Entscheidung von Admin oder Inhaber. Leer heißt: Grundregel der Ampel. */
  kundenFreigabe?: "frei" | "gesperrt" | null;
  /** Vom Admin als geschwärzt geprüft markiert. Nur bei Rot von Bedeutung. */
  geschwaerzt?: boolean;
}

const AMPEL_JE_OBERBEGRIFF: Record<Oberbegriff, Ampel> = {
  "Exposé und Beschreibung": "gruen",
  "Grundrisse und Pläne": "gruen",
  "Flächen": "gruen",
  "Teilungserklärung": "gruen",
  "Energie": "gruen",
  "Versicherung": "gruen",
  "WEG und Hausgeld": "gelb",
  "Behördliche Auskünfte": "gelb",
  "Vertragsunterlagen": "gelb",
  "Sonstiges": "gelb",
  "Mietverhältnis": "rot",
  "Grundbuch": "rot",
};

const ROTE_OBERBEGRIFFE = (Object.keys(AMPEL_JE_OBERBEGRIFF) as Oberbegriff[]).filter((b) => AMPEL_JE_OBERBEGRIFF[b] === "rot");

/** Der Oberbegriff, unter dem die Unterlage in der Liste steht: erst die Investagon-Kategorie, sonst der Titel. */
export function dokumentOberbegriff(d: FreigabeDokument): string {
  return oberbegriffAusKategorie(d.investagonKategorie) ?? oberbegriffAusTitel(d.name);
}

/**
 * Die Ampelfarbe einer Unterlage.
 *
 * Grundlage ist der Oberbegriff. Rot hat Vorrang vor allem, deshalb zählt der
 * Titel zusätzlich für sich: Nennt er irgendwo ein Stichwort von
 * Mietverhältnis oder Grundbuch („Mietvertrag", „Kaution", „GBA"), ist die
 * Unterlage rot. Auch wenn der Verkäufer sie bei Investagon unter „Exposé"
 * abgelegt hat, und auch wenn die Liste sie wegen eines anderen Stichworts
 * anderswo einordnet („Mietvertrag Anlage Grundriss" steht bei den
 * Grundrissen). Ein falsch eingeordneter Mietvertrag mit Mieternamen wiegt
 * schwerer als eine Unterlage, die deshalb nicht von selbst hinausgeht.
 */
export function dokumentAmpel(d: FreigabeDokument): Ampel {
  const nachGruppe = AMPEL_JE_OBERBEGRIFF[dokumentOberbegriff(d) as Oberbegriff] ?? "gelb";
  if (nachGruppe === "rot") return "rot";
  if (ROTE_OBERBEGRIFFE.some((begriff) => titelNenntOberbegriff(d.name, begriff))) return "rot";
  return nachGruppe;
}

/**
 * Darf die Unterlage an einen Kunden hinaus?
 *
 * Reihenfolge der Regeln, die erste zutreffende entscheidet:
 *   1. Rot nur, wenn geschwärzt geprüft UND ausdrücklich frei. Sonst nie.
 *   2. Die Entscheidung von Admin oder Inhaber (frei oder gesperrt).
 *   3. Von Hand als intern markiert: gesperrt.
 *   4. Grundregel: Grün frei, Gelb gesperrt.
 */
export function darfZumKunden(d: FreigabeDokument): boolean {
  const ampel = dokumentAmpel(d);
  if (ampel === "rot") return d.geschwaerzt === true && d.kundenFreigabe === "frei";
  if (d.kundenFreigabe === "frei") return true;
  if (d.kundenFreigabe === "gesperrt") return false;
  if (d.internVonHand === true) return false;
  return ampel === "gruen";
}

/* ------------------------------------------------------------------ */
/* Aus einer Tabellenzeile die Angaben für die Ampel lesen             */
/* ------------------------------------------------------------------ */

/** Der Zeiger, den der Investagon-Import statt einer Adresse speichert. */
export const INVESTAGON_DOKUMENT_ZEIGER = "/investagon-dokument/";

/**
 * Stammt die Datei aus Investagon? Der Zeiger des Imports oder eine
 * Originaladresse bei Investagon selbst.
 */
export function istInvestagonDatei(url: unknown): boolean {
  const wert = typeof url === "string" ? url.trim() : "";
  if (wert.startsWith(INVESTAGON_DOKUMENT_ZEIGER)) return true;
  return /^https?:\/\/([a-z0-9-]+\.)*investagon\.com(?:[/:?#]|$)/i.test(wert);
}

/**
 * Ist die Unterlage intern, geht also nur mit ausdrücklicher Freigabe zum Kunden?
 *
 * Von Hand: die Kategorie „intern" (im CRM die Auswahl „Interne Unterlagen /
 * Tools" beim Hochladen) oder `sichtbar = false` an einer Objektunterlage.
 *
 * Bei Investagon-Dateien setzt der Import beides als bloße Voreinstellung,
 * das sagt dort nichts. Intern ist eine Investagon-Datei, wenn Titel oder
 * Dateiname nach `INTERNE_IMPORT_UNTERLAGE` klingen, heute die
 * Eigenprovisionsvereinbarungen für den Käufer (`istInterneInvestagonUnterlage`).
 */
export function internVonHandAusZeile(zeile: { url?: unknown; kategorie?: unknown; sichtbar?: unknown; name?: unknown }): boolean {
  if (istInvestagonDatei(zeile.url)) return istInterneInvestagonUnterlage(zeile);
  return zeile.kategorie === "intern" || zeile.sichtbar === false;
}

/**
 * Eine interne Unterlage aus Investagon, heute die Eigenprovisionsvereinbarungen
 * für den Käufer (Christian, 05.10.2026). Für alle Objektrollen sichtbar, zum
 * Kunden nur mit ausdrücklicher Freigabe, nie als Grundriss.
 *
 * Erkannt an Titel und Dateiname, nach demselben Muster, mit dem der Import
 * die Kategorie „intern“ vergibt. Die Kategorie selbst zählt nicht: Vor dem
 * 24.09.2026 legte der Import jede Datei als „intern“ ab, auch Grundrisse.
 * Im Bestand deckt sich beides (15 Unterlagen, Stand 05.10.2026).
 */
export function istInterneInvestagonUnterlage(zeile: { url?: unknown; name?: unknown }): boolean {
  if (!istInvestagonDatei(zeile.url)) return false;
  const url = String(zeile.url).split(/[?#]/)[0];
  const dateiname = url.slice(url.lastIndexOf("/") + 1);
  return INTERNE_IMPORT_UNTERLAGE.test(`${typeof zeile.name === "string" ? zeile.name : ""} ${dateiname}`);
}

/* ------------------------------------------------------------------ */
/* Die Kategorie einer Datei aus dem Investagon-Import                 */
/* ------------------------------------------------------------------ */

/**
 * Titel, die wirklich nur ins CRM gehören: Vergütung, Provision und
 * Vertriebsabsprachen sowie die eigene Einkaufskalkulation.
 *
 * Dieselbe Liste steht als regulärer Ausdruck in der Migration
 * `20260924150000_investagon_unterlagen_einordnen.sql`. Wer sie ändert,
 * ändert beide.
 */
export const INTERNE_IMPORT_UNTERLAGE =
  /provision|courtage|verg(ü|ue)tung|vertriebsvereinbarung|vertriebsvertrag|vermittlungsvertrag|vermittlungsvereinbarung|maklervertrag|maklerauftrag|tippgeber|kalkulation[\s_-]*einkauf|einkaufspreis|(^|[^a-zäöüß])intern([^a-zäöüß]|$)/i;

/**
 * Die Kategorie, unter der der Investagon-Import eine Datei ablegt.
 *
 * Bis zum 24.09.2026 legte er JEDE Datei als „intern“ ab. Baubeschreibung,
 * Teilungserklärung, Grundriss und Energieausweis galten damit als interne
 * Werkzeuge: Der Rechner fand „0 hinterlegte Dateien“, und die
 * Dokumentenseite zeigte „Intern · Kunde sieht“. Seitdem gilt: Unterlagen zum
 * Haus sind Objektunterlagen, Unterlagen zu einer Wohnung Wohnungsunterlagen,
 * und nur, was der Titel als Vergütung oder Vertriebsabsprache ausweist, ist
 * intern.
 *
 * Wer eine Unterlage beim Kunden sieht, hängt davon NICHT ab: Bei Dateien aus
 * Investagon zählt die Kategorie für die Ampel nicht (`internVonHandAusZeile`),
 * es entscheidet allein `darfZumKunden`. Mietvertrag und Grundbuch bleiben rot.
 */
export function investagonImportKategorie(
  ebene: "objekt" | "wohnung",
  ...namen: Array<string | null | undefined>
): "objektunterlagen" | "wohnungsunterlagen" | "intern" {
  const text = namen.filter((n): n is string => typeof n === "string").join(" ");
  if (INTERNE_IMPORT_UNTERLAGE.test(text)) return "intern";
  return ebene === "objekt" ? "objektunterlagen" : "wohnungsunterlagen";
}

/** Nur die beiden erlaubten Werte zählen, alles andere heißt „keine Entscheidung". */
export function kundenFreigabeWert(wert: unknown): "frei" | "gesperrt" | null {
  return wert === "frei" || wert === "gesperrt" ? wert : null;
}

/**
 * Die Angaben für die Ampel aus einer Zeile von `objekt_dokumente` oder
 * `wohnungs_dokumente`.
 *
 * `herkunft` ist Pflicht und entscheidet, ob Freigabe und Schwärzung zählen:
 *
 *   "tabelle"  Die Zeile kommt aus der Tabelle. Die Spalten `kunden_freigabe`
 *              und `geschwaerzt` schützt dort ein Auslöser, ändern dürfen sie
 *              nur Admin und Inhaber. Ohne Migration 20260923170000 fehlen
 *              sie, dann gilt die Grundregel.
 *   "meta"     Der Eintrag steht in `wohnungen.meta.dokumente`. Dieses JSON
 *              darf jede interne Rolle schreiben, ein dort stehendes „frei"
 *              ist also nichts wert. Es gilt immer die Grundregel.
 */
export function freigabeDokumentAusZeile(
  zeile: Record<string, unknown>,
  herkunft: "tabelle" | "meta",
  investagonKategorie?: string | null,
): FreigabeDokument {
  const vertrauenswuerdig = herkunft === "tabelle";
  return {
    name: typeof zeile.name === "string" ? zeile.name : "",
    kategorie: typeof zeile.kategorie === "string" ? zeile.kategorie : null,
    investagonKategorie: investagonKategorie ?? null,
    internVonHand: internVonHandAusZeile(zeile),
    kundenFreigabe: vertrauenswuerdig ? kundenFreigabeWert(zeile.kunden_freigabe) : null,
    geschwaerzt: vertrauenswuerdig && zeile.geschwaerzt === true,
  };
}
