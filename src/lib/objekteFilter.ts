/**
 * Die Filter der Seite „Objekte“, je Nutzer gemerkt (seit 24.10.2026).
 *
 * Vorher standen sie nur im Seitenzustand. Wer ein Kundenprofil öffnete und
 * zurückkam, fand die Liste wieder ungefiltert vor und musste Ort, Preis und
 * Rendite neu eintippen. Gespeichert wird in den Nutzereinstellungen, wie die
 * Auswahl auf dem Dashboard, also ohne neue Tabelle.
 */
import { getUserSetting, setUserSetting } from "./userSettingsCache";

export const OBJEKTE_FILTER_SCHLUESSEL = "objekte_filter";

export interface ObjekteFilter {
  suche: string;
  adresse: string;
  bauzustand: string;
  anlageklasse: string;
  objStatus: string;
  kpMin: string;
  kpMax: string;
  brMin: string;
  brMax: string;
  grMin: string;
  grMax: string;
  bjMin: string;
  bjMax: string;
  mehrOffen: boolean;
  /** Höchster Eigenaufwand je Monat in Euro, leer ohne Grenze. */
  aufwandBis: string;
  /** AfA-Arten, durch Komma getrennt (`linear,degressiv`). */
  afaArten: string;
  nurReservierbar: boolean;
}

export const LEERE_OBJEKTE_FILTER: ObjekteFilter = {
  suche: "",
  adresse: "",
  bauzustand: "alle",
  anlageklasse: "alle",
  objStatus: "alle",
  kpMin: "",
  kpMax: "",
  brMin: "",
  brMax: "",
  grMin: "",
  grMax: "",
  bjMin: "",
  bjMax: "",
  mehrOffen: false,
  aufwandBis: "",
  afaArten: "",
  nurReservierbar: false,
};

/**
 * Gespeicherten Wert in einen vollständigen Filter verwandeln. Fehlende oder
 * falsch getypte Felder (ältere Fassung, Handeingriff) fallen auf leer zurück,
 * statt die Seite mit `undefined` in einem Eingabefeld zu füllen.
 */
export function bereinigeObjekteFilter(roh: unknown): ObjekteFilter {
  if (!roh || typeof roh !== "object") return { ...LEERE_OBJEKTE_FILTER };
  const quelle = roh as Record<string, unknown>;
  const ergebnis = { ...LEERE_OBJEKTE_FILTER } as Record<string, unknown>;
  for (const [schluessel, vorgabe] of Object.entries(LEERE_OBJEKTE_FILTER)) {
    if (typeof quelle[schluessel] === typeof vorgabe) ergebnis[schluessel] = quelle[schluessel];
  }
  return ergebnis as unknown as ObjekteFilter;
}

export function ladeObjekteFilter(): ObjekteFilter {
  return bereinigeObjekteFilter(getUserSetting<unknown>(OBJEKTE_FILTER_SCHLUESSEL, null));
}

let ausstehend: ReturnType<typeof setTimeout> | null = null;

/** Speichert mit kurzer Verzögerung, damit nicht jeder Tastendruck einzeln geschrieben wird. */
export function speichereObjekteFilter(filter: ObjekteFilter, verzoegerungMs = 600): void {
  if (ausstehend) clearTimeout(ausstehend);
  ausstehend = setTimeout(() => {
    ausstehend = null;
    setUserSetting(OBJEKTE_FILTER_SCHLUESSEL, filter);
  }, verzoegerungMs);
}
