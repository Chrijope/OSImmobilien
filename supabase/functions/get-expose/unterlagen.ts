/**
 * Welche Unterlagen das öffentliche Exposé herausgibt (Befund 1 aus dem
 * Bauplan Kundenansicht vom 23.09.2026).
 *
 * WAS VORHER HINAUSGING
 *
 * `get-expose` gab je Einheit die Unterlagen ungefiltert heraus, aus der
 * Tabelle `wohnungs_dokumente` und aus `meta.dokumente`: auch interne, mit
 * Namen und Ablageadresse. Die Exposé-Seite hat sie erst im Browser
 * aussortiert. Wer die Antwort selbst las, sah also Namen wie „Mietvertrag
 * WE 09" samt Ablagepfad, und eine Altdatei mit öffentlicher Adresse war für
 * jeden abrufbar, der den Exposé-Link kannte.
 *
 * WAS JETZT HINAUSGEHT
 *
 *   - Nur Unterlagen, die nach der Dokumenten-Ampel an Kunden dürfen
 *     (`_shared/dokument-freigabe.ts`): Grün ohne Sperre, Gelb nur nach
 *     Freigabe durch Admin oder Inhaber, Rot nur als geprüft geschwärzte und
 *     freigegebene Kopie.
 *   - Nur mit einer Adresse aus der öffentlichen Ablage (`objekt-medien`).
 *     Zeiger auf die geschützten Eimer, Pfade im privaten Speicher,
 *     befristete Adressen und Originaladressen bei Investagon bleiben drin.
 *     Eine Unterlage ohne solche Adresse fällt ganz weg: Das Exposé hätte
 *     ohne Anmeldung ohnehin nichts damit anfangen können.
 *   - Je Unterlage genau fünf Angaben: Kennung, Name, Adresse, Kategorie,
 *     sichtbar. Die Kategorie ist immer die kundentaugliche („objektunterlagen"
 *     beziehungsweise „wohnungsunterlagen"), ein internes Kennzeichen verlässt
 *     den Server nie.
 *
 * GRUNDRISSE AUS INVESTAGON (seit dem 23.09.2026, Entscheidung Christian)
 *
 * Bis dahin gingen Grundriss und Energieausweis als Originaladressen bei
 * Investagon hinaus (`meta.investagonRaw.files`). Jetzt wie in der
 * Kundenansicht: keine Adresse bei Investagon, keine Adresse eines fremden
 * Servers. Der Kundenlink bekommt die Grundrisse als Liste ohne Adresse
 * (`kundenGrundrisse`), die Datei selbst holt die Seite einzeln über die
 * Aktion „datei“, als befristete Adresse (15 Minuten) auf die Kopie im
 * eigenen Speicher. Ohne gültigen Schlüssel gibt es weder Liste noch Datei.
 *
 * WELCHE GRUNDRISSE (seit dem 23.09.2026, Auftrag Christian)
 *
 * Bis dahin kamen nur Dateien, die Investagon als `layout` führt. Ein von
 * Hand hochgeladener Plan im geschützten Eimer fehlte im Kundenlink ganz,
 * ebenso ein Plan aus einem Dokumentenpaket ohne Kategorie. Jetzt gilt die
 * gemeinsame Regel aus `_shared/grundriss-erkennung.ts`, dieselbe wie im
 * internen Exposé: Erkennung an Kategorie, Name und Dateiname, Zuordnung zur
 * Einheit über die Nummer, lieber kein Plan als der einer fremden Wohnung.
 * Die Datei geht weiterhin nur befristet über die Aktion „datei“ hinaus.
 *
 * Getrennt von `index.ts`, damit Vitest die Regeln ohne Deno prüfen kann
 * (`src/lib/exposeUnterlagen.test.ts`).
 */
import { darfZumKunden, freigabeDokumentAusZeile } from "../_shared/dokument-freigabe.ts";
import { investagonKategorieAusRohdaten } from "../_shared/dokument-gruppen.ts";
import { dateinameAusAblage, ersatzArt, grundrisseWaehlen, istUebernahmeKopie, planIstBild, type ErsatzArt, type PlanKandidat } from "../_shared/grundriss-erkennung.ts";
import { istExposeToken } from "../_shared/expose-oeffentlich.ts";
// Dieselbe Regel wie in der Kundenansicht, welche Ablage eine Datei haben darf.
import { ablageFuer, DATEI_GUELTIG_SEKUNDEN, istKennung, type Ablage } from "../_shared/kunden-ablage.ts";

export { DATEI_GUELTIG_SEKUNDEN };

export type UnterlagenKategorie = "objektunterlagen" | "wohnungsunterlagen";

export interface OeffentlicheUnterlage {
  id: string;
  name: string;
  url: string;
  kategorie: UnterlagenKategorie;
  sichtbar: true;
}

/**
 * Eimer, deren Adressen ohne Anmeldung hinausdürfen. Positivliste: Fotos,
 * Exposés und Grundrisse liegen in `objekt-medien`. Ein neuer öffentlicher
 * Eimer für Unterlagen muss hier bewusst dazukommen.
 */
const OEFFENTLICHE_EIMER = ["objekt-medien"] as const;

/**
 * Die Adresse, unter der eine Unterlage ohne Anmeldung abrufbar sein darf,
 * oder nichts.
 */
export function oeffentlicheAdresse(url: unknown): string | undefined {
  const wert = typeof url === "string" ? url.trim() : "";
  const treffer = wert.match(/^https:\/\/[^/?#]+\/storage\/v1\/object\/public\/([^/?#]+)\/[^?#]+/i);
  if (!treffer) return undefined;
  return (OEFFENTLICHE_EIMER as readonly string[]).includes(treffer[1]) ? wert : undefined;
}

function alsZeile(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function textWert(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
}

export interface UnterlagenQuelle {
  /** Zeilen aus `objekt_dokumente` beziehungsweise `wohnungs_dokumente`. */
  zeilen: unknown;
  /** Einträge aus `wohnungen.meta.dokumente`. Freigaben darin zählen nicht, siehe `freigabeDokumentAusZeile`. */
  metaEintraege?: unknown;
  kategorie: UnterlagenKategorie;
  /** `meta.investagonRaw` des Objekts beziehungsweise der Einheit, für die Kategorie der Datei. */
  investagonRoh?: unknown;
}

/**
 * Die Unterlagen eines Objekts oder einer Einheit, so wie sie ins öffentliche
 * Exposé dürfen.
 *
 * Tabelle und `meta.dokumente` werden über die Adresse zusammengeführt, die
 * Tabellenzeile gewinnt. Sonst brächte eine alte Kopie in `meta` eine
 * Unterlage zurück, die Admin oder Inhaber in der Tabelle gesperrt haben.
 */
export function oeffentlicheUnterlagen(q: UnterlagenQuelle): OeffentlicheUnterlage[] {
  const kategorieFuer = investagonKategorieAusRohdaten(q.investagonRoh);
  const kandidaten = new Map<string, { zeile: Record<string, unknown>; herkunft: "tabelle" | "meta" }>();
  const tabellenIds = new Set<string>();

  for (const roh of Array.isArray(q.zeilen) ? q.zeilen : []) {
    const zeile = alsZeile(roh);
    const url = textWert(zeile?.url);
    if (!zeile || !url) continue;
    kandidaten.set(url, { zeile, herkunft: "tabelle" });
    const id = textWert(zeile.id);
    if (id) tabellenIds.add(id);
  }
  for (const roh of Array.isArray(q.metaEintraege) ? q.metaEintraege : []) {
    const zeile = alsZeile(roh);
    const url = textWert(zeile?.url);
    if (!zeile || !url || kandidaten.has(url) || tabellenIds.has(textWert(zeile.id))) continue;
    // Die Kopie eines aus einer PDF übernommenen Plans ist veraltet, der Plan selbst steht in der Tabelle.
    if (istUebernahmeKopie(url)) continue;
    kandidaten.set(url, { zeile, herkunft: "meta" });
  }

  const ergebnis: OeffentlicheUnterlage[] = [];
  for (const { zeile, herkunft } of kandidaten.values()) {
    const name = textWert(zeile.name);
    const freigabe = freigabeDokumentAusZeile(zeile, herkunft, kategorieFuer(name));
    if (!darfZumKunden(freigabe)) continue;
    const url = oeffentlicheAdresse(zeile.url);
    if (!url) continue;
    ergebnis.push({ id: textWert(zeile.id) || url, name, url, kategorie: q.kategorie, sichtbar: true });
  }
  return ergebnis;
}

/* ────────────────────────────────────────────────────────────────────────
 * Grundrisse, nur über den Kundenlink
 * ──────────────────────────────────────────────────────────────────────── */

export type Bereich = "objekt" | "wohnung";

/**
 * Ein Grundriss, wie ihn die Exposé-Seite erfährt: Kennung, Bereich, Name
 * und ob er sich als Bild zeigen lässt. Nie eine Adresse. Die Kennung ist die
 * der Tabellenzeile beziehungsweise des Eintrags in `meta.dokumente`.
 */
export interface KundenGrundriss {
  id: string;
  bereich: Bereich;
  wohnungId: string | null;
  name: string;
  istBild: boolean;
  /** Kein eigener Plan der Einheit, sondern der des Geschosses oder des Hauses. Die Seite beschriftet ihn so. */
  ersatz?: ErsatzArt;
}

/** Derselbe Grundriss mit Eimer und Pfad, nur im Server. */
export interface GrundrissIntern extends KundenGrundriss {
  ablage: Ablage;
}

function zeilenAus(liste: unknown): Record<string, unknown>[] {
  return (Array.isArray(liste) ? liste : []).map(alsZeile).filter((z): z is Record<string, unknown> => !!z);
}

export interface GrundrissQuelle {
  /** `meta.investagonRaw` des Objekts, ungefiltert aus der Zeile. */
  objektRoh: unknown;
  /** Zeilen aus `objekt_dokumente`. */
  objektZeilen: unknown;
  /** `objekte.meta.einzelwohnung`: Dann gehört jeder Plan am Objekt der einen Einheit. */
  einzelwohnung?: boolean;
  /**
   * Nur die Einheit des Kundenlinks. Ohne Einheit (Objekt-Exposé) gibt es nur
   * die Pläne am Objekt. `metaEintraege` sind die von Hand hochgeladenen
   * Unterlagen aus `wohnungen.meta.dokumente`, etwa der Grundriss „wd2“.
   */
  wohnung?: { id: string; weNr: unknown; etage?: unknown; roh: unknown; zeilen: unknown; metaEintraege?: unknown } | null;
}

type Kandidat = PlanKandidat & { id: string; wohnungId: string | null; ablage: Ablage };

/**
 * Die Grundrisse, die der Kunde sehen darf.
 *
 * Hinaus darf ein Plan nur, wenn alles zutrifft:
 *   - Die Ampel lässt ihn hinaus, nach der Zeile, der Investagon-Kategorie
 *     und dem Namen. Sperrt Admin oder Inhaber die Zeile, ist er weg, und
 *     nennt der Name einen Mietvertrag, ebenfalls. Freigabe und Schwärzung
 *     zählen nur aus der Tabelle, nie aus `meta.dokumente`.
 *   - Er liegt im eigenen Speicher (`ablageFuer`). Eine Adresse bei
 *     Investagon oder auf einem fremden Server ergibt nichts, auf sie wird
 *     nie ausgewichen.
 *   - `grundrisseWaehlen` erkennt ihn als Grundriss und ordnet ihn dieser
 *     Einheit zu: erst die Pläne der Einheit, dann die des Objekts mit ihrer
 *     Nummer, zuletzt ein Plan des ganzen Hauses. Nie eine fremde Nummer.
 */
export function kundenGrundrisse(q: GrundrissQuelle): GrundrissIntern[] {
  const kandidaten: Kandidat[] = [];
  const vergeben = new Set<string>();
  const dazu = (
    bereich: Bereich,
    wohnungId: string | null,
    zeilen: Record<string, unknown>[],
    herkunft: "tabelle" | "meta",
    roh: unknown,
  ) => {
    const kategorieFuer = investagonKategorieAusRohdaten(roh);
    for (const zeile of zeilen) {
      const id = textWert(zeile.id);
      const ablage = ablageFuer(zeile.url);
      if (!ablage || !istKennung(id) || vergeben.has(`${bereich}:${id}`)) continue;
      const name = textWert(zeile.name);
      const kategorie = kategorieFuer(name) ?? null;
      if (!darfZumKunden(freigabeDokumentAusZeile(zeile, herkunft, kategorie))) continue;
      vergeben.add(`${bereich}:${id}`);
      kandidaten.push({ id, bereich, wohnungId, name, dateiname: dateinameAusAblage(ablage.pfad), investagonKategorie: kategorie, ablage });
    }
  };

  if (q.wohnung) {
    const tabelle = zeilenAus(q.wohnung.zeilen);
    dazu("wohnung", q.wohnung.id, tabelle, "tabelle", q.wohnung.roh);
    // Wie `oeffentlicheUnterlagen`: Steht dieselbe Datei oder Kennung in der Tabelle, gilt die Tabelle.
    const tabellenUrls = new Set(tabelle.map((z) => textWert(z.url)).filter(Boolean));
    const tabellenIds = new Set(tabelle.map((z) => textWert(z.id)).filter(Boolean));
    const nurMeta = zeilenAus(q.wohnung.metaEintraege)
      .filter((z) => !tabellenUrls.has(textWert(z.url)) && !tabellenIds.has(textWert(z.id)) && !istUebernahmeKopie(z.url));
    dazu("wohnung", q.wohnung.id, nurMeta, "meta", q.wohnung.roh);
  }
  dazu("objekt", null, zeilenAus(q.objektZeilen), "tabelle", q.objektRoh);

  const ziel = {
    weNr: q.wohnung ? textWert(q.wohnung.weNr) : null,
    einzelwohnung: q.einzelwohnung === true,
    etage: q.wohnung ? textWert(q.wohnung.etage) : null,
  };
  return grundrisseWaehlen(kandidaten, ziel).map((k) => {
    const ersatz = ersatzArt(k, ziel);
    return {
      id: k.id,
      bereich: k.bereich,
      wohnungId: k.wohnungId,
      name: k.name,
      istBild: planIstBild(k.dateiname, k.name),
      ...(ersatz ? { ersatz } : {}),
      ablage: k.ablage,
    };
  });
}

/**
 * Die Grundrisse zu einem geprüften Kundenlink.
 *
 * Dieselbe Rechnung für die Liste beim Laden und für die Aktion „datei“:
 * Was die Liste nicht enthält, gibt es auch nicht als Datei. Die Einheit muss
 * die des Links sein und zu diesem Objekt gehören, sonst gibt es gar nichts.
 */
export function grundrisseZumLink(e: {
  link: { objekt_id: string; wohnung_id: string | null };
  objekt: Record<string, unknown>;
  objektZeilen: unknown;
  wohnungen: unknown;
}): GrundrissIntern[] {
  if (!e.link.objekt_id || textWert(e.objekt.id) !== e.link.objekt_id) return [];
  const wohnungId = e.link.wohnung_id || null;
  let wohnung: Record<string, unknown> | undefined;
  if (wohnungId) {
    wohnung = (Array.isArray(e.wohnungen) ? e.wohnungen : [])
      .map(alsZeile)
      .find((w) => !!w && textWert(w.id) === wohnungId && textWert(w.objekt_id) === e.link.objekt_id);
    if (!wohnung) return [];
  }
  const objektMeta = alsZeile(e.objekt.meta);
  return kundenGrundrisse({
    objektRoh: objektMeta?.investagonRaw,
    objektZeilen: e.objektZeilen,
    einzelwohnung: objektMeta?.einzelwohnung === true,
    wohnung: wohnung && wohnungId
      ? {
        id: wohnungId,
        weNr: wohnung.we_nr,
        etage: wohnung.etage,
        roh: alsZeile(wohnung.meta)?.investagonRaw,
        zeilen: wohnung.wohnungs_dokumente,
        metaEintraege: alsZeile(wohnung.meta)?.dokumente,
      }
      : null,
  });
}

/** Der Grundriss ohne seine Ablage, so wie er in die Antwort geht. */
export function grundrissOhneAblage(g: GrundrissIntern): KundenGrundriss {
  const { ablage: _ablage, ...rest } = g;
  return rest;
}

/** Welcher Grundriss gemeint ist. */
export interface DateiAnfrage {
  token: string;
  bereich: Bereich;
  id: string;
}

/**
 * Die Aktion „datei“ aus der Adresse lesen:
 * `?aktion=datei&id=<Objekt>&token=<Schlüssel>&bereich=objekt|wohnung&datei=<Kennung>`.
 *
 * Ohne Schlüssel in gültiger Form gibt es keine Datei, auch nicht für die
 * öffentliche Vorschau ohne Kunden. Was nicht passt, ist `null`.
 */
export function pruefeDateiAnfrage(p: URLSearchParams): DateiAnfrage | null {
  const token = p.get("token");
  if (!istExposeToken(token)) return null;
  const bereich = p.get("bereich");
  if (bereich !== "objekt" && bereich !== "wohnung") return null;
  const id = p.get("datei");
  if (!istKennung(id)) return null;
  const wohnung = p.get("wohnung");
  if (wohnung !== null && wohnung !== "" && !istKennung(wohnung)) return null;
  return { token, bereich, id };
}

/** Der gemeinte Grundriss aus der geprüften Liste, oder nichts. */
export function findeGrundriss(liste: GrundrissIntern[], anfrage: Pick<DateiAnfrage, "bereich" | "id">): GrundrissIntern | undefined {
  return liste.find((g) => g.bereich === anfrage.bereich && g.id === anfrage.id);
}
