/**
 * Die Umgebung jedes Objekts automatisch messen (Christian, 24.09.2026).
 *
 * „Jedes Objekt hat eine Adresse, also soll die Umgebung für jedes Objekt
 * gemessen werden.“ Bis dahin maß nur der Investagon-Import (für die Objekte
 * seines Laufs) und der Text-Lauf. Von Hand angelegte Objekte, Objekte mit
 * geänderter Adresse und alle Messungen vor der Messfassung 2 blieben liegen.
 *
 * Die Function `standort-nachholen` läuft per pg_cron alle zehn Minuten und
 * misst jedes Mal höchstens `NACHHOLEN_JE_LAUF` Objekte, nacheinander mit
 * Pause, über denselben Ablauf wie der Import (`standort-lauf.ts`). So wird
 * ein neues Objekt und jede geänderte Adresse binnen Minuten gemessen, und
 * der Rückstand baut sich gleichmäßig ab, ohne OpenStreetMap zu belasten.
 *
 * WARUM EIN OBJEKT GEMESSEN WIRD, in dieser Reihenfolge
 *
 *   „fehlt“    keine gemessene Analyse, etwa von Hand angelegt
 *   „adresse“  die Adresse weicht von der gemessenen ab, oder die Analyse
 *              kennt ihre Adresse nicht (vor dem 23.09.2026 abends)
 *   „fassung“  gemessen vor der aktuellen Messfassung (`MESSFASSUNG`),
 *              etwa vor Fassung 3 ohne Parks, Behörden und nur mit drei
 *              bis vier Orten je Kategorie. Die Adresse wird dabei nicht
 *              neu gesucht, die Lage der letzten Messung gilt weiter
 *              (`bekannteLageAusAnalyse`), neu abgefragt wird nur Overpass.
 *
 * WANN NICHT
 *
 *   - Die Messung scheiterte an derselben Adresse (`art: "adresse"`, etwa
 *     „9a“ ohne Straße). Erst eine geänderte Adresse misst neu. Der Vermerk
 *     steht am Objekt (`standortanalyseFehler`), der Nachtwächter meldet
 *     solche Adressen unter Objektmanagement.
 *   - Die Dienste waren gestört (`art: "dienst"`): erst nach
 *     `DIENST_WARTEZEIT_MS` wieder, damit ein Objekt, an dem Overpass
 *     dauerhaft scheitert, nicht alle zehn Minuten gefragt wird.
 *
 * Reine Funktionen ohne Deno-Bezug, geprüft in `src/lib/standortNachholen.test.ts`.
 */
import { MESSFASSUNG, STANDORT_SCHEMA, istGemessen, standortAdresseGeaendert } from "./standort-messung.ts";

/**
 * Höchstens so viele Messungen je Lauf, bei einem Lauf alle zehn Minuten
 * also 36 je Stunde (bis zum 24.09.2026: 2 je Lauf, 12 je Stunde).
 *
 * Warum 6 vertretbar ist:
 *   - Overpass: je Messung eine gebündelte Abfrage, nur bei leeren
 *     Kategorien eine zweite. Das sind höchstens 72 Abfragen je Stunde,
 *     rund 1.700 am Tag, weit unter den 10.000 je Tag, die overpass-api.de
 *     als unbedenklich nennt. Nacheinander, nie gleichzeitig, mit
 *     `NACHHOLEN_PAUSE_MS` dazwischen.
 *   - Nominatim: höchstens eine Anfrage je Sekunde, dafür sorgt
 *     `findeLage`. Beim Nachholen einer neuen Messfassung fällt die
 *     Adresssuche ganz weg (`bekannteLageAusAnalyse`), gefragt wird nur bei
 *     neuen Objekten und geänderten Adressen.
 *   - Zeit: Eine Messung braucht meist unter zehn Sekunden. Sechs mit Pause
 *     passen in die 100 Sekunden, nach denen `standorteMessen` keine neue
 *     Messung mehr beginnt; was nicht passt, kommt beim nächsten Lauf dran.
 *   - Der Rückstand von rund 90 Objekten ist so in etwa zweieinhalb Stunden
 *     abgebaut statt in acht.
 */
export const NACHHOLEN_JE_LAUF = 6;

/**
 * Pause zwischen zwei Messungen eines Laufs. Länger als beim Import
 * (`MESS_PAUSE_MS`), damit sechs Messungen Overpass nicht in einem Stoß
 * erreichen: Edge Functions teilen sich ihre Absender mit anderen Projekten.
 */
export const NACHHOLEN_PAUSE_MS = 5_000;

/**
 * Nach einer Störung der Dienste frühestens so viel später erneut messen.
 *
 * Bis zum 01.10.2026 ein ganzer Tag. Damit blieb ein Objekt nach einem
 * einzigen Aussetzer von Overpass einen Tag ohne Umgebung, nach zwei
 * Aussetzern zwei Tage. Zwei Stunden schonen Overpass genauso (je Objekt
 * höchstens zwölf Versuche am Tag) und holen die Umgebung noch am selben Tag.
 */
export const DIENST_WARTEZEIT_MS = 2 * 60 * 60 * 1000;

/** Mengenbremse der ganzen Function, auch gegen fremde Aufrufe: je Stunde und je Tag. */
export const NACHHOLEN_AUFRUFE_JE_STUNDE = 12;
export const NACHHOLEN_AUFRUFE_JE_TAG = 200;

export type MessGrund = "fehlt" | "adresse" | "fassung";

/** Die Spalten, die das Nachholen je Objekt liest. `analyse` und `fehler` sind Auszüge aus `meta`. */
export interface NachholZeile {
  id: string;
  adresse?: unknown;
  plz?: unknown;
  ort?: unknown;
  /** `meta.standortanalyse`, nur Schema, Messfassung und gemessene Adresse. */
  analyse?: unknown;
  /** `meta.standortanalyseFehler`. */
  fehler?: unknown;
}

/** Der Stand über alle Objekte, nur Zahlen. Geht an den Aufrufer und ins Protokoll. */
export interface NachholStand {
  objekte: number;
  aktuell: number;
  fehlt: number;
  adresse: number;
  fassung: number;
  /** Gescheitert an derselben Adresse, wird nicht wiederholt. */
  adresseUnbrauchbar: number;
  /** Dienste gestört, wartet auf den nächsten Versuch. */
  dienstWartet: number;
}

const zeitVon = (wert: unknown): number => {
  const t = typeof wert === "string" ? Date.parse(wert) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/**
 * Hält ein früherer Fehlschlag die Messung noch zurück? Nur, solange die
 * Adresse dieselbe ist wie beim Fehlschlag.
 */
export function fehlschlagSperre(fehler: unknown, zeile: NachholZeile, jetztMs: number): "adresse" | "dienst" | null {
  if (!fehler || typeof fehler !== "object") return null;
  const f = fehler as { art?: unknown; adresse?: unknown; am?: unknown };
  if (!f.adresse || typeof f.adresse !== "object") return null;
  // Dieselbe Rechnung wie beim Vergleich mit einer Messung, als hätte der Fehlschlag gemessen.
  const gleicheAdresse = !standortAdresseGeaendert({ schema: STANDORT_SCHEMA, gemessene_adresse: f.adresse }, zeile);
  if (!gleicheAdresse) return null;
  if (f.art === "adresse") return "adresse";
  if (f.art === "dienst" && jetztMs - zeitVon(f.am) < DIENST_WARTEZEIT_MS) return "dienst";
  return null;
}

/** Warum dieses Objekt gemessen werden sollte, oder `null`, wenn nicht (mehr). */
export function messGrund(zeile: NachholZeile, jetztMs: number): MessGrund | null {
  if (fehlschlagSperre(zeile.fehler, zeile, jetztMs)) return null;
  if (!istGemessen(zeile.analyse)) return "fehlt";
  if (standortAdresseGeaendert(zeile.analyse, zeile)) return "adresse";
  const fassung = (zeile.analyse as { messfassung?: unknown }).messfassung;
  if (typeof fassung !== "number" || fassung < MESSFASSUNG) return "fassung";
  return null;
}

/**
 * Die Spalten, die das Nachholen je Objekt liest: keine ganze `meta`, nur
 * die Auszüge, die die Auswahl braucht. Die Analyse selbst kann groß sein.
 */
export const NACHHOLEN_SPALTEN = [
  "id", "adresse", "plz", "ort",
  "schema:meta->standortanalyse->schema",
  "messfassung:meta->standortanalyse->messfassung",
  "gemessene_adresse:meta->standortanalyse->gemessene_adresse",
  "fehler:meta->standortanalyseFehler",
].join(", ");

/** Eine nach `NACHHOLEN_SPALTEN` gelesene Zeile in die Form, die `nachholAuswahl` erwartet. */
export function alsNachholZeile(z: Record<string, unknown>): NachholZeile {
  const schema = z.schema;
  return {
    id: typeof z.id === "string" ? z.id : "",
    adresse: z.adresse,
    plz: z.plz,
    ort: z.ort,
    analyse: schema === undefined || schema === null
      ? undefined
      : { schema, messfassung: z.messfassung, gemessene_adresse: z.gemessene_adresse },
    fehler: z.fehler,
  };
}

const RANG: Record<MessGrund, number> = { fehlt: 0, adresse: 1, fassung: 2 };

/**
 * Welche Objekte dieser Lauf misst, und der Stand über alle. Erst die ohne
 * Messung, dann die mit geänderter Adresse, zuletzt die alten Fassungen;
 * innerhalb dieser Stufen in der Reihenfolge der Eingabe.
 */
export function nachholAuswahl(
  zeilen: readonly NachholZeile[],
  jetztMs: number,
  grenze: number = NACHHOLEN_JE_LAUF,
): { ids: string[]; stand: NachholStand } {
  const stand: NachholStand = { objekte: 0, aktuell: 0, fehlt: 0, adresse: 0, fassung: 0, adresseUnbrauchbar: 0, dienstWartet: 0 };
  const kandidaten: Array<{ id: string; rang: number; nr: number }> = [];
  zeilen.forEach((z, nr) => {
    if (!z || typeof z.id !== "string" || !z.id) return;
    stand.objekte += 1;
    const sperre = fehlschlagSperre(z.fehler, z, jetztMs);
    if (sperre === "adresse") { stand.adresseUnbrauchbar += 1; return; }
    if (sperre === "dienst") { stand.dienstWartet += 1; return; }
    const grund = messGrund(z, jetztMs);
    if (!grund) { stand.aktuell += 1; return; }
    stand[grund] += 1;
    kandidaten.push({ id: z.id, rang: RANG[grund], nr });
  });
  kandidaten.sort((a, b) => a.rang - b.rang || a.nr - b.nr);
  return { ids: kandidaten.slice(0, Math.max(0, grenze)).map((k) => k.id), stand };
}
