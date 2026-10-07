/**
 * Die Anzeigesprache für Bausteine, die öffentliche Kundenseiten und das CRM
 * gemeinsam nutzen (Kundensprache, Etappe 3).
 *
 * Kundenlink und Exposé bauen auf Komponenten der internen Objektseite auf
 * (Galerie, Dokumentenansicht, Finanzen, Kacheln) und auf Exposé-Bausteinen.
 * Statt `sprache` durch jede Ebene zu reichen, setzt die öffentliche Seite
 * einmal `SeitenSpracheProvider`, und die Bausteine lesen `useAnzeigeSprache`.
 *
 * Ohne Provider, also überall im CRM, gilt Deutsch. Das CRM ändert sich
 * dadurch nicht.
 */
import { createContext, useContext, type ReactNode } from "react";
import { STANDARD_SPRACHE, type Sprache } from "@/lib/seitenSprache";

const SeitenSpracheKontext = createContext<Sprache>(STANDARD_SPRACHE);

export function SeitenSpracheProvider({ sprache, children }: { sprache: Sprache; children: ReactNode }) {
  return <SeitenSpracheKontext.Provider value={sprache}>{children}</SeitenSpracheKontext.Provider>;
}

/** Die Sprache, in der der Baustein gerade anzeigt. Im CRM immer Deutsch. */
export function useAnzeigeSprache(): Sprache {
  return useContext(SeitenSpracheKontext);
}
