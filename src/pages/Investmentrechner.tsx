import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calculator, FilePlus2, LoaderCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import {
  InvestmentrechnerInhalt,
  type Rechnerstart,
  type Rechnervorbelegung,
} from "@/components/investmentrechner/InvestmentrechnerInhalt";
import {
  ladeBerechnung,
  ladeBerechnungen,
  BERECHNUNGEN_MIGRATION_HINWEIS,
  type InvestmentBerechnung,
} from "@/lib/investmentBerechnungenStore";
import { vorbelegungAusInvestment } from "@/lib/investmentrechner/investmentVorbelegung";
import { getInvestmentById } from "@/lib/investmentsStore";
import { getKontaktById } from "@/lib/kundenStore";
import { useCacheReady } from "@/hooks/useCacheReady";
import { formatDatum } from "@/lib/utils";
import { formatEuro, formatProzent } from "@/lib/investmentrechner/formatierer";

/*
 * Seite /investmentrechner. Der eigentliche Rechner liegt in
 * InvestmentrechnerInhalt, hier kommt der Rahmen des CRM dazu und die Frage,
 * mit welchem Stand er startet.
 *
 * Drei Wege führen herein:
 *
 *   /investmentrechner                       leer, wie bisher
 *   /investmentrechner?berechnung={id}       eine gespeicherte Berechnung
 *   /investmentrechner?investment={id}       die neueste des Investments,
 *                                            bei mehreren erst die Auswahl
 *   /investmentrechner?investment={id}&neu=1 neu, mit den Zahlen der Wohnung
 *                                            und des Kunden vorbelegt
 *
 * Der Rechner selbst wird erst gerendert, wenn feststeht, womit er anfängt.
 * Sonst müsste er seinen Zustand nachträglich austauschen, und ein halb
 * gefülltes Formular, das sich unter der Hand ändert, ist schlimmer als eine
 * kurze Ladezeile.
 */

interface Vorbereitet {
  start?: Rechnerstart;
  vorbelegung?: Rechnervorbelegung;
}

/*
 * Worauf die Vorbelegung wartet: das Investment und, weil sie bei einer
 * Wohnung aus dem Bestand die Objektanlage liest (`vorbelegungAusEinheit`),
 * auch Objekte und Wohnungen. Bis zum 30.09.2026 wurde nur auf die
 * Investments gewartet. Kam der Link vor den Objekten an, fand
 * `vorbelegungAusInvestment` die Wohnung nicht, fiel auf die dünnen Angaben
 * am Investment zurück, und der Rechner blieb so gut wie leer.
 * `useCacheReady` lädt fehlende Tabellen außerdem selbst nach.
 */
const VORBELEGUNG_TABELLEN = ["investments", "objekte", "wohnungen"];

function kundeName(kontaktId: string | null | undefined): string {
  if (!kontaktId) return "";
  const k = getKontaktById(kontaktId) as { vorname?: string; nachname?: string } | undefined;
  return k ? `${k.vorname || ""} ${k.nachname || ""}`.trim() : "";
}

/** Aus einem Investment einen frischen Start bauen: Objektzahlen plus Kunde. */
function neuerStart(investmentId: string): Vorbereitet {
  const investment = getInvestmentById(investmentId);
  const vor = vorbelegungAusInvestment(investmentId);
  return {
    start: {
      investmentId,
      kundeId: investment?.kontaktId ?? null,
      kundeName: kundeName(investment?.kontaktId),
    },
    vorbelegung: vor ? { quellen: vor.quellen, eingabe: vor.eingabe, knk: vor.knk, unterlagen: vor.unterlagen, herkunft: vor.herkunft } : undefined,
  };
}

const Investmentrechner = () => {
  const [params] = useSearchParams();
  const berechnungParam = params.get("berechnung");
  const investmentParam = params.get("investment");
  const willNeu = params.get("neu") === "1";
  const investmentsGeladen = useCacheReady(VORBELEGUNG_TABELLEN);

  const [laedt, setLaedt] = useState(!!berechnungParam || !!investmentParam);
  const [vorbereitet, setVorbereitet] = useState<Vorbereitet>({});
  const [auswahl, setAuswahl] = useState<InvestmentBerechnung[]>([]);
  const [hinweis, setHinweis] = useState("");

  useEffect(() => {
    let abgebrochen = false;
    if (!berechnungParam && !investmentParam) {
      setLaedt(false);
      setVorbereitet({});
      setAuswahl([]);
      setHinweis("");
      return;
    }
    // Die Vorbelegung liest den Zwischenspeicher, also erst danach anfangen.
    if (!investmentsGeladen) return;

    setLaedt(true);
    setHinweis("");
    void (async () => {
      if (berechnungParam) {
        const erg = await ladeBerechnung(berechnungParam);
        if (abgebrochen) return;
        if (erg.migrationFehlt) setHinweis(BERECHNUNGEN_MIGRATION_HINWEIS);
        else if (erg.fehler) setHinweis(erg.fehler);
        else if (!erg.berechnung) setHinweis("Diese Berechnung gibt es nicht mehr. Der Rechner startet leer.");
        setVorbereitet(
          erg.berechnung
            ? { start: { berechnung: erg.berechnung, kundeName: kundeName(erg.berechnung.kontakt_id) } }
            : {},
        );
        setLaedt(false);
        return;
      }

      const id = investmentParam as string;
      if (willNeu) {
        if (!abgebrochen) {
          setVorbereitet(neuerStart(id));
          setLaedt(false);
        }
        return;
      }
      const erg = await ladeBerechnungen(id);
      if (abgebrochen) return;
      if (erg.migrationFehlt) setHinweis(BERECHNUNGEN_MIGRATION_HINWEIS);
      else if (erg.fehler) setHinweis(erg.fehler);
      if (erg.berechnungen.length > 1) {
        setAuswahl(erg.berechnungen);
        setLaedt(false);
        return;
      }
      const eine = erg.berechnungen[0];
      setVorbereitet(eine ? { start: { berechnung: eine, kundeName: kundeName(eine.kontakt_id) } } : neuerStart(id));
      setLaedt(false);
    })();

    return () => {
      abgebrochen = true;
    };
  }, [berechnungParam, investmentParam, willNeu, investmentsGeladen]);

  if (laedt || (!investmentsGeladen && (berechnungParam || investmentParam))) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <PageHeader title="Investmentkalkulation" />
          <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Gespeicherter Stand wird geladen …
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (auswahl.length > 0) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <PageHeader title="Investmentkalkulation" />
          <Card className="p-6 space-y-4">
            <div className="w-8 h-1 bg-primary" />
            <div>
              <h2 className="font-bold">Welche Berechnung?</h2>
              <p className="text-xs text-muted-foreground">
                Für dieses Investment sind mehrere Berechnungen gespeichert.
              </p>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {auswahl.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                    onClick={() => {
                      setAuswahl([]);
                      setVorbereitet({ start: { berechnung: b, kundeName: kundeName(b.kontakt_id) } });
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{b.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatEuro(b.kennzahlen.kaufpreis)} · {formatProzent(b.kennzahlen.bruttorendite)} brutto ·
                        zuletzt geändert {formatDatum(b.geaendert_am)}
                      </span>
                    </span>
                    <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                  onClick={() => {
                    setAuswahl([]);
                    setVorbereitet(neuerStart(investmentParam as string));
                  }}
                >
                  <FilePlus2 className="h-4 w-4 text-muted-foreground" /> Neue Berechnung beginnen
                </button>
              </li>
            </ul>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {hinweis && (
        <Alert className="mb-4">
          <AlertTitle>Hinweis</AlertTitle>
          <AlertDescription>{hinweis}</AlertDescription>
        </Alert>
      )}
      <InvestmentrechnerInhalt
        key={vorbereitet.start?.berechnung?.id || vorbereitet.start?.investmentId || "leer"}
        start={vorbereitet.start}
        vorbelegung={vorbereitet.vorbelegung}
      />
    </DashboardLayout>
  );
};

export default Investmentrechner;
