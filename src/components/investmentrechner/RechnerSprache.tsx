import { createContext, useContext } from "react";
import type { FormatSprache } from "@/lib/sprachFormat";
import { dokumentTexteFuer, type DokumentTexte } from "@/lib/investmentrechner/dokumentTexte";
import { kennzahlTexteFuer, type KennzahlTexte } from "@/lib/investmentrechner/kennzahlTexte";

/**
 * Die Sprache, in der die Bausteine des Investmentrechners schreiben.
 *
 * Plan Kundensprache, Etappe 5: Der Druck der Berechnung (`ExposeDokument`)
 * geht an den Kunden und erscheint in seiner Sprache. Er setzt dafür diesen
 * Kontext, und Tabellen, Diagramme, Steuerprofil und Glossar darin lesen ihn,
 * statt dass die Sprache durch jede Komponente gereicht wird. Ohne Kontext
 * gilt Deutsch, die Rechneransicht bleibt also, wie sie ist.
 */
export const RechnerSpracheContext = createContext<FormatSprache>("de");

export function useRechnerSprache(): FormatSprache {
  return useContext(RechnerSpracheContext);
}

/** Sprache und die beiden Textsammlungen in einem Griff. */
export function useRechnerTexte(): { sprache: FormatSprache; texte: DokumentTexte; kennzahl: KennzahlTexte } {
  const sprache = useRechnerSprache();
  return { sprache, texte: dokumentTexteFuer(sprache), kennzahl: kennzahlTexteFuer(sprache) };
}
