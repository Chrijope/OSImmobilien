import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EinheitStatusChip } from "@/components/objektseite/Bausteine";
import { BelegungsAngaben } from "@/components/objektseite/BelegungsAngaben";
import { belegungsAnzeige, type BelegungsKontext } from "@/lib/einheitBelegung";
import { darfReservieren } from "@/lib/reservierungsRechte";
import type { ObjektWohnung } from "@/lib/objekteStore";

type EinheitStatus = ObjektWohnung["status"];

/**
 * Der Verkaufsstatus einer Einheit im Objektassistenten.
 *
 * Seit dem 23.09.2026 schreibt `saveObjekt` Status, Kunde und Reservierung
 * einer vorhandenen Einheit nie mehr, die gehören allein dem Reservierungsweg.
 * Eine Auswahl wäre dort wirkungslos und brachte nur den Hinweis „Der
 * Verkaufsstatus bleibt …“ ein. Deshalb zwei Fälle:
 *
 *   - Vorhandene Einheit: nur Anzeige, dasselbe Kennzeichen und dieselben
 *     Angaben wie in der Einheitentabelle der Objektseite. Kunde und Partner
 *     entscheidet `belegungsAnzeige`, Namen also nur für Rollen, die sie sehen
 *     dürfen.
 *   - Neue Einheit: Auswahl, denn beim Einfügen übernimmt `saveObjekt` den
 *     Status (`neueEinheitZeile`), immer ohne Kunden. „Reserviert“ nur für
 *     Rollen, die reservieren dürfen; sonst lehnt die Datenbank das Anlegen ab
 *     (`wohnung_reservierung_pruefen_neu`) und das ganze Speichern scheitert.
 */
export function EinheitVerkaufsstatus({ vorhandene, wert, onWaehlen, kontext }: {
  /** Die gespeicherte Einheit. Fehlt sie, ist die Einheit neu. */
  vorhandene?: ObjektWohnung;
  /** Der gewählte Status einer neuen Einheit. */
  wert?: string;
  onWaehlen: (status: EinheitStatus) => void;
  /** Der angemeldete Nutzer, für Namen und Reservierungsrecht. */
  kontext: BelegungsKontext;
}) {
  if (vorhandene) {
    const anzeige = belegungsAnzeige(vorhandene, kontext);
    return (
      <div className="flex items-start gap-2" data-testid="verkaufsstatus-anzeige">
        <Label className="text-xs pt-1">Verkaufsstatus:</Label>
        <div className="space-y-1">
          <EinheitStatusChip status={vorhandene.status} className="text-[10px]" />
          <BelegungsAngaben anzeige={anzeige} />
          <p className="text-[10px] text-muted-foreground">Reserviert wird über die Einheitsseite oder das Kundenprofil.</p>
        </div>
      </div>
    );
  }

  const status = wert || "frei";
  const reservierenErlaubt = darfReservieren(kontext.rolle);
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs">Verkaufsstatus:</Label>
      <Select value={status} onValueChange={(v) => onWaehlen(v as EinheitStatus)}>
        <SelectTrigger className="h-8 w-36 text-xs" aria-label="Verkaufsstatus"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="frei">Frei</SelectItem>
          {/* Steht ein Entwurf schon auf „reserviert“, bleibt der Eintrag sichtbar, aber nicht wählbar. */}
          {(reservierenErlaubt || status === "reserviert") && (
            <SelectItem value="reserviert" disabled={!reservierenErlaubt}>Reserviert</SelectItem>
          )}
          <SelectItem value="verkauft">Verkauft</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
