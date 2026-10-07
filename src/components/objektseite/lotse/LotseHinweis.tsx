import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Der Hinweis „Umgang mit KI“ vor dem OS Lotsen, als Pflichtschranke.
 *
 * Beim ersten Öffnen liegt er über dem Chat: Text zum Scrollen, darunter fest
 * das Häkchen und „Verstanden und akzeptiert“, der Knopf erst mit Häkchen.
 * Erst nach dem Speichern der Zustimmung ist die Eingabe frei. Über das „i“
 * im Chatkopf öffnet er sich jederzeit wieder, dann nur mit „Schließen“.
 * Texte nach der Vorschau vom 28.09.2026 (KI-Verordnung Art. 4 und 50).
 */
export function LotseHinweis({
  modus,
  speichert = false,
  fehler,
  onAkzeptieren,
  onSchliessen,
}: {
  modus: "zustimmen" | "lesen";
  speichert?: boolean;
  fehler?: string | null;
  onAkzeptieren?: () => void;
  onSchliessen?: () => void;
}) {
  const [gelesen, setGelesen] = useState(false);
  const titel = useId();
  const haken = useId();

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titel}
      className="absolute inset-0 z-10 flex flex-col rounded-2xl bg-card/95 backdrop-blur-sm"
      data-testid="lotse-hinweis"
    >
      <div className="px-4 pb-2 pt-4 sm:px-5">
        <h3 id={titel} className="text-base font-semibold tracking-tight text-foreground">Bevor du den OS Lotsen nutzt</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Einmal lesen und bestätigen. Du findest diesen Hinweis jederzeit wieder über das i oben rechts.
        </p>
      </div>

      <div
        tabIndex={0}
        className="mx-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-border/60 bg-background/70 p-4 text-sm leading-relaxed sm:mx-5"
      >
        <section>
          <h4 className="font-semibold">Du sprichst mit einer KI</h4>
          <p>
            Der OS Lotse ist eine künstliche Intelligenz (Google Gemini über das Lovable AI Gateway). Er antwortet nur
            aus den Objektdaten, der Investmentkalkulation, der Karte und den Unterlagen im CRM. Er kann sich trotzdem irren.
          </p>
        </section>
        <section>
          <h4 className="font-semibold">Was seine Antworten sind, und was nicht</h4>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Eine Arbeitshilfe für dich, keine geprüfte Auskunft von OS Immobilien.</li>
            <li>Keine Steuer-, Rechts- oder Anlageberatung. OS Immobilien vermittelt Immobilien und berät nicht zu Geldanlage, Versicherung oder Steuern.</li>
            <li>Zins und Tilgung in der Kalkulation sind Rechenannahmen, kein Finanzierungsangebot.</li>
            <li>Er rechnet nicht selbst, er zitiert die Kalkulation mit deinen Annahmen.</li>
            <li>Er macht keine Prognosen und sagt nicht, ob ein Objekt zu einem bestimmten Kunden passt.</li>
          </ul>
        </section>
        <section>
          <h4 className="font-semibold">So nutzt du ihn richtig</h4>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>Prüf jede Angabe an der genannten Quelle, bevor du sie verwendest.</li>
            <li>Gib an Kunden nur freigegebene Unterlagen weiter, zum Beispiel Exposé und Kalkulation, nicht den Text des Lotsen.</li>
            <li>Gib hier keine Namen, Einkommen oder sonstigen Daten deiner Kunden ein.</li>
          </ul>
        </section>
        <section>
          <h4 className="font-semibold">Deine Daten</h4>
          <p>
            Deine Fragen und die Antworten werden 90 Tage gespeichert, damit du den Verlauf wiederfindest, und danach
            automatisch gelöscht. Nur du siehst deinen Verlauf.
          </p>
        </section>
        <section>
          <h4 className="font-semibold">Rechtsgrundlage</h4>
          <p>
            Hinweis nach der EU-Verordnung über künstliche Intelligenz (KI-Verordnung, Art. 4 und Art. 50): Transparenz bei
            KI-Systemen und Kompetenz im Umgang damit.
          </p>
        </section>
      </div>

      <div className="mt-3 flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        {modus === "zustimmen" ? (
          <>
            <div className="flex flex-1 items-center gap-2">
              <Checkbox id={haken} checked={gelesen} onCheckedChange={(w) => setGelesen(w === true)} disabled={speichert} />
              <Label htmlFor={haken} className="text-sm font-normal leading-snug">Ich habe den Hinweis gelesen und verstanden.</Label>
            </div>
            <Button variant="brand" disabled={!gelesen || speichert} onClick={onAkzeptieren} className="gap-1.5">
              {speichert && <Loader2 className="h-4 w-4 animate-spin" />} Verstanden und akzeptiert
            </Button>
          </>
        ) : (
          <Button variant="outline" className="sm:ml-auto" onClick={onSchliessen}>Schließen</Button>
        )}
      </div>
      {fehler && <p className="px-4 pb-3 text-xs text-destructive sm:px-5" role="alert">{fehler}</p>}
    </div>
  );
}
