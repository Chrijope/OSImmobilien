import { type ReactNode } from "react";
import type { ScrollAbschnitt } from "./useScrollAbschnitt";

/**
 * Die Bühne zum Hook `useScrollAbschnitt`: ein hoher Kasten, in dem der Inhalt
 * oben festklebt, solange man durch ihn hindurchscrollt. Bei reduzierter
 * Bewegung bleibt nur ein schlichter Kasten übrig.
 */
interface BuehneProps {
  abschnitt: ScrollAbschnitt;
  /** Höhe der Hülle als Vielfaches der Bildschirmhöhe, z. B. "h-[260svh] sm:h-[300svh]". */
  hoehe: string;
  /**
   * Wo der Inhalt auf der Bühne sitzt.
   *
   * "mitte" ist der Standard und bleibt es für alle bisherigen Aufrufe.
   * "oben" braucht, wer über der Bühne noch eine Abschnittsüberschrift stehen
   * hat: Zentriert rutscht der Inhalt dann in die Bildschirmmitte, und
   * zwischen Überschrift und Inhalt klafft ein Loch, solange beides zugleich
   * zu sehen ist.
   */
  ausrichtung?: "mitte" | "oben";
  children: ReactNode;
}

/** Hoher Kasten mit festklebender Bühne. Bei reduzierter Bewegung schlicht ein Kasten. */
export function ScrollBuehne({ abschnitt, hoehe, ausrichtung = "mitte", children }: BuehneProps) {
  if (abschnitt.ruhig) return <div className="w-full">{children}</div>;
  return (
    <div ref={abschnitt.huelleRef} className={`relative ${hoehe}`}>
      <div
        ref={abschnitt.buehneRef}
        /*
         * Auf dem Handy ist die Buehne nur so hoch wie ihr Inhalt.
         *
         * Mit h-[100svh] blieben dort gemessene 267 Pixel Leerraum unter dem
         * Inhalt stehen, und alles, was nach der Huelle kommt, rutschte um
         * genau diesen Betrag nach unten. Christian am 16.09.2026 zum Kasten
         * unter der Ausgangslage: "da dort viel zu viel Platz ist".
         *
         * Ab 640 Pixeln bleibt die volle Bildschirmhoehe, dort wird der Inhalt
         * senkrecht zentriert und braucht sie.
         */
        className={
          ausrichtung === "oben"
            ? "sticky top-0 flex h-auto items-start overflow-clip py-6 sm:h-[100svh] sm:items-start sm:pt-8 sm:pb-12"
            : "sticky top-0 flex h-auto items-start overflow-clip py-6 sm:h-[100svh] sm:items-center sm:py-12"
        }
      >
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}

export default ScrollBuehne;
