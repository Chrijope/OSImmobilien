import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section, number, percent } from "@/components/statistiken/ControllerViews";
import { kampagnenAuswertung, type Row } from "@/lib/statistikController";
import { OHNE_KAMPAGNE } from "@/lib/kampagnenKennung";
import { quelleFuerAuswertung } from "@/lib/handbuch/leadStand";

const ALLE_QUELLEN = "__alle__";

/**
 * Leads, Termine, Reservierungen und Abschlüsse je Kampagne.
 *
 * Steht im Reiter "Quellen & Online-Rechner" unter den Akquisequellen. Die
 * Quelle ist der Kanal ("Meta Ads: München", "Steuerrechner"), die Kampagne
 * die einzelne Anzeige dahinter. Deshalb lässt sich die Tabelle nach Quelle
 * filtern: "Welche Meta-Kampagne bringt Abschlüsse?" ist genau diese Frage.
 *
 * Die Zahlen stammen aus `kampagnenAuswertung` und zählen mit denselben
 * Nachweisen wie der Trichter "Conversion" der Seite.
 */
export function StatistikKampagnen({ kontakte, investments }: { kontakte: Row[]; investments: Row[] }) {
  const [quelle, setQuelle] = useState<string>(ALLE_QUELLEN);

  const quellen = useMemo(
    () =>
      [...new Set(kontakte.map((k) => quelleFuerAuswertung(k.quelle, "Keine Angabe")))].sort((a, b) =>
        a.localeCompare(b, "de"),
      ),
    [kontakte],
  );

  const zeilen = useMemo(() => {
    const gefiltert =
      quelle === ALLE_QUELLEN ? kontakte : kontakte.filter((k) => quelleFuerAuswertung(k.quelle, "Keine Angabe") === quelle);
    return kampagnenAuswertung(gefiltert, investments);
  }, [kontakte, investments, quelle]);

  const mitKennung = zeilen.filter((z) => z.kampagne !== OHNE_KAMPAGNE).reduce((s, z) => s + z.leads, 0);

  return (
    <Section
      title="Kampagnen"
      note={`Neue Kontakte im Zeitraum, gruppiert nach der Kampagnenkennung aus dem Werbelink (utm_campaign) oder aus einem Meta-Formularlead. Leads ohne Kennung stehen unter „${OHNE_KAMPAGNE}“. Termine, Reservierungen und Abschlüsse zeigen den heutigen Stand dieser Kontakte.`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Quelle:</span>
        <Select value={quelle} onValueChange={setQuelle}>
          <SelectTrigger className="h-9 w-full sm:w-72" aria-label="Nach Quelle filtern">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALLE_QUELLEN}>Alle Quellen</SelectItem>
            {quellen.map((q) => (
              <SelectItem key={q} value={q}>
                {q}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {number(mitKennung)} von {number(zeilen.reduce((s, z) => s + z.leads, 0))} Leads mit Kampagnenkennung
        </span>
      </div>

      {zeilen.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Kontakte im gewählten Zeitraum.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="kampagnen-tabelle">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-2 py-2">Kampagne</th>
                <th className="px-2 py-2 text-right">Leads</th>
                <th className="px-2 py-2 text-right">Termine</th>
                <th className="px-2 py-2 text-right">Reservierungen</th>
                <th className="px-2 py-2 text-right">Abschlüsse</th>
                <th className="px-2 py-2 text-right">Abschlussquote</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.kampagne} className="border-b border-border">
                  <td className={`px-2 py-2 font-medium ${z.kampagne === OHNE_KAMPAGNE ? "text-muted-foreground" : ""}`}>
                    {z.kampagne}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{number(z.leads)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{number(z.termine)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{number(z.reservierungen)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{number(z.abschluesse)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{percent(z.abschlussquote)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
