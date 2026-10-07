/**
 * Der persönliche Kundenlink eines Exposés: gehört der Token zu diesem
 * Aufruf, gilt er noch, und was passiert beim Aufruf.
 *
 * Getrennt von `index.ts`, damit Vitest die Regeln ohne Deno prüfen kann
 * (`src/lib/exposeKundenlink.test.ts`).
 *
 * Die Regeln (Entscheidungen von Christian vom 23.09.2026):
 *   - Ein zurückgezogener Link gilt wie ein abgelaufener. Die Seite zeigt dann
 *     nur einen Hinweis mit den Kontaktdaten des Partners, sonst nichts.
 *   - Gezählt werden nur Anzahl und Zeitpunkt der Aufrufe. Kein Cookie, keine
 *     IP, nichts über den Betrachter.
 *   - Beim ersten Aufruf bekommt der Partner eine Glocke, genau einmal.
 */

/** Die Spalten, die für den Link gelesen werden, mit der Migration 20260923151000. */
export const LINK_SPALTEN =
  "id, objekt_id, wohnung_id, kontakt_id, erstellt_von, gueltig_bis, aufrufe, gesendet_von, zurueckgezogen_am, erstmals_aufgerufen_am";

/** Dieselben ohne die Spalten der Migration, damit der Link vorher weiterläuft. */
export const LINK_SPALTEN_ALT = "id, objekt_id, wohnung_id, kontakt_id, erstellt_von, gueltig_bis, aufrufe";

export interface ExposeLinkZeile {
  id: string;
  objekt_id: string;
  wohnung_id: string | null;
  kontakt_id: string | null;
  erstellt_von: string | null;
  gueltig_bis: string | null;
  aufrufe: number | null;
  gesendet_von?: string | null;
  zurueckgezogen_am?: string | null;
  erstmals_aufgerufen_am?: string | null;
}

/** Wofür ein Link bei einem Aufruf gilt: ein Objekt und höchstens eine Einheit davon. */
export interface LinkBereich {
  objekt_id: string;
  wohnung_id: string | null;
}

/** Die Einheit des Aufrufs, so wie sie aus der Tabelle `wohnungen` geladen wurde. */
export interface GeladeneEinheit {
  id?: unknown;
  objekt_id?: unknown;
}

/**
 * Für welche Seite gilt der Token bei diesem Aufruf? `null` heißt: gar nicht.
 *
 *   - Link zu einer Einheit: nur genau diese Einheit dieses Objekts. Er gilt
 *     weder für das ganze Objekt noch für eine andere Einheit.
 *   - Link zum ganzen Objekt (`wohnung_id` leer): das Objekt selbst und, seit
 *     dem 25.09.2026, jede Einheit DESSELBEN Objekts. So kommt der Kunde über
 *     „Ansehen“ in der Einheitentabelle direkt in das Exposé der Einheit, mit
 *     Partner und Sprache (Entscheidung Christian). Die Einheit muss dafür als
 *     geladene Zeile vorliegen (`einheit`), deren `objekt_id` die des Links
 *     ist. Eine Kennung nur aus der Adresse reicht nicht; fehlt die Zeile oder
 *     hängt sie an einem anderen Objekt, gilt der Token nicht.
 *   - Ein anderes Objekt: nie.
 */
export function linkBereich(
  zeile: Pick<ExposeLinkZeile, "objekt_id" | "wohnung_id">,
  objektId: string,
  wohnungId: string | null | undefined,
  einheit?: GeladeneEinheit | null,
): LinkBereich | null {
  if (!zeile.objekt_id || zeile.objekt_id !== objektId) return null;
  const aufruf = wohnungId || null;
  const eigene = zeile.wohnung_id || null;
  if (eigene) return aufruf === eigene ? { objekt_id: objektId, wohnung_id: eigene } : null;
  if (!aufruf) return { objekt_id: objektId, wohnung_id: null };
  const gehoertZumObjekt = !!einheit && einheit.id === aufruf && einheit.objekt_id === objektId;
  return gehoertZumObjekt ? { objekt_id: objektId, wohnung_id: aufruf } : null;
}

/**
 * Gehört das Exposé zu diesem Aufruf? Kurzform von `linkBereich`.
 *
 * Ohne geladene Einheit gilt, was bis zum 25.09.2026 immer galt: Objekt und
 * Einheit müssen beide stimmen.
 */
export function passtZumAufruf(
  zeile: Pick<ExposeLinkZeile, "objekt_id" | "wohnung_id">,
  objektId: string,
  wohnungId: string | null | undefined,
  einheit?: GeladeneEinheit | null,
): boolean {
  return linkBereich(zeile, objektId, wohnungId, einheit) !== null;
}

/**
 * Ist der Token einer für das Exposé?
 *
 * `objekt_exposes` bekommt mit dem Kundenlink die Spalte `art`: `expose` oder
 * `objektuebersicht`. Eine Objektübersicht liefert `get-kundenansicht` aus,
 * mit eigener Positivliste und eigener Ampel. Ihr Schlüssel öffnet hier
 * nichts, sonst ließe sich mit ihm das Exposé samt Partner abrufen und der
 * Aufruf würde am falschen Ort gezählt.
 *
 * Fehlt der Wert (Zeile vor der Migration), ist es ein Exposé.
 */
export function exposeArtErlaubt(art: unknown): boolean {
  if (art === null || art === undefined) return true;
  if (typeof art !== "string") return false;
  const wert = art.trim();
  return wert === "" || wert === "expose";
}

export type LinkZustand = "gueltig" | "abgelaufen";

/**
 * Gilt der Link noch?
 *
 * Zurückgezogen heißt abgelaufen. Ein leeres `gueltig_bis` gilt als gültig:
 * So stehen die intern gespeicherten Exposés da, die nie gesendet wurden. Ein
 * unlesbares Datum gilt dagegen als abgelaufen, im Zweifel lieber zu.
 */
export function linkZustand(
  zeile: Pick<ExposeLinkZeile, "gueltig_bis" | "zurueckgezogen_am">,
  jetzt: number = Date.now(),
): LinkZustand {
  if (zeile.zurueckgezogen_am) return "abgelaufen";
  if (zeile.gueltig_bis) {
    const frist = Date.parse(zeile.gueltig_bis);
    if (Number.isNaN(frist) || frist < jetzt) return "abgelaufen";
  }
  return "gueltig";
}

/** Das Ergebnis eines Schreibaufrufs, so lose wie nötig. */
interface Antwort {
  data: unknown;
  error: unknown;
}

/**
 * So viel vom Supabase-Client, wie das Zählen braucht. Der Aufrufer reicht
 * den echten Client herein, der Test eine Attrappe.
 */
export interface ZaehlFilter extends PromiseLike<Antwort> {
  eq: (feld: string, wert: unknown) => ZaehlFilter;
  is: (feld: string, wert: null) => ZaehlFilter;
  select: (spalten: string) => PromiseLike<Antwort>;
}
export interface ZaehlClient {
  from: (tabelle: string) => { update: (werte: Record<string, unknown>) => ZaehlFilter };
}

/**
 * Einen Aufruf zählen. Liefert, ob es der erste war.
 *
 * Der erste Aufruf wird mit einer Bedingung gesetzt („nur solange noch leer“).
 * Kommen zwei Anfragen gleichzeitig, trifft die Bedingung nur bei einer, und
 * nur sie löst die Glocke aus. Ohne die Spalten der Migration gibt es keinen
 * ersten Aufruf und damit keine Glocke; gezählt wird trotzdem.
 *
 * Wirft nie: Das Exposé soll nicht daran scheitern, dass der Zähler klemmt.
 */
export async function aufrufZaehlen(
  db: ZaehlClient,
  zeile: ExposeLinkZeile,
  mitVersandSpalten: boolean,
  jetzt: Date = new Date(),
): Promise<{ ersterAufruf: boolean }> {
  const zeit = jetzt.toISOString();
  let ersterAufruf = false;
  try {
    if (mitVersandSpalten && !zeile.erstmals_aufgerufen_am) {
      const { data, error } = await db
        .from("objekt_exposes")
        .update({ erstmals_aufgerufen_am: zeit })
        .eq("id", zeile.id)
        .is("erstmals_aufgerufen_am", null)
        .select("id");
      ersterAufruf = !error && Array.isArray(data) && data.length > 0;
    }
    await db
      .from("objekt_exposes")
      .update({ aufrufe: (Number(zeile.aufrufe) || 0) + 1, zuletzt_aufgerufen_am: zeit })
      .eq("id", zeile.id);
  } catch (fehler) {
    console.error("[get-expose] Aufruf nicht gezählt:", fehler instanceof Error ? fehler.message : fehler);
  }
  return { ersterAufruf };
}

/**
 * Wer die Glocke bekommt: der für den Kunden zuständige Partner und, falls
 * ein anderer das Exposé gesendet hat, auch dieser. Jeder nur einmal.
 */
export function glockenEmpfaenger(
  zustaendigId: string | null | undefined,
  gesendetVon: string | null | undefined,
  erstelltVon: string | null | undefined,
): string[] {
  const liste = [zustaendigId, gesendetVon || erstelltVon]
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);
  return [...new Set(liste)];
}

/** „Martina hat dein Exposé geöffnet“. Ohne Vornamen der Nachname, sonst „Dein Kunde“. */
export function glockenTitel(vorname: string | null | undefined, nachname?: string | null): string {
  const wer = (vorname || "").trim() || (nachname || "").trim() || "Dein Kunde";
  return `${wer} hat dein Exposé geöffnet`;
}

/** Der Text unter der Glocke. */
export function glockenText(bezeichnung: string): string {
  const b = bezeichnung.trim();
  return b ? `Das Exposé ${b} wurde zum ersten Mal aufgerufen.` : "Das Exposé wurde zum ersten Mal aufgerufen.";
}
