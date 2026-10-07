/**
 * Der Standort eines Objekts, einmal gemessen und dann fest.
 *
 * Bis zum 24.09.2026 lag diese Datei im Import (`investagon-import/standort.ts`,
 * dort steht jetzt nur noch eine Weiterleitung). Seitdem misst mit demselben
 * Ablauf auch das Nachholen (`standort-nachholen`) alle übrigen Objekte, mit
 * eigener Auswahl (`brauchtMessung`, siehe `standort-nachholen.ts`).
 *
 * Christians Entscheidung vom 23.09.2026: Beim Investagon-Import wird der
 * Standort einmal fertig gemacht und fest hinterlegt, Koordinate und
 * gemessene Umgebung. Daraus entstehen Nadel, Umgebungslisten und
 * Standortargumente. Danach gibt es keine wiederholten Abfragen mehr.
 *
 * WANN GEMESSEN WIRD
 *
 * Nach dem Abgleich, für die Objekte dieses Laufs, und nur, wenn
 * `standortAdresseGeaendert` es verlangt: Es fehlt eine gemessene Analyse,
 * oder die Adresse weicht von der gemessenen ab. Diesen Helfer teilt sich der
 * Import mit dem Text-Lauf, es gibt keine zweite Rechnung.
 *
 * Eine Koordinate aus Investagon (`meta.koordinaten`, `quelle: "investagon"`,
 * gerade eben vom Abgleich geschrieben) hat Vorrang vor der Adresssuche.
 * Danach kommt die Lage einer früheren Messung derselben Adresse
 * (`bekannteLageAusAnalyse`): Steigt nur die Messfassung, wird die Umgebung
 * neu abgefragt, die Adresse aber nicht noch einmal gesucht.
 *
 * RÜCKSICHT AUF OPENSTREETMAP
 *
 * Nacheinander, mit Pause, höchstens `MESSUNGEN_JE_LAUF` Messungen je Lauf,
 * und nur, solange das Zeitbudget der Function reicht. Der Rest kommt beim
 * nächsten Lauf dran. Nichts hiervon bricht den Import ab: Jeder Fehler wird
 * am Objekt vermerkt (`FEHLER_META_SCHLUESSEL`) und im Bericht gezählt.
 *
 * Ein Fehlschlag, weil die Adresse sich nicht finden lässt (`art: "adresse"`),
 * wird für dieselbe Adresse nicht wiederholt; erst eine geänderte Adresse
 * misst neu. Ein Ausfall der Dienste (`art: "dienst"`) wird beim nächsten
 * Lauf erneut versucht, nie im selben.
 *
 * Nur Datenbankzugriffe über den übergebenen Client und die Messung selbst,
 * beides austauschbar, damit `src/lib/investagonStandortMessung.test.ts` den
 * Ablauf ohne Netz prüfen kann.
 */

import {
  bekannteLageAusAnalyse,
  gemesseneAdresseAus,
  koordinatenAusInvestagon,
  koordinatenInMeta,
  messeStandort,
  STANDORT_SCHEMA,
  standortAdresseGeaendert,
  standortInMeta,
} from "./standort-messung.ts";

/** Höchstens so viele Messungen je Importlauf. */
export const MESSUNGEN_JE_LAUF = 25;

/** Pause zwischen zwei Messungen, aus Rücksicht auf Photon und Overpass. */
export const MESS_PAUSE_MS = 1_500;

/**
 * Nach so vielen Millisekunden ab Beginn des Laufs beginnt keine neue Messung
 * mehr. Eine Messung dauert im schlimmsten Fall rund 60 Sekunden (`MESS_BUDGET_MS`), und eine
 * Edge Function hat höchstens 150.
 */
export const MESS_START_BIS_MS = 100_000;

/** Bis dahin (ab Beginn des Laufs) muss jede Messung fertig sein. */
export const MESS_ENDE_MS = 138_000;

/** Der Vermerk am Objekt, wenn die Messung scheiterte. */
export const FEHLER_META_SCHLUESSEL = "standortanalyseFehler";

export interface StandortBericht {
  /** Objekte dieses Laufs, die geprüft werden sollten. */
  kandidaten: number;
  gemessen: number;
  fehlgeschlagen: number;
  /** Schon gemessen, oder dieselbe unauffindbare Adresse wie beim letzten Mal. */
  uebersprungen: number;
  /** Nicht mehr geprüft, weil Obergrenze oder Zeit erreicht war. Kommt beim nächsten Lauf dran. */
  offen: number;
  ende: "fertig" | "obergrenze" | "zeit";
}

/** Die Zeile eines Objekts, soweit die Messung sie braucht. */
export interface ObjektZeile {
  id: string;
  titel?: unknown;
  adresse?: unknown;
  plz?: unknown;
  ort?: unknown;
  meta?: Record<string, unknown> | null;
}

type Antwort<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

/** Das Wenige, was der Ablauf vom Datenbank-Client braucht. */
export interface StandortDb {
  from(tabelle: "objekte"): {
    select(spalten: string): { eq(spalte: "id", wert: string): { maybeSingle(): Antwort<ObjektZeile> } };
    update(werte: { meta: Record<string, unknown> }): { eq(spalte: "id", wert: string): Antwort<unknown> };
  };
}

/**
 * Gilt ein früherer Fehlschlag noch? Nur bei `art: "adresse"` und derselben
 * Adresse. Verglichen wird mit dem gemeinsamen Helfer, als wäre die Adresse
 * des Vermerks eine gemessene.
 */
function fehlschlagGiltNoch(vermerk: unknown, objekt: ObjektZeile): boolean {
  if (!vermerk || typeof vermerk !== "object") return false;
  const v = vermerk as { art?: unknown; adresse?: unknown };
  if (v.art !== "adresse" || !v.adresse || typeof v.adresse !== "object") return false;
  return !standortAdresseGeaendert({ schema: STANDORT_SCHEMA, gemessene_adresse: v.adresse }, objekt);
}

/**
 * Die Objekte dieses Laufs messen, wo nötig. Gibt immer einen Bericht zurück
 * und wirft nie.
 */
export async function standorteMessen(
  db: StandortDb,
  objektIds: string[],
  umgebung: {
    /** Beginn des Importlaufs in ms, daran hängen die Zeitgrenzen. */
    laufBeginn: number;
    messe?: typeof messeStandort;
    pause?: (ms: number) => Promise<void>;
    jetzt?: () => number;
    obergrenze?: number;
    /** Pause zwischen zwei Messungen, ohne Angabe `MESS_PAUSE_MS`. */
    pauseMs?: number;
    /**
     * Braucht dieses Objekt eine Messung? Ohne Angabe die Regel des Imports:
     * Analyse fehlt oder Adresse geändert, und kein gültiger Fehlschlag wegen
     * derselben Adresse. Das Nachholen gibt hier seine eigene Regel mit.
     */
    brauchtMessung?: (zeile: ObjektZeile) => boolean;
  },
): Promise<StandortBericht> {
  const messe = umgebung.messe ?? messeStandort;
  const pause = umgebung.pause ?? ((ms: number) => new Promise<void>((fertig) => setTimeout(fertig, ms)));
  const jetzt = umgebung.jetzt ?? (() => Date.now());
  const obergrenze = umgebung.obergrenze ?? MESSUNGEN_JE_LAUF;
  const ids = [...new Set(objektIds.filter(Boolean))];
  const bericht: StandortBericht = { kandidaten: ids.length, gemessen: 0, fehlgeschlagen: 0, uebersprungen: 0, offen: 0, ende: "fertig" };

  for (let i = 0; i < ids.length; i++) {
    const versucht = bericht.gemessen + bericht.fehlgeschlagen;
    if (versucht >= obergrenze) {
      bericht.ende = "obergrenze";
      bericht.offen = ids.length - i;
      break;
    }
    if (jetzt() - umgebung.laufBeginn > MESS_START_BIS_MS) {
      bericht.ende = "zeit";
      bericht.offen = ids.length - i;
      break;
    }
    const id = ids[i];
    try {
      const { data: zeile, error } = await db.from("objekte").select("id, titel, adresse, plz, ort, meta").eq("id", id).maybeSingle();
      if (error || !zeile) {
        bericht.uebersprungen += 1;
        continue;
      }
      const meta = (zeile.meta || {}) as Record<string, unknown>;
      const braucht = umgebung.brauchtMessung
        ? umgebung.brauchtMessung(zeile)
        : standortAdresseGeaendert(meta.standortanalyse, zeile) && !fehlschlagGiltNoch(meta[FEHLER_META_SCHLUESSEL], zeile);
      if (!braucht) {
        bericht.uebersprungen += 1;
        continue;
      }

      if (versucht > 0) await pause(umgebung.pauseMs ?? MESS_PAUSE_MS);
      const messung = await messe(
        { adresse: zeile.adresse, plz: zeile.plz, ort: zeile.ort, titel: zeile.titel },
        {
          // Die Koordinate aus Investagon hat Vorrang vor der Adresssuche,
          // danach die Lage der letzten Messung, solange die Adresse gleich ist.
          koordinate: koordinatenAusInvestagon(meta) ?? bekannteLageAusAnalyse(meta.standortanalyse, zeile) ?? null,
          bis: Math.min(umgebung.laufBeginn + MESS_ENDE_MS, jetzt() + 60_000),
        },
      );

      // `meta` unmittelbar vor dem Schreiben frisch lesen und nur die eigenen
      // Schlüssel setzen: Analyse, Zeitpunkt, Koordinate, Fehlervermerk.
      const { data: frisch } = await db.from("objekte").select("id, meta").eq("id", id).maybeSingle();
      const vorher = ((frisch?.meta ?? meta) || {}) as Record<string, unknown>;
      let neu: Record<string, unknown>;
      if (messung.ok) {
        neu = standortInMeta(vorher, messung.analyse);
        delete neu[FEHLER_META_SCHLUESSEL];
        bericht.gemessen += 1;
      } else {
        const fehlschlag = messung as { art: "adresse" | "dienst"; grund: string };
        neu = {
          ...vorher,
          [FEHLER_META_SCHLUESSEL]: {
            art: fehlschlag.art,
            grund: fehlschlag.grund,
            am: new Date(jetzt()).toISOString(),
            adresse: gemesseneAdresseAus(zeile),
          },
        };
        bericht.fehlgeschlagen += 1;
        console.warn(`investagon-import: Standort ${id} nicht gemessen (${fehlschlag.art}): ${fehlschlag.grund}`);
      }
      // Auch bei einem Fehlschlag steht die Lage oft schon fest (Overpass fiel aus).
      if (messung.lage) neu = koordinatenInMeta(neu, messung.lage);
      const { error: schreibFehler } = await db.from("objekte").update({ meta: neu }).eq("id", id);
      if (schreibFehler) console.error(`investagon-import: Standort ${id} nicht gespeichert`, schreibFehler.message);
    } catch (e) {
      bericht.fehlgeschlagen += 1;
      console.error(`investagon-import: Standort ${id}`, e);
    }
  }
  return bericht;
}
