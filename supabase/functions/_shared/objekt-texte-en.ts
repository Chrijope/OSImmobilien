/**
 * Die englische Fassung der automatisch erzeugten Objekttexte.
 *
 * Plan Kundensprache vom 25.09.2026, Entscheidung 12: `objekt-texte-ki`
 * erzeugt zusätzlich eine englische Fassung von Kurzbeschreibung,
 * Standortargumenten und Marktargumenten und legt sie unter
 * `meta.objekttexteKiEn` ab. Das ist erlaubt, weil in diesen Texten keine
 * Personendaten stehen; sie beschreiben Haus und Lage.
 *
 * Gelesen wird die Fassung an einer Stelle: `oeffentlicheObjekttexteEn`
 * (`expose-oeffentlich.ts`, Etappe 3) für Exposé, Kundenlink und PDF. Diese
 * Datei ist nur die Erzeugung. Damit der Leser nichts prüfen muss, gilt hier:
 *
 *   - Übersetzt wird nur, was automatisch erzeugt dasteht. Ein von Hand
 *     gepflegter Block bleibt deutsch (Entscheidung 12) und bekommt keine
 *     englische Fassung, sonst stünde sie auf der englischen Seite anstelle
 *     des Getippten (`uebersetzungsQuelle`).
 *   - Wird ein Block später von Hand überschrieben, fällt seine englische
 *     Fassung weg (`objektTexteEnOhneGepflegte`).
 *   - Jeder neue Lauf ersetzt die Fassung oder entfernt sie.
 *   - Der deutsche Wortlaut, aus dem übersetzt wurde, steht unter `quelle`.
 *     Daran erkennt `uebersetzungFehlt`, ob nachgeholt werden muss.
 *
 * Diese Datei läuft in Deno (Edge Function) und im Browser
 * (`src/lib/objektTexteKi.ts`). Deshalb nichts, was nur eines von beiden kennt.
 */

import { vonHandGepflegt, type ObjektTexte } from "./objekt-texte.ts";

export const OBJEKT_TEXTE_EN_META_SCHLUESSEL = "objekttexteKiEn";
export const OBJEKT_TEXTE_EN_SCHEMA = 1;

/** Der deutsche Wortlaut, aus dem übersetzt wird. */
export interface ObjektTexteQuelle {
  kurzbeschreibung: string;
  standortargumente: string[];
  marktargumente: string[];
}

/**
 * Was übersetzt wird: genau der automatisch erzeugte Wortlaut eines Laufs.
 * Ein Vermerk ohne Ergebnis hat nichts zu übersetzen.
 */
export function quelleAusStand(texte: ObjektTexte | undefined): ObjektTexteQuelle {
  if (!texte || texte.ohneErgebnis) return { kurzbeschreibung: "", standortargumente: [], marktargumente: [] };
  return {
    kurzbeschreibung: (texte.kurzbeschreibung || "").trim(),
    standortargumente: (texte.standortargumente || []).map((a) => (a.argument || "").trim()).filter(Boolean),
    marktargumente: (texte.marktargumente || []).map((a) => (a.argument || "").trim()).filter(Boolean),
  };
}

export interface ObjektTexteEn extends ObjektTexteQuelle {
  schema: number;
  /** Zeitpunkt der Übersetzung, ISO. */
  erzeugtAm: string;
  modell: string;
  /** Der deutsche Wortlaut, aus dem übersetzt wurde. */
  quelle: ObjektTexteQuelle;
}

const text = (wert: unknown): string => (typeof wert === "string" ? wert.trim() : "");
const liste = (wert: unknown): string[] => (Array.isArray(wert) ? wert.map(text) : []);

/** Gedankenstriche gehören in keinen Kundentext, auch nicht im Englischen. */
export function ohneGedankenstriche(satz: string): string {
  return satz.replace(/\s*[–—]\s*/g, ", ").replace(/,\s*,/g, ",").trim();
}

/** Die gespeicherte Fassung defensiv lesen. Alles Unbrauchbare heißt: keine. */
export function objektTexteEnAusMeta(meta: unknown): ObjektTexteEn | undefined {
  const m = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
  const roh = m[OBJEKT_TEXTE_EN_META_SCHLUESSEL];
  if (!roh || typeof roh !== "object" || Array.isArray(roh)) return undefined;
  const r = roh as Record<string, unknown>;
  const q = r.quelle && typeof r.quelle === "object" && !Array.isArray(r.quelle) ? (r.quelle as Record<string, unknown>) : {};
  return {
    schema: typeof r.schema === "number" ? r.schema : 0,
    erzeugtAm: text(r.erzeugtAm),
    modell: text(r.modell),
    kurzbeschreibung: text(r.kurzbeschreibung),
    standortargumente: liste(r.standortargumente),
    marktargumente: liste(r.marktargumente),
    quelle: {
      kurzbeschreibung: text(q.kurzbeschreibung),
      standortargumente: liste(q.standortargumente),
      marktargumente: liste(q.marktargumente),
    },
  };
}

/**
 * Was von einem Stand übersetzt wird: der automatische Wortlaut ohne die
 * Blöcke, die im gepflegten Feld von Hand stehen.
 */
export function uebersetzungsQuelle(meta: unknown, texte: ObjektTexte | undefined): ObjektTexteQuelle {
  const q = quelleAusStand(texte);
  const hand = vonHandGepflegt(meta);
  return {
    kurzbeschreibung: hand.kurzbeschreibung ? "" : q.kurzbeschreibung,
    standortargumente: hand.standortargumente ? [] : q.standortargumente,
    marktargumente: hand.marktargumente ? [] : q.marktargumente,
  };
}

/**
 * `meta` mit einer englischen Fassung ohne die Blöcke, die inzwischen von
 * Hand gepflegt sind. Bleibt nichts übrig, fällt die Fassung ganz weg.
 */
export function objektTexteEnOhneGepflegte(meta: Record<string, unknown>): Record<string, unknown> {
  const en = objektTexteEnAusMeta(meta);
  if (!en) return meta;
  const hand = vonHandGepflegt(meta);
  if (!hand.kurzbeschreibung && !hand.standortargumente && !hand.marktargumente) return meta;
  const neu: ObjektTexteEn = {
    ...en,
    kurzbeschreibung: hand.kurzbeschreibung ? "" : en.kurzbeschreibung,
    standortargumente: hand.standortargumente ? [] : en.standortargumente,
    marktargumente: hand.marktargumente ? [] : en.marktargumente,
    quelle: {
      kurzbeschreibung: hand.kurzbeschreibung ? "" : en.quelle.kurzbeschreibung,
      standortargumente: hand.standortargumente ? [] : en.quelle.standortargumente,
      marktargumente: hand.marktargumente ? [] : en.quelle.marktargumente,
    },
  };
  const leer = !neu.kurzbeschreibung && neu.standortargumente.length === 0 && neu.marktargumente.length === 0;
  return objektTexteEnInMeta(meta, leer ? undefined : neu);
}

const gleicheListe = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Gibt es etwas zu übersetzen, und fehlt die passende Übersetzung? */
export function uebersetzungFehlt(meta: unknown, quelle: ObjektTexteQuelle): boolean {
  const hatText = !!quelle.kurzbeschreibung || quelle.standortargumente.length > 0 || quelle.marktargumente.length > 0;
  if (!hatText) return false;
  const en = objektTexteEnAusMeta(meta);
  if (!en || en.schema !== OBJEKT_TEXTE_EN_SCHEMA) return true;
  return (
    en.quelle.kurzbeschreibung !== quelle.kurzbeschreibung ||
    !gleicheListe(en.quelle.standortargumente, quelle.standortargumente) ||
    !gleicheListe(en.quelle.marktargumente, quelle.marktargumente)
  );
}

/* ── Auftrag an das Sprachmodell ─────────────────────────────── */

/** Das Werkzeug, über das das Modell die Übersetzung zurückgibt. */
export const OBJEKT_TEXTE_EN_WERKZEUG = {
  type: "function",
  function: {
    name: "objekt_texte_englisch",
    description: "Die englische Fassung von Kurzbeschreibung, Standortargumenten und Marktargumenten zurückgeben",
    parameters: {
      type: "object",
      properties: {
        kurzbeschreibung: { type: "string", description: "Die Kurzbeschreibung auf Englisch. Leer, wenn die Vorlage leer ist." },
        standortargumente: {
          type: "array",
          description: "Jedes Standortargument auf Englisch, in derselben Reihenfolge und Anzahl wie die Vorlage.",
          items: { type: "string" },
        },
        marktargumente: {
          type: "array",
          description: "Jedes Marktargument auf Englisch, in derselben Reihenfolge und Anzahl wie die Vorlage.",
          items: { type: "string" },
        },
      },
      required: ["kurzbeschreibung", "standortargumente", "marktargumente"],
      additionalProperties: false,
    },
  },
};

export const OBJEKT_TEXTE_EN_SYSTEM =
  "Du übersetzt Immobilientexte für Kapitalanleger aus dem Deutschen in britisches Englisch. Du übersetzt genau, fügst nichts hinzu und lässt nichts weg. Du antwortest ausschließlich über den Werkzeugaufruf.";

/** Der Auftrag an das Modell, mit dem deutschen Wortlaut. */
export function uebersetzungsAuftrag(quelle: ObjektTexteQuelle): string {
  const nummeriert = (l: string[]) => (l.length ? l.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(keine)");
  return [
    "Übersetze die folgenden Texte ins britische Englisch.",
    "",
    "Regeln:",
    "- Genau übersetzen. Keine neuen Tatsachen, keine Zusagen, keine Werbung, die nicht schon im Deutschen steht.",
    "- Zahlen, Entfernungen, Jahreszahlen, Quellen und Stand unverändert übernehmen; Zahlen in englischer Schreibweise (1,800 statt 1.800, 3.1 statt 3,1).",
    "- Eigennamen (Orte, Straßen, Firmen, Einrichtungen) nicht übersetzen.",
    "- Fachbegriffe: Hausgeld = service charge (Hausgeld), Kaltmiete = net cold rent, Eigentümergemeinschaft = owners’ association, Sondereigentum = individual unit, Instandhaltungsrücklage = maintenance reserve, Wohnfläche = living space.",
    "- Die Leserin oder der Leser wird mit „you“ angesprochen, freundlich und direkt.",
    "- Keine Gedankenstriche (– oder —). Stattdessen Komma, Doppelpunkt oder einen neuen Satz.",
    "- Ein Argument hat die Form „Titel. Text“. Diese Form beibehalten: kurzer Titel, Punkt, dann der Satz.",
    "- Gleiche Anzahl und Reihenfolge wie in der Vorlage.",
    "",
    "Kurzbeschreibung:",
    quelle.kurzbeschreibung || "(keine)",
    "",
    "Standortargumente:",
    nummeriert(quelle.standortargumente),
    "",
    "Marktargumente:",
    nummeriert(quelle.marktargumente),
  ].join("\n");
}

/**
 * Die Antwort des Modells prüfen (flache Form, siehe `KiVersuch` in lauf.ts). Stimmt die Anzahl nicht oder fehlt ein
 * Text, gilt die Übersetzung als gescheitert: Lieber gar keine englische
 * Fassung als eine, in der ein Argument fehlt oder verrutscht ist.
 */
export function pruefeUebersetzung(
  roh: unknown,
  quelle: ObjektTexteQuelle,
): { ok: boolean; texte?: ObjektTexteQuelle; grund?: string } {
  const r = roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  const kurz = ohneGedankenstriche(text(r.kurzbeschreibung));
  const standort = liste(r.standortargumente).map(ohneGedankenstriche);
  const markt = liste(r.marktargumente).map(ohneGedankenstriche);
  if (quelle.kurzbeschreibung && !kurz) return { ok: false, grund: "Kurzbeschreibung fehlt in der Übersetzung." };
  if (standort.length !== quelle.standortargumente.length || standort.some((s) => !s)) {
    return { ok: false, grund: "Die Standortargumente passen in der Anzahl nicht zur Vorlage." };
  }
  if (markt.length !== quelle.marktargumente.length || markt.some((s) => !s)) {
    return { ok: false, grund: "Die Marktargumente passen in der Anzahl nicht zur Vorlage." };
  }
  return { ok: true, texte: { kurzbeschreibung: quelle.kurzbeschreibung ? kurz : "", standortargumente: standort, marktargumente: markt } };
}

/** Die fertige englische Fassung zum Ablegen. */
export function baueObjektTexteEn(quelle: ObjektTexteQuelle, texte: ObjektTexteQuelle, modell: string, jetzt = new Date()): ObjektTexteEn {
  return {
    schema: OBJEKT_TEXTE_EN_SCHEMA,
    erzeugtAm: jetzt.toISOString(),
    modell,
    ...texte,
    quelle: {
      kurzbeschreibung: quelle.kurzbeschreibung,
      standortargumente: [...quelle.standortargumente],
      marktargumente: [...quelle.marktargumente],
    },
  };
}

/** Die englische Fassung in `meta` setzen, ohne anderes anzufassen. */
export function objektTexteEnInMeta(
  meta: Record<string, unknown> | null | undefined,
  en: ObjektTexteEn | undefined,
): Record<string, unknown> {
  const neu: Record<string, unknown> = { ...(meta || {}) };
  if (!en) delete neu[OBJEKT_TEXTE_EN_META_SCHLUESSEL];
  else neu[OBJEKT_TEXTE_EN_META_SCHLUESSEL] = en;
  return neu;
}
