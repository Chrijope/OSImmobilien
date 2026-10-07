import { useState, useMemo } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  getTickets, getTicketStats, addNachricht, updateTicketStatus, updateTicketPrioritaet, deleteTicket,
  antwortErneutMelden, darfSupportAntworten, supportAbsenderName, letzteSupportAntwortAm,
  type TicketStatus, type TicketPrioritaet,
} from "@/lib/supportTicketStore";
import { toast } from "@/hooks/use-toast";
import { cacheGet } from "@/lib/dataCache";
import { useUser } from "@/contexts/UserContext";
import {
  Zap, AlertCircle, RefreshCw, CheckCircle, XCircle, TicketIcon, Clock,
  Timer, TrendingUp, Smile, ArrowLeft, Send, MessageSquare, BarChart3, Trash2,
  FilterX, CalendarDays, ArrowUpDown, ArrowUp, ArrowDown, BellRing,
} from "lucide-react";
import { format, isAfter, isBefore, parseISO, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    neu: { label: "Neu", icon: <Zap className="h-3 w-3" />, cls: "bg-blue-100 text-blue-700 border-blue-200" },
    offen: { label: "Offen", icon: <AlertCircle className="h-3 w-3" />, cls: "bg-orange-100 text-orange-700 border-orange-200" },
    in_bearbeitung: { label: "In Bearbeitung", icon: <RefreshCw className="h-3 w-3" />, cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    geloest: { label: "Gelöst", icon: <CheckCircle className="h-3 w-3" />, cls: "bg-green-100 text-green-700 border-green-200" },
    geschlossen: { label: "Geschlossen", icon: <XCircle className="h-3 w-3" />, cls: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status] || map.neu;
  return <Badge variant="outline" className={`${s.cls} gap-1`}>{s.icon}{s.label}</Badge>;
}

function PrioBadge({ prio }: { prio: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    niedrig: { label: "Niedrig", cls: "bg-muted text-muted-foreground" },
    mittel: { label: "Mittel", cls: "bg-yellow-100 text-yellow-700" },
    hoch: { label: "Hoch", cls: "bg-red-100 text-red-700" },
  };
  const s = map[prio] || map.mittel;
  return <Badge className={s.cls}>{s.label}</Badge>;
}

function KategorieBadge({ kat }: { kat: string }) {
  const labels: Record<string, string> = {
    allgemein: "Allgemein", technisch: "Technisch", abrechnung: "Abrechnung", objekte: "Objekte", vertrag: "Vertrag", bug: "Bug",
  };
  return <Badge variant="outline" className="text-xs">{labels[kat] || kat}</Badge>;
}

// Rendert Nachrichten-Text und erkennt eingebettete Markdown-Bilder ![alt](url),
// damit Screenshots aus Bug-Reports inline sichtbar werden.
function MessageBody({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<p key={`t-${key++}`} className="text-sm whitespace-pre-wrap">{text.slice(lastIndex, match.index)}</p>);
    }
    parts.push(
      <a key={`i-${key++}`} href={match[1]} target="_blank" rel="noreferrer" className="block mt-2">
        <img src={match[1]} alt="Screenshot" className="max-h-64 rounded-md border border-border" />
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<p key={`t-${key++}`} className="text-sm whitespace-pre-wrap">{text.slice(lastIndex)}</p>);
  }
  return <>{parts.length > 0 ? parts : <p className="text-sm whitespace-pre-wrap">{text}</p>}</>;
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: string | number; label: string; color?: string }) {
  return (
    <Card className="text-center">
      <CardContent className="pt-4 pb-3 px-3">
        <div className={`mx-auto mb-1 ${color || "text-muted-foreground"}`}>{icon}</div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function Helpdesk() {
  const { user } = useUser();
  const isAdmin = ["admin", "inhaber"].includes(user.role);
  /*
   * Wer sieht hier alle Tickets? Seit der Migration
   * 20260916110000_support_tickets_sichtbarkeit sind das nur noch
   * Administrator, Inhaber und Backoffice. Die Vertriebsleitung sieht die
   * Tickets ihrer eigenen Partner, alle uebrigen nur ihre eigenen.
   *
   * Das ist keine Zugriffskontrolle, die macht die Datenbank. Es geht allein
   * darum, eine kurze Liste zu erklaeren, statt sie unkommentiert zu zeigen.
   */
  const sichtAlle = ["admin", "inhaber", "backoffice"].includes(user.role);
  const sichtTeam = user.role === "vertriebsleiter";
  const [tab, setTab] = useState<"tickets" | "dashboard">("tickets");
  const liveVersion = useLiveVersion(["support_tickets"]);
  const tickets = useMemo(() => getTickets(), [liveVersion]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("alle");
  const [filterPrio, setFilterPrio] = useState<string>("alle");
  const [filterAbsender, setFilterAbsender] = useState("");
  const [filterDatumVon, setFilterDatumVon] = useState("");
  const [filterDatumBis, setFilterDatumBis] = useState("");
  /*
   * Gemerkt wird nur die Kennung. Das Ticket selbst kommt bei jedem Rendern
   * frisch aus dem Live-Zwischenspeicher, damit eine neue Nachricht des
   * Erstellers sofort im offenen Ticket steht.
   */
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const selectedTicket = tickets.find(t => t.id === selectedTicketId) || null;
  const [reply, setReply] = useState("");
  const [meldetGerade, setMeldetGerade] = useState(false);
  // Antworten und "Antwort erneut melden" nach aktiver Rolle: Admin, Inhaber,
  // Backoffice. Die Vertriebsleitung liest nur. Erzwungen in der Datenbank.
  const darfAntworten = darfSupportAntworten(user.role);
  type SortKey = "nummer" | "status" | "prioritaet" | "erstelltAm";
  const [sortKey, setSortKey] = useState<SortKey>("erstelltAm");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "erstelltAm" ? "desc" : "asc");
    }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />
      : sortDir === "asc" ? <ArrowUp className="inline h-3 w-3 ml-1" />
        : <ArrowDown className="inline h-3 w-3 ml-1" />;

  const stats = getTicketStats();

  const filtered = tickets.filter(t => {
    if (filterStatus !== "alle" && t.status !== filterStatus) return false;
    if (filterPrio !== "alle" && t.prioritaet !== filterPrio) return false;
    if (filterAbsender) {
      const a = filterAbsender.toLowerCase();
      if (!t.erstellerName.toLowerCase().includes(a) && !t.erstellerEmail.toLowerCase().includes(a)) return false;
    }
    if (filterDatumVon) {
      const von = startOfDay(parseISO(filterDatumVon));
      if (isBefore(parseISO(t.erstelltAm), von)) return false;
    }
    if (filterDatumBis) {
      const bis = endOfDay(parseISO(filterDatumBis));
      if (isAfter(parseISO(t.erstelltAm), bis)) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      return (
        t.betreff.toLowerCase().includes(s) ||
        t.erstellerName.toLowerCase().includes(s) ||
        `T-${t.nummer}`.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const prioRank: Record<string, number> = { niedrig: 0, mittel: 1, hoch: 2 };
  const statusRank: Record<string, number> = { neu: 0, offen: 1, in_bearbeitung: 2, geloest: 3, geschlossen: 4 };
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "nummer": return (a.nummer - b.nummer) * dir;
      case "status": return ((statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99)) * dir;
      case "prioritaet": return ((prioRank[a.prioritaet] ?? 99) - (prioRank[b.prioritaet] ?? 99)) * dir;
      case "erstelltAm":
      default: return (new Date(a.erstelltAm).getTime() - new Date(b.erstelltAm).getTime()) * dir;
    }
  });

  const hasActiveFilters = filterStatus !== "alle" || filterPrio !== "alle" || filterAbsender || filterDatumVon || filterDatumBis;

  const handleReply = async () => {
    const text = reply.trim();
    if (!text || !selectedTicket) return;
    setReply("");
    try {
      await addNachricht(selectedTicket.id, { absender: "backoffice", absenderName: supportAbsenderName(user.name), inhalt: text });
    } catch (fehler) {
      setReply(text);
      console.error("Antwort nicht gespeichert:", fehler);
      toast({
        title: "Antwort konnte nicht gespeichert werden",
        description: (fehler as { message?: string } | null)?.message || "Bitte versuche es noch einmal.",
        variant: "destructive",
      });
    }
  };

  const handleErneutMelden = async () => {
    if (!selectedTicket || meldetGerade) return;
    setMeldetGerade(true);
    try {
      const ergebnis = await antwortErneutMelden(selectedTicket.id);
      const ohneMail: Record<string, string> = {
        bremse: "Eine Mail ging in den letzten 15 Minuten schon hinaus, deshalb keine weitere.",
        migration_fehlt: "Eine Mail ging nicht hinaus, die Datenbankänderung ist noch nicht eingespielt.",
        nicht_erreichbar: "Eine Mail ging nicht hinaus, der Mailversand ist noch nicht ausgerollt.",
        ohne_adresse: "Eine Mail ging nicht hinaus, beim Ersteller ist keine Mailadresse hinterlegt.",
        kein_interner_empfaenger: "Eine Mail ging nicht hinaus, der Ersteller ist kein interner Nutzer.",
      };
      const mailText = ergebnis.mail
        ? "Glocke und Mail sind unterwegs."
        : "Die Glocke ist gesetzt. " + (ohneMail[ergebnis.grund || ""] || "Eine Mail ging nicht hinaus.");
      toast({ title: `Antwort zu T-${selectedTicket.nummer} gemeldet`, description: mailText });
    } catch (fehler) {
      console.error("Antwort nicht gemeldet:", fehler);
      toast({
        title: "Antwort konnte nicht gemeldet werden",
        description: (fehler as { message?: string } | null)?.message || "Bitte versuche es noch einmal.",
        variant: "destructive",
      });
    } finally {
      setMeldetGerade(false);
    }
  };

  const handleStatusChange = (status: TicketStatus) => {
    if (!selectedTicket) return;
    updateTicketStatus(selectedTicket.id, status);
  };

  const handlePrioChange = (prio: TicketPrioritaet) => {
    if (!selectedTicket) return;
    updateTicketPrioritaet(selectedTicket.id, prio);
  };

  const handleDeleteTicket = () => {
    if (!selectedTicket) return;
    deleteTicket(selectedTicket.id);
    setSelectedTicketId(null);
  };

  // Ticket detail view
  if (selectedTicket) {
    const isBugTicket = selectedTicket.kategorie === ("bug" as any);
    // Original Bilder aus meta.bilder (Bug-Reports) – als Fallback/Galerie immer anzeigen
    const rawRow = cacheGet("support_tickets").find((r: any) => r.id === selectedTicket.id);
    const metaBilder: string[] = Array.isArray(rawRow?.meta?.bilder) ? rawRow.meta.bilder : [];
    return (
      <DashboardLayout>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="destructive" size="sm" onClick={() => setSelectedTicketId(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
          </Button>
          <div className="flex-1" />
          {darfAntworten && selectedTicket.benutzerId && letzteSupportAntwortAm(selectedTicket) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleErneutMelden}
              disabled={meldetGerade}
              title="Glocke und Mail an den Ersteller, ohne neue Nachricht. Höchstens eine Mail je Ticket in 15 Minuten."
            >
              <BellRing className="h-4 w-4 mr-1" /> Antwort erneut melden
            </Button>
          )}
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" /> Ticket löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Ticket wirklich löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Das Ticket T-{selectedTicket.nummer} „{selectedTicket.betreff}" wird unwiderruflich gelöscht. 
                    Diese Aktion kann nicht rückgängig gemacht werden.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteTicket} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Endgültig löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-sm font-mono text-muted-foreground">T-{selectedTicket.nummer}</span>
          <StatusBadge status={selectedTicket.status} />
          <PrioBadge prio={selectedTicket.prioritaet} />
          <KategorieBadge kat={selectedTicket.kategorie} />
          <div className="flex-1" />
          {/* Die Vertriebsleitung liest nur; RLS verwirft ihre Statusänderung still. */}
          {darfAntworten && (
            <Select value={selectedTicket.status} onValueChange={v => handleStatusChange(v as TicketStatus)}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="neu">Neu</SelectItem>
                <SelectItem value="offen">Offen</SelectItem>
                <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
                <SelectItem value="geloest">Gelöst</SelectItem>
                <SelectItem value="geschlossen">Geschlossen</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <h2 className="text-xl font-bold mb-1">{selectedTicket.betreff}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {selectedTicket.erstellerName} · {selectedTicket.erstellerEmail}
        </p>

        <Card className="max-w-3xl">
          <CardContent className="pt-6">
            <div className="space-y-4 mb-6 max-h-[450px] overflow-y-auto pr-2">
              {selectedTicket.nachrichten.map(msg => (
                <div key={msg.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{msg.absenderName}</span>
                    <span className="text-xs text-muted-foreground">· {format(new Date(msg.timestamp), "HH:mm", { locale: de })}</span>
                  </div>
                  <div className={`rounded-xl px-4 py-3 ${msg.absender === "backoffice" ? "bg-primary/10 border border-primary/20" : "bg-muted"}`}>
                    <MessageBody text={msg.inhalt} />
                  </div>
                </div>
              ))}
              {metaBilder.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Angehängte Screenshots ({metaBilder.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {metaBilder.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={url}
                          alt={`Screenshot ${i + 1}`}
                          className="w-full h-32 object-cover rounded-md border border-border hover:opacity-90 transition"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {!darfAntworten ? (
              <p className="text-xs text-muted-foreground italic border-t border-border pt-3">
                Antworten schreiben Backoffice und Geschäftsleitung. Du kannst das Ticket hier lesen.
              </p>
            ) : isBugTicket ? (
              <p className="text-xs text-muted-foreground italic border-t border-border pt-3">
                Bug-Meldungen aus dem Warndreieck sind reine IT-Tickets — eine Antwort an den Melder ist hier nicht vorgesehen. Status auf „Gelöst" oder „Geschlossen" setzen, wenn erledigt.
              </p>
            ) : (
              <div className="flex gap-2">
                <Textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Antwort schreiben..." rows={2} className="flex-1" />
                <Button onClick={handleReply} size="icon" aria-label="Senden" className="self-end h-10 w-10">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Helpdesk" subtitle="Support-Anfragen verwalten und bearbeiten." />
        <div className="flex gap-2">
          <Button variant={tab === "tickets" ? "default" : "outline"} size="sm" onClick={() => setTab("tickets")}>
            <TicketIcon className="h-4 w-4 mr-1" /> Tickets
          </Button>
          <Button variant={tab === "dashboard" ? "default" : "outline"} size="sm" onClick={() => setTab("dashboard")}>
            <BarChart3 className="h-4 w-4 mr-1" /> Dashboard
          </Button>
        </div>
      </div>

      {!sichtAlle && (
        <Alert className="mb-4">
          <AlertTitle>Du siehst hier nicht alle Tickets</AlertTitle>
          <AlertDescription>
            {sichtTeam
              ? "In einem Ticket steckt der technische Anhang der Fehlermeldung, und darin können Kundendaten stehen. Deshalb siehst du deine eigenen Tickets und die deiner Teampartner. Alle übrigen bearbeiten Backoffice und Geschäftsleitung."
              : "In einem Ticket steckt der technische Anhang der Fehlermeldung, und darin können Kundendaten stehen. Deshalb siehst du nur deine eigenen Tickets. Alle übrigen bearbeiten Backoffice und Geschäftsleitung. Wenn du dort etwas brauchst, melde dich kurz beim Backoffice."}
          </AlertDescription>
        </Alert>
      )}

      {tab === "dashboard" ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <StatCard icon={<Zap className="h-5 w-5" />} value={stats.neu} label="Neue Tickets" color="text-blue-600" />
            <StatCard icon={<AlertCircle className="h-5 w-5" />} value={stats.offen} label="Offen" color="text-orange-600" />
            <StatCard icon={<RefreshCw className="h-5 w-5" />} value={stats.inBearbeitung} label="In Bearbeitung" />
            <StatCard icon={<CheckCircle className="h-5 w-5" />} value={stats.geloest} label="Gelöst" color="text-green-600" />
            <StatCard icon={<XCircle className="h-5 w-5" />} value={stats.geschlossen} label="Geschlossen" />
            <StatCard icon={<TicketIcon className="h-5 w-5" />} value={stats.gesamt} label="Gesamt" color="text-primary" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Clock className="h-5 w-5" />} value={stats.avgAntwortzeit} label="Ø Antwortzeit" color="text-primary" />
            <StatCard icon={<Timer className="h-5 w-5" />} value={stats.avgLoesungszeit} label="Ø Lösungszeit" color="text-purple-600" />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} value={`${stats.loesungsrate}%`} label="Lösungsrate" color="text-green-600" />
            <StatCard icon={<Smile className="h-5 w-5" />} value={`${stats.zufriedenheit}%`} label="Zufriedenheit" color="text-primary" />
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-3 items-end mb-4 flex-wrap">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ticket-ID, Name oder Betreff suchen..." className="max-w-xs" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Status</SelectItem>
                <SelectItem value="neu">Neu</SelectItem>
                <SelectItem value="offen">Offen</SelectItem>
                <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
                <SelectItem value="geloest">Gelöst</SelectItem>
                <SelectItem value="geschlossen">Geschlossen</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPrio} onValueChange={setFilterPrio}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Priorität" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Prio</SelectItem>
                <SelectItem value="niedrig">Niedrig</SelectItem>
                <SelectItem value="mittel">Mittel</SelectItem>
                <SelectItem value="hoch">Hoch</SelectItem>
              </SelectContent>
            </Select>
            <Input value={filterAbsender} onChange={e => setFilterAbsender(e.target.value)} placeholder="Absender suchen..." className="max-w-[180px]" />
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={filterDatumVon} onChange={e => setFilterDatumVon(e.target.value)} className="w-36" />
              <span className="text-sm text-muted-foreground">–</span>
              <Input type="date" value={filterDatumBis} onChange={e => setFilterDatumBis(e.target.value)} className="w-36" />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("alle"); setFilterPrio("alle"); setFilterAbsender(""); setFilterDatumVon(""); setFilterDatumBis(""); }}>
                <FilterX className="h-4 w-4 mr-1" /> Filter zurücksetzen
              </Button>
            )}
            <span className="text-sm text-muted-foreground ml-auto">{filtered.length} Tickets</span>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 cursor-pointer select-none" onClick={() => toggleSort("nummer")}>ID<SortIcon k="nummer" /></TableHead>
                  <TableHead>Betreff</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Absender</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>Status<SortIcon k="status" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("prioritaet")}>Prio<SortIcon k="prioritaet" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("erstelltAm")}>Erstellt<SortIcon k="erstelltAm" /></TableHead>
                  <TableHead className="w-16">Nach.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(ticket => (
                  <TableRow key={ticket.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedTicketId(ticket.id)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">T-{ticket.nummer}</TableCell>
                    <TableCell className="font-medium text-sm">{ticket.betreff}</TableCell>
                    <TableCell><KategorieBadge kat={ticket.kategorie} /></TableCell>
                    <TableCell>
                      <div className="text-sm">{ticket.erstellerName}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={ticket.status} /></TableCell>
                    <TableCell><PrioBadge prio={ticket.prioritaet} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(ticket.erstelltAm), "dd.MM. HH:mm", { locale: de })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" /> {ticket.nachrichten.length}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Keine Tickets gefunden.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </DashboardLayout>
  );
}
