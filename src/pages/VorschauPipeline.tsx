import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cacheGet, cacheSet } from "@/lib/dataCache";
import { getKontakte } from "@/lib/kundenStore";
import { getInvestments } from "@/lib/investmentsStore";
import {
  PIPELINE_STUFEN,
  buildPipelineKarten,
  buildBucketEntries,
  investmentStufenText,
} from "@/lib/kontaktPipeline";
import { berechneDashboardKpis, zeitraumGrenzen } from "@/lib/dashboardKpis";

/*
 * Lokale Vorschau "Pipeline am Investment" (11.10.2026). Nur im
 * Entwicklungsmodus erreichbar (siehe vorschauRouten.ts), ohne Anmeldung und
 * ohne Datenbank: Die Beispielkunden liegen nur im Arbeitsspeicher dieses
 * Tabs. Gerechnet wird mit denselben Funktionen wie auf den echten Seiten
 * (buildPipelineKarten, buildBucketEntries, investmentStufenText,
 * berechneDashboardKpis). Kein echter Kunde.
 */

const JETZT = new Date().toISOString();

/** Rohzeilen wie aus der Datenbank: Kontakte mit der (abgeleiteten) Kontaktstufe. */
const KONTAKTE = [
  { id: "vk-1", vorname: "Anna", nachname: "Beispiel (2 Investments)", status: "kontaktiert", meta: { pipelineStufe: "notar" } },
  { id: "vk-2", vorname: "Bernd", nachname: "Muster", status: "neu", meta: { pipelineStufe: "neuer_lead" } },
  { id: "vk-3", vorname: "Carla", nachname: "Probe", status: "kontaktiert", meta: { pipelineStufe: "objektauswahl" } },
  { id: "vk-4", vorname: "Dieter", nachname: "Test (3 Investments)", status: "kunde", meta: { pipelineStufe: "reservierung" } },
  { id: "vk-5", vorname: "Eva", nachname: "Bestand", status: "kunde", meta: { pipelineStufe: "bestandsimport" } },
].map((k) => ({
  ...k,
  email: "", telefon: "", archiviert: false, geloescht: false,
  zustaendig_id: "vorschau-partner", berater: "Beispiel Partner", quelle: "Vorschau",
  erstellt_am: JETZT, aktualisiert_am: JETZT,
}));

const INVESTMENTS = [
  ["vi-1", "vk-1", 1, "notar", 289000],
  ["vi-2", "vk-1", 2, "neuer_lead", 0],
  ["vi-3", "vk-2", 1, "neuer_lead", 0],
  ["vi-4", "vk-3", 1, "objektauswahl", 199000],
  ["vi-5", "vk-4", 1, "abgeschlossen", 245000],
  ["vi-6", "vk-4", 2, "reservierung", 179000],
  ["vi-7", "vk-4", 3, "erreicht", 0],
  ["vi-8", "vk-5", 1, "bestandsimport", 0],
].map(([id, kunde_id, nummer, stufe, kaufpreis]) => ({
  id, kunde_id, kaufpreis, erstellt_am: JETZT,
  meta: { nummer, label: `Investment ${nummer}`, pipelineStufe: stufe, kaufpreis },
}));

/** Nur in dieser Vorschau: die Stufe eines Investments direkt im Speicher setzen. */
function setzeStufe(investmentId: string, stufe: string) {
  cacheSet(
    "investments",
    cacheGet("investments").map((r: { id: string; meta: Record<string, unknown> }) =>
      r.id === investmentId ? { ...r, meta: { ...r.meta, pipelineStufe: stufe } } : r,
    ),
  );
}

const SPALTEN = PIPELINE_STUFEN.filter((s) => !["zugewiesen", "kontaktversuche", "vermoegensaufbau", "archiviert"].includes(s.key));
const label = (key: string) => PIPELINE_STUFEN.find((s) => s.key === key)?.label || key;
const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function VorschauPipeline() {
  // Beim ersten Zeichnen die Beispieldaten in den Speicher legen.
  const [stand, setStand] = useState(() => {
    cacheSet("kontakte", KONTAKTE);
    cacheSet("investments", INVESTMENTS);
    return 0;
  });
  const neu = () => setStand((v) => v + 1);

  const daten = useMemo(() => {
    const kontakte = getKontakte();
    const karten = buildPipelineKarten(kontakte);
    const { von, bis } = zeitraumGrenzen("monat");
    const kpis = berechneDashboardKpis({
      kontakte: kontakte.map((k) => ({ id: k.id, pipelineStufe: k.pipelineStufe, erstellt_am: k.erstellt_am, archiviert: k.archiviert })),
      investments: getInvestments().map((i) => ({
        id: i.id, kontaktId: i.kontaktId, pipelineStufe: i.pipelineStufe, erstellt_am: i.erstellt_am,
        kaufpreis: Number((i.meta as { kaufpreis?: number } | undefined)?.kaufpreis) || 0,
      })),
      von, bis,
    });
    return { kontakte, karten, kpis, leads: buildBucketEntries(kontakte, "leadverwaltung") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stand]);

  const belegt = SPALTEN.filter((s) => daten.karten.some((k) => k.stufe === s.key) || ["neuer_lead", "reservierung", "notar"].includes(s.key));

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 space-y-6" data-lg="seite">
      <div>
        <h1 className="text-2xl font-bold">Vorschau: Pipeline am Investment</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Beispielkunden, nur in diesem Browserfenster, nichts wird gespeichert. Jede Karte ist ein Investment.
          Über die Auswahl auf einer Karte lässt sich ihre Stufe ändern: Die anderen Investments desselben
          Kunden bleiben, wo sie sind, und Lead-Verwaltung, „Alle Kontakte“ und die Zahlen rechnen sofort neu.
        </p>
      </div>

      <section>
        <h2 className="font-semibold mb-2">Pipeline</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {belegt.map((spalte) => {
            const karten = daten.karten.filter((k) => k.stufe === spalte.key);
            return (
              <div key={spalte.key} className="min-w-[220px] w-[220px] shrink-0 rounded-lg bg-muted/40 p-2">
                <div className="text-xs font-semibold uppercase tracking-wide mb-2">
                  {spalte.label} <span className="text-muted-foreground">({karten.length})</span>
                </div>
                <div className="space-y-2">
                  {karten.map((k) => {
                    const inv = getInvestments().find((i) => i.id === k.investmentId);
                    return (
                      <Card key={k.entryKey} className="p-2 text-sm">
                        <div className="font-medium">{k.kunde.vorname} {k.kunde.nachname}</div>
                        {inv && <Badge variant="secondary" className="text-[10px] mt-1">Investment {inv.nummer}</Badge>}
                        {inv && (
                          <select
                            aria-label={`Stufe von Investment ${inv.nummer}`}
                            className="mt-2 w-full rounded border bg-background text-xs p-1"
                            value={inv.pipelineStufe}
                            onChange={(e) => { setzeStufe(inv.id, e.target.value); neu(); }}
                          >
                            {SPALTEN.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Lead-Verwaltung</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {daten.leads.length === 0 && <p className="text-muted-foreground">Keine Leads.</p>}
            {daten.leads.map((e) => (
              <div key={`${e.kunde.id}-${e.investmentId}`}>
                {e.kunde.vorname} {e.kunde.nachname}
                {e.investmentNummer ? <span className="text-muted-foreground"> · Investment {e.investmentNummer}</span> : null}
                <span className="text-muted-foreground"> · {label(e.stufe)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Alle Kontakte: Pipeline-Status</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {daten.kontakte.map((k) => (
              <div key={k.id}>
                {k.vorname} {k.nachname}: <span className="text-muted-foreground">{investmentStufenText(k)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Dashboard-Zahlen (je Investment)</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Offene Reservierungen: <b>{daten.kpis.offeneReservierungen}</b> ({euro(daten.kpis.reservierungEintraege.reduce((s, e) => s + (e.betrag || 0), 0))})</div>
            <div>Aktive Vorgänge: <b>{daten.kpis.aktiveLeads}</b></div>
            <div>Unbearbeitete Leads: <b>{daten.kpis.unbearbeiteteLeads}</b></div>
            <p className="text-xs text-muted-foreground pt-2">
              Ein Kunde mit zwei Käufen zählt zweimal, jeder mit seinem eigenen Kaufpreis.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
