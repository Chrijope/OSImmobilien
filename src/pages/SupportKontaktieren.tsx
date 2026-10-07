import { useState, useMemo, useEffect } from "react";
import { nameMeintNutzer } from "@/lib/beraterNamensabgleich";
import { useSearchParams } from "react-router-dom";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUngeleseneSupportTickets } from "@/hooks/useUngeleseneSupportTickets";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useUser } from "@/contexts/UserContext";
import {
  createTicket, getTickets, addNachricht, ticketGelesenSetzen, letzteSupportAntwortAm,
  type SupportTicket, type TicketKategorie, type TicketPrioritaet,
} from "@/lib/supportTicketStore";
import {
  Send, TicketIcon, Clock, MessageSquare, CheckCircle2,
  HelpCircle, Monitor, FileText, Building2, Scale, ArrowRight, ArrowLeft,
  PanelRightOpen, PanelRightClose, ChevronRight,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

// ─── Category options ───
const KATEGORIEN: { value: TicketKategorie; label: string; icon: React.ReactNode; beschreibung: string }[] = [
  { value: "allgemein", label: "Allgemeine Frage", icon: <HelpCircle className="h-5 w-5" />, beschreibung: "Fragen zu Abläufen, Funktionen oder Prozessen" },
  { value: "technisch", label: "Technisches Problem", icon: <Monitor className="h-5 w-5" />, beschreibung: "Fehler, Bugs oder technische Schwierigkeiten" },
  { value: "abrechnung", label: "Abrechnung & Provision", icon: <FileText className="h-5 w-5" />, beschreibung: "Fragen zu Provisionen, Abrechnungen oder Zahlungen" },
  { value: "objekte", label: "Objekte & Wohnungen", icon: <Building2 className="h-5 w-5" />, beschreibung: "Fragen zu Immobilien, Reservierungen oder Dokumenten" },
  { value: "vertrag", label: "Vertragliches", icon: <Scale className="h-5 w-5" />, beschreibung: "Vertragsfragen, Konditionen oder rechtliche Themen" },
];

const PRIORITAETEN: { value: TicketPrioritaet; label: string; cls: string }[] = [
  { value: "niedrig", label: "Niedrig", cls: "border-green-300 text-green-700 bg-green-50" },
  { value: "mittel", label: "Mittel", cls: "border-yellow-300 text-yellow-700 bg-yellow-50" },
  { value: "hoch", label: "Hoch – Dringend", cls: "border-red-300 text-red-700 bg-red-50" },
];

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    neu: { label: "Neu", cls: "bg-blue-100 text-blue-700 border-blue-200" },
    offen: { label: "Offen", cls: "bg-orange-100 text-orange-700 border-orange-200" },
    in_bearbeitung: { label: "In Bearbeitung", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    geloest: { label: "Gelöst", cls: "bg-green-100 text-green-700 border-green-200" },
    geschlossen: { label: "Geschlossen", cls: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status] || map.neu;
  return <Badge variant="outline" className={`text-[10px] ${s.cls}`}>{s.label}</Badge>;
}

type Step = "kategorie" | "details" | "fertig";

export default function SupportKontaktieren() {
  const { user, authUser } = useUser();
  const [step, setStep] = useState<Step>("kategorie");
  const [kategorie, setKategorie] = useState<TicketKategorie | "">("");
  const [betreff, setBetreff] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [prioritaet, setPrioritaet] = useState<TicketPrioritaet>("mittel");
  const [erstelltesTicket, setErstelltesTicket] = useState<SupportTicket | null>(null);

  /*
   * Das geoeffnete Ticket. Gemerkt wird nur die Kennung, die Nachrichten
   * kommen bei jedem Rendern frisch aus dem Live-Zwischenspeicher. Vorher
   * stand hier eine Momentaufnahme, und eine neue Antwort erschien erst nach
   * dem Schliessen und erneuten Oeffnen.
   */
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const ticketAusLink = searchParams.get("ticket");
  const ungelesen = useUngeleseneSupportTickets();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const liveVersion = useLiveVersion(["support_tickets"]);
  const tickets = useMemo(() => getTickets(), [liveVersion]);

  /*
   * Nur die eigenen Tickets, und zwar an der Kennung des Absenders.
   *
   * Hier stand `t.erstellerName === user.name || t.erstellerRolle ===
   * user.role`. Der zweite Teil war der Fehler: Die Rolle passt auf jeden
   * Kollegen mit derselben Rolle, ein Vertriebspartner sah also die Tickets
   * aller anderen Vertriebspartner. In einem Ticket steckt unter `meta` der
   * technische Anhang der Fehlermeldung, und darin standen am 16.09.2026
   * Name, Anschrift, Geburtsdatum und Kaufpreis eines Kunden.
   *
   * Die Datenbank liefert fremde Tickets seit der Migration
   * 20260916110000_support_tickets_sichtbarkeit gar nicht mehr aus. Diese
   * Zeile ist die zweite Sperre und gilt auch dann, wenn jemand spaeter die
   * Leseregel wieder oeffnet.
   *
   * Beim Testkonto liegen die Tickets nur im Browser und haben keine
   * Kennung. Dort bleibt der Vergleich ueber den Namen, aber nur, wenn er
   * genau einen Nutzer meint.
   */
  const ich = { userId: authUser?.id, userName: user.name };
  const userTickets = tickets.filter(t =>
    t.benutzerId ? t.benutzerId === authUser?.id : nameMeintNutzer(t.erstellerName, ich)
  );
  // Ein frisch angelegtes Ticket kann kurz noch fehlen, bis der Zwischenspeicher es hat.
  const selectedTicket: SupportTicket | null =
    userTickets.find(t => t.id === selectedTicketId)
    ?? (erstelltesTicket && erstelltesTicket.id === selectedTicketId ? erstelltesTicket : null);
  const letzteAntwort = selectedTicket ? letzteSupportAntwortAm(selectedTicket) : null;

  // Der Link aus Glocke und Mail: /support-kontaktieren?ticket=<id> oeffnet das Ticket.
  useEffect(() => {
    if (ticketAusLink) {
      setSelectedTicketId(ticketAusLink);
      setStep("kategorie");
    }
  }, [ticketAusLink]);

  // Der Ersteller hat die Antworten gesehen. Auch dann, wenn eine neue
  // Antwort eintrifft, waehrend das Ticket offen ist.
  const eigenesOffen = !!selectedTicket && (selectedTicket.benutzerId
    ? selectedTicket.benutzerId === authUser?.id
    : nameMeintNutzer(selectedTicket.erstellerName, ich));
  useEffect(() => {
    if (eigenesOffen && selectedTicket && letzteAntwort) void ticketGelesenSetzen(selectedTicket.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eigenesOffen, selectedTicket?.id, letzteAntwort]);

  const ticketOeffnen = (id: string | null) => {
    setSelectedTicketId(id);
    setStep("kategorie");
    // Den Link nicht stehen lassen, sonst oeffnet er das alte Ticket wieder.
    if (ticketAusLink && ticketAusLink !== id) {
      const neu = new URLSearchParams(searchParams);
      neu.delete("ticket");
      setSearchParams(neu, { replace: true });
    }
  };

  // ─── Submit ticket ───
  const handleSubmit = async () => {
    if (!kategorie || !betreff.trim() || !beschreibung.trim()) return;
    try {
      const ticket = await createTicket({
        betreff: betreff.trim(),
        kategorie: kategorie as TicketKategorie,
        prioritaet,
        nachricht: beschreibung.trim(),
        erstellerName: user.name,
        erstellerEmail: `${user.name.toLowerCase().replace(/\s/g, ".")}@mail.de`,
        erstellerRolle: user.role,
      });
      setErstelltesTicket(ticket);
      setStep("fertig");
      // Data auto-refreshes via useLiveVersion
      toast({ title: `Ticket T-${ticket.nummer} erstellt`, description: "Das Backoffice wurde benachrichtigt." });
    } catch (fehler) {
      // Ehrlich bleiben: Landet das Ticket nicht in der Datenbank, darf hier
      // kein "erstellt" stehen. Der technische Grund kommt mit, denn er ist
      // das Einzige, was der Partner weitergeben kann, wenn der Meldeweg
      // selbst klemmt.
      console.error("Support-Ticket konnte nicht gespeichert werden:", fehler);
      const f = fehler as { message?: string; code?: string } | null;
      const grund = [f?.message, f?.code ? `(${f.code})` : ""]
        .filter(Boolean)
        .join(" ")
        .slice(0, 300);
      toast({
        title: "Ticket konnte nicht gespeichert werden",
        description:
          "Bitte melde dich kurz direkt beim Backoffice und gib diesen Grund weiter: "
          + (grund || "kein Grund vom Server erhalten"),
        variant: "destructive",
      });
    }
  };

  // ─── Reset form ───
  const resetForm = () => {
    setStep("kategorie");
    setKategorie("");
    setBetreff("");
    setBeschreibung("");
    setPrioritaet("mittel");
    setErstelltesTicket(null);
    ticketOeffnen(null);
  };

  // ─── Send reply to ticket ───
  const sendReply = async () => {
    const text = replyInput.trim();
    if (!text || !selectedTicket) return;
    setReplyInput("");
    try {
      await addNachricht(selectedTicket.id, { absender: "nutzer", absenderName: user.name, inhalt: text });
    } catch (fehler) {
      // Den Text zurueckgeben, damit nichts verloren geht.
      setReplyInput(text);
      console.error("Nachricht nicht gespeichert:", fehler);
      toast({
        title: "Nachricht konnte nicht gespeichert werden",
        description: (fehler as { message?: string } | null)?.message || "Bitte versuche es noch einmal.",
        variant: "destructive",
      });
    }
  };

  // ─── Render main content ───
  const renderContent = () => {
    // If viewing a ticket detail
    if (selectedTicket) {
      return (
        <Card className="flex-1 flex flex-col min-w-0">
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => ticketOeffnen(null)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Zurück
              </Button>
              <TicketIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">T-{selectedTicket.nummer}: {selectedTicket.betreff}</span>
              <StatusBadge status={selectedTicket.status} />
            </div>
          </div>

          <CardContent className="flex-1 overflow-y-auto pt-4 pb-2 space-y-4">
            {selectedTicket.nachrichten.map((msg, i) => (
              <div key={i} className={`flex ${msg.absender === "nutzer" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-4 py-3 ${
                  msg.absender === "nutzer" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  <p className="text-xs font-medium mb-1 opacity-70">{msg.absenderName}</p>
                  <p className="text-sm">{msg.inhalt}</p>
                  <p className="text-[10px] opacity-50 mt-1">
                    {format(new Date(msg.timestamp), "dd.MM.yyyy HH:mm", { locale: de })}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>

          {selectedTicket.status !== "geschlossen" && selectedTicket.status !== "geloest" && (
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  value={replyInput}
                  onChange={e => setReplyInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder="Nachricht an Support schreiben..."
                  className="flex-1"
                />
                <Button onClick={sendReply} disabled={!replyInput.trim()} size="icon" aria-label="Senden" className="h-10 w-10">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      );
    }

    // Step-based ticket creation
    return (
      <Card className="flex-1 flex flex-col min-w-0">
        {/* Step indicator */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <div className={`flex items-center gap-1.5 ${step === "kategorie" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step === "kategorie" ? "bg-primary text-primary-foreground" : step === "details" || step === "fertig" ? "bg-green-500 text-white" : "bg-muted"}`}>
                {step === "details" || step === "fertig" ? "✓" : "1"}
              </span>
              Kategorie
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <div className={`flex items-center gap-1.5 ${step === "details" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step === "details" ? "bg-primary text-primary-foreground" : step === "fertig" ? "bg-green-500 text-white" : "bg-muted"}`}>
                {step === "fertig" ? "✓" : "2"}
              </span>
              Beschreibung
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <div className={`flex items-center gap-1.5 ${step === "fertig" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${step === "fertig" ? "bg-green-500 text-white" : "bg-muted"}`}>
                {step === "fertig" ? "✓" : "3"}
              </span>
              Fertig
            </div>
          </div>
        </div>

        <CardContent className="flex-1 overflow-y-auto pt-6 pb-4">
          {/* Step 1: Category */}
          {step === "kategorie" && (
            <div className="max-w-lg mx-auto">
              <h3 className="text-lg font-semibold mb-1">Worum geht es?</h3>
              <p className="text-sm text-muted-foreground mb-6">Wähle die Kategorie, die am besten zu deinem Anliegen passt.</p>

              <div className="space-y-3">
                {KATEGORIEN.map(k => (
                  <button
                    key={k.value}
                    onClick={() => setKategorie(k.value)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-start gap-3 hover:border-primary/50 ${
                      kategorie === k.value ? "border-primary bg-primary/5 shadow-sm" : "border-border"
                    }`}
                  >
                    <div className={`mt-0.5 ${kategorie === k.value ? "text-primary" : "text-muted-foreground"}`}>
                      {k.icon}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{k.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{k.beschreibung}</p>
                    </div>
                  </button>
                ))}
              </div>

              <Button
                onClick={() => setStep("details")}
                disabled={!kategorie}
                className="w-full mt-6 gap-2"
              >
                Weiter <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Details */}
          {step === "details" && (
            <div className="max-w-lg mx-auto">
              <h3 className="text-lg font-semibold mb-1">Beschreibe dein Anliegen</h3>
              <p className="text-sm text-muted-foreground mb-6">Je genauer du beschreibst, desto schneller können wir helfen.</p>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="betreff">Betreff *</Label>
                  <Input
                    id="betreff"
                    value={betreff}
                    onChange={e => setBetreff(e.target.value)}
                    placeholder="Kurze Zusammenfassung des Anliegens"
                    maxLength={100}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="beschreibung">Beschreibung *</Label>
                  <Textarea
                    id="beschreibung"
                    value={beschreibung}
                    onChange={e => setBeschreibung(e.target.value)}
                    placeholder="Beschreibe so genau wie möglich:&#10;- Was hast du versucht?&#10;- Was ist passiert?&#10;- Was hast du erwartet?"
                    className="min-h-[160px]"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Tipp: Nenne den Bereich, die Funktion und ggf. den Kunden/das Objekt.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Priorität</Label>
                  <RadioGroup
                    value={prioritaet}
                    onValueChange={v => setPrioritaet(v as TicketPrioritaet)}
                    className="flex gap-3"
                  >
                    {PRIORITAETEN.map(p => (
                      <label
                        key={p.value}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                          prioritaet === p.value ? p.cls + " border-2" : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <RadioGroupItem value={p.value} />
                        <span className="text-sm font-medium">{p.label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep("kategorie")} className="gap-2">
                  <ArrowLeft className="h-4 w-4" /> Zurück
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!betreff.trim() || !beschreibung.trim()}
                  className="flex-1 gap-2"
                >
                  <TicketIcon className="h-4 w-4" /> Ticket erstellen
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === "fertig" && erstelltesTicket && (
            <div className="max-w-lg mx-auto text-center py-8">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Ticket T-{erstelltesTicket.nummer} erstellt!</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Das Backoffice-Team wurde benachrichtigt und wird sich um dein Anliegen kümmern.
              </p>

              <Card className="text-left mb-6">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Ticket-Nr.</span>
                    <span className="text-sm font-mono font-bold">T-{erstelltesTicket.nummer}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Betreff</span>
                    <span className="text-sm">{erstelltesTicket.betreff}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Kategorie</span>
                    <span className="text-sm capitalize">{erstelltesTicket.kategorie}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <StatusBadge status={erstelltesTicket.status} />
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={resetForm} className="gap-2">
                  <TicketIcon className="h-4 w-4" /> Neues Ticket
                </Button>
                <Button onClick={() => ticketOeffnen(erstelltesTicket.id)} className="gap-2">
                  Ticket öffnen <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Support kontaktieren" subtitle="Erstelle ein Ticket – unser Team kümmert sich darum." />
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 200px)", minHeight: "500px" }}>
        {renderContent()}

        {/* ─── Sidebar: Tickets ─── */}
        <div className={`w-72 flex-shrink-0 flex flex-col gap-3 transition-all ${sidebarOpen ? "" : "hidden"}`}>
          <Button onClick={resetForm} className="w-full gap-2">
            <TicketIcon className="h-4 w-4" /> Neues Ticket erstellen
          </Button>

          <div data-ui="card" className="bg-card border rounded-lg overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Meine Tickets</p>
              <Badge variant="secondary" className="text-[10px] h-5">{userTickets.length}</Badge>
            </div>
            <div className="flex-1 overflow-y-auto">
              {userTickets.map(ticket => {
                const neueAntwort = ungelesen.has(ticket.id);
                return (
                <button
                  key={ticket.id}
                  onClick={() => ticketOeffnen(ticket.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-accent transition-colors ${
                    selectedTicket?.id === ticket.id ? "bg-accent" : neueAntwort ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <TicketIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground">T-{ticket.nummer}</span>
                    <StatusBadge status={ticket.status} />
                    {neueAntwort && (
                      <Badge className="text-[10px] h-5 ml-auto">Neue Antwort</Badge>
                    )}
                  </div>
                  <p className={`text-sm truncate mt-0.5 ${neueAntwort ? "font-semibold" : ""}`}>{ticket.betreff}</p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(new Date(ticket.erstelltAm), "dd.MM.yyyy", { locale: de })}
                    <MessageSquare className="h-3 w-3 ml-1" />
                    {ticket.nachrichten.length}
                  </div>
                </button>
                );
              })}

              {userTickets.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <TicketIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">Noch keine Tickets</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
