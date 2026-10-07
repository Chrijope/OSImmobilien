/**
 * Die Marktdaten an einer Stelle: Seed, Datenbank und die Belege dazu.
 *
 * Vorher lag das Zusammenführen von Seed und Datenbank mitten in der
 * Listenseite. Detailseite und Vergleich lasen deshalb roh aus dem Seed: Ein
 * Standort konnte in der Liste den frisch gesyncten Einwohnerstand zeigen und
 * einen Klick weiter den alten aus der Datei. Beide lesen jetzt hierüber.
 *
 * Zweitens hat der Sync längst mehr geliefert, als die Oberfläche je gezeigt
 * hat. `sync-boris` schreibt Bodenrichtwerte, `sync-osm-mikrolage` schreibt
 * sieben Kategorien Nahversorgung, `enrich-arbeitgeber` schreibt Arbeitgeber.
 * Gelesen wurde davon nichts, die Detailseite zeigte stattdessen die
 * gerechneten Werte. Diese Kennzahlen kommen hier mit an, samt Quelle und
 * Stand, damit sie als erhoben gekennzeichnet werden können.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STANDORTE, type Standort } from "@/data/marktanalyseSeed";
import type { KennzahlBeleg } from "@/lib/marktdatenHerkunft";

/**
 * Zuordnung über den normalisierten Namen.
 *
 * Über den Gemeindeschlüssel wäre es sauberer, aber die Formate gehen
 * auseinander: der Seed führt Berlin als "11000", der Sync-Bestand als
 * "11000000".
 */
export function normName(n: string): string {
  return n.toLowerCase().replace(/\s+/g, "").replace(/[()]/g, "");
}

/** Kennzahl-Schlüssel in der Datenbank → Feld im Standort-Datensatz. */
const FELD_ZU_KENNZAHL: Partial<Record<keyof Standort, string[]>> = {
  arbeitslosenquote_pct: ["arbeitslosenquote_pct"],
  bip_pro_kopf_eur: ["bip_pro_kopf_eur", "bip_pro_kopf"],
  kaufpreis_qm_wohnung_eur: ["kaufpreis_qm_wohnung_eur", "kaufpreis_qm_wohnung"],
  kaufpreis_qm_haus_eur: ["kaufpreis_qm_haus_eur", "kaufpreis_qm_haus"],
  miete_qm_eur: ["miete_qm_eur", "miete_qm"],
  einwohner: ["einwohner"],
  leerstand_pct: ["leerstand_pct"],
};

/**
 * Kennzahlen, die kein Feld im Standort-Datensatz haben, aber auf der
 * Detailseite gezeigt werden sollen, sobald sie erhoben vorliegen.
 */
export const ZUSATZ_KENNZAHLEN = [
  "bodenrichtwert_eur_qm",
  "poi_kitas",
  "poi_schulen",
  "poi_aerzte",
  "poi_supermaerkte",
  "poi_oepnv",
  "poi_apotheken",
  "poi_restaurants",
] as const;

export interface StandortArbeitgeber {
  name: string;
  branche: string | null;
  mitarbeiter: number | null;
  hauptsitz: boolean | null;
  quelle: string | null;
}

export interface MarktdatenBestand {
  /** Standorte mit den Datenbankwerten darübergelegt. */
  standorte: Standort[];
  /** Belege je Standort-Id und Kennzahl-Schlüssel. */
  belege: Map<string, Map<string, KennzahlBeleg>>;
  /** Arbeitgeber aus der Datenbank, je Standort-Id. */
  arbeitgeber: Map<string, StandortArbeitgeber[]>;
  geladen: boolean;
}

const LEER: MarktdatenBestand = {
  standorte: STANDORTE,
  belege: new Map(),
  arbeitgeber: new Map(),
  geladen: false,
};

/**
 * Einmal geladen, für die Sitzung behalten. Die Marktdaten ändern sich nur,
 * wenn ein Sync läuft, und der ist ein bewusster Klick im Adminbereich.
 */
let cache: MarktdatenBestand | null = null;
let laufend: Promise<MarktdatenBestand> | null = null;
const hoerer = new Set<(b: MarktdatenBestand) => void>();

async function ladeBestand(): Promise<MarktdatenBestand> {
  try {
    const { data: st } = await supabase
      .from("standorte")
      .select("id, ags, name, einwohner, lat, lng");
    if (!st?.length) return { ...LEER, geladen: true };

    const ids = (st as any[]).map((s) => s.id);
    const [{ data: kz }, { data: ag }] = await Promise.all([
      supabase
        .from("standort_kennzahlen")
        .select("standort_id, kennzahl, wert, stand, einheit, quelle_id, meta")
        .in("standort_id", ids)
        .order("stand", { ascending: false }),
      supabase
        .from("standort_arbeitgeber")
        .select("standort_id, name, branche, mitarbeiter, hauptsitz, quelle, rang")
        .in("standort_id", ids)
        .order("rang", { ascending: true }),
    ]);

    // Je Standort und Kennzahl den jüngsten Eintrag behalten. Die Abfrage ist
    // nach Stand absteigend sortiert, der erste Treffer gewinnt.
    const belegeNachDbId = new Map<string, Map<string, KennzahlBeleg>>();
    for (const row of (kz ?? []) as any[]) {
      let m = belegeNachDbId.get(row.standort_id);
      if (!m) {
        m = new Map();
        belegeNachDbId.set(row.standort_id, m);
      }
      if (m.has(row.kennzahl)) continue;
      m.set(row.kennzahl, {
        wert: Number(row.wert),
        quelleId: String(row.quelle_id ?? "unbekannt"),
        stand: row.stand ?? null,
        einheit: row.einheit ?? null,
        meta: row.meta ?? null,
      });
    }

    const agNachDbId = new Map<string, StandortArbeitgeber[]>();
    for (const row of (ag ?? []) as any[]) {
      const liste = agNachDbId.get(row.standort_id) ?? [];
      liste.push({
        name: row.name,
        branche: row.branche ?? null,
        mitarbeiter: row.mitarbeiter ?? null,
        hauptsitz: row.hauptsitz ?? null,
        quelle: row.quelle ?? null,
      });
      agNachDbId.set(row.standort_id, liste);
    }

    // Datenbank-Zeilen über den Namen den Seed-Standorten zuordnen.
    const dbNachName = new Map<string, any>();
    for (const s of st as any[]) dbNachName.set(normName(s.name), s);

    const belege = new Map<string, Map<string, KennzahlBeleg>>();
    const arbeitgeber = new Map<string, StandortArbeitgeber[]>();

    const standorte = STANDORTE.map((s) => {
      const db = dbNachName.get(normName(s.name));
      if (!db) return s;

      const kennz = belegeNachDbId.get(db.id);
      if (kennz) belege.set(s.id, kennz);
      const agListe = agNachDbId.get(db.id);
      if (agListe?.length) arbeitgeber.set(s.id, agListe);

      const zusammen: Standort = { ...s };
      // Einwohner steht direkt am Standort, nicht als Kennzahl.
      if (typeof db.einwohner === "number" && db.einwohner > 0) {
        zusammen.einwohner = db.einwohner;
      }
      if (typeof db.lat === "number" && typeof db.lng === "number" && db.lat && db.lng) {
        zusammen.lat = Number(db.lat);
        zusammen.lng = Number(db.lng);
      }
      if (kennz) {
        for (const [feld, schluessel] of Object.entries(FELD_ZU_KENNZAHL)) {
          for (const k of schluessel as string[]) {
            const beleg = kennz.get(k);
            // Auf einen echten Zahlenwert prüfen, nicht auf Wahrheitswert:
            // eine Leerstandsquote von 0 ist eine Aussage.
            if (beleg && Number.isFinite(beleg.wert)) {
              (zusammen as any)[feld] = beleg.wert;
              break;
            }
          }
        }
      }
      return zusammen;
    });

    return { standorte, belege, arbeitgeber, geladen: true };
  } catch (e) {
    console.warn("[marktdaten] Laden fehlgeschlagen, nutze den Seed", e);
    return { ...LEER, geladen: true };
  }
}

/** Lädt den Bestand einmal und teilt ihn allen Seiten. */
export function ladeMarktdaten(erzwingen = false): Promise<MarktdatenBestand> {
  if (cache && !erzwingen) return Promise.resolve(cache);
  if (laufend && !erzwingen) return laufend;
  laufend = ladeBestand().then((b) => {
    cache = b;
    laufend = null;
    for (const h of hoerer) h(b);
    return b;
  });
  return laufend;
}

export function useMarktdaten(): MarktdatenBestand {
  const [bestand, setBestand] = useState<MarktdatenBestand>(() => cache ?? LEER);

  useEffect(() => {
    hoerer.add(setBestand);
    void ladeMarktdaten().then(setBestand);
    return () => {
      hoerer.delete(setBestand);
    };
  }, []);

  return bestand;
}

/** Ein einzelner Standort mit den Datenbankwerten darüber. */
export function useStandort(id: string | undefined): {
  standort: Standort | undefined;
  belege: Map<string, KennzahlBeleg>;
  arbeitgeber: StandortArbeitgeber[];
  geladen: boolean;
} {
  const bestand = useMarktdaten();
  return useMemo(
    () => ({
      standort: bestand.standorte.find((s) => s.id === id),
      belege: (id && bestand.belege.get(id)) || new Map(),
      arbeitgeber: (id && bestand.arbeitgeber.get(id)) || [],
      geladen: bestand.geladen,
    }),
    [bestand, id],
  );
}
