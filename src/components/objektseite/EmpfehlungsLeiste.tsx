import { Sparkles, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dez } from "@/lib/objektKennzahlen";
import { NEBENKOSTEN_IM_RAHMEN, spanneText } from "@/lib/einheitEmpfehlung";
import type { EmpfehlungsAuswahl } from "@/lib/empfehlungAuswahl";

/**
 * Die Leiste oben auf der Objektseite, solange aus der Objektauswahl eines
 * Kunden heraus gesucht wird (`?empfehlung=<Investment>`).
 *
 * Sie sagt, für wen gerade ausgewählt wird und in welchem Kaufpreisrahmen,
 * und sie lässt sich beenden. Der Kaufpreisrahmen rechnet mit dem
 * Nebenkostensatz dieses Objekts, ist also hier genau und nicht „je nach
 * Bundesland" wie in der Kundenakte.
 *
 * Nur der Vorname steht da, und nur, weil ihn der Zwischenspeicher liefert:
 * Wer den Kunden nicht sehen darf, bekommt keine Leiste.
 */
export function EmpfehlungsLeiste({
  auswahl, global, onBeenden, onZurKundenakte,
}: {
  auswahl: EmpfehlungsAuswahl;
  /** Ein Globalobjekt, dort passt das ganze Haus oder nicht. */
  global: boolean;
  onBeenden: () => void;
  onZurKundenakte: () => void;
}) {
  const fuer = auswahl.vorname ? `Auswahl für ${auswahl.vorname}` : "Auswahl für den Kunden";
  const kp = auswahl.kaufpreisRahmen;
  // Ohne erkennbares Bundesland ist der Satz null. Dann steht das da, statt „0,0 %".
  const nebenkostenSatz = !NEBENKOSTEN_IM_RAHMEN
    ? ""
    : auswahl.nebenkostenProzent > 0
      ? `Bei ${dez(auswahl.nebenkostenProzent, 1)} % Kaufnebenkosten in diesem Bundesland. `
      : "Kaufnebenkosten für dieses Objekt unbekannt, gerechnet ohne. ";
  const passend = global
    ? (auswahl.gesamtobjektPasst ? "Das Gesamtobjekt passt in den Rahmen." : "Das Gesamtobjekt passt nicht in den Rahmen.")
    : auswahl.empfohleneIds.length === 1
      ? "1 Einheit passt in den Rahmen."
      : `${auswahl.empfohleneIds.length} Einheiten passen in den Rahmen.`;

  return (
    <div
      role="region"
      aria-label="Objektauswahl für einen Kunden"
      data-testid="empfehlungs-leiste"
      className="mb-4 flex flex-col gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-foreground">
            {fuer}
            {kp ? `, Kaufpreisrahmen ${spanneText(kp.von, kp.bis)}` : ", kein Finanzierungsrahmen"}
          </p>
          <p className="text-xs text-muted-foreground">
            {kp
              ? `${nebenkostenSatz}${passend}`
              : "Ohne Selbstauskunft oder bei Selbstfinanzierung gibt es keine passenden Einheiten."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={onZurKundenakte}>
          <UserRound className="h-4 w-4" /> Zur Objektauswahl
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onBeenden}>
          <X className="h-4 w-4" /> Auswahl beenden
        </Button>
      </div>
    </div>
  );
}
