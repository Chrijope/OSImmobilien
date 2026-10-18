import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

/**
 * Wie ein einzelnes Feld bearbeitet wird.
 *
 * `speichern` ist immer ein vorhandener Speicherweg der Seite (siehe
 * `speichereStammdaten` in `pages/KundenDetail.tsx`), dieses Bauteil hat
 * keine eigene Speicherlogik. `false` heißt: nicht gespeichert, das Feld
 * bleibt offen. Den Grund hat der Speicherweg dann selbst gemeldet.
 */
export interface FeldBearbeitung<T> {
  start: () => T;
  editor: (wert: T, setze: (neu: T) => void) => ReactNode;
  speichern: (wert: T) => Promise<boolean | void> | boolean | void;
}

/** Hilft TypeScript, den Typ des Entwurfs aus `start` abzuleiten. */
export const feldBearbeitung = <T,>(b: FeldBearbeitung<T>): FeldBearbeitung<T> => b;

interface Props<T> {
  label: string;
  wert: ReactNode;
  /** Ohne Bearbeitung kein Stift: Die Rolle darf das Feld nicht ändern. */
  bearbeitung?: FeldBearbeitung<T>;
  /** Statt des Feldes öffnet der Stift einen eigenen, vorhandenen Ablauf. */
  onStift?: () => void;
}

/**
 * Eine Zeile der linken Spalte mit eigenem Stift.
 *
 * Der Stift erscheint beim Darüberfahren oder bei Fokus, auf dem Handy immer
 * (kundenprofil.css). Enter oder Häkchen speichert, Esc oder X verwirft,
 * danach ein kurzer Toast und keine Rückfrage.
 */
export function KundenprofilFeld<T>({ label, wert, bearbeitung, onStift }: Props<T>) {
  const [entwurf, setEntwurf] = useState<T | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const stiftRef = useRef<HTMLButtonElement>(null);
  const offen = entwurf !== null;
  const warOffen = useRef(false);

  useEffect(() => {
    if (offen) {
      formRef.current?.querySelector<HTMLElement>("input, textarea, button[role='combobox']")?.focus();
    } else if (warOffen.current) {
      stiftRef.current?.focus();
    }
    warOffen.current = offen;
  }, [offen]);

  const verwerfen = () => setEntwurf(null);
  const speichern = async () => {
    if (!bearbeitung || entwurf === null || speichert) return;
    setSpeichert(true);
    try {
      const ergebnis = await bearbeitung.speichern(entwurf);
      if (ergebnis === false) return;
      setEntwurf(null);
      toast({ title: `${label} gespeichert` });
    } catch (fehler) {
      toast({
        title: `${label} nicht gespeichert`,
        description: String((fehler as { message?: string })?.message || "Bitte versuche es erneut."),
        variant: "destructive",
      });
    } finally {
      setSpeichert(false);
    }
  };

  const stift = bearbeitung || onStift ? (
    <Button
      ref={stiftRef}
      type="button"
      variant="ghost"
      size="icon"
      className="kundenprofil-feld-stift h-7 w-7 shrink-0 rounded-full text-muted-foreground"
      aria-label={`${label} bearbeiten`}
      onClick={() => (onStift ? onStift() : setEntwurf(bearbeitung!.start()))}
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  ) : null;

  return (
    <div className="kundenprofil-feld" data-bearbeiten={offen ? "true" : undefined}>
      <dt>{label}</dt>
      <dd>
        {offen && bearbeitung ? (
          <form
            ref={formRef}
            className="space-y-2"
            aria-label={`${label} bearbeiten`}
            onSubmit={(e) => { e.preventDefault(); void speichern(); }}
            onKeyDown={(e) => {
              // Tasten aus Auswahllisten im Portal gehören nicht zu diesem Feld.
              if (e.key === "Escape" && formRef.current?.contains(e.target as Node)) {
                e.preventDefault();
                verwerfen();
              }
            }}
          >
            {bearbeitung.editor(entwurf as T, (neu) => setEntwurf(neu))}
            <div className="flex justify-end gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Verwerfen" onClick={verwerfen} disabled={speichert}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="submit" size="icon" className="h-8 w-8 rounded-full" aria-label="Speichern" disabled={speichert}>
                {speichert ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </form>
        ) : (
          <div className="kundenprofil-feld-wert">
            <div className="min-w-0 flex-1">{wert || <span className="text-muted-foreground">Nicht hinterlegt</span>}</div>
            {stift}
          </div>
        )}
      </dd>
    </div>
  );
}

/** Eine reine Anzeigezeile ohne Stift, gleicher Aufbau. */
export function KundenprofilAnzeige({ label, wert }: { label: string; wert: ReactNode }) {
  return <KundenprofilFeld label={label} wert={wert} />;
}
