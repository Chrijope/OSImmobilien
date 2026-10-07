import { aktuelleRollposition, rolleZu } from "@/lib/rollen";

// Kleine Helper-API, um vom Kapitel per interner Verlinkung zu einer Seite
// zu springen und mit einem sichtbaren „Zurück zur Vertriebsakademie"-Banner
// exakt an die auslösende Stelle zurückzukehren.

export interface VaReturnState {
  academyBase?: "/vertriebsakademie" | "/vertriebsakademie-neu";
  kapitelSlug: string;
  kapitelNummer: string;
  kapitelTitel: string;
  sectionId: string;
  scrollY: number;
  targetPath: string; // Pfad, auf dem das Banner erscheinen soll
  ts: number;
}

const KEY = "va-return-context";

export function setVaReturn(state: Omit<VaReturnState, "ts">) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...state, ts: Date.now() }));
  } catch {}
}

export function getVaReturn(): VaReturnState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VaReturnState;
  } catch {
    return null;
  }
}

export function clearVaReturn() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

/**
 * Rollposition des Kastens, der wirklich rollt (Rueckfall: Fenster).
 *
 * Das erste `<main>` im Dokument ist die aeussere Klammer aus `App.tsx` und
 * rollt gar nicht. Deshalb laeuft die Suche ueber `lib/rollen.ts`.
 */
export function currentMainScrollY(): number {
  return aktuelleRollposition();
}

export function scrollMainTo(y: number) {
  rolleZu(y, "smooth");
}