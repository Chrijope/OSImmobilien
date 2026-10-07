/**
 * Prozesslinie: das Modell hinter der Fortschrittsanzeige im Kundenprofil.
 *
 * Reihenfolge, Zustände und Rollenschnitt stehen nur hier. Die Stufen kommen
 * aus `FORTSCHRITT_STUFEN`, dieselbe Quelle wie die heutige Chip-Leiste.
 */
import { FORTSCHRITT_STUFEN, fortschrittsRang, istNoShowStufe } from "@/lib/pipelineStufen";
import { STUFEN_ERKLAERUNG } from "@/lib/stufenErklaerung";

export type StationsZustand = "erledigt" | "aktuell" | "offen";

export interface Station {
  key: string;
  label: string;
  /** Laufende Nummer ab 1, so wie sie der Nutzer sieht. */
  nr: number;
  zustand: StationsZustand;
  phase: PhaseKey;
  hinweis?: string;
  istZiel: boolean;
}

export type PhaseKey = "kontakt" | "beratung" | "objekt" | "finanzierung" | "abschluss";

export const PHASEN: { key: PhaseKey; label: string; stufen: string[] }[] = [
  { key: "kontakt", label: "Kontakt", stufen: ["neuer_lead", "nicht_erreicht", "erreicht", "follow_up"] },
  { key: "beratung", label: "Beratung", stufen: ["erstgespraech_geplant", "beratungsgespraech", "selbstauskunft"] },
  { key: "objekt", label: "Objekt", stufen: ["objektauswahl", "follow_up_objekt", "reservierung"] },
  { key: "finanzierung", label: "Finanzierung", stufen: ["bonitaetsunterlagen", "finanzierung"] },
  { key: "abschluss", label: "Abschluss", stufen: ["notar", "faelligkeit", "abrechnung", "abgeschlossen"] },
];

const PHASE_JE_STUFE: Record<string, PhaseKey> = Object.fromEntries(
  PHASEN.flatMap((p) => p.stufen.map((s) => [s, p.key])),
);

/**
 * Rollen, die die Straße bis „Abgeschlossen“ sehen. Alle anderen enden an
 * „Fälligkeit“: Ab dort stellt der Vertrieb seine Provision, Abrechnung und
 * Abschluss sind Sache des Hauses. Unbekannte Rollen fallen bewusst in die
 * kurze Fassung, das ist die sichere Richtung.
 */
export const VOLLE_STRASSE_ROLLEN: readonly string[] = [
  "admin",
  "inhaber",
  "backoffice",
  "buchhaltung",
  "vertriebsleiter",
];

export function zielStufeFuerRolle(rolle: string): string {
  return VOLLE_STRASSE_ROLLEN.includes(rolle) ? "abgeschlossen" : "faelligkeit";
}

export interface Strasse {
  stationen: Station[];
  /** Index der aktuellen Station; bei erreichtem Ziel die Zielstation. */
  aktuellIndex: number;
  /** 0 bis 100, gerundet. */
  prozent: number;
  zielErreicht: boolean;
  nichtErschienen: boolean;
  /** Ziel der aktiven Rolle: „faelligkeit“ oder „abgeschlossen“. */
  zielKey: string;
}

/**
 * Baut die Straße für eine Stufe und die aktive Rolle.
 *
 * Steht ein Investment hinter dem Ziel der Rolle (etwa in „Abrechnung“, und
 * ein Partner schaut), gilt das Ziel als erreicht. Die Stufe dahinter wird
 * nicht verraten, auch nicht im Prozentwert.
 */
export function baueStrasse(stufe: string | null | undefined, rolle: string): Strasse {
  const zielKey = zielStufeFuerRolle(rolle);
  const zielIdx = FORTSCHRITT_STUFEN.findIndex((s) => s.key === zielKey);
  const sichtbar = FORTSCHRITT_STUFEN.slice(0, zielIdx + 1);
  const rang = fortschrittsRang(stufe || "erstgespraech_geplant");
  const abgeschlossen = stufe === "abgeschlossen";
  // Hinter dem Ziel oder am Ende: alles erledigt.
  const zielErreicht = rang > zielIdx || (rang === zielIdx && (abgeschlossen || zielKey === "faelligkeit"));
  const aktuellIndex = Math.min(rang, zielIdx);

  const stationen: Station[] = sichtbar.map((s, i) => ({
    key: s.key,
    label: s.label,
    nr: i + 1,
    zustand: zielErreicht || i < aktuellIndex ? "erledigt" : i === aktuellIndex ? "aktuell" : "offen",
    phase: PHASE_JE_STUFE[s.key] ?? "abschluss",
    hinweis: STUFEN_ERKLAERUNG[s.key],
    istZiel: i === sichtbar.length - 1,
  }));

  return {
    stationen,
    aktuellIndex,
    prozent: zielErreicht ? 100 : Math.round(((aktuellIndex + 1) / sichtbar.length) * 100),
    zielErreicht,
    nichtErschienen: istNoShowStufe(stufe),
    zielKey,
  };
}

/** Ob die interne Kennzeichnung „mit/ohne GS“ an Notar gezeigt wird (wie heute). */
export function zeigtGrundschuld(stufe: string | null | undefined): boolean {
  return ["notar", "faelligkeit", "abrechnung", "abgeschlossen"].includes(stufe || "");
}
