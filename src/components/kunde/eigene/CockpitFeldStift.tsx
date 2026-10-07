import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { validiereEigenesInvestment, type PruefErgebnis } from "@/lib/eigeneInvestmentValidierung";
import type { CockpitFeld } from "@/lib/eigeneInvestmentSpeichern";

export interface StiftFeld {
  key: CockpitFeld;
  label: string;
  /** Einheit rechts im Feld, etwa "€" oder "%". */
  einheit?: string;
  art: "zahl" | "jahr" | "datum";
  hilfe?: string;
}

export type StiftWerte = Partial<Record<CockpitFeld, string>>;

interface Props {
  /** Ueberschrift im Popover, etwa "Grundsteuer". */
  titel: string;
  felder: StiftFeld[];
  /** Gespeicherte Werte als Text (Zahlen mit Komma, Datum als JJJJ-MM-TT). */
  startwerte: StiftWerte;
  /** Speichert ueber denselben Weg wie der Bearbeiten-Dialog. true = gespeichert. */
  onSpeichern: (werte: StiftWerte) => Promise<boolean>;
  /** Zusaetzlicher Inhalt unter den Feldern, etwa der AfA-Vorschlag. */
  zusatz?: (werte: StiftWerte, setze: (key: CockpitFeld, wert: string) => void) => ReactNode;
  /** Hinweis unter den Feldern, etwa welcher Wert gilt, solange das Feld leer ist. */
  hinweis?: string;
  /** Statt des Stifts ein Textlink als Ausloeser. */
  linkText?: string;
}

/**
 * Stift im Steuer-Cockpit: oeffnet eine kompakte Eingabe direkt an der Zeile.
 * Validierung wie im Bearbeiten-Dialog (validiereEigenesInvestment): harte
 * Fehler blockieren, Warnungen brauchen ein ausdrueckliches "Trotzdem speichern".
 */
export function CockpitFeldStift({ titel, felder, startwerte, onSpeichern, zusatz, hinweis, linkText }: Props) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  const [werte, setWerte] = useState<StiftWerte>(startwerte);
  const [pruefung, setPruefung] = useState<PruefErgebnis | null>(null);
  const [warnungBestaetigt, setWarnungBestaetigt] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  const oeffnen = (o: boolean) => {
    // Jedes Oeffnen beginnt beim gespeicherten Stand; Abbrechen verwirft alles.
    if (o) {
      setWerte(startwerte);
      setPruefung(null);
      setWarnungBestaetigt(false);
    }
    setOffen(o);
  };

  const setze = (key: CockpitFeld, wert: string) => {
    setWerte(w => ({ ...w, [key]: wert }));
    if (warnungBestaetigt) setWarnungBestaetigt(false);
  };

  const speichern = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const ergebnis = validiereEigenesInvestment(werte as Record<string, string>);
    setPruefung(ergebnis);
    if (ergebnis.fehler.length > 0) { setWarnungBestaetigt(false); return; }
    if (ergebnis.warnungen.length > 0 && !warnungBestaetigt) { setWarnungBestaetigt(true); return; }
    setSpeichert(true);
    try {
      const ok = await onSpeichern(werte);
      if (ok) setOffen(false);
    } finally {
      setSpeichert(false);
    }
  };

  const feldKlasse = (key: string) =>
    pruefung?.felder[key] === "fehler"
      ? "border-destructive focus-visible:ring-destructive"
      : pruefung?.felder[key] === "warnung"
        ? "border-[hsl(var(--warning))]"
        : "";

  const ariaLabel = t("portal.cards.steuer_eigen.stift_aria", "{{feld}} bearbeiten", { feld: titel });

  return (
    <Popover open={offen} onOpenChange={oeffnen}>
      <PopoverTrigger asChild>
        {linkText ? (
          <button type="button" className="text-primary underline-offset-4 hover:underline font-medium" aria-label={ariaLabel}>
            {linkText}
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={ariaLabel}
            title={ariaLabel}
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          >
            <Pencil />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)] p-4">
        <form onSubmit={speichern} className="space-y-3" aria-label={titel}>
          <p className="text-sm font-semibold">{titel}</p>
          {felder.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`stift-${f.key}`} className="text-[13px]">{f.label}</Label>
              {f.art === "datum" ? (
                <DateInput
                  id={`stift-${f.key}`}
                  ariaLabel={f.label}
                  value={werte[f.key] ?? ""}
                  onChange={v => setze(f.key, v)}
                />
              ) : (
                <div className="relative">
                  <Input
                    id={`stift-${f.key}`}
                    type="text"
                    inputMode={f.art === "jahr" ? "numeric" : "decimal"}
                    autoComplete="off"
                    value={werte[f.key] ?? ""}
                    onChange={e => setze(f.key, e.target.value)}
                    placeholder={t("portal.cards.steuer_eigen.fehlt_placeholder", "Angabe fehlt")}
                    aria-invalid={pruefung?.felder[f.key] === "fehler"}
                    className={`h-9 ${f.einheit ? "pr-9" : ""} ${feldKlasse(f.key)}`}
                  />
                  {f.einheit && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{f.einheit}</span>
                  )}
                </div>
              )}
              {f.hilfe && <p className="text-[12px] leading-snug text-muted-foreground">{f.hilfe}</p>}
            </div>
          ))}

          {zusatz?.(werte, setze)}

          {hinweis && <p className="text-[12px] leading-snug text-muted-foreground">{hinweis}</p>}

          {pruefung && pruefung.fehler.length > 0 && (
            <ul role="alert" className="list-disc space-y-0.5 pl-5 text-[12px] text-destructive">
              {pruefung.fehler.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          {pruefung && pruefung.fehler.length === 0 && pruefung.warnungen.length > 0 && (
            <ul role="alert" className="list-disc space-y-0.5 pl-5 text-[12px]">
              {pruefung.warnungen.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          <p className="text-[12px] leading-snug text-muted-foreground">
            {t("portal.cards.steuer_eigen.stift_gemeinsam", "Derselbe Wert wie unter Bearbeiten an der Immobilie.")}
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => oeffnen(false)} disabled={speichert}>
              {t("portal.cards.steuer_eigen.stift_abbrechen", "Abbrechen")}
            </Button>
            <Button type="submit" size="sm" disabled={speichert} className="gap-1.5">
              {speichert && <Loader2 className="animate-spin" />}
              {warnungBestaetigt
                ? t("portal.cards.steuer_eigen.stift_trotzdem", "Trotzdem speichern")
                : t("portal.cards.steuer_eigen.stift_speichern", "Speichern")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
