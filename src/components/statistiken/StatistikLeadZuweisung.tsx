import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cacheGet, cacheLadeZeilenFuer } from "@/lib/dataCache";
import { useLiveData } from "@/hooks/useLiveData";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { LEITUNG_ROLLEN } from "@/lib/bellNotifications";
import { dbRowToKunde } from "@/lib/kundenStore";
import { getEffectivePipelineStufe, PIPELINE_STUFEN } from "@/lib/kontaktPipeline";
import { isKontaktStatsExcluded } from "@/lib/statsExclusion";
import { tarnName } from "@/lib/vorfuehrmodus";
import { inPeriod, ratio, type Period, type Row } from "@/lib/statistikController";
import {
  STATUS_GRUPPEN,
  partnerUebersicht,
  rueckgabeGrund,
  umhaengungAusLog,
  zuweisungenAuswerten,
  type Umhaengung,
  type Verbleib,
} from "@/lib/leadZuweisungStatistik";
import { Metric, Section, number, percent } from "./ControllerViews";
import { LeadPaketeUebersicht } from "@/components/leadpakete/LeadPaketeUebersicht";

const VERBLEIB_TEXT: Record<Verbleib, string> = {
  bei_ihm: "Beim Partner",
  zurueckgegeben: "An die Zentrale zurückgegeben",
  weitergegeben: "An Kollegen weitergegeben",
  abgezogen: "Von der Zentrale neu vergeben",
};

const datum = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "");

/**
 * Reiter "Lead-Zuweisung": je Partner, wie viele Leads die Zentrale ihm
 * zugewiesen hat, wo sie heute stehen und wie viele zurückkamen. Die
 * Zählung steht in `leadZuweisungStatistik.ts`, hier wird nur geladen und
 * angezeigt.
 */
export function StatistikLeadZuweisung({
  ids,
  period,
}: {
  /** Sichtbare Partner nach Datenbereich, `null` für das ganze Haus. */
  ids: Set<string> | null;
  period: Period;
}) {
  const [laden, setLaden] = useState<"laeuft" | "fehler" | "fertig">("laeuft");
  const [nurZeitraum, setNurZeitraum] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);

  // Gezielt nur die Umhängungen, nicht das ganze Protokoll: Das liegt im
  // Zwischenspeicher nur mit den neuesten 20.000 Zeilen, die frühen
  // Zuweisungen fielen sonst heraus.
  useEffect(() => {
    let aktiv = true;
    void cacheLadeZeilenFuer("activity_log", "action", "kontakt_reassigned").then((ok) => {
      if (aktiv) setLaden(ok ? "fertig" : "fehler");
    });
    return () => {
      aktiv = false;
    };
  }, []);

  // Ohne useMemo: Die Seite rendert bei jeder Cache-Änderung neu, und die
  // Mengen sind klein (einige hundert Umhängungen).
  const logZeilen = useLiveData<Row>("activity_log", (r) => r.action === "kontakt_reassigned");
  const nutzer = loadAllUsers();
  const leitung = new Set(
    nutzer
      .filter((u) => (u.rollen || []).some((r) => (LEITUNG_ROLLEN as readonly string[]).includes(r)))
      .map((u) => u.id),
  );
  const namen = new Map(nutzer.map((u) => [u.id, u.name || "Ohne Namen"]));
  const kontakte = new Map<string, Row>();
  for (const k of cacheGet<Row>("kontakte")) if (!k.geloescht && !isKontaktStatsExcluded(k)) kontakte.set(k.id, k);
  const stufen = new Map<string, string>();
  const stufeVon = (id: string) => {
    if (stufen.has(id)) return stufen.get(id);
    const k = kontakte.get(id);
    if (!k) return undefined;
    const s = getEffectivePipelineStufe(dbRowToKunde(k));
    stufen.set(id, s);
    return s;
  };
  const umhaengungen = logZeilen.map(umhaengungAusLog).filter((u): u is Umhaengung => !!u);
  const alle = zuweisungenAuswerten(umhaengungen, (id) => leitung.has(id)).filter(
    (z) => (ids === null || ids.has(z.partnerId)) && (!nurZeitraum || inPeriod(z.am, period)),
  );
  const zeilen = partnerUebersicht(alle, stufeVon);

  if (laden === "laeuft") {
    return (
      <Section title="Daten werden geladen…">
        <p role="status">Die Zuweisungen aus dem Protokoll werden geholt.</p>
      </Section>
    );
  }
  if (laden === "fehler") {
    return (
      <Section title="Zuweisungen konnten nicht geladen werden">
        <p role="alert">
          Die Tabelle bleibt ausgeblendet, damit fehlende Daten nicht als Nullwerte erscheinen. Bitte lade die Seite neu.
        </p>
      </Section>
    );
  }

  const summe = zeilen.reduce((s, z) => s + z.zuweisungen.length, 0);
  const zurueck = zeilen.reduce((s, z) => s + z.zurueckgegeben, 0);
  const partnerName = (id: string | null) => (id ? tarnName(namen.get(id) || "Unbekanntes Konto", "partner") : "System");
  const stufeLabel = (s?: string) => PIPELINE_STUFEN.find((p) => p.key === s)?.label || s || "";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Metric label="Zuweisungen durch die Zentrale" value={number(summe)} note={`${zeilen.length} Partner`} />
        <Metric label="An die Zentrale zurückgegeben" value={number(zurueck)} note="Vom Partner selbst zurückgegeben" />
        <Metric label="Rückgabequote" value={percent(ratio(zurueck, summe))} note="Zurückgegeben im Verhältnis zu zugewiesen" />
      </div>
      <Section
        title="Lead-Zuweisung je Partner"
        note="Grundlage ist das Protokoll der Zuständigkeitswechsel seit dem 09.07.2026. Gezählt wird jede Zuweisung durch Admin, Inhaber, Vertriebsleitung oder das System. Eigenkontakte, selbst übernommene Leads und Weitergaben unter Partnern zählen nicht. Der Status gilt für die Leads, die heute noch beim Partner liegen. Gelöschte Kontakte fallen heraus."
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={nurZeitraum}
            onChange={(e) => setNurZeitraum(e.target.checked)}
          />
          Nur Zuweisungen im gewählten Zeitraum oben
        </label>
        {zeilen.length === 0 ? (
          <p>
            {nurZeitraum
              ? "Im gewählten Zeitraum hat die Zentrale in diesem Datenbereich keine Leads zugewiesen."
              : "In diesem Datenbereich hat die Zentrale noch keine Leads zugewiesen."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Partner</th>
                  <th className="py-2 px-2 font-medium text-right">Zugewiesen</th>
                  {STATUS_GRUPPEN.map((g) => (
                    <th key={g.id} className="py-2 px-2 font-medium text-right">{g.label}</th>
                  ))}
                  <th className="py-2 px-2 font-medium text-right">Zurückgegeben</th>
                  <th className="py-2 px-2 font-medium text-right">Weitergegeben</th>
                  <th className="py-2 pl-2 font-medium text-right">Neu vergeben</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => {
                  const auf = offen === z.partnerId;
                  const n = z.zuweisungen.length;
                  return (
                    <Fragment key={z.partnerId}>
                      <tr className="border-t">
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-left hover:text-primary"
                            aria-expanded={auf}
                            onClick={() => setOffen(auf ? null : z.partnerId)}
                          >
                            {auf ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {partnerName(z.partnerId)}
                          </button>
                        </td>
                        <td className="py-2 px-2 text-right font-semibold">{number(n)}</td>
                        {STATUS_GRUPPEN.map((g) => (
                          <td key={g.id} className="py-2 px-2 text-right">{number(z.jeStatus[g.id])}</td>
                        ))}
                        <td className="py-2 px-2 text-right">
                          {number(z.zurueckgegeben)}
                          <span className="text-muted-foreground"> ({percent(ratio(z.zurueckgegeben, n))})</span>
                        </td>
                        <td className="py-2 px-2 text-right">{number(z.weitergegeben)}</td>
                        <td className="py-2 pl-2 text-right">{number(z.abgezogen)}</td>
                      </tr>
                      {auf && (
                        <tr>
                          <td colSpan={STATUS_GRUPPEN.length + 5} className="pb-4">
                            <table className="w-full text-sm bg-muted/40 rounded-md">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="p-2 font-medium">Lead</th>
                                  <th className="p-2 font-medium">Zugewiesen am</th>
                                  <th className="p-2 font-medium">Durch</th>
                                  <th className="p-2 font-medium">Status heute</th>
                                  <th className="p-2 font-medium">Verbleib</th>
                                </tr>
                              </thead>
                              <tbody>
                                {z.zuweisungen.map((w) => {
                                  const k = kontakte.get(w.kontaktId);
                                  const name = `${k?.vorname || ""} ${k?.nachname || ""}`.trim() || "Ohne Namen";
                                  const grund =
                                    w.verbleib === "zurueckgegeben" && w.endeAm
                                      ? rueckgabeGrund(k?.meta?.beraterHistorie, w.endeAm)
                                      : "";
                                  return (
                                    <tr key={`${w.kontaktId}-${w.am}`} className="border-t align-top">
                                      <td className="p-2">
                                        <Link className="text-primary underline" to={`/kunden/${w.kontaktId}`}>
                                          {tarnName(name, "kunde")}
                                        </Link>
                                      </td>
                                      <td className="p-2">{datum(w.am)}</td>
                                      <td className="p-2">{partnerName(w.durchId)}</td>
                                      <td className="p-2">{stufeLabel(stufen.get(w.kontaktId))}</td>
                                      <td className="p-2">
                                        {VERBLEIB_TEXT[w.verbleib]}
                                        {w.endeAm && w.verbleib !== "bei_ihm" && ` am ${datum(w.endeAm)}`}
                                        {grund && <span className="block text-muted-foreground">Grund: {grund}</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <LeadPaketeUebersicht ids={ids} />
    </div>
  );
}
