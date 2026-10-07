import { useId, useLayoutEffect, useRef, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
import type { AktivitaetEntry } from "@/lib/aktivitaetenStore";

/**
 * Der Stern an einer Notiz im Verlauf des Kundenprofils.
 *
 * Wer die Notiz nicht bearbeiten darf, bekommt keinen Knopf. Ist die Notiz
 * angepinnt, sieht er den Stern trotzdem, nur eben nicht klickbar.
 */
export function NotizFavoritStern({
  angepinnt,
  darf,
  speichert,
  onUmschalten,
}: {
  angepinnt: boolean;
  darf: boolean;
  speichert?: boolean;
  onUmschalten: () => void;
}) {
  const stern = <Star className={`h-3.5 w-3.5 ${angepinnt ? "text-amber-500 fill-current" : ""}`} />;
  if (!darf) {
    return angepinnt ? (
      <span role="img" aria-label="Angepinnt" className="inline-flex h-7 w-7 items-center justify-center">
        {stern}
      </span>
    ) : null;
  }
  const text = angepinnt ? "Nicht mehr anpinnen" : "Als Favorit anpinnen";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onUmschalten}
          disabled={speichert}
          aria-label={text}
          aria-pressed={angepinnt}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
        >
          {stern}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Text, der hoechstens drei Zeilen zeigt und sich mit „mehr“ aufklappen laesst.
 *
 * Ob er laenger ist, wird gemessen, nicht an der Zeichenzahl geschaetzt: Im
 * schmalen Dialog auf dem Handy sind drei Zeilen weniger Zeichen als am
 * Rechner.
 * ponytail: gemessen wird beim Oeffnen, nicht bei jeder Groessenaenderung;
 * ein ResizeObserver waere noetig, falls der Dialog je mitwachsen soll.
 */
function DreiZeilen({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [offen, setOffen] = useState(false);
  const [zuLang, setZuLang] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !offen) setZuLang(el.scrollHeight > el.clientHeight + 1);
  }, [text, offen]);
  return (
    <>
      <p
        ref={ref}
        id={id}
        className={`mt-1 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm font-medium text-foreground ${offen ? "" : "line-clamp-3"}`}
      >
        {text}
      </p>
      {zuLang && (
        <button
          type="button"
          className="mt-1 text-xs text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          aria-expanded={offen}
          aria-controls={id}
          onClick={() => setOffen((wert) => !wert)}
        >
          {offen ? "weniger" : "mehr"}
        </button>
      )}
    </>
  );
}

/**
 * Rueckfrage vor dem Entfernen eines Eintrags aus dem Verlauf.
 *
 * Gilt fuer jeden Eintrag, Notiz wie Aufgabe oder Termin. Das Loeschen selbst
 * bleibt beim Aufrufer, hier steht nur, was man sieht.
 */
export function EintragEntfernenDialog({
  eintrag,
  loescht,
  onSchliessen,
  onLoeschen,
}: {
  eintrag: AktivitaetEntry | null;
  loescht: boolean;
  onSchliessen: () => void;
  onLoeschen: () => void;
}) {
  const datum = eintrag?.datum
    ? new Date(eintrag.datum).toLocaleString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";
  return (
    <AlertDialog open={!!eintrag} onOpenChange={(offen) => { if (!offen) onSchliessen(); }}>
      <AlertDialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-[min(32rem,calc(100vw-2rem))]">
        <AlertDialogHeader className="min-w-0">
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 shrink-0 text-destructive" />
            Eintrag entfernen
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="min-w-0 space-y-3">
              <p>Dieser Eintrag wird dauerhaft gelöscht. Das lässt sich nicht rückgängig machen.</p>
              {eintrag && (
                <div data-testid="eintrag-vorschau" className="min-w-0 rounded-lg border border-border bg-muted/40 p-3 text-left">
                  <p className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                    {eintrag.von}
                    {datum ? ` · ${datum} Uhr` : ""}
                  </p>
                  <DreiZeilen key={eintrag.id} text={eintrag.beschreibung} />
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Die Knöpfe sagen, was sie tun, nicht „OK" und „Abbrechen". */}
          <AlertDialogCancel disabled={loescht}>Behalten</AlertDialogCancel>
          <AlertDialogAction
            disabled={loescht}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              // Erst schliessen, wenn die Datenbank bestaetigt hat. Das
              // uebernimmt der Aufrufer ueber `eintrag`.
              e.preventDefault();
              onLoeschen();
            }}
          >
            {loescht ? "Wird gelöscht …" : "Löschen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
