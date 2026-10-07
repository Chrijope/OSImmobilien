import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { useVersionsHinweis } from "@/lib/versionspruefung";
import { useVideoraumOptional } from "@/contexts/VideoraumContext";
import { confirmDialog } from "@/lib/confirm";

/**
 * Laedt beim naechsten Seitenwechsel still neu (seit 26.09.2026, fuer alle).
 *
 * Nur gerendert, wenn `useVersionsHinweis` das so entschieden hat. Der
 * Seitenwechsel ist der Moment, in dem die alte Seite schon abgebaut ist,
 * also nichts Getipptes mehr offen steht. Geladen wird die neue Adresse,
 * der Nutzer landet genau dort, wohin er wollte.
 *
 * Nie waehrend eines Videogespraechs: Das Neuladen trennt die Verbindung.
 * Dann wartet es auf einen Seitenwechsel nach dem Gespraech.
 * `window.location.reload()` loest die `beforeunload`-Waechter aus, wer
 * noch etwas Ungespeichertes offen hat, bekommt die Rueckfrage.
 */
function StillesNeuladen({ merkeStill }: { merkeStill: () => void }) {
  const { pathname } = useLocation();
  const videoraum = useVideoraumOptional();
  const start = useRef(pathname);

  useEffect(() => {
    if (pathname === start.current || videoraum?.aktiv) return;
    merkeStill();
    window.location.reload();
  }, [pathname, videoraum?.aktiv, merkeStill]);

  return null;
}

/**
 * Der Warnstreifen ganz oben, wenn eine neuere Fassung des CRM bereitliegt
 * und `public/versionsnotiz.json` fuer sie einen Eintrag mit `kritisch`
 * enthaelt, also der alte Stand nicht mehr richtig speichert. Bei jedem
 * anderen Update gibt es seit dem 26.09.2026 keinen Streifen mehr, dann
 * laedt `StillesNeuladen` beim naechsten Seitenwechsel.
 *
 * Anlass war ein Vorfall vom 18.09.2026: Ein Vertriebspartner konnte vier Tage
 * lang bei einem Kunden nichts speichern, jede Eingabe endete mit „Eintrag
 * nicht im Verlauf gespeichert". Die Berechtigungen waren in Ordnung. Er hatte
 * die Seite seit dem 14.09. offen und lief deshalb mit dem Programmstand von
 * damals. Ein einziges Neuladen hat es behoben, nur wies nichts darauf hin.
 * Wann geprueft wird und was dabei bewusst schweigt, steht in
 * `lib/versionspruefung.ts`.
 *
 * Er schiebt den Seiteninhalt nach unten, statt ihn zu ueberdecken, genau wie
 * die Videoraumleiste. Dafuer braucht er hier gar nichts Besonderes: Er steht
 * im normalen Fluss, oberhalb der Routen. Die Videoraumleiste muss sich
 * festkleben, weil sie oben stehen bleiben soll; sie legt deshalb einen
 * gleich hohen Platzhalter in den Fluss. Dieser Streifen ist selbst der
 * Platzhalter, damit gibt es keine zweite Hoehe, die auseinanderlaufen kann.
 *
 * Stehen beide gleichzeitig, liegt der Streifen unter dem Platzhalter der
 * Videoraumleiste, also unter der Leiste. Nichts ueberlappt, weil nur eines
 * von beiden aus dem Fluss genommen ist.
 *
 * Vom Streifen aus wird nur auf Klick neu geladen. Es gibt keinen
 * herunterlaufenden Zaehler: Mitten auf einer Seite neu zu laden wuerde
 * wegwerfen, was jemand gerade tippt.
 */
export function VersionsHinweis() {
  const { sichtbar, still, ausblenden, merkeStill } = useVersionsHinweis();
  const videoraum = useVideoraumOptional();

  if (still) return <StillesNeuladen merkeStill={merkeStill} />;
  if (!sichtbar) return null;

  const laden = async () => {
    /*
     * Ein laufendes Gespraech ist der schlimmste Fall: Neuladen trennt die
     * Verbindung, und der Kunde sitzt allein in der Leitung. Deshalb hier
     * eine Rueckfrage im Projektstil. Browser-Dialoge sind im Projekt
     * verboten, siehe `lib/confirm.tsx`.
     */
    if (videoraum?.aktiv) {
      const weiter = await confirmDialog({
        title: "Gespräch trennen und neu laden?",
        description:
          "Du bist gerade in einem Videogespräch. Beim Neuladen wird die Verbindung getrennt, und du musst dem Gespräch neu beitreten.",
        confirmText: "Trotzdem laden",
        cancelText: "Im Gespräch bleiben",
        variant: "destructive",
      });
      if (!weiter) return;
    }
    /*
     * Ein einfaches Neuladen, damit die `beforeunload`-Waechter des Projekts
     * greifen. Wer eine ungespeicherte Notiz offen hat, bekommt vom Browser
     * selbst die Rueckfrage und kann abbrechen. Das ist gewollt und darf hier
     * nicht umgangen werden.
     */
    window.location.reload();
  };

  return (
    <div
      role="status"
      data-pruefung="versionshinweis"
      /*
        `min-h-[44px]` in festen Pixeln, nicht `h-11`. Die Wurzelschrift steht
        in `index.css` auf 90 Prozent, aus `h-11` wuerden dadurch nur 40 Pixel.
      */
      className="flex min-h-[44px] w-full shrink-0 items-center gap-2 border-b border-warning/40 bg-warning/15 px-3 text-foreground sm:gap-3 sm:px-4"
    >
      <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-warning" />

      {/*
        Der Text darf umbrechen, er muss ganz gelesen werden. `min-w-0`
        gehoert dazu, sonst weigert sich das Flex-Element zu schrumpfen und
        schiebt den Knopf aus dem Bild.
      */}
      <span className="min-w-0 flex-1 py-1 text-sm font-medium">
        Bitte kurz neu laden, damit alles richtig gespeichert wird.
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {/*
          Der Knopf ist 44 Pixel hoch, das gefaerbte Feld darin kleiner. So
          bleibt die Trefferflaeche gross genug, ohne dass der Streifen wie ein
          durchgehender Block aussieht.

          Das Ausrufezeichen vor `min-h` ist noetig und gemessen: In
          `index.css` steht unter `@media (max-width: 767px)` die Regel
          `button:not(…) { min-height: 40px }`. Sie ist spezifischer als eine
          Tailwind-Klasse und hat die 44 Pixel auf dem Telefon auf 40
          gedrueckt, also genau dort, wo die grosse Trefferflaeche zaehlt.
        */}
        <button
          type="button"
          onClick={() => void laden()}
          className="flex !min-h-[44px] items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="rounded-lg bg-warning px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-warning/90">
            Jetzt laden
          </span>
        </button>

        {/*
          Das Kreuz ist Absicht: Wer mitten im Kundengespraech tippt, soll den
          Hinweis loswerden koennen. Weg bleibt er nur fuer diese Sitzung, beim
          naechsten Wechsel zurueck in den Tab steht er wieder da.
        */}
        <button
          type="button"
          onClick={ausblenden}
          aria-label="Hinweis ausblenden"
          className="flex !min-h-[44px] min-w-[44px] items-center justify-center rounded-lg transition-colors hover:bg-warning/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
