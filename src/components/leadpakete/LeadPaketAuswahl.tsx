import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { paketZaehlung, type LeadPaket, type LeadPaketZuweisung } from "@/lib/leadPaketStore";

/** Wert für „kein Paket“. Radix erlaubt keinen leeren Wert. */
export const KEIN_PAKET = "kein";

export const datumDe = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("de-DE") : "");

export function paketBezeichnung(p: LeadPaket, zuweisungen: LeadPaketZuweisung[]): string {
  const { offen } = paketZaehlung(p, zuweisungen);
  return `Paket vom ${datumDe(p.erstellt_am)}, noch ${offen} von ${p.anzahl} offen`;
}

/**
 * Feld „aus Paket“ im Zuweisungsdialog. Erscheint nur, wenn der gewählte
 * Partner ein offenes Paket hat. `offene` kommt ältestes zuerst, der
 * Aufrufer setzt es als Vorauswahl.
 */
export function LeadPaketAuswahl({
  offene,
  zuweisungen,
  value,
  onChange,
  ladeFehler = false,
}: {
  offene: LeadPaket[];
  zuweisungen: LeadPaketZuweisung[];
  value: string;
  onChange: (v: string) => void;
  /** Die Paketliste ließ sich nicht laden. Dann ein Hinweis statt Stille. */
  ladeFehler?: boolean;
}) {
  if (ladeFehler) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Die Leadpakete ließen sich gerade nicht laden. Die Zuweisung klappt trotzdem, die Paketlieferung kannst du danach unter Statistik, Lead-Zuweisung, Leadpakete nachtragen.
      </p>
    );
  }
  if (offene.length === 0) return null;
  return (
    <div>
      <label className="text-sm font-medium mb-1 block" id="lead-paket-label">Aus Paket</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-labelledby="lead-paket-label"><SelectValue /></SelectTrigger>
        <SelectContent>
          {offene.map((p) => (
            <SelectItem key={p.id} value={p.id}>{paketBezeichnung(p, zuweisungen)}</SelectItem>
          ))}
          <SelectItem value={KEIN_PAKET}>Kein Paket</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1">
        Der Lead wird als Lieferung aus diesem Paket vermerkt. Das ist der Nachweis gegenüber dem Partner.
      </p>
    </div>
  );
}
