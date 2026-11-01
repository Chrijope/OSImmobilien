import { useState, useMemo, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Pencil, Inbox, Send, FileText, Archive, Trash2, Star,
  Search, Reply, ReplyAll, Forward, ArrowLeft, MoreHorizontal,
  MailOpen, Mail, AlertCircle, RefreshCw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserSettings } from "@/hooks/useUserSettings";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { format } from "date-fns";
import { de } from "date-fns/locale";


type EmailOrdner = "posteingang" | "gesendet" | "entwuerfe" | "archiviert" | "papierkorb";

type Email = {
  id: string;
  betreff: string;
  inhalt: string | null;
  absender_name: string | null;
  absender_email: string | null;
  vorschau: string | null;
  gelesen: boolean;
  markiert: boolean;
  ordner: EmailOrdner;
  empfangen_am: string;
  benutzer_id: string;
  konto_id: string | null;
  message_id: string | null;
  empfaenger: string[] | null;
};

type MailEintrag = Omit<Email, "benutzer_id">;

const ORDNER = [
  { label: "Posteingang", icon: Inbox, id: "posteingang" as EmailOrdner },
  { label: "Gesendet", icon: Send, id: "gesendet" as EmailOrdner },
  { label: "Entwürfe", icon: FileText, id: "entwuerfe" as EmailOrdner },
  { label: "Archiviert", icon: Archive, id: "archiviert" as EmailOrdner },
  { label: "Papierkorb", icon: Trash2, id: "papierkorb" as EmailOrdner },
];

/** Felder, die die Seite liest. */
const MAIL_FELDER = "id, konto_id, betreff, inhalt, absender_name, absender_email, empfaenger, message_id, vorschau, gelesen, markiert, ordner, empfangen_am";

type MailKonto = { id: string; adresse: string; anzeigename: string | null };

/** Adressen aus einem Eingabefeld: Komma, Semikolon oder Leerzeichen trennen. */
function adressenAus(text: string): string[] {
  return text.split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean);
}

function htmlAusText(text: string): string {
  const ersetzt = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return ersetzt.split("\n").map((z) => z || "&nbsp;").map((z) => `<div>${z}</div>`).join("");
}

const EmailSeite = () => {
  const [aktuellerOrdner, setAktuellerOrdner] = useState<EmailOrdner>("posteingang");
  const [emails, setEmails] = useState<MailEintrag[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<MailEintrag | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "replyall" | "forward">("new");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [antwortAuf, setAntwortAuf] = useState<string | null>(null);
  const [konten, setKonten] = useState<MailKonto[]>([]);
  const [vonKonto, setVonKonto] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingBody, setLoadingBody] = useState(false);
  const { toast } = useToast();
  const { settings } = useUserSettings();
  const [benutzerId, setBenutzerId] = useState<string | null>(null);

  const loadEmails = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setBenutzerId(user.id);
      const { data, error } = await supabase
        .from("emails")
        .select(MAIL_FELDER)
        .eq("benutzer_id", user.id)
        .order("empfangen_am", { ascending: false })
        .limit(500);
      if (error) throw error;
      setEmails((data as unknown as MailEintrag[]) ?? []);
    } catch (e) {
      console.error("Email load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmails();
    void supabase.from("email_konten" as never).select("id, adresse, anzeigename").order("erstellt_am").then(({ data }) => {
      const liste = (data as unknown as MailKonto[]) ?? [];
      setKonten(liste);
      if (liste[0]) setVonKonto((v) => v || liste[0].id);
    });
  }, [loadEmails]);

  // Neue Mails aus dem automatischen Abholen erscheinen ohne Neuladen.
  useEffect(() => {
    if (!benutzerId) return;
    const kanal = supabase
      .channel(`emails-seite-${benutzerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "emails", filter: `benutzer_id=eq.${benutzerId}` }, () => void loadEmails())
      .subscribe();
    return () => { void supabase.removeChannel(kanal); };
  }, [benutzerId, loadEmails]);

  /** Eine Aktion im Postfach; die Liste ist schon vorab angepasst und wird bei Fehler neu geladen. */
  const aktion = async (body: Record<string, unknown>): Promise<boolean> => {
    const { error } = await supabase.functions.invoke("email-aktion", { body });
    if (error) {
      const f = await edgeFehlerMitGrund(error, { functionName: "email-aktion" });
      toast({ title: "Im Postfach nicht übernommen", description: (f as Error)?.message, variant: "destructive" });
      await loadEmails();
      return false;
    }
    return true;
  };

  const syncEmails = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-emails", { body: {} });
      if (error) throw await edgeFehlerMitGrund(error, { functionName: "sync-emails" });
      if (data?.fehler?.length) {
        toast({ title: "Nicht alle Konten abgeholt", description: data.fehler.map((f: { adresse: string; fehler: string }) => `${f.adresse}: ${f.fehler}`).join(" · "), variant: "destructive" });
      } else if (!konten.length) {
        toast({ title: "Noch kein Konto verbunden", description: "Unter Einstellungen, E-Mail, ein Postfach verbinden." });
      } else {
        toast({ title: data?.synced ? `${data.synced} neue E-Mails abgeholt` : "Postfach ist aktuell" });
      }
      await loadEmails();
    } catch (e) {
      toast({ title: "Abholen fehlgeschlagen", description: (e as Error)?.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // Ungelesen im Posteingang, sonst die Anzahl.
  const ordnerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ORDNER.forEach((o) => {
      counts[o.id] = emails.filter((e) => e.ordner === o.id && (o.id === "posteingang" ? !e.gelesen : true)).length;
    });
    return counts;
  }, [emails]);

  const filteredEmails = useMemo(() => {
    let result = emails.filter((e) => e.ordner === aktuellerOrdner);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.absender_name || "").toLowerCase().includes(q) ||
          e.betreff.toLowerCase().includes(q) ||
          (e.vorschau || "").toLowerCase().includes(q) ||
          (e.absender_email || "").toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => new Date(b.empfangen_am).getTime() - new Date(a.empfangen_am).getTime());
  }, [emails, aktuellerOrdner, search]);

  const openEmail = async (email: MailEintrag) => {
    setSelectedEmail(email);
    if (!email.gelesen) {
      setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, gelesen: true } : e)));
      void aktion({ aktion: "gelesen", ids: [email.id], wert: true });
    }
    if (!email.inhalt) {
      setLoadingBody(true);
      const { data, error } = await supabase.functions.invoke("email-aktion", { body: { aktion: "inhalt", id: email.id } });
      setLoadingBody(false);
      if (!error && typeof data?.inhalt === "string") {
        setSelectedEmail({ ...email, inhalt: data.inhalt, gelesen: true });
        setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, inhalt: data.inhalt } : e)));
      }
    }
  };

  // Der Stern ist eine Markierung im CRM, nicht im Postfach.
  const toggleStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const neu = !emails.find((m) => m.id === id)?.markiert;
    setEmails((prev) => prev.map((em) => (em.id === id ? { ...em, markiert: neu } : em)));
    const { error } = await supabase.from("emails").update({ markiert: neu }).eq("id", id);
    if (error) await loadEmails();
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const moveEmails = async (ids: string[], target: EmailOrdner) => {
    setEmails((prev) => prev.map((e) => (ids.includes(e.id) ? { ...e, ordner: target } : e)));
    setSelectedIds(new Set());
    setSelectedEmail(null);
    const labels: Record<string, string> = {
      archiviert: "archiviert",
      papierkorb: "in den Papierkorb verschoben",
      posteingang: "in den Posteingang verschoben",
    };
    if (await aktion({ aktion: "verschieben", ids, ziel: target })) {
      toast({ title: `E-Mail${ids.length > 1 ? "s" : ""} ${labels[target] || "verschoben"}` });
    }
  };

  const markAsUnread = async (id: string) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, gelesen: false } : e)));
    setSelectedEmail(null);
    if (await aktion({ aktion: "gelesen", ids: [id], wert: false })) toast({ title: "Als ungelesen markiert" });
  };

  const deleteForever = async (ids: string[]) => {
    setEmails((prev) => prev.filter((e) => !ids.includes(e.id)));
    setSelectedIds(new Set());
    setSelectedEmail(null);
    if (await aktion({ aktion: "loeschen", ids })) toast({ title: "Endgültig gelöscht" });
  };

  const eigeneAdressen = useMemo(() => new Set(konten.map((k) => k.adresse.toLowerCase())), [konten]);

  const openCompose = (mode: "new" | "reply" | "replyall" | "forward", email?: MailEintrag) => {
    setComposeMode(mode);
    setAntwortAuf(mode === "reply" || mode === "replyall" ? email?.id ?? null : null);
    if (email?.konto_id) setVonKonto(email.konto_id);
    const zitat = email
      ? `Am ${format(new Date(email.empfangen_am), "dd.MM.yyyy HH:mm", { locale: de })} schrieb ${email.absender_name || email.absender_email}:\n\n${email.inhalt || ""}`
      : "";
    if (mode === "new" || !email) {
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
    } else if (mode === "reply" || mode === "replyall") {
      const weitere = mode === "replyall" ? (email.empfaenger ?? []).filter((a) => !eigeneAdressen.has(a.toLowerCase())) : [];
      setComposeTo([email.absender_email || "", ...weitere].filter(Boolean).join(", "));
      setComposeSubject(/^re:/i.test(email.betreff) ? email.betreff : `Re: ${email.betreff}`);
      setComposeBody(`\n\n---\n${zitat}`);
    } else {
      setComposeTo("");
      setComposeSubject(`Fwd: ${email.betreff}`);
      setComposeBody(`\n\n--- Weitergeleitete Nachricht ---\nVon: ${email.absender_name} <${email.absender_email}>\nDatum: ${format(new Date(email.empfangen_am), "dd.MM.yyyy HH:mm", { locale: de })}\nBetreff: ${email.betreff}\n\n${email.inhalt || ""}`);
    }
    setComposeOpen(true);
  };

  const handleSend = async (): Promise<boolean> => {
    const an = adressenAus(composeTo);
    if (!vonKonto) {
      toast({ title: "Kein Konto zum Senden", description: "Unter Einstellungen, E-Mail, ein Postfach verbinden.", variant: "destructive" });
      return false;
    }
    if (an.length === 0 || !composeSubject.trim()) {
      toast({ title: "Fehler", description: "Empfänger und Betreff sind Pflichtfelder.", variant: "destructive" });
      return false;
    }
    const signatur = settings?.email?.signatur;
    const html = htmlAusText(composeBody) + (signatur?.aktiv && signatur.html ? `<br>${signatur.html}` : "");
    const { data, error } = await supabase.functions.invoke("email-aktion", {
      body: { aktion: "senden", kontoId: vonKonto, an, betreff: composeSubject, text: composeBody, html, antwortAuf },
    });
    if (error) {
      const f = await edgeFehlerMitGrund(error, { functionName: "email-aktion" });
      toast({ title: "Nicht gesendet", description: (f as Error)?.message, variant: "destructive" });
      return false;
    }
    setComposeOpen(false);
    toast({ title: "E-Mail gesendet ✓", description: data?.hinweis || `An ${an.join(", ")}` });
    await loadEmails();
    return true;
  };

  // Entwürfe bleiben im CRM, sie gehen nicht ins Postfach.
  const handleSaveDraft = async () => {
    if (!benutzerId) return;
    const { error } = await supabase.from("emails").insert({
      benutzer_id: benutzerId,
      ordner: "entwuerfe",
      betreff: composeSubject || "(Kein Betreff)",
      inhalt: composeBody,
      vorschau: composeBody.slice(0, 80) || "(Leerer Entwurf)",
      empfaenger: adressenAus(composeTo),
      gelesen: true,
    } as never);
    if (error) {
      toast({ title: "Entwurf nicht gespeichert", description: error.message, variant: "destructive" });
      return;
    }
    setComposeOpen(false);
    toast({ title: "Entwurf gespeichert ✓" });
    await loadEmails();
  };

  const selectAll = () => {
    if (selectedIds.size === filteredEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmails.map((e) => e.id)));
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffH < 24) return format(d, "HH:mm");
    if (diffH < 48) return "Gestern";
    return format(d, "dd.MM.yyyy");
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title="E-Mail" subtitle={loading ? "Lade E-Mails…" : `${emails.length} E-Mails`}>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void syncEmails()} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Synchronisiere…" : "Synchronisieren"}
            </Button>
            <Button size="sm" onClick={() => openCompose("new")}>
              <Pencil className="h-4 w-4 mr-1" /> Verfassen
            </Button>
          </div>
        </PageHeader>

        <div className="flex gap-4 min-h-[calc(100vh-220px)]">
          {/* Sidebar */}
          <div className="w-48 flex-shrink-0 space-y-1">
            <Button className="w-full mb-3" size="sm" onClick={() => openCompose("new")}>
              <Pencil className="h-4 w-4 mr-1" /> Neue E-Mail
            </Button>
            {ORDNER.map((o) => (
              <button
                key={o.id}
                onClick={() => { setAktuellerOrdner(o.id); setSelectedEmail(null); setSelectedIds(new Set()); }}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  aktuellerOrdner === o.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <o.icon className="h-4 w-4" />
                <span className="flex-1 text-left">{o.label}</span>
                {ordnerCounts[o.id] > 0 && (
                  <Badge
                    variant={o.id === "posteingang" && ordnerCounts[o.id] > 0 ? "destructive" : "secondary"}
                    className="text-bildunterschrift px-1.5 h-5"
                  >
                    {ordnerCounts[o.id]}
                  </Badge>
                )}
              </button>
            ))}

          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedEmail ? (
              /* Email Detail View */
              <div className="flex flex-col h-full">
                {/* Toolbar */}
                <div className="flex items-center gap-2 mb-3">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(null)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Zurück
                  </Button>
                  <Separator orientation="vertical" className="h-5" />
                  <Button variant="ghost" size="sm" onClick={() => openCompose("reply", selectedEmail)}>
                    <Reply className="h-4 w-4 mr-1" /> Antworten
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openCompose("forward", selectedEmail)}>
                    <Forward className="h-4 w-4 mr-1" /> Weiterleiten
                  </Button>
                  <Separator orientation="vertical" className="h-5" />
                  <Button variant="ghost" size="icon" aria-label="Archivieren" className="h-8 w-8" onClick={() => moveEmails([selectedEmail.id], "archiviert")}>
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Löschen" className="h-8 w-8" onClick={() => moveEmails([selectedEmail.id], "papierkorb")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Weitere Aktionen" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => markAsUnread(selectedEmail.id)}>
                        <MailOpen className="h-4 w-4 mr-2" /> Als ungelesen markieren
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => moveEmails([selectedEmail.id], "posteingang")}>
                        <Inbox className="h-4 w-4 mr-2" /> In Posteingang verschieben
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Email Content */}
                <Card className="flex-1 p-6 overflow-y-auto">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{selectedEmail.betreff}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {(selectedEmail.absender_name || "?")[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{selectedEmail.absender_name}</p>
                          <p className="text-xs text-muted-foreground">{selectedEmail.absender_email}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(selectedEmail.empfangen_am), "dd. MMMM yyyy, HH:mm", { locale: de })} Uhr
                    </p>
                  </div>
                  <Separator className="mb-4" />
                  {loadingBody ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      E-Mail-Inhalt wird geladen...
                    </div>
                  ) : selectedEmail.inhalt ? (
                    <div
                      className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedEmail.inhalt.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>') }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground italic py-4">Kein Inhalt verfügbar.</p>
                  )}
                </Card>

                {/* Quick Reply */}
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openCompose("reply", selectedEmail)}>
                    <Reply className="h-4 w-4 mr-1" /> Antworten
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openCompose("forward", selectedEmail)}>
                    <Forward className="h-4 w-4 mr-1" /> Weiterleiten
                  </Button>
                </div>
              </div>
            ) : (
              /* Email List View */
              <>
                {/* Search & Actions Bar */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="E-Mails durchsuchen..."
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Neu laden" className="h-9 w-9" onClick={() => void syncEmails()} disabled={syncing}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                {/* Bulk Actions */}
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2 mb-2 p-2 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">{selectedIds.size} ausgewählt</span>
                    <Button variant="outline" size="sm" onClick={() => moveEmails(Array.from(selectedIds), "archiviert")}>
                      <Archive className="h-3 w-3 mr-1" /> Archivieren
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => moveEmails(Array.from(selectedIds), "papierkorb")}>
                      <Trash2 className="h-3 w-3 mr-1" /> Löschen
                    </Button>
                    {aktuellerOrdner === "papierkorb" && (
                      <Button variant="destructive" size="sm" onClick={() => deleteForever(Array.from(selectedIds))}>
                        Endgültig löschen
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Abbrechen</Button>
                  </div>
                )}

                {/* Select All */}
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                  <Checkbox
                    checked={filteredEmails.length > 0 && selectedIds.size === filteredEmails.length}
                    onCheckedChange={selectAll}
                  />
                  <span className="text-xs text-muted-foreground">
                    {filteredEmails.length} E-Mail{filteredEmails.length !== 1 ? "s" : ""} in {ORDNER.find((o) => o.id === aktuellerOrdner)?.label}
                  </span>
                </div>

                {/* Email List */}
                <Card className="flex-1 divide-y divide-border overflow-y-auto">
                  {filteredEmails.length === 0 ? (
                    <div className="p-8 text-center">
                      <Mail className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {search ? "Keine E-Mails gefunden" : "Keine E-Mails in diesem Ordner"}
                      </p>
                    </div>
                  ) : (
                    filteredEmails.map((e) => (
                      <div
                        key={e.id}
                        onClick={() => openEmail(e)}
                        className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors flex items-center gap-3 ${
                          !e.gelesen ? "bg-accent/20" : ""
                        } ${selectedIds.has(e.id) ? "bg-primary/5" : ""}`}
                      >
                        <Checkbox
                          checked={selectedIds.has(e.id)}
                          onCheckedChange={() => {}}
                          onClick={(ev) => toggleSelect(e.id, ev)}
                          className="flex-shrink-0"
                        />
                        <Star
                          className={`h-4 w-4 flex-shrink-0 cursor-pointer ${
                            e.markiert ? "fill-warning text-warning" : "text-muted-foreground hover:text-warning"
                          }`}
                          onClick={(ev) => toggleStar(e.id, ev)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm truncate ${!e.gelesen ? "font-bold" : "font-medium"} text-foreground`}>
                              {e.absender_name}
                            </p>
                            <span className="text-[11px] text-muted-foreground flex-shrink-0">
                              {formatTime(e.empfangen_am)}
                            </span>
                          </div>
                          <p className={`text-sm truncate ${!e.gelesen ? "font-semibold" : ""} text-foreground`}>
                            {e.betreff}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{e.vorschau}</p>
                        </div>
                        {!e.gelesen && (
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                    ))
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {composeMode === "new" && "Neue E-Mail"}
              {composeMode === "reply" && "Antworten"}
              {composeMode === "replyall" && "Allen antworten"}
              {composeMode === "forward" && "Weiterleiten"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="flex items-center gap-2">
              <Label className="w-12 text-xs text-muted-foreground">Von</Label>
              {konten.length > 0 ? (
                <select
                  value={vonKonto}
                  onChange={(e) => setVonKonto(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  data-ui="field"
                >
                  {konten.map((k) => <option key={k.id} value={k.id}>{k.anzeigename ? `${k.anzeigename} <${k.adresse}>` : k.adresse}</option>)}
                </select>
              ) : (
                <Input value="Kein Konto verbunden (Einstellungen, E-Mail)" disabled className="bg-muted/30 text-sm" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-12 text-xs text-muted-foreground">An</Label>
              <Input
                placeholder="empfaenger@email.de"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="w-12 text-xs text-muted-foreground">Betreff</Label>
              <Input
                placeholder="Betreff eingeben..."
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                className="text-sm"
              />
            </div>
            <Textarea
              placeholder="Nachricht schreiben..."
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              className="min-h-[250px] text-sm"
            />
            <div className="flex items-center justify-between">
              <div />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveDraft}>
                  <FileText className="h-4 w-4 mr-1" /> Entwurf speichern
                </Button>
                <Button size="sm" haken onClick={handleSend}>
                  <Send className="h-4 w-4 mr-1" /> Senden
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default EmailSeite;
