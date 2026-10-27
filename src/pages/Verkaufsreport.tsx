import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer, Plus, Send, Undo2, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/contexts/UserContext";
import { confirmDialog } from "@/lib/confirm";
import { getInvestments } from "@/lib/investmentsStore";
import { getObjekte } from "@/lib/objekteStore";
import {
  berechneVerkaufsreport, ladeStaende, legeStandAn, loescheStand, veroeffentliche,
  type VerkaufsreportDaten, type VerkaufsreportStand,
} from "@/lib/verkaufsreport";

/**
 * Verkaufsreport (Christian, 27.10.2026). Admin und Inhaber erstellen und
 * veroeffentlichen Staende, Geschaeftspartner sehen nur veroeffentlichte.
 * Rechnung und Regeln: `src/lib/verkaufsreport.ts`.
 */

const eur = (v: number | null) => v === null ? "–" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const tag = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("de-DE");

export default function Verkaufsreport() {
  const { user } = useUser();
  const leitung = user.role === "admin" || user.role === "inhaber";
  const [staende, setStaende] = useState<VerkaufsreportStand[] | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const laden = useCallback(() => {
    ladeStaende().then((liste) => {
      setStaende(liste);
      setGewaehlt((alt) => (alt && liste.some((s) => s.id === alt) ? alt : liste[0]?.id ?? null));
    }).catch((f) => {
      console.error("[Verkaufsreport]", f);
      toast.error("Der Verkaufsreport konnte nicht geladen werden.");
      setStaende([]);
    });
  }, []);
  useEffect(laden, [laden]);

  const ausfuehren = async (aktion: () => Promise<void>, meldung: string) => {
    setArbeitet(true);
    try {
      await aktion();
      toast.success(meldung);
      laden();
    } catch (f: any) {
      toast.error(f?.message || "Das hat nicht geklappt.");
    } finally {
      setArbeitet(false);
    }
  };

  const standErstellen = () => ausfuehren(async () => {
    const objekte = getObjekte().map((o) => ({
      id: o.id,
      titel: o.titel,
      wohnungen: [...o.wohnungen, ...(o.wohnungenNichtImAngebot || [])].map((w) => ({
        weNr: String(w.weNr || ""), groesse: Number(w.groesse) || 0, vkGesamt: Number(w.vkGesamt) || 0,
        status: w.status, statusText: w.investagonStatusText,
      })),
    }));
    const investments = getInvestments().map((i) => ({
      objektId: i.objektId, pipelineStufe: i.pipelineStufe, finanzierungsStatus: i.finanzierungsStatus,
      notarTermin: i.notarTermin, reserviertAm: typeof i.meta?.reserviertAm === "string" ? i.meta.reserviertAm : undefined,
    }));
    await legeStandAn(berechneVerkaufsreport(objekte, investments));
    setGewaehlt(null);
  }, "Stand erstellt. Bitte prüfen und dann veröffentlichen.");

  const stand = staende?.find((s) => s.id === gewaehlt) || null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Verkaufsreport Eigentumswohnungen"
          subtitle={stand ? `Stand ${tag(stand.stand_am)}` : "Noch kein Stand"}
        />

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {leitung && (
            <Button size="sm" disabled={arbeitet} onClick={standErstellen}>
              <Plus className="h-4 w-4 mr-1.5" /> Stand erstellen
            </Button>
          )}
          {stand && (
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" /> PDF
            </Button>
          )}
          {staende && staende.length > 1 && (
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={gewaehlt ?? ""} onChange={(e) => setGewaehlt(e.target.value)}>
              {staende.map((s) => (
                <option key={s.id} value={s.id}>
                  Stand {tag(s.stand_am)}{leitung ? (s.veroeffentlicht_am ? " · veröffentlicht" : " · Entwurf") : ""}
                </option>
              ))}
            </select>
          )}
          {leitung && stand && (
            <>
              <Badge variant="outline" className="border-0 bg-muted">
                {stand.veroeffentlicht_am ? `Veröffentlicht am ${tag(stand.veroeffentlicht_am)}` : "Entwurf, für Geschäftspartner nicht sichtbar"}
              </Badge>
              {stand.veroeffentlicht_am ? (
                <Button size="sm" variant="ghost" disabled={arbeitet} onClick={() => ausfuehren(() => veroeffentliche(stand.id, false), "Veröffentlichung zurückgenommen.")}>
                  <Undo2 className="h-4 w-4 mr-1.5" /> Zurücknehmen
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={arbeitet} onClick={() => ausfuehren(() => veroeffentliche(stand.id, true), "Veröffentlicht. Geschäftspartner sehen diesen Stand jetzt.")}>
                  <Send className="h-4 w-4 mr-1.5" /> Veröffentlichen
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={arbeitet} onClick={async () => {
                const ok = await confirmDialog({ title: "Diesen Stand löschen?", confirmText: "Löschen", cancelText: "Abbrechen" });
                if (ok) ausfuehren(() => loescheStand(stand.id), "Stand gelöscht.");
              }}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Löschen
              </Button>
            </>
          )}
        </div>

        {!staende ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : !stand ? (
          <p className="text-sm text-muted-foreground">
            {leitung ? "Noch kein Stand erstellt." : "Es ist noch kein Verkaufsreport veröffentlicht."}
          </p>
        ) : (
          <ReportAnsicht daten={stand.daten} />
        )}

        {leitung && (
          <p className="text-xs text-muted-foreground print:hidden">
            Die Zahlen kommen aus dem CRM: Einheiten und Preise aus den Objekten, der Trichter aus den Investments. Verkäufe, die nicht im CRM stehen (etwa Fremdvertrieb), fehlen im Report.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}

function Kachel({ titel, wert, zusatz }: { titel: string; wert: string; zusatz?: string }) {
  return (
    <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-5">
      <p className="text-xs text-muted-foreground">{titel}</p>
      <p className="text-2xl font-semibold mt-1">{wert}</p>
      {zusatz && <p className="text-xs text-muted-foreground mt-1">{zusatz}</p>}
    </div>
  );
}

function ReportAnsicht({ daten }: { daten: VerkaufsreportDaten }) {
  const k = daten.kacheln;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Kachel titel="Ø Kaufpreis je Wohnung" wert={eur(k.durchschnittKaufpreis)}
          zusatz={k.kaufpreisVon !== null ? `${eur(k.kaufpreisVon)} bis ${eur(k.kaufpreisBis)}` : undefined} />
        <Kachel titel="Ø Kaufpreis je m²" wert={eur(k.durchschnittQmPreis)} />
        <Kachel titel="Reserviert / verkauft" wert={`${k.reserviert} / ${k.verkauft}`} />
        <Kachel titel="Ø Verkaufsdauer" wert={k.durchschnittVerkaufsdauerTage === null ? "–" : `${k.durchschnittVerkaufsdauerTage.toLocaleString("de-DE")} Tage`}
          zusatz="Reservierung bis Notartermin" />
      </div>

      <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-5">
        <p className="text-sm font-semibold mb-3">Verkaufstrichter</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {daten.trichter.map((t, i) => (
            <span key={t.stufe} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <span className="rounded-md bg-muted px-2.5 py-1">{t.stufe} <strong>{t.anzahl}</strong></span>
            </span>
          ))}
        </div>
      </div>

      {daten.objekte.map((o) => (
        <div key={o.titel} data-ui="card" className="rounded-2xl border border-border/60 bg-card p-5 space-y-3 break-inside-avoid">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-semibold">{o.titel}</p>
            <p className="text-xs text-muted-foreground">
              {o.gesamt} Wohnungen · {o.frei} frei · {o.reserviert} reserviert · {o.verkauft} verkauft · Ø {eur(o.durchschnittKaufpreis)} · Ø {eur(o.durchschnittQmPreis)}/m²
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  {["WE", "Wohnfläche", "Kaufpreis", "€/m²", "Stand"].map((h) => <th key={h} className="py-1.5 pr-4 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {o.einheiten.map((e) => (
                  <tr key={e.weNr} className="border-t">
                    <td className="py-1.5 pr-4">{e.weNr}</td>
                    <td className="pr-4 whitespace-nowrap">{e.groesse ? `${e.groesse.toLocaleString("de-DE")} m²` : "–"}</td>
                    <td className="pr-4 whitespace-nowrap">{e.kaufpreis ? eur(e.kaufpreis) : "–"}</td>
                    <td className="pr-4 whitespace-nowrap">{eur(e.qmPreis)}</td>
                    <td className="pr-4">{e.stand}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
