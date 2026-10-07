import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  GRUND_SONSTIGES,
  GRUND_TEXT_MAX,
  UEBERGABE_GRUENDE,
  type UebergabeGrund,
} from "@/lib/uebergabeGrund";
import { cn } from "@/lib/utils";

/**
 * Die Erfassung des Uebergabegrunds: Knoepfe zum Antippen, dazu ein Feld fuer
 * alles, was keine Liste vorhersieht.
 *
 * Absicht der Gestaltung: Der haeufige Fall ist ein einziger Klick. Getippt
 * wird nur, wer etwas zu ergaenzen hat. Der Grund landet bei einem Kollegen
 * und bleibt am Kontakt stehen, deshalb sind die Vorschlaege sachlich und der
 * Hinweistext bittet ausdruecklich um eine Uebergabe, nicht um eine Bewertung
 * der Person.
 */
export interface UebergabeGrundFeldProps {
  grund: UebergabeGrund;
  onChange: (grund: UebergabeGrund) => void;
  /** Schmale Fassung fuer die Zeile eines einzelnen Leads. */
  kompakt?: boolean;
  /** Eigener Platzhalter fuer das Textfeld. */
  platzhalter?: string;
  /** Kennzeichnung fuer Vorlesewerkzeuge, wenn mehrere Felder untereinander stehen. */
  bezeichnung?: string;
}

export function UebergabeGrundFeld({
  grund,
  onChange,
  kompakt = false,
  platzhalter,
  bezeichnung,
}: UebergabeGrundFeldProps) {
  const gewaehlt = (grund.key || "").trim();
  const text = grund.text || "";
  const textPflicht = gewaehlt === GRUND_SONSTIGES;

  const waehle = (key: string) => {
    // Noch einmal auf denselben Knopf hebt die Wahl wieder auf. Ohne das
    // bliebe ein versehentlich gesetzter Grund stehen.
    onChange({ ...grund, key: gewaehlt === key ? "" : key });
  };

  return (
    <div className={cn("space-y-2", kompakt && "space-y-1.5")}>
      <div className="flex flex-wrap gap-1.5">
        {UEBERGABE_GRUENDE.map((option) => {
          const aktiv = gewaehlt === option.key;
          return (
            <Button
              key={option.key}
              type="button"
              size="sm"
              variant={aktiv ? "default" : "outline"}
              title={option.hinweis}
              aria-pressed={aktiv}
              className={cn("h-7 rounded-full px-3 text-xs font-normal", kompakt && "h-6 px-2.5 text-[11px]")}
              onClick={() => waehle(option.key)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>

      {kompakt ? (
        <Input
          value={text}
          maxLength={GRUND_TEXT_MAX}
          aria-label={bezeichnung || "Ergänzung zum Grund"}
          placeholder={platzhalter || (textPflicht ? "Bitte kurz beschreiben" : "Ergänzung, optional")}
          onChange={(e) => onChange({ ...grund, text: e.target.value })}
          className="h-8 text-xs"
        />
      ) : (
        <Textarea
          value={text}
          maxLength={GRUND_TEXT_MAX}
          rows={2}
          aria-label={bezeichnung || "Ergänzung zum Grund"}
          placeholder={
            platzhalter ||
            (textPflicht
              ? "Bitte kurz beschreiben, warum der Lead wechselt"
              : "Ergänzung für den neuen Vertriebspartner, optional")
          }
          onChange={(e) => onChange({ ...grund, text: e.target.value })}
          className="text-sm"
        />
      )}

      {textPflicht && !text.trim() && (
        <p className="text-xs text-muted-foreground">
          Bei „Sonstiges“ braucht es eine kurze Beschreibung.
        </p>
      )}
    </div>
  );
}
