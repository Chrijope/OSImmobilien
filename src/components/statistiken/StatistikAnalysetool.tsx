/**
 * Trichter eines öffentlichen Rechners.
 *
 * Zeigt, wie viele Interessenten starten, das Ergebnis erreichen, die
 * Eintragung sehen und sie absenden. Erst daraus lässt sich beurteilen, ob die
 * Eintragung vor dem Ergebnis Leads bringt oder Leute vertreibt.
 *
 * Die Karte dient beiden Werkzeugen, dem Analysetool und dem Steuerrechner.
 * Sie zählen in dieselbe Tabelle und unterscheiden sich nur über die Spalte
 * `werkzeug`, siehe `analysetoolEreignisse.ts`.
 *
 * Beim Steuerrechner kommt die Aufteilung nach Kampagne dazu. Er läuft in
 * bezahlter Werbung, und dort genügt die Zahl der Leads am Ende nicht: Ohne
 * die Absprungrate davor lässt sich nicht sagen, ob die Anzeige zu wenige
 * Leute bringt oder die Seite sie verliert.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Users } from "lucide-react";
import {
  ladeAnalyseTrichter,
  ladeKampagnenTrichter,
  type AnalyseTrichter,
  type KampagnenTrichter,
  type Werkzeug,
} from "@/lib/analysetoolEreignisse";
import { OHNE_KAMPAGNE } from "@/lib/kampagnenKennung";

const ZEITRAEUME: { key: number; label: string }[] = [
  { key: 30, label: "30 Tage" },
  { key: 90, label: "90 Tage" },
  { key: 365, label: "1 Jahr" },
];

interface Props {
  beraterId?: string | null;
  beraterIds?: string[] | null;
  /** Vorgabe bleibt das Analysetool, damit der bestehende Aufruf gleich bleibt. */
  werkzeug?: Werkzeug;
  /** Überschrift der Karte. */
  titel?: string;
  /** Aufteilung nach Kampagne mitzeigen. Nur beim Steuerrechner sinnvoll. */
  mitKampagnen?: boolean;
}

export function StatistikAnalysetool({
  beraterId,
  beraterIds,
  werkzeug = "analysetool",
  titel,
  mitKampagnen = false,
}: Props) {
  const [tage, setTage] = useState(90);
  const [daten, setDaten] = useState<AnalyseTrichter | null>(null);
  const [kampagnen, setKampagnen] = useState<KampagnenTrichter[] | null>(null);
  const [laedt, setLaedt] = useState(true);
  const idsKey =
    beraterIds === undefined ? undefined : JSON.stringify(beraterIds);

  useEffect(() => {
    let abgebrochen = false;
    setLaedt(true);
    Promise.all([
      (async () => {
        const ids: string[] | null | undefined =
          idsKey === undefined ? undefined : JSON.parse(idsKey);
        if (ids === undefined || ids === null)
          return ladeAnalyseTrichter(tage, beraterId, werkzeug);
        if (!ids.length)
          return {
            gestartet: 0,
            beendet: 0,
            eintragungGesehen: 0,
            eintragungAbgesendet: 0,
            abschlussquote: 0,
          };
        const rows = await Promise.all(
          ids.map((id) => ladeAnalyseTrichter(tage, id, werkzeug)),
        );
        if (rows.some((r) => !r)) return null;
        const total = rows.reduce(
          (a, r) => ({
            gestartet: a.gestartet + r!.gestartet,
            beendet: a.beendet + r!.beendet,
            eintragungGesehen: a.eintragungGesehen + r!.eintragungGesehen,
            eintragungAbgesendet:
              a.eintragungAbgesendet + r!.eintragungAbgesendet,
            abschlussquote: 0,
          }),
          {
            gestartet: 0,
            beendet: 0,
            eintragungGesehen: 0,
            eintragungAbgesendet: 0,
            abschlussquote: 0,
          },
        );
        total.abschlussquote = total.eintragungGesehen
          ? total.eintragungAbgesendet / total.eintragungGesehen
          : 0;
        return total;
      })(),
      mitKampagnen
        ? ladeKampagnenTrichter(tage, werkzeug)
        : Promise.resolve(null),
    ]).then(([trichter, jeKampagne]) => {
      if (abgebrochen) return;
      setDaten(trichter);
      setKampagnen(jeKampagne);
      setLaedt(false);
    });
    return () => {
      abgebrochen = true;
    };
  }, [tage, beraterId, idsKey, werkzeug, mitKampagnen]);

  const stufen = useMemo(() => {
    if (!daten) return [];
    const max = Math.max(daten.gestartet, 1);
    return [
      {
        label:
          werkzeug === "steuerrechner"
            ? "Rechner gestartet"
            : "Analyse gestartet",
        wert: daten.gestartet,
      },
      { label: "Fragen beantwortet", wert: daten.beendet },
      { label: "Eintragung gesehen", wert: daten.eintragungGesehen },
      { label: "Eintragung abgesendet", wert: daten.eintragungAbgesendet },
    ].map((s) => ({ ...s, anteil: (s.wert / max) * 100 }));
  }, [daten, werkzeug]);

  const ueberschrift =
    titel ||
    (werkzeug === "steuerrechner"
      ? "Steuerrechner: Vom Aufruf zum Lead"
      : "Analysetool: Vom Aufruf zum Lead");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-primary rounded-full" />
            <CardTitle className="text-sm font-semibold font-sans flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {ueberschrift}
              <InfoTooltip text="Anonym gezählte Ereignisse, keine eindeutigen Personen. Zeigt, an welcher Stelle Interessenten aussteigen und wie viele sich am Ende eintragen." />
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            {ZEITRAEUME.map((z) => (
              <button
                key={z.key}
                onClick={() => setTage(z.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  tage === z.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {laedt ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            Wird geladen.
          </p>
        ) : !daten ? (
          <p role="alert" className="text-sm text-muted-foreground">
            Auswertung derzeit nicht verfügbar. Bitte den Zeitraum erneut
            auswählen oder die Seite aktualisieren.
          </p>
        ) : daten.gestartet === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4 text-center">
            {werkzeug === "steuerrechner"
              ? "Im gewählten Zeitraum wurde der Steuerrechner noch nicht aufgerufen."
              : "Im gewählten Zeitraum wurde das Analysetool noch nicht aufgerufen."}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {stufen.map((s) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold text-foreground">
                        {s.wert}
                      </span>
                      {" · "}
                      {s.anteil.toFixed(0)} %
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary/70 transition-colors"
                      style={{ width: `${Math.min(100, s.anteil)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">
              Von denen, die die Eintragung gesehen haben, haben{" "}
              <span className="font-semibold text-foreground">
                {(daten.abschlussquote * 100).toFixed(0)} %
              </span>{" "}
              abgesendet. Die Ereignisquote ist keine eindeutige Besucherquote;
              ohne Sitzungsbezug können zeitliche Verschiebungen auftreten.
            </p>

            {mitKampagnen && (
              <div className="mt-5 pt-4 border-t border-border">
                <p className="text-xs font-semibold text-foreground mb-2">
                  Je Kampagne
                </p>
                {!kampagnen ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    Die Kampagnenauswertung ist derzeit nicht verfügbar. Bitte
                    später erneut versuchen.
                  </p>
                ) : kampagnen.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    Im gewählten Zeitraum wurde noch nichts gezählt.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-1.5 pr-2">Kampagne</th>
                          <th className="py-1.5 px-2 text-right">Gestartet</th>
                          <th className="py-1.5 px-2 text-right">Ergebnis</th>
                          <th className="py-1.5 px-2 text-right">Formular</th>
                          <th className="py-1.5 px-2 text-right">Leads</th>
                          <th className="py-1.5 pl-2 text-right">Quote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kampagnen.map((k) => (
                          <tr
                            key={k.kampagne ?? OHNE_KAMPAGNE}
                            className="border-b border-border last:border-0"
                          >
                            <td className="py-1.5 pr-2 font-medium">
                              {k.kampagne ?? OHNE_KAMPAGNE}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums">
                              {k.gestartet}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums">
                              {k.beendet}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums">
                              {k.eintragungGesehen}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums">
                              {k.eintragungAbgesendet}
                            </td>
                            <td className="py-1.5 pl-2 text-right tabular-nums">
                              {(k.abschlussquote * 100).toFixed(0)} %
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      „{OHNE_KAMPAGNE}" sind Aufrufe über den persönlichen
                      Partnerlink, direkte Aufrufe und alles, was vor der
                      Einführung der Kampagnenkennungen gezählt wurde. Quote =
                      Leads geteilt durch gesehene Formulare.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default StatistikAnalysetool;
