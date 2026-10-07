import { useCallback, useEffect, useState } from "react";
import { Calculator, FilePlus2, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { formatDatum } from "@/lib/utils";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { formatEuro, formatProzent } from "@/lib/investmentrechner/formatierer";
import {
  ladeBerechnungen,
  loescheBerechnung,
  BERECHNUNGEN_MIGRATION_HINWEIS,
  type InvestmentBerechnung,
} from "@/lib/investmentBerechnungenStore";

/*
 * Die gespeicherten Berechnungen eines Investments, in der Karte
 * „Objektauswahl".
 *
 * Ein Klick öffnet den Investmentrechner mit genau diesem Stand, „Neue
 * Berechnung" öffnet ihn mit den Zahlen der zugewiesenen Wohnung und des
 * Kunden. Gibt es noch keine, steht hier ein Satz und der Knopf, sonst nichts.
 *
 * Solange die Migration 20260907130000 nicht gelaufen ist, bleibt die Liste
 * leer und es steht ein ruhiger Hinweis da. Der Knopf funktioniert weiter, der
 * Rechner meldet dann selbst, dass er noch nicht speichern kann.
 */

interface InvestmentBerechnungenProps {
  investmentId: string;
  /** Nur wer den Kunden pflegen darf, sieht Anlegen und Löschen. Die Sperre
   *  selbst steht in der Datenbank (RLS auf `investment_berechnungen`). */
  darfPflegen: boolean;
  /**
   * Nichts zeichnen, solange es keine Berechnung gibt.
   *
   * Für die gesperrte Objektauswahl gedacht: Dort soll eine vorhandene
   * Berechnung sichtbar sein, eine leere Überschrift mit dem Satz „noch keine
   * Berechnung gespeichert" wäre dort aber nur Beiwerk an einer Karte, die
   * ohnehin sagt, worauf sie wartet.
   */
  nurWennVorhanden?: boolean;
  onNavigate: (pfad: string) => void;
}

/** Die Kennzahlen einer Berechnung in einer Zeile. */
function Kennzahlenzeile({ b }: { b: InvestmentBerechnung }) {
  const teile = [
    b.kennzahlen.kaufpreis > 0 ? formatEuro(b.kennzahlen.kaufpreis) : "",
    b.kennzahlen.eigenkapital > 0 ? `${formatEuro(b.kennzahlen.eigenkapital)} EK` : "",
    b.kennzahlen.bruttorendite > 0 ? `${formatProzent(b.kennzahlen.bruttorendite)} brutto` : "",
    b.kennzahlen.cashflowMonatNachSteuern !== 0
      ? `${formatEuro(b.kennzahlen.cashflowMonatNachSteuern)} je Monat nach Steuern`
      : "",
    b.kennzahlen.irr !== null ? `${formatProzent(b.kennzahlen.irr)} IRR` : "",
  ].filter(Boolean);
  if (teile.length === 0) return null;
  return <span className="block text-[11px] text-muted-foreground">{teile.join(" · ")}</span>;
}

export function InvestmentBerechnungen({
  investmentId, darfPflegen, nurWennVorhanden, onNavigate,
}: InvestmentBerechnungenProps) {
  const [berechnungen, setBerechnungen] = useState<InvestmentBerechnung[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [hinweis, setHinweis] = useState("");

  const laden = useCallback(async () => {
    const erg = await ladeBerechnungen(investmentId);
    setBerechnungen(erg.berechnungen);
    setHinweis(erg.migrationFehlt ? BERECHNUNGEN_MIGRATION_HINWEIS : erg.fehler || "");
    setLaedt(false);
  }, [investmentId]);

  useEffect(() => {
    setLaedt(true);
    void laden();
  }, [laden]);

  const loeschen = async (b: InvestmentBerechnung) => {
    const ja = await confirmDialog({
      title: "Berechnung löschen?",
      description: `„${b.name}“ wird entfernt. Das lässt sich nicht rückgängig machen.`,
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ja) return;
    const erg = await loescheBerechnung(b.id);
    if (!erg.erfolg) {
      toast({
        title: "Nicht gelöscht",
        description: erg.migrationFehlt ? BERECHNUNGEN_MIGRATION_HINWEIS : erg.fehler || "Bitte erneut versuchen.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Berechnung gelöscht" });
    await laden();
  };

  const nutzer = loadAllUsers();
  const namenVon = (id: string | null) => (id ? nutzer.find((n) => n.id === id)?.name || "" : "");

  // Der Abbruch steht bewusst hier unten, nach allen Hooks: React verlangt in
  // jedem Durchlauf dieselben Hooks in derselben Reihenfolge.
  if (nurWennVorhanden && berechnungen.length === 0) return null;

  return (
    <div className="mt-5 border-t border-border pt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold">Berechnungen</h4>
        {darfPflegen && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onNavigate(`/investmentrechner?investment=${investmentId}&neu=1`)}
          >
            <FilePlus2 className="mr-1 h-3 w-3" /> Neue Berechnung
          </Button>
        )}
      </div>

      {laedt ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="h-3 w-3 animate-spin" /> wird geladen …
        </p>
      ) : berechnungen.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {hinweis || "Für dieses Investment ist noch keine Berechnung gespeichert."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {berechnungen.map((b) => (
            <li key={b.id} className="flex items-center gap-2 pr-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                onClick={() => onNavigate(`/investmentrechner?berechnung=${b.id}`)}
              >
                <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{b.name}</span>
                  <Kennzahlenzeile b={b} />
                  <span className="block text-[10px] text-muted-foreground">
                    Zuletzt geändert {formatDatum(b.geaendert_am)}
                    {namenVon(b.erstellt_von) ? ` · angelegt von ${namenVon(b.erstellt_von)}` : ""}
                  </span>
                </span>
              </button>
              {darfPflegen && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  aria-label={`${b.name} löschen`}
                  onClick={() => void loeschen(b)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
