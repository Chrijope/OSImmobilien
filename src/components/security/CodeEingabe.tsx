import { useEffect, useRef, useState } from "react";
import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { cn } from "@/lib/utils";

/**
 * Eingabe des sechsstelligen Codes aus der Authenticator-App, wie am iPhone:
 * sechs Felder, Einfügen füllt alle, Rücktaste springt zurück.
 *
 * Technisch ist es EIN unsichtbares Eingabefeld (Paket `input-otp`), die sechs
 * Kästchen sind nur Anzeige. Deshalb funktionieren Einfügen, Autofill
 * („one-time-code“) und Rücktaste wie bei einem normalen Feld, und die ganze
 * Reihe ist Tippfläche.
 *
 * Nur Oberfläche: Geprüft wird weiter in der Komponente, die den Code braucht.
 */

const LAENGE = 6;

interface CodeEingabeProps {
  value: string;
  onChange: (wert: string) => void;
  /**
   * Wird genau einmal je vollständigem Code aufgerufen. Fehlt es, wird nicht
   * automatisch abgesendet (etwa beim Ausschalten, dort bestätigt ein Knopf).
   */
  onVollstaendig?: () => void;
  /** Während der Prüfung: Felder gesperrt und gedämpft. */
  beschaeftigt?: boolean;
  /** Bei jedem Hochzählen: kurz schütteln, Felder leeren, Fokus ins erste Feld. */
  fehler?: number;
  /** Zugängliche Beschriftung der Eingabe. */
  label: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}

export function CodeEingabe({
  value,
  onChange,
  onVollstaendig,
  beschaeftigt = false,
  fehler = 0,
  label,
  id,
  autoFocus,
  className,
}: CodeEingabeProps) {
  const eingabe = useRef<HTMLInputElement>(null);
  // Der zuletzt abgesendete Code. Verhindert ein zweites Absenden desselben
  // Codes, etwa wenn nach der Prüfung `beschaeftigt` wieder auf false fällt.
  const abgesendet = useRef<string | null>(null);
  const letzterFehler = useRef(fehler);
  const fokusNachFehler = useRef(false);
  const [schuetteln, setSchuetteln] = useState(false);

  // Absenden im Effekt und nicht im onComplete des Pakets: Erst nach dem
  // Neuzeichnen kennt die aufrufende Komponente den vollständigen Code in
  // ihrem eigenen Zustand.
  useEffect(() => {
    if (value.length < LAENGE) {
      abgesendet.current = null;
      return;
    }
    if (!onVollstaendig || beschaeftigt || abgesendet.current === value) return;
    abgesendet.current = value;
    onVollstaendig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, beschaeftigt]);

  useEffect(() => {
    if (fehler !== letzterFehler.current) {
      letzterFehler.current = fehler;
      onChange("");
      setSchuetteln(true);
      fokusNachFehler.current = true;
    }
    // Fokus erst, wenn das Feld nicht mehr gesperrt ist.
    if (fokusNachFehler.current && !beschaeftigt) {
      fokusNachFehler.current = false;
      eingabe.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fehler, beschaeftigt]);

  return (
    <div
      data-code-eingabe=""
      className={cn("w-full", schuetteln && "motion-safe:animate-code-schuetteln", className)}
      onAnimationEnd={() => setSchuetteln(false)}
    >
      <OTPInput
        ref={eingabe}
        id={id}
        value={value}
        onChange={onChange}
        maxLength={LAENGE}
        pattern={REGEXP_ONLY_DIGITS}
        // Kopierte Codes kommen oft als „123 456“ oder „123-456“.
        pasteTransformer={(text) => text.replace(/\D/g, "").slice(0, LAENGE)}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={beschaeftigt}
        aria-label={label}
        aria-busy={beschaeftigt || undefined}
        // Sonst schiebt das Paket Platz für Passwortmanager an und die Reihe
        // wird auf dem Handy breiter als der Bildschirm.
        pushPasswordManagerStrategy="none"
        containerClassName="flex w-full items-center justify-center gap-1.5 sm:gap-2"
        render={({ slots }) => slots.map((slot, i) => <Feld key={i} {...slot} beschaeftigt={beschaeftigt} />)}
      />
    </div>
  );
}

function Feld({ char, isActive, hasFakeCaret, beschaeftigt }: SlotProps & { beschaeftigt: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        // Mindestens 44 Pixel breit auf 375 Pixeln, 56 hoch, darüber bis 52 breit.
        "relative flex h-14 min-w-0 max-w-[3.25rem] flex-1 items-center justify-center rounded-xl border border-input",
        "bg-card/70 text-2xl font-semibold tabular-nums text-foreground shadow-sm backdrop-blur-sm dark:bg-white/5",
        "transition-[border-color,box-shadow] duration-150",
        isActive && "border-primary ring-2 ring-primary/30",
        beschaeftigt && "opacity-60 motion-safe:animate-pulse",
      )}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-px bg-foreground motion-safe:animate-caret-blink" />
        </div>
      )}
    </div>
  );
}
