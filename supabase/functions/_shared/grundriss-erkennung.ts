/**
 * Grundrisse erkennen und der richtigen Einheit zuordnen.
 *
 * Reine Funktionen ohne Deno- oder Browser-Bezug, wie `dokument-gruppen.ts`.
 * Dieselbe Entscheidung fällt im Browser (`src/lib/exposeInhalt.ts`, internes
 * Exposé und PDF) und im Server (`get-expose/unterlagen.ts`, Kundenlink).
 * Zwei getrennte Regeln liefen früher oder später auseinander, und dann sähe
 * der Kunde einen anderen Plan als der Berater in der Vorschau.
 *
 * WORAN EIN GRUNDRISS ERKANNT WIRD
 *
 *   1. Investagon führt die Datei als Grundriss (`layout`). Eine andere
 *      Investagon-Kategorie (Mietvertrag, Energieausweis, Teilungserklärung,
 *      Lageplan) schließt aus, nur „Sonstiges“ und „Exposé“ lassen den Namen
 *      entscheiden.
 *   2. Sonst der Name samt Dateiname: „Grundriss“, „Floor plan“,
 *      „Wohnungsplan“ sicher, „GR“ als eigenes Wort ziemlich sicher, „Plan“
 *      oder „Pläne“ als eigenes Wort schwach.
 *   3. Nie, wenn der Name einen Mietvertrag oder Grundbuchauszug nennt, und
 *      nie, wenn er nach der Stichwortliste zu einer anderen Gruppe gehört
 *      („Teilungserklärung mit Grundrissen“, „Kaufvertrag Anlage Grundriss“).
 *   4. Nebenpläne ohne Einheitennummer zählen nicht: Lageplan, Schnitt,
 *      Ansicht, Keller, Tiefgarage, Stellplatz, Außenanlagen.
 *
 * Ob der Plan hinausdarf, entscheidet danach unverändert die Ampel
 * (`dokument-freigabe.ts`). Diese Datei lockert nichts.
 *
 * WIE ER DER EINHEIT ZUGEORDNET WIRD
 *
 * Grundsatz: lieber kein Plan als der einer fremden Wohnung. Ein falscher
 * Grundriss im Exposé ist eine falsche Angabe in einem Dokument, auf das
 * sich ein Käufer beruft, ein fehlender nur eine Lücke.
 *
 * Exposé einer Einheit, in dieser Rangfolge, und nur die beste Stufe zählt:
 *   Stufe 1  Plan an der Einheit selbst, sofern er keine fremde Nummer nennt.
 *   Stufe 2  Plan am Objekt, der genau diese Einheit nennt („WE 7“,
 *            „Whg. 7“, „Wohnung Nr. 07“).
 *            Bei einer Einzelwohnung zählt hier auch jeder Plan am Objekt
 *            ohne Nummer, er gehört der einen Einheit.
 *   Stufe 3  Ersatz: der Plan des Geschosses, in dem die Einheit liegt
 *            („Grundriss 2. OG“ für eine Einheit im 2. OG). Ein Plan eines
 *            anderen Geschosses nie, und ohne bekannte Etage auch keiner.
 *   Stufe 4  Ersatz: ein Plan des ganzen Hauses („Pläne Haus 9“,
 *            „Grundrisse gesamt“). Ein bloßes „Grundriss.jpg“ an einem Haus
 *            mit zwanzig Wohnungen kann jeder von ihnen gehören und bleibt weg.
 *
 * Und davon genau einer (Christian, 24.09.2026): zuerst der eigene Grundriss
 * der Einheit, ohne ihn EIN Geschoss- oder Hausplan, sonst keiner. Ein
 * Ersatzplan trägt seine Art (`ersatzArt`), damit das Exposé ihn als
 * „Geschossplan“ oder „Hausplan“ beschriften kann und niemand ihn für den
 * Plan der Wohnung hält.
 *
 * Exposé des ganzen Objekts: erst die Pläne ohne Nummer, sonst die Pläne der
 * Einheiten.
 *
 * Innerhalb der Stufe gewinnt der sicherer erkannte Plan, dann das Bild vor
 * der PDF (es lässt sich überall zeigen, auch im PDF-Exposé). Dieselbe Datei
 * unter gleichem Namen als Bild und als PDF erscheint nur einmal.
 */
import { normalisiereTitel, oberbegriffAusKategorie, oberbegriffAusTitel, titelNenntOberbegriff } from "./dokument-gruppen.ts";
import { INTERNE_IMPORT_UNTERLAGE } from "./dokument-freigabe.ts";

export type PlanBereich = "wohnung" | "objekt";

/** Eine Unterlage, die ein Grundriss sein könnte. */
export interface PlanKandidat {
  /** Name der Zeile, also Titel oder Originalname. */
  name: string;
  /** Dateiname aus der Ablage. Trägt oft die Nummer, die im Titel fehlt („WE7_Grundriss.jpg“). */
  dateiname?: string;
  /** Die Investagon-Kategorie, wenn sie sich über die Rohdaten finden lässt. */
  investagonKategorie?: string | null;
  /** Hängt die Unterlage an der Einheit oder am Objekt? */
  bereich: PlanBereich;
}

/** Für wen gewählt wird. */
export interface PlanZiel {
  /** Nummer der Einheit, etwa „WE 07“. `null` beim Exposé des ganzen Objekts. */
  weNr: string | null;
  /**
   * Ausdrücklich als Einzelwohnung angelegt (`objekte.meta.einzelwohnung`).
   * Dann gehört jeder Plan am Objekt dieser einen Einheit, auch ohne Nummer.
   */
  einzelwohnung?: boolean;
  /** Die Etage der Einheit („2. OG“, „2“, „EG“), für den Geschossplan als Ersatz. */
  etage?: string | null;
}

/** Ein Ersatzplan statt des eigenen Grundrisses der Einheit. */
export type ErsatzArt = "geschossplan" | "hausplan";

/**
 * Steht im Dateinamen jedes Plans, den „Grundriss aus PDF übernehmen“ angelegt
 * hat (`src/lib/grundrissAusPdf.ts`). Solche Pläne stehen immer als Zeile in
 * der Tabelle. Ein Eintrag mit diesem Kennzeichen in `wohnungen.meta.dokumente`
 * ist deshalb eine veraltete Kopie: Die Objektanlage kopiert beim Speichern
 * alle Unterlagen einer Einheit dorthin. Nach „Ersetzen“ brächte sie den
 * alten Plan zurück, darum zählt sie nirgends.
 */
export const UEBERNAHME_KENNZEICHEN = "grundriss-aus-pdf";

/** Ist dieser Eintrag aus `meta.dokumente` die Kopie eines übernommenen Plans? */
export function istUebernahmeKopie(url: unknown): boolean {
  return typeof url === "string" && url.includes(UEBERNAHME_KENNZEICHEN);
}

/** Wie viele Pläne höchstens ins Exposé einer Einheit gehen: der eine der Einheit. */
export const HOECHSTENS_PLAENE_EINHEIT = 1;
/** Wie viele Pläne höchstens ins Exposé des ganzen Objekts gehen. Jede PDF wird dort Seite für Seite gezeichnet. */
export const HOECHSTENS_PLAENE_OBJEKT = 12;

/* ────────────────────────────────────────────────────────────────────────
 * Einheitennummern
 * ──────────────────────────────────────────────────────────────────────── */

/*
 * Vorsilben, hinter denen eine Einheitennummer steht. „Nr.“ allein zählt
 * nicht, das ist oft die Hausnummer („Haus Nr. 9“). Bewusst ohne
 * Rückwärtsblick im regulären Ausdruck: Ältere Safari-Versionen brechen daran
 * beim Laden der ganzen Seite ab.
 */
const EINHEIT_VORSILBE = "we|whg|wohnung|wohneinheit|einheit|etw|app|appartement|apartment|unit";
/** Eine Nummer wie „7“, „07“, „7a“ oder „1.02“. Ein Buchstabe nur, wenn kein weiterer folgt („WE7Grundriss“ ist 7). */
const NUMMER = "(\\d{1,4}(?:\\.\\d{1,3})?(?:[a-z](?![a-z]))?)(?!\\d)";
const EINHEIT_NUMMER = new RegExp(`(?:^|[^a-z])(?:${EINHEIT_VORSILBE})[\\s._#:-]*(?:nr[\\s._#:-]*)?${NUMMER}`, "g");
const NACKTE_NUMMER = new RegExp(`^(?:nr[\\s._#:-]*)?${NUMMER}$`);

/** „07“ und „7“, „1.02“ und „1.2“ sind dieselbe Einheit. */
function nummerNormal(roh: string): string {
  return roh.split(".").map((teil) => teil.replace(/^0+(?=\d)/, "")).join(".");
}

/** Alle Einheitennummern, die ein Text nennt, klein und ohne führende Nullen. */
export function einheitNummern(text: string | null | undefined): string[] {
  const klein = (text || "").normalize("NFC").toLowerCase();
  const gefunden = new Set<string>();
  for (const treffer of klein.matchAll(EINHEIT_NUMMER)) gefunden.add(nummerNormal(treffer[1]));
  return [...gefunden];
}

/**
 * Die eigene Nummer einer Einheit aus `we_nr`. „WE 07“, „7“ und „6b“ ergeben
 * eine Nummer, eine Lagebeschreibung wie „2. OG links“ keine: Aus ihr eine
 * Nummer zu raten, führte zum Plan einer fremden Wohnung.
 */
export function eigeneEinheitNummer(weNr: string | null | undefined): string | undefined {
  const klein = (weNr || "").normalize("NFC").trim().toLowerCase();
  if (!klein) return undefined;
  const mitVorsilbe = einheitNummern(klein)[0];
  if (mitVorsilbe) return mitVorsilbe;
  const nackt = NACKTE_NUMMER.exec(klein);
  return nackt ? nummerNormal(nackt[1]) : undefined;
}

/**
 * Nennt der Text ausdrücklich eine andere Einheit als diese? Ohne eigene
 * Nummer lässt sich das nicht sagen, dann nein.
 */
export function nenntFremdeEinheit(text: string, weNr: string | null | undefined): boolean {
  const eigene = eigeneEinheitNummer(weNr);
  if (!eigene) return false;
  const genannt = einheitNummern(text);
  return genannt.length > 0 && !genannt.includes(eigene);
}

/* ────────────────────────────────────────────────────────────────────────
 * Erkennen
 * ──────────────────────────────────────────────────────────────────────── */

/** Wortteile, die sicher einen Grundriss meinen. In der Schreibweise von `normalisiereTitel`. */
const SICHER = ["grundriss", "floor plan", "floorplan", "wohnungsplan"];
/** Abkürzung „GR“, nur als eigenes Wort („WE12_GR.pdf“), sonst träfe es „Grenze“. */
const KUERZEL = ["gr"];
/** Ein Plan ohne nähere Angabe. Als eigenes Wort, damit „Wirtschaftsplan“ nicht zählt. */
const ALLGEMEIN = ["plan", "plaene", "plans", "bauzeichnung", "bauzeichnungen"];

/** Worte, an denen man einen Plan des ganzen Hauses erkennt. Geschosse erkennt `geschossSchluessel`. */
const GANZES_HAUS = ["haus", "gebaeude", "gesamt", "gesamtplan", "uebersicht", "alle", "plaene", "grundrisse"];

/**
 * Das Geschoss, das ein Text nennt, in einer Vergleichsform: „eg“, „og2“,
 * „dg“, „ug“. „2. OG“, „OG 2“, „2. Obergeschoss“, „2. Etage“ und die nackte
 * Etage „2“ ergeben dasselbe. Ein „OG“ ohne Zahl nennt ein Geschoss, das
 * sich nicht zuordnen lässt („og?“).
 */
export function geschossSchluessel(text: string | null | undefined, nackteZahl = false): string | undefined {
  const t = (text || "").normalize("NFC").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  if (!t.trim()) return undefined;
  if (nackteZahl) {
    const n = /^\s*(-?\d{1,2})\s*$/.exec(t);
    if (n) return Number(n[1]) === 0 ? "eg" : Number(n[1]) < 0 ? "ug" : `og${Number(n[1])}`;
  }
  const og = /(?:^|[^a-z0-9])(\d{1,2})\s*\.?\s*(?:og|obergeschoss|etage|stock|stockwerk)(?![a-z])/.exec(t)
    || /(?:^|[^a-z0-9])og\s*(\d{1,2})(?!\d)/.exec(t);
  if (og) return `og${Number(og[1])}`;
  if (/(?:^|[^a-z])(?:eg|erdgeschoss|hochparterre|parterre)(?![a-z])/.test(t)) return "eg";
  if (/(?:^|[^a-z])(?:dg|dachgeschoss|staffelgeschoss)(?![a-z])/.test(t)) return "dg";
  if (/(?:^|[^a-z])(?:ug|untergeschoss|souterrain|kellergeschoss)(?![a-z])/.test(t)) return "ug";
  if (/(?:^|[^a-z])(?:og|obergeschoss|regelgeschoss|etage|geschoss)(?![a-z])/.test(t)) return "og?";
  return undefined;
}

/** Pläne, die nicht die Wohnung zeigen. Nur ohne Einheitennummer ausgeschlossen: „WE 3 mit Keller“ bleibt. */
const NEBENPLAN = [
  "lageplan", "lage", "schnitt", "schnitte", "ansicht", "ansichten", "keller", "kellergeschoss", "tiefgarage", "tg",
  "garage", "stellplatz", "stellplaetze", "aussenanlage", "aussenanlagen", "freianlage", "freianlagen", "flurkarte",
  "brandschutzplan", "fluchtplan", "rettungsplan", "fluchtwegeplan", "entwaesserungsplan",
];

/** Investagon-Kategorien, bei denen der Name entscheiden darf. Alles andere hat der Verkäufer ausdrücklich anders eingeordnet. */
const NAME_ENTSCHEIDET = new Set(["", "other_object", "expose"]);

function woerter(text: string): string[] {
  return normalisiereTitel(text).split(" ").filter(Boolean);
}

function textVon(k: Pick<PlanKandidat, "name" | "dateiname">): string {
  return [k.name, k.dateiname].filter(Boolean).join(" ");
}

/**
 * Wie sicher die Unterlage ein Grundriss ist: 0 gar nicht, 1 schwach („Plan“),
 * 2 ziemlich („GR“), 3 sicher („Grundriss“ oder Investagon `layout`).
 */
export function grundrissStaerke(k: Pick<PlanKandidat, "name" | "dateiname" | "investagonKategorie">): 0 | 1 | 2 | 3 {
  const text = textVon(k);
  const normal = normalisiereTitel(text);
  if (!normal) return 0;
  // Rot geht immer vor: Ein Mietvertrag bleibt einer, auch unter „Grundriss“.
  if (titelNenntOberbegriff(text, "Mietverhältnis") || titelNenntOberbegriff(text, "Grundbuch")) return 0;
  // Eine Eigenprovisionsvereinbarung ist nie ein Grundriss, auch nicht unter „Grundriss Eigenprovisionsvereinbarung“.
  if (INTERNE_IMPORT_UNTERLAGE.test(text)) return 0;
  const liste = woerter(text);
  const nebenplan = einheitNummern(text).length === 0 && liste.some((w) => NEBENPLAN.includes(w));

  const kategorie = (k.investagonKategorie || "").trim();
  if (kategorie === "layout") return nebenplan ? 0 : 3;
  if (!NAME_ENTSCHEIDET.has(kategorie) && oberbegriffAusKategorie(kategorie)) return 0;

  const begriff = oberbegriffAusTitel(text);
  if (begriff !== "Grundrisse und Pläne" && begriff !== "Sonstiges") return 0;
  if (nebenplan) return 0;
  if (SICHER.some((teil) => normal.includes(teil))) return 3;
  if (liste.some((w) => KUERZEL.includes(w))) return 2;
  if (liste.some((w) => ALLGEMEIN.includes(w))) return 1;
  return 0;
}

/* ────────────────────────────────────────────────────────────────────────
 * Dateinamen
 * ──────────────────────────────────────────────────────────────────────── */

const BILD_ENDUNG = /\.(?:png|jpe?g|webp|gif)$/i;
const ENDUNG = /\.([a-z0-9]{2,5})$/i;

function ohneAbfrage(wert: string): string {
  return (wert || "").split(/[?#]/)[0];
}

/**
 * Der Dateiname hinter einer gespeicherten Adresse oder einem Ablagepfad,
 * ohne Abfrageteil und ohne das Kürzel, das der Investagon-Import vorn
 * anhängt („1a2b3c4d-WE18_Grundriss.jpg“ wird „WE18_Grundriss.jpg“).
 */
export function dateinameAusAblage(gespeichert: string | null | undefined): string {
  const letztes = ohneAbfrage(gespeichert || "").split("/").filter(Boolean).pop() || "";
  let name = letztes;
  try {
    name = decodeURIComponent(letztes);
  } catch {
    // Kaputt kodiert: dann eben der Rohwert.
  }
  return name.replace(/^[0-9a-f]{8}-/i, "");
}

/**
 * Lässt sich der Plan als Bild zeigen? Die Endung der Datei entscheidet, erst
 * ersatzweise die des Namens. Eine befristete Adresse trägt ihren Schlüssel
 * im Abfrageteil, deshalb zählt nur der Teil davor.
 */
export function planIstBild(dateiname: string | null | undefined, name?: string | null): boolean {
  const datei = ohneAbfrage(dateiname || "");
  if (ENDUNG.test(datei) && /[a-z]/i.test(ENDUNG.exec(datei)?.[1] ?? "")) return BILD_ENDUNG.test(datei);
  return BILD_ENDUNG.test(ohneAbfrage(name || ""));
}

/** Der Name, unter dem der Plan im Exposé steht: ohne Dateiendung und ohne Unterstriche. */
export function planAnzeigename(name: string | null | undefined): string {
  const ohneEndung = (name || "").trim().replace(/\.(?:pdf|png|jpe?g|webp|gif|tiff?|heic)$/i, "");
  const sauber = ohneEndung.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return sauber || "Grundriss";
}

/* ────────────────────────────────────────────────────────────────────────
 * Zuordnen und auswählen
 * ──────────────────────────────────────────────────────────────────────── */

function nummernVon(k: PlanKandidat): string[] {
  return [...new Set([...einheitNummern(k.name), ...einheitNummern(k.dateiname)])];
}

/**
 * Ist dieser Plan im Exposé einer Einheit ein Ersatz, und welcher? Nur ein
 * Plan am Objekt ohne Einheitennummer, und nicht bei einer Einzelwohnung.
 * Ein Geschossplan nur für das Geschoss der Einheit. `null` heißt: kein
 * Ersatz, sei es der eigene Plan oder gar keiner für diese Einheit.
 */
export function ersatzArt(k: PlanKandidat, ziel: PlanZiel): ErsatzArt | null {
  if (ziel.weNr === null || ziel.einzelwohnung || k.bereich !== "objekt" || nummernVon(k).length) return null;
  const text = textVon(k);
  const geschoss = geschossSchluessel(text);
  if (geschoss) {
    const eigenes = geschossSchluessel(ziel.etage, true);
    return eigenes && geschoss === eigenes ? "geschossplan" : null;
  }
  return woerter(text).some((w) => GANZES_HAUS.includes(w)) ? "hausplan" : null;
}

/** Die Stufe eines Plans für dieses Ziel, kleiner ist besser. `undefined` heißt: gehört nicht hierher. */
function stufeFuer(k: PlanKandidat, nummern: string[], ziel: PlanZiel): number | undefined {
  if (ziel.weNr === null) {
    // Exposé des ganzen Objekts: nur, was am Objekt hängt.
    if (k.bereich !== "objekt") return undefined;
    return nummern.length ? 2 : 1;
  }
  const eigene = eigeneEinheitNummer(ziel.weNr);
  if (k.bereich === "wohnung") {
    return eigene && nummern.length && !nummern.includes(eigene) ? undefined : 1;
  }
  if (nummern.length) {
    if (eigene) return nummern.includes(eigene) ? 2 : undefined;
    // Ohne eigene Nummer lässt sich eine genannte nicht prüfen, außer es gibt nur diese eine Einheit.
    return ziel.einzelwohnung ? 2 : undefined;
  }
  if (ziel.einzelwohnung) return 2;
  const ersatz = ersatzArt(k, ziel);
  return ersatz === "geschossplan" ? 3 : ersatz === "hausplan" ? 4 : undefined;
}

/** Derselbe Plan unter gleichem Namen, einmal als Bild und einmal als PDF. */
function stamm(k: PlanKandidat): string {
  return normalisiereTitel(planAnzeigename(k.name));
}

/**
 * Die Grundrisse für dieses Exposé, beste Stufe zuerst, höchstens
 * `HOECHSTENS_PLAENE_EINHEIT` beziehungsweise `HOECHSTENS_PLAENE_OBJEKT`.
 *
 * Die Kandidaten sind, was die Ampel schon durchgelassen hat. Die Einträge
 * kommen unverändert zurück, nur ausgewählt und sortiert.
 */
export function grundrisseWaehlen<T extends PlanKandidat>(kandidaten: readonly T[], ziel: PlanZiel): T[] {
  const bewertet = kandidaten.flatMap((k, reihenfolge) => {
    const staerke = grundrissStaerke(k);
    if (!staerke) return [];
    const nummern = nummernVon(k);
    const stufe = stufeFuer(k, nummern, ziel);
    if (stufe === undefined) return [];
    return [{ k, staerke, stufe, bild: planIstBild(k.dateiname, k.name), reihenfolge }];
  });
  if (!bewertet.length) return [];
  const beste = Math.min(...bewertet.map((b) => b.stufe));
  const sortiert = bewertet
    .filter((b) => b.stufe === beste)
    .sort((a, b) => b.staerke - a.staerke
      || Number(b.bild) - Number(a.bild)
      || a.k.name.localeCompare(b.k.name, "de", { numeric: true, sensitivity: "base" })
      || a.reihenfolge - b.reihenfolge);
  const gesehen = new Set<string>();
  const ergebnis: T[] = [];
  for (const { k } of sortiert) {
    const schluessel = stamm(k);
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.push(k);
  }
  return ergebnis.slice(0, ziel.weNr === null ? HOECHSTENS_PLAENE_OBJEKT : HOECHSTENS_PLAENE_EINHEIT);
}
