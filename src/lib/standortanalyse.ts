/**
 * Die Standortanalyse eines Objekts, so wie sie im Exposé landet.
 *
 * Die Daten entstehen beim Investagon-Import (einmal, dann dauerhaft) oder
 * auf Wunsch von Admin und Inhaber in `generate-standortanalyse` und liegen
 * anschließend in `objekte.meta.standortanalyse`. Bis zur Umstellung
 * hat ein Sprachmodell sie vollständig erfunden, Namen, Entfernungen und
 * Koordinaten inbegriffen. Seither werden die Einrichtungen in OpenStreetMap
 * gemessen, und der gespeicherte Datensatz trägt dafür `schema: 2`.
 *
 * Diese Datei hält drei Dinge zusammen, die vorher an vier Stellen einzeln
 * getippt waren: den Typ, die Unterscheidung alt gegen gemessen und das
 * Nachladen. Der Typ ist bewusst durchgehend optional, denn eine gemessene
 * Analyse lässt weg, was OpenStreetMap nicht kennt, und die alten Datensätze
 * kennen die neuen Felder nicht.
 */

import {
  istGemessen,
  STANDORT_SCHEMA,
  HERKUNFT_HINWEIS_MIKROLAGE,
  HERKUNFT_HINWEIS_LEER,
  HERKUNFT_HINWEIS_ARBEITGEBER,
} from "../../supabase/functions/_shared/standort-messung";

export {
  istGemessen,
  STANDORT_SCHEMA,
  HERKUNFT_HINWEIS_MIKROLAGE,
  HERKUNFT_HINWEIS_LEER,
  HERKUNFT_HINWEIS_ARBEITGEBER,
};

export interface StandortOrt {
  name: string;
  typ?: string;
  entfernung_m: number;
  lat?: number;
  lng?: number;
}

export interface StandortArbeitgeber {
  name: string;
  branche?: string;
  /** Nur in alten, erfundenen Datensätzen vorhanden. */
  mitarbeiter?: number;
  /** Nur in alten, erfundenen Datensätzen vorhanden. */
  entfernung_km?: number;
  lat?: number;
  lng?: number;
}

export interface StandortAnalyse {
  /** Fehlt bei allen vor der Umstellung erzeugten Datensätzen. */
  schema?: number;
  gemessen_am?: string;
  objekt_koordinaten?: { lat: number; lng: number };
  /** Fassung der Messung, siehe `MESSFASSUNG` in `standort-messung.ts`. */
  messfassung?: number;
  /** Ab wo gemessen wurde: Haus, Straße, Postleitzahlgebiet oder Ortsmitte. */
  genauigkeit?: "adresse" | "strasse" | "plz" | "ort";
  mikrolage?: {
    kindergaerten?: StandortOrt[];
    schulen?: StandortOrt[];
    einkaufen?: StandortOrt[];
    apotheken?: StandortOrt[];
    aerzte?: StandortOrt[];
    oepnv?: StandortOrt[];
    freizeit?: StandortOrt[];
    /** Seit der Messfassung 3, vorher unter `freizeit` mit `typ: "Park"`. */
    parks?: StandortOrt[];
    /** Seit der Messfassung 3: Rathaus, Ämter, Polizei, Post, Bibliothek. */
    behoerden?: StandortOrt[];
    /** Makrolage, seit der Messfassung 2. */
    hochschulen?: StandortOrt[];
    kliniken?: StandortOrt[];
  };
  mikrolage_hinweis?: string;
  arbeitgeber?: StandortArbeitgeber[];
  arbeitgeber_hinweis?: string;
  makrolage?: {
    beschreibung?: string;
    einwohner?: number;
    einwohner_stand?: string;
    arbeitslosenquote?: number;
    /** Nur in alten Datensätzen, es gibt dafür keine Quelle. */
    kaufkraftindex?: number;
    /** Nur in alten Datensätzen, es gibt dafür keine Quelle. */
    mietpreis_durchschnitt_qm?: number;
    highlights?: string[];
  };
}

/**
 * Die gemessene Standortanalyse eines Objekts holen.
 *
 * SEIT DEM 23.09.2026 NUR NOCH LESEN. Vorher rief diese Funktion bei
 * fehlender Analyse `generate-standortanalyse` ohne Anmeldung auf, und die
 * Function maß und speicherte für jeden, der eine Objekt-ID kannte. Jetzt
 * misst der Investagon-Import einmal, und die Analyse gilt dauerhaft. Hier
 * zählt die gespeicherte Analyse; eine alte, erfundene gilt als nicht
 * vorhanden.
 *
 * Neu messen lässt sich nur ausdrücklich (`messen: true`), und nur mit
 * Anmeldung über `supabase.functions.invoke`. Die Function lässt dann nur
 * Admin und Inhaber messen. Öffentliche Seiten rufen das nie mit `messen`.
 * Schlägt der Aufruf fehl, kommt `undefined` zurück: lieber nichts als etwas
 * Erfundenes.
 */
export async function ladeStandortanalyse(
  objektId: string,
  meta: unknown,
  optionen: { messen?: boolean } = {},
): Promise<StandortAnalyse | undefined> {
  const gespeichert = (meta as { standortanalyse?: StandortAnalyse } | null)?.standortanalyse;
  if (!optionen.messen) return istGemessen(gespeichert) ? gespeichert : undefined;

  try {
    // Erst hier geladen: Wer nur liest, braucht den Client nicht.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke("generate-standortanalyse", {
      body: { objektId, neuMessen: true },
    });
    if (error) return istGemessen(gespeichert) ? gespeichert : undefined;
    return istGemessen(data?.data) ? (data.data as StandortAnalyse) : istGemessen(gespeichert) ? gespeichert : undefined;
  } catch {
    return istGemessen(gespeichert) ? gespeichert : undefined;
  }
}

/**
 * Hat die Analyse überhaupt etwas zu zeigen?
 *
 * Eine gemessene Analyse ohne einen einzigen Treffer kommt auf dem Land vor.
 * Dann soll das Exposé den Abschnitt nicht mit leeren Überschriften füllen.
 */
export function hatInhalt(a: StandortAnalyse | undefined | null): boolean {
  if (!a) return false;
  const mikro = a.mikrolage || {};
  const eintraege = Object.values(mikro).reduce((n, liste) => n + (liste?.length || 0), 0);
  return eintraege > 0 || !!a.arbeitgeber?.length || !!a.makrolage?.beschreibung;
}

/**
 * Die Mikrolage als fertige Liste für die Darstellung.
 *
 * Objekt-PDF, Wohnungs-PDF und die öffentliche Exposé-Seite bauten dieselben
 * sieben Zeilen bisher je für sich zusammen. Leere Kategorien fallen hier
 * heraus, damit im Exposé keine Überschrift ohne Inhalt steht.
 */
export function mikrolageKategorien(
  a: StandortAnalyse | undefined | null,
): { title: string; items: { name: string; detail: string }[] }[] {
  const m = a?.mikrolage;
  if (!m) return [];

  const mitTyp = (o: StandortOrt) => (o.typ ? `${o.typ} · ${o.entfernung_m} m` : `${o.entfernung_m} m`);
  const gruppen: [string, StandortOrt[] | undefined][] = [
    ["Kindergärten", m.kindergaerten],
    ["Schulen", m.schulen],
    ["Einkaufen", m.einkaufen],
    ["Apotheken", m.apotheken],
    ["Ärzte & Gesundheit", m.aerzte],
    ["ÖPNV", m.oepnv],
    ["Freizeit & Erholung", m.freizeit],
  ];

  return gruppen
    .filter(([, orte]) => !!orte?.length)
    .map(([title, orte]) => ({
      title,
      items: orte!.map((o) => ({ name: o.name, detail: mitTyp(o) })),
    }));
}
