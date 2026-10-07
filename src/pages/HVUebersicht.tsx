import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMieter } from "@/lib/mieterStore";
import { getVermietungen, VERMIETUNG_STUFEN } from "@/lib/vermietungStore";
import { getDienstleister } from "@/lib/dienstleisterStore";
import { getHvTickets } from "@/lib/hvTicketStore";
import { getAlleFristen } from "@/lib/fristenStore";
import { Users, Wrench, AlertTriangle, Home, Key, Euro, ClipboardList, GraduationCap, UserPlus, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const HVUebersicht = () => {
  const navigate = useNavigate();
  const mieter = getMieter();
  const vermietungen = getVermietungen();
  const dienstleister = getDienstleister();
  const tickets = getHvTickets();
  const fristen = getAlleFristen();

  const aktiveMieter = mieter.filter(m => m.status === "aktiv").length;
  const gekuendigteMieter = mieter.filter(m => m.status === "gekuendigt").length;
  const leerstehend = vermietungen.filter(v => v.stufe === "leerstehend").length;
  const offeneTickets = tickets.filter(t => t.status !== "erledigt").length;
  const dringendeTickets = tickets.filter(t => t.prioritaet === "dringend" && t.status !== "erledigt").length;

  const mieteinnahmenMonat = mieter.filter(m => m.status === "aktiv").reduce((sum, m) => sum + m.kaltmiete + m.nebenkosten, 0);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString().slice(0, 10);
  const ueberfaelligeFristen = fristen.filter(f => !f.erledigt && f.faelligAm < today);
  const baldFaelligeFristen = fristen.filter(f => !f.erledigt && f.faelligAm >= today && f.faelligAm <= in30Days);
  const kritischeFristen = [...ueberfaelligeFristen, ...baldFaelligeFristen].slice(0, 5);

  const kpiCards = [
    { label: "Aktive Mieter", value: aktiveMieter, icon: Users, color: "text-green-600" },
    { label: "Leerstehende Einheiten", value: leerstehend, icon: Home, color: "text-red-500" },
    { label: "Gekündigte Verträge", value: gekuendigteMieter, icon: Key, color: "text-orange-500" },
    { label: "Offene Tickets", value: offeneTickets, icon: Wrench, color: dringendeTickets > 0 ? "text-red-500" : "text-blue-500" },
    { label: "Mieteinnahmen/Monat", value: `${mieteinnahmenMonat.toLocaleString("de-DE")} €`, icon: Euro, color: "text-green-600" },
    { label: "Kritische Fristen", value: ueberfaelligeFristen.length + baldFaelligeFristen.length, icon: Clock, color: ueberfaelligeFristen.length > 0 ? "text-red-500" : "text-muted-foreground" },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Hausverwaltung" subtitle="Übersicht aller Verwaltungsaktivitäten" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
        {kpiCards.map(kpi => (
          <Card key={kpi.label} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6 text-center">
              <kpi.icon className={`h-6 w-6 mx-auto mb-2 ${kpi.color}`} />
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {dringendeTickets > 0 && (
        <Card className="mt-6 border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">{dringendeTickets} dringende(s) Ticket(s) offen</p>
              <p className="text-sm text-muted-foreground">Sofortige Bearbeitung erforderlich</p>
            </div>
            <button onClick={() => navigate("/hv-tickets")} className="ml-auto text-sm font-medium text-red-600 hover:underline">
              Tickets anzeigen →
            </button>
          </CardContent>
        </Card>
      )}

      {/* Fristen-Warnung */}
      {kritischeFristen.length > 0 && (
        <Card className={`mt-4 ${ueberfaelligeFristen.length > 0 ? "border-red-200 dark:border-red-900" : "border-yellow-200 dark:border-yellow-900"}`}>
          <CardContent className="pt-6 flex items-start gap-3">
            <Clock className={`h-5 w-5 mt-0.5 ${ueberfaelligeFristen.length > 0 ? "text-red-500" : "text-yellow-500"}`} />
            <div className="flex-1">
              <p className={`font-semibold ${ueberfaelligeFristen.length > 0 ? "text-red-700 dark:text-red-400" : "text-yellow-700 dark:text-yellow-400"}`}>
                {ueberfaelligeFristen.length > 0 ? `${ueberfaelligeFristen.length} überfällige Frist(en)` : `${baldFaelligeFristen.length} bald fällige Frist(en)`}
              </p>
              <div className="mt-2 space-y-1">
                {kritischeFristen.map(f => (
                    <div key={f.id} className="flex items-center justify-between text-sm">
                      <span>{f.titel}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Date(f.faelligAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                        <Badge variant={f.faelligAm < today ? "destructive" : "outline"} className="text-[10px]">
                          {f.faelligAm < today ? "Überfällig" : "Bald fällig"}
                        </Badge>
                      </div>
                    </div>
                ))}
              </div>
            </div>
            <button onClick={() => navigate("/fristenueberwachung")} className="text-sm font-medium text-primary hover:underline shrink-0">
              Alle Fristen →
            </button>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        {[
          { title: "Mieter anlegen", icon: UserPlus, url: "/mieter" },
          { title: "Neues Ticket", icon: ClipboardList, url: "/hv-tickets" },
          { title: "Vermietung", icon: Key, url: "/vermietung" },
          { title: "Fristenüberwachung", icon: Clock, url: "/fristenueberwachung" },
        ].map(action => (
          <Card key={action.title} className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group" onClick={() => navigate(action.url)}>
            <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-accent transition-colors">
                <action.icon className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground transition-colors" />
              </div>
              <p className="text-xs font-medium text-foreground text-center">{action.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Vermietungs-Pipeline */}
        <Card className="flex flex-col">
          <CardHeader><CardTitle className="text-base">Vermietungs-Pipeline</CardTitle></CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="space-y-2">
              {VERMIETUNG_STUFEN.map(stufe => {
                const count = vermietungen.filter(v => v.stufe === stufe.value).length;
                return (
                  <div key={stufe.value} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stufe.color }} />
                      <span className="text-sm">{stufe.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">{count}</Badge>
                  </div>
                );
              })}
            </div>
            <button onClick={() => navigate("/vermietung")} className="mt-auto pt-4 text-sm font-medium text-primary hover:underline text-left">
              Vermietung öffnen →
            </button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader><CardTitle className="text-base">Aktuelle Tickets</CardTitle></CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="space-y-3">
              {tickets.filter(t => t.status !== "erledigt").slice(0, 5).map(t => (
                <div key={t.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{t.titel}</p>
                    <p className="text-xs text-muted-foreground">{t.objektName} · {t.wohneinheitName}</p>
                  </div>
                  <Badge variant={t.prioritaet === "dringend" ? "destructive" : t.prioritaet === "hoch" ? "default" : "secondary"} className="text-[10px] shrink-0">
                    {t.prioritaet}
                  </Badge>
                </div>
              ))}
              {tickets.filter(t => t.status !== "erledigt").length === 0 && (
                <p className="text-sm text-muted-foreground">Keine offenen Tickets</p>
              )}
            </div>
            <button onClick={() => navigate("/hv-tickets")} className="mt-auto pt-4 text-sm font-medium text-primary hover:underline text-left">
              Alle Tickets →
            </button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader><CardTitle className="text-base">Auslaufende Mietverträge</CardTitle></CardHeader>
          <CardContent className="flex-1 flex flex-col">
            {(() => {
              const in6Months = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
              const auslaufend = mieter.filter(m => m.status === "aktiv" && m.mietvertragEnde && new Date(m.mietvertragEnde) <= in6Months);
              if (auslaufend.length === 0) return <p className="text-sm text-muted-foreground">Keine auslaufenden Verträge in den nächsten 6 Monaten</p>;
              return (
                <div className="space-y-2">
                  {auslaufend.map(m => (
                    <div key={m.id} className="flex items-center justify-between">
                      <span className="text-sm">{m.vorname} {m.nachname}</span>
                      <span className="text-xs text-muted-foreground">{new Date(m.mietvertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <button onClick={() => navigate("/mieter")} className="mt-auto pt-4 text-sm font-medium text-primary hover:underline text-left">
              Alle Mieter →
            </button>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader><CardTitle className="text-base">Dienstleister</CardTitle></CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="space-y-2">
              {dienstleister.slice(0, 5).map(d => (
                <div key={d.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{d.firma}</p>
                    <p className="text-xs text-muted-foreground">{d.ansprechpartner}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{d.typ}</Badge>
                </div>
              ))}
            </div>
            <button onClick={() => navigate("/dienstleister")} className="mt-auto pt-4 text-sm font-medium text-primary hover:underline text-left">
              Alle Dienstleister →
            </button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default HVUebersicht;
