import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAufgaben, type Aufgabe } from "@/lib/aufgabenStore";
import { eingetragenerStufenTermin } from "@/lib/stufenTermin";

function datumDe(iso: string): string {
  const [j, m, t] = iso.split("-");
  return j && m && t ? `${t}.${m}.${j}` : iso;
}

/**
 * „Termin Bankgutachter" im Abschnitt Finanzierung (Vorgabe Christian,
 * 16.10.2026): Ist die Finanzierung angefragt, meldet sich der Gutachter der
 * Bank, und das Backoffice traegt den Termin hier ein. Gespeichert wird wie
 * beim Setzen der Stufe ueber `StufenTerminDialog` (Meeting mit Aufgabe am
 * Investment), deshalb steht der Termin zugleich in „Nächste Aktionen" und
 * auf der Pipeline-Karte.
 */
export function BankgutachterTerminZeile({
  investmentId,
  darfEintragen,
  onEintragen,
  aufgaben,
}: {
  investmentId: string;
  /** Nur fuer die lokale Vorschau, sonst gelten die geladenen Aufgaben. */
  aufgaben?: ReadonlyArray<Pick<Aufgabe, "investmentId" | "titel" | "status" | "faelligAm" | "uhrzeit" | "beschreibung" | "erstelltVonName">>;
  darfEintragen: boolean;
  onEintragen: () => void;
}) {
  const termin = eingetragenerStufenTermin(aufgaben ?? getAufgaben(), investmentId, "bankgutachter");
  return (
    <div className="mb-4 rounded-lg border px-4 py-3 text-sm flex items-start justify-between gap-3" data-testid="bankgutachter-termin">
      <div className="flex items-start gap-2 min-w-0">
        <CalendarClock className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-semibold">Termin Bankgutachter</p>
          {termin ? (
            <p className="text-xs text-muted-foreground">
              {datumDe(termin.datum)}{termin.uhrzeit ? `, ${termin.uhrzeit} Uhr` : ""}
              {termin.ort ? ` · ${termin.ort}` : ""}
              {termin.eingetragenVon ? ` · eingetragen von ${termin.eingetragenVon}` : ""}
              {termin.erledigt ? " · hat stattgefunden" : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Noch nicht eingetragen. Sobald sich der Gutachter der Bank meldet, Datum, Uhrzeit und Ort hier eintragen.
            </p>
          )}
        </div>
      </div>
      {darfEintragen && (
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onEintragen}>
          {termin && !termin.erledigt ? "Neuen Termin eintragen" : "Eintragen"}
        </Button>
      )}
    </div>
  );
}
