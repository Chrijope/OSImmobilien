import { useEffect, useRef, useState } from "react";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { OBJEKTSEITE_KUNDEN_TEXTE } from "@/components/objektseite/objektseiteKundenTexte";
import { ChevronLeft, ChevronRight, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { resolveImageUrl } from "@/lib/objekteImages";
import { setObjektTitelbild } from "@/lib/objekteStore";
import type { ObjektBild } from "@/lib/objekteStore";
import { bildBeschriftung, naechsterIndex, vorherigerIndex } from "@/lib/objektGalerie";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Die Vollbildansicht der Objektfotos.
 *
 * Sie steckt im Dialog des Projekts (Radix), damit Escape, die Fokusfalle und
 * die Rückgabe des Fokus nicht noch einmal von Hand gebaut werden. Zusätzlich
 * blättern die Pfeiltasten, und der Fokus landet beim Öffnen in der Ansicht
 * statt irgendwo auf der Seite dahinter.
 *
 * Hier sitzt auch der Stern für das Titelbild. Früher stand er auf dem einen
 * großen Bild der alten Galerie. Im neuen Raster gibt es fünf Bilder
 * gleichzeitig, ein Stern an einem davon wäre missverständlich. In der
 * Vollbildansicht ist immer genau ein Bild gemeint, und man kommt an jedes.
 */
export function GalerieVollbild({
  offen,
  onOpenChange,
  bilder,
  adresse,
  startIndex,
  titelbildObjektId,
  titelbildUrl,
  beimSchliessen,
}: {
  offen: boolean;
  onOpenChange: (offen: boolean) => void;
  bilder: ObjektBild[];
  adresse: string;
  startIndex: number;
  /** Nur gesetzt, wenn die Rolle das Titelbild ändern darf. */
  titelbildObjektId?: string;
  titelbildUrl?: string;
  /** Holt den Fokus zurück auf das Feld, das die Ansicht geöffnet hat. */
  beimSchliessen?: () => void;
}) {
  // Kundensprache, Etappe 3: auf Kundenseiten in deren Sprache, im CRM Deutsch.
  const sprache = useAnzeigeSprache();
  const vt = OBJEKTSEITE_KUNDEN_TEXTE[sprache].vollbild;
  const [idx, setIdx] = useState(startIndex);
  const [speichert, setSpeichert] = useState(false);
  const buehne = useRef<HTMLDivElement>(null);

  // Jedes Öffnen beginnt bei dem Bild, auf das geklickt wurde.
  useEffect(() => {
    if (offen) setIdx(startIndex);
  }, [offen, startIndex]);

  const gesamt = bilder.length;
  const sicherIdx = gesamt > 0 ? Math.min(Math.max(idx, 0), gesamt - 1) : 0;
  const aktuell = bilder[sicherIdx];

  const zurueck = () => setIdx((i) => vorherigerIndex(i, gesamt));
  const weiter = () => setIdx((i) => naechsterIndex(i, gesamt));

  const istTitelbild =
    !!aktuell && !!titelbildUrl && resolveImageUrl(titelbildUrl) === resolveImageUrl(aktuell.url);
  const titelbildLabel = istTitelbild
    ? "Aktuelles Titelbild der Objektübersicht"
    : "Als Titelbild in der Objektübersicht verwenden";

  const alsTitelbild = async () => {
    if (!titelbildObjektId || !aktuell || speichert || istTitelbild) return;
    setSpeichert(true);
    try {
      await setObjektTitelbild(titelbildObjektId, aktuell.url);
      toast.success("Titelbild für die Objektübersicht gespeichert");
    } catch {
      toast.error("Titelbild konnte nicht gespeichert werden. Bitte erneut versuchen.");
    } finally {
      setSpeichert(false);
    }
  };

  if (gesamt === 0) return null;

  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
      <DialogContent
        /*
          Ueber der Kopfleiste und eine Spur kleiner.

          Christian am 22.09.2026: Die Kopfleiste schob sich ueber den oberen
          Rand der Ansicht, damit war das Kreuz zum Schliessen nicht mehr
          erreichbar. Die Leiste liegt auf `z-[60]`, der Dialog von Haus aus
          nur auf `z-50`. Deshalb hier `z-[80]`, wie beim Menue der Kopfleiste,
          das aus demselben Grund angehoben wurde.

          Dazu 86vh statt 92vh: So bleibt oben und unten ein Streifen frei, und
          die Ansicht steht sichtbar vor der Seite, statt sie randlos zu
          ersetzen.
        */
        className="z-[80] flex h-[86vh] max-h-[86vh] w-[92vw] max-w-[92vw] flex-col gap-3 overflow-hidden p-4 sm:p-5"
        onOpenAutoFocus={(e) => {
          // Der Fokus gehört in die Ansicht, nicht auf den Schließen-Knopf:
          // dann wirken die Pfeiltasten sofort.
          e.preventDefault();
          buehne.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          beimSchliessen?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); weiter(); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); zurueck(); }
          else if (e.key === "Home") { e.preventDefault(); setIdx(0); }
          else if (e.key === "End") { e.preventDefault(); setIdx(gesamt - 1); }
        }}
      >
        {/* max-md:mr-8: Auf dem Handy ersetzt die Dialogregel das pr-8 durch 1rem, und der Stern lag unter dem Schließen-Kreuz. */}
        <div className="flex items-start justify-between gap-3 pr-8 max-md:mr-8">
          <div className="min-w-0">
            <DialogTitle className="truncate">{adresse || vt.titel}</DialogTitle>
            <DialogDescription className="text-xs">
              {vt.beschreibung(sicherIdx + 1, gesamt)}
            </DialogDescription>
          </div>
          {titelbildObjektId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-[40px] min-w-[40px] shrink-0 gap-1.5 sm:h-9"
              onClick={alsTitelbild}
              disabled={speichert || istTitelbild}
              aria-pressed={istTitelbild}
              title={titelbildLabel}
            >
              {speichert
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Star className={cn("h-4 w-4", istTitelbild ? "fill-primary text-primary" : "text-muted-foreground")} />}
              <span className="hidden sm:inline">{istTitelbild ? "Titelbild" : "Als Titelbild"}</span>
            </Button>
          )}
        </div>

        <div
          ref={buehne}
          tabIndex={-1}
          role="group"
          aria-label={vt.bereich}
          className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-muted outline-none"
        >
          {aktuell && (
            <img
              key={aktuell.id || aktuell.url}
              src={resolveImageUrl(aktuell.url)}
              alt={bildBeschriftung(aktuell, adresse, sicherIdx, gesamt, sprache)}
              className="h-full w-full object-contain"
              loading="eager"
              decoding="async"
            />
          )}
          {gesamt > 1 && (
            <>
              <Button
                type="button" size="icon" variant="secondary" aria-label={vt.vorheriges} onClick={zurueck}
                className="absolute left-3 top-1/2 h-[40px] w-[40px] -translate-y-1/2 rounded-full shadow"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button" size="icon" variant="secondary" aria-label={vt.naechstes} onClick={weiter}
                className="absolute right-3 top-1/2 h-[40px] w-[40px] -translate-y-1/2 rounded-full shadow"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>

        {gesamt > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
            {bilder.map((b, i) => (
              <button
                key={b.id || b.url}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={bildBeschriftung(b, adresse, i, gesamt, sprache)}
                aria-current={i === sicherIdx}
                className={cn(
                  "h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  i === sicherIdx ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
                )}
              >
                <img src={resolveImageUrl(b.url)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
