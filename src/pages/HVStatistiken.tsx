import { useLiveVersion } from '@/hooks/useLiveData';
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMieter } from "@/lib/mieterStore";
import { getVermietungen } from "@/lib/vermietungStore";
import { getDienstleister } from "@/lib/dienstleisterStore";
import { getHvTickets } from "@/lib/hvTicketStore";
import { Euro, TrendingUp, TrendingDown, AlertTriangle, Home, Users, CheckCircle, XCircle } from "lucide-react";

const HVStatistiken = () => {
  useLiveVersion(["mieter", "vermietungen", "dienstleister", "hv_tickets"]);
  const mieter = getMieter();
  const vermietungen = getVermietungen();
  const dienstleister = getDienstleister();
  const tickets = getHvTickets();

  const aktiveMieter = mieter.filter(m => m.status === "aktiv");
  const kaltmietenGesamt = aktiveMieter.reduce((s, m) => s + m.kaltmiete, 0);
  const nebenkostenGesamt = aktiveMieter.reduce((s, m) => s + m.nebenkosten, 0);
  const kautionenGesamt = aktiveMieter.reduce((s, m) => s + m.kaution, 0);
  const kautionenOffen = mieter.filter(m => !m.kautionEingegangen && m.status === "aktiv");
  const kautionenOffenSumme = kautionenOffen.reduce((s, m) => s + m.kaution, 0);
  const dienstleisterKosten = dienstleister.reduce((s, d) => s + d.kostenMonatlich, 0);

  const nettoEinnahmen = kaltmietenGesamt - dienstleisterKosten;

  const leerstehend = vermietungen.filter(v => v.stufe === "leerstehend").length;
  const vermietetCount = vermietungen.filter(v => v.stufe === "vermietet").length;
  const totalUnits = vermietungen.length;
  const vermietungsquote = totalUnits > 0 ? Math.round((vermietetCount / totalUnits) * 100) : null;

  const ticketsOffen = tickets.filter(t => t.status !== "erledigt").length;
  const ticketsErledigt = tickets.filter(t => t.status === "erledigt").length;
  const ticketsDringend = tickets.filter(t => t.prioritaet === "dringend" && t.status !== "erledigt").length;

  const now = new Date();
  const in3Months = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
  const in6Months = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
  const abgelaufen = aktiveMieter.filter(m => m.mietvertragEnde && new Date(m.mietvertragEnde) < now);
  const auslaufend3m = mieter.filter(m => m.status === "aktiv" && m.mietvertragEnde && new Date(m.mietvertragEnde) >= now && new Date(m.mietvertragEnde) <= in3Months);
  const auslaufend6m = mieter.filter(m => m.status === "aktiv" && m.mietvertragEnde && new Date(m.mietvertragEnde) <= in6Months && new Date(m.mietvertragEnde) > in3Months);

  return (
    <DashboardLayout>
      <PageHeader title="HV-Statistiken & Abrechnungen" subtitle="Finanzübersicht und Kennzahlen der Hausverwaltung" />

      {/* Finanz-KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <Card className="border-green-200 dark:border-green-900">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-green-600 mb-1"><Euro className="h-4 w-4" /><span className="text-xs font-medium">Soll-Kaltmieten / Monat</span></div>
            <p className="text-2xl font-bold">{kaltmietenGesamt.toLocaleString("de-DE")} €</p>
            <p className="text-xs text-muted-foreground mt-1">{aktiveMieter.length} aktive Mieter</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-500 mb-1"><TrendingUp className="h-4 w-4" /><span className="text-xs font-medium">Nebenkosten / Monat</span></div>
            <p className="text-2xl font-bold">{nebenkostenGesamt.toLocaleString("de-DE")} €</p>
            <p className="text-xs text-muted-foreground mt-1">Vereinbarte Vorauszahlungen; kein Hausgeld</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-orange-500 mb-1"><TrendingDown className="h-4 w-4" /><span className="text-xs font-medium">Dienstleisterkosten</span></div>
            <p className="text-2xl font-bold">{dienstleisterKosten.toLocaleString("de-DE")} €</p>
            <p className="text-xs text-muted-foreground mt-1">{dienstleister.length} Dienstleister</p>
          </CardContent>
        </Card>
        <Card className={nettoEinnahmen >= 0 ? "border-green-200 dark:border-green-900" : "border-red-200 dark:border-red-900"}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1"><Euro className={`h-4 w-4 ${nettoEinnahmen >= 0 ? "text-green-600" : "text-red-500"}`} /><span className="text-xs font-medium">Miete abzüglich Dienstleister</span></div>
            <p className={`text-2xl font-bold ${nettoEinnahmen >= 0 ? "text-green-600" : "text-red-500"}`}>{nettoEinnahmen.toLocaleString("de-DE")} €</p>
            <p className="text-xs text-muted-foreground mt-1">Teilbetrachtung der Sollbeträge; kein Gewinn oder Zahlungsnachweis</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Kautionen */}
        <Card>
          <CardHeader><CardTitle className="text-base">Kautionen</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Kautionen gesamt</span>
                <span className="font-semibold">{kautionenGesamt.toLocaleString("de-DE")} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-green-500" /> Eingegangen</span>
                <span className="font-semibold text-green-600">{(kautionenGesamt - kautionenOffenSumme).toLocaleString("de-DE")} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-500" /> Ausstehend</span>
                <span className="font-semibold text-red-500">{kautionenOffenSumme.toLocaleString("de-DE")} €</span>
              </div>
              {kautionenOffen.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Offene Kautionen:</p>
                  {kautionenOffen.map(m => (
                    <div key={m.id} className="flex justify-between text-xs py-0.5">
                      <span>{m.vorname} {m.nachname}</span>
                      <span className="text-red-500">{m.kaution.toLocaleString("de-DE")} €</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vermietungsquote */}
        <Card>
          <CardHeader><CardTitle className="text-base">Vermietungsquote der erfassten Vorgänge</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-24">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-muted" />
                  <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeDasharray={`${vermietungsquote ?? 0} 100`} className="stroke-primary" strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">{vermietungsquote === null ? "—" : `${vermietungsquote}%`}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><Home className="h-3.5 w-3.5 text-green-500" /> Vermietet: {vermietetCount}</div>
                <div className="flex items-center gap-2"><Home className="h-3.5 w-3.5 text-red-500" /> Leerstehend: {leerstehend}</div>
                <div className="flex items-center gap-2"><Home className="h-3.5 w-3.5 text-muted-foreground" /> In Pipeline: {totalUnits - vermietetCount - leerstehend}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Auslaufende Verträge */}
        <Card>
          <CardHeader><CardTitle className="text-base">Auslaufende Mietverträge</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {abgelaufen.length > 0 && <p className="text-sm text-destructive">{abgelaufen.length} aktive Mietverhältnisse mit bereits abgelaufenem Vertragsende: Stammdaten prüfen.</p>}
              {auslaufend3m.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-500 mb-1">Nächste 3 Monate ({auslaufend3m.length})</p>
                  {auslaufend3m.map(m => (
                    <div key={m.id} className="flex justify-between text-xs py-0.5">
                      <span>{m.vorname} {m.nachname}</span>
                      <span>{new Date(m.mietvertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                    </div>
                  ))}
                </div>
              )}
              {auslaufend6m.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-orange-500 mb-1">3–6 Monate ({auslaufend6m.length})</p>
                  {auslaufend6m.map(m => (
                    <div key={m.id} className="flex justify-between text-xs py-0.5">
                      <span>{m.vorname} {m.nachname}</span>
                      <span>{new Date(m.mietvertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                    </div>
                  ))}
                </div>
              )}
              {auslaufend3m.length === 0 && auslaufend6m.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine auslaufenden Verträge in den nächsten 6 Monaten</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Ticket-Statistik */}
        <Card>
          <CardHeader><CardTitle className="text-base">Ticket-Statistik</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">Offene Tickets</span>
                <Badge variant={ticketsDringend > 0 ? "destructive" : "default"}>{ticketsOffen}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Davon dringend</span>
                <Badge variant="destructive">{ticketsDringend}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Erledigt (gesamt)</span>
                <Badge variant="secondary">{ticketsErledigt}</Badge>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="text-sm font-medium">Erledigungsquote</span>
                <span className="font-semibold">{tickets.length > 0 ? Math.round((ticketsErledigt / tickets.length) * 100) : 0}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default HVStatistiken;
