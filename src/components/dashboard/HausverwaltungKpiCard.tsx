import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getMieter } from "@/lib/mieterStore";
import { getVermietungen, VERMIETUNG_STUFEN } from "@/lib/vermietungStore";
import { getDienstleister } from "@/lib/dienstleisterStore";
import { getHvTickets } from "@/lib/hvTicketStore";
import { getObjekte } from "@/lib/objekteStore";
import { Home, Users, Wrench, Euro, AlertTriangle, Key, ClipboardList, GraduationCap, UserPlus, BarChart3, TrendingUp, TrendingDown, Building2, Building, CreditCard, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";

export function HausverwaltungKpiCard() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const _cv = useLiveVersion(["mieter", "hv_tickets", "vermietungen", "dienstleister", "objekte"]);
  const mieter = getMieter();
  const vermietungen = getVermietungen();
  const dienstleister = getDienstleister();
  const tickets = getHvTickets();
  const objekte = getObjekte();

  const aktiveMieter = mieter.filter(m => m.status === "aktiv").length;
  const leerstehend = vermietungen.filter(v => v.stufe === "leerstehend").length;
  const gekuendigte = mieter.filter(m => m.status === "gekuendigt").length;
  const offeneTickets = tickets.filter(t => t.status !== "erledigt").length;
  const dringend = tickets.filter(t => t.prioritaet === "dringend" && t.status !== "erledigt").length;
  const mieteinnahmen = mieter.filter(m => m.status === "aktiv").reduce((s, m) => s + m.kaltmiete + m.nebenkosten, 0);
  const kautionOffen = mieter.filter(m => !m.kautionEingegangen && m.status === "aktiv").length;
  const dienstleisterKosten = dienstleister.reduce((s, d) => s + d.kostenMonatlich, 0);
  const gesamtEinheiten = vermietungen.length;
  const vermietungsquote = gesamtEinheiten > 0 ? Math.round(((gesamtEinheiten - leerstehend) / gesamtEinheiten) * 100) : 0;

  // Objekte & Einheiten
  const anzahlObjekte = objekte.length;
  const anzahlEinheiten = objekte.reduce((s, o) => s + (o.wohnungen?.length || 0), 0);
  const vermieteteEinheiten = objekte.reduce((s, o) => s + (o.wohnungen?.filter(w => w.vermietet).length || 0), 0);
  const nettomieteinnahmen = mieteinnahmen - dienstleisterKosten;

  // Zahlungsstatus
  const ueberfaelligeZahlungen = mieter.reduce((s, m) => s + m.zahlungen.filter(z => z.status === "ueberfaellig" || z.status === "gemahnt").length, 0);
  const neueMieter = mieter.filter(m => m.status === "neu").length;

  const now = new Date();
  const in6Months = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
  const auslaufend = mieter.filter(m => m.status === "aktiv" && m.mietvertragEnde && new Date(m.mietvertragEnde) <= in6Months);

  const isFullDashboard = user.role === "hausverwaltung";

  // ── Expanded card for admin/inhaber ──
  if (!isFullDashboard) {
    return (
      <Card className="h-full">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-muted/40 transition-colors rounded-t-lg">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Hausverwaltung – Überblick</span>
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">Entwurf</Badge>
                  {dringend > 0 && <Badge variant="destructive" className="text-[10px]">{dringend} dringend</Badge>}
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </div>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Objekte", value: anzahlObjekte, icon: Building2, color: "text-primary" },
              { label: "Einheiten gesamt", value: anzahlEinheiten, icon: Building, color: "text-primary" },
              { label: "Davon vermietet", value: vermieteteEinheiten, icon: Users, color: "text-green-600" },
              { label: "Leerstehend", value: leerstehend, icon: Home, color: leerstehend > 0 ? "text-destructive" : "text-green-600" },
              { label: "Aktive Mieter", value: aktiveMieter, icon: Users, color: "text-green-600" },
              { label: "Gekündigt", value: gekuendigte, icon: Key, color: gekuendigte > 0 ? "text-orange-500" : "text-muted-foreground" },
              { label: "Neue Interessenten", value: neueMieter, icon: UserPlus, color: neueMieter > 0 ? "text-blue-500" : "text-muted-foreground" },
              { label: "Vermietungsquote", value: `${vermietungsquote}%`, icon: TrendingUp, color: vermietungsquote >= 90 ? "text-green-600" : "text-orange-500" },
              { label: "Mieteinnahmen/Monat", value: `${mieteinnahmen.toLocaleString("de-DE")} €`, icon: Euro, color: "text-green-600" },
              { label: "DL-Kosten/Monat", value: `${dienstleisterKosten.toLocaleString("de-DE")} €`, icon: TrendingDown, color: "text-muted-foreground" },
              { label: "Netto-Ergebnis/Monat", value: `${nettomieteinnahmen.toLocaleString("de-DE")} €`, icon: Euro, color: nettomieteinnahmen >= 0 ? "text-green-600" : "text-destructive" },
              { label: "Überfällige Zahlungen", value: ueberfaelligeZahlungen, icon: CreditCard, color: ueberfaelligeZahlungen > 0 ? "text-destructive" : "text-green-600" },
            ].map(kpi => (
              <div key={kpi.label} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                <kpi.icon className={`h-4 w-4 ${kpi.color} shrink-0`} />
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-none truncate">{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{kpi.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Alerts */}
          {(dringend > 0 || kautionOffen > 0 || ueberfaelligeZahlungen > 0) && (
            <div className="space-y-2">
              {dringend > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">{dringend} dringende(s) Ticket(s)</span>
                  <button onClick={() => navigate("/hv-tickets")} className="ml-auto underline text-[10px]">Anzeigen</button>
                </div>
              )}
              {ueberfaelligeZahlungen > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
                  <CreditCard className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">{ueberfaelligeZahlungen} überfällige Zahlung(en)</span>
                  <button onClick={() => navigate("/mieter")} className="ml-auto underline text-[10px]">Anzeigen</button>
                </div>
              )}
              {kautionOffen > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 text-orange-600 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">{kautionOffen} Kaution(en) ausstehend</span>
                  <button onClick={() => navigate("/mieter")} className="ml-auto underline text-[10px]">Anzeigen</button>
                </div>
              )}
            </div>
          )}

          {/* Offene Tickets + Pipeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground">Offene Tickets ({offeneTickets})</p>
              <div className="space-y-1.5">
                {tickets.filter(t => t.status !== "erledigt").slice(0, 4).map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-1">
                    <span className="text-xs truncate">{t.titel}</span>
                    <Badge variant={t.prioritaet === "dringend" ? "destructive" : "secondary"} className="text-[9px] shrink-0">{t.prioritaet}</Badge>
                  </div>
                ))}
                {offeneTickets === 0 && <p className="text-xs text-muted-foreground">Keine offenen Tickets</p>}
              </div>
              <button onClick={() => navigate("/hv-tickets")} className="text-[10px] text-primary hover:underline mt-1.5">Alle Tickets →</button>
            </div>
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground">Vermietungs-Pipeline</p>
              <div className="space-y-1.5">
                {VERMIETUNG_STUFEN.map(stufe => {
                  const count = vermietungen.filter(v => v.stufe === stufe.value).length;
                  if (count === 0) return null;
                  return (
                    <div key={stufe.value} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stufe.color }} />
                        <span className="text-xs">{stufe.label}</span>
                      </div>
                      <span className="text-xs font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => navigate("/vermietung")} className="text-[10px] text-primary hover:underline mt-1.5">Vermietung →</button>
            </div>
          </div>

          {/* Auslaufende Verträge */}
          {auslaufend.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground">Auslaufende Verträge (6 Mon.)</p>
              <div className="space-y-1">
                {auslaufend.slice(0, 3).map(m => (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span>{m.vorname} {m.nachname}</span>
                    <span className="text-muted-foreground">{new Date(m.mietvertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                  </div>
                ))}
                {auslaufend.length > 3 && <p className="text-[10px] text-muted-foreground">+{auslaufend.length - 3} weitere</p>}
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            {[
              { label: "Mieter", url: "/mieter" },
              { label: "Tickets", url: "/hv-tickets" },
              { label: "Vermietung", url: "/vermietung" },
              { label: "Dienstleister", url: "/dienstleister" },
              { label: "HV-Statistiken", url: "/hv-statistiken" },
            ].map(link => (
              <button key={link.url} onClick={() => navigate(link.url)} className="text-[10px] px-2 py-1 rounded-md bg-muted hover:bg-accent text-foreground transition-colors">
                {link.label}
              </button>
            ))}
          </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  }

  // Full dashboard for hausverwaltung role
  const kpiCards = [
    { label: "Aktive Mieter", value: aktiveMieter, icon: Users, color: "text-green-600" },
    { label: "Leerstehende Einheiten", value: leerstehend, icon: Home, color: "text-red-500" },
    { label: "Gekündigte Verträge", value: gekuendigte, icon: Key, color: "text-orange-500" },
    { label: "Offene Tickets", value: offeneTickets, icon: Wrench, color: dringend > 0 ? "text-red-500" : "text-blue-500" },
    { label: "Mieteinnahmen/Monat", value: `${mieteinnahmen.toLocaleString("de-DE")} €`, icon: Euro, color: "text-green-600" },
    { label: "DL-Kosten/Monat", value: `${dienstleisterKosten.toLocaleString("de-DE")} €`, icon: ClipboardList, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpiCards.map(kpi => (
          <Card key={kpi.label} className="hover:shadow-md transition-shadow">
            <CardContent data-ui="kennzahl" data-anordnung="kompakt" className="pt-6 text-center">
              <kpi.icon className={`h-6 w-6 mx-auto mb-2 ${kpi.color}`} />
              <p data-ui="kennzahl-wert" className="text-2xl font-bold">{kpi.value}</p>
              <p data-ui="kennzahl-label" className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {dringend > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">{dringend} dringende(s) Ticket(s) offen</p>
              <p className="text-sm text-muted-foreground">Sofortige Bearbeitung erforderlich</p>
            </div>
            <button onClick={() => navigate("/hv-tickets")} className="ml-auto text-sm font-medium text-red-600 hover:underline">
              Tickets anzeigen →
            </button>
          </CardContent>
        </Card>
      )}

      {kautionOffen > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <div>
              <p className="font-semibold text-orange-700 dark:text-orange-400">{kautionOffen} Kaution(en) ausstehend</p>
              <p className="text-sm text-muted-foreground">Bitte Kautionseingänge prüfen</p>
            </div>
            <button onClick={() => navigate("/mieter")} className="ml-auto text-sm font-medium text-orange-600 hover:underline">
              Mieter anzeigen →
            </button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { title: "Mieter anlegen", icon: UserPlus, url: "/mieter" },
          { title: "Neues Ticket", icon: ClipboardList, url: "/hv-tickets" },
          { title: "Vermietung", icon: Key, url: "/vermietung" },
          { title: "Statistiken", icon: BarChart3, url: "/hv-statistiken" },
          { title: "Akademie", icon: GraduationCap, url: "/academy" },
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            {auslaufend.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine auslaufenden Verträge in den nächsten 6 Monaten</p>
            ) : (
              <div className="space-y-2">
                {auslaufend.map(m => (
                  <div key={m.id} className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2" onClick={() => navigate(`/mieter/${m.id}`)}>
                    <span className="text-sm">{m.vorname} {m.nachname}</span>
                    <span className="text-xs text-muted-foreground">{new Date(m.mietvertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</span>
                  </div>
                ))}
              </div>
            )}
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
                <div key={d.id} className="flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2" onClick={() => navigate(`/dienstleister/${d.id}`)}>
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
    </div>
  );
}
