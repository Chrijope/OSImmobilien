import { useState, useMemo, useEffect } from "react";
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
  Paperclip, MailOpen, Mail, AlertCircle, RefreshCw,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { FolderOpen } from "lucide-react";

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
};

type ImapFolder = {
  name: string;
  displayName: string;
  konto: string;
};

const ORDNER = [
  { label: "Posteingang", icon: Inbox, id: "posteingang" as EmailOrdner },
  { label: "Gesendet", icon: Send, id: "gesendet" as EmailOrdner },
  { label: "Entwürfe", icon: FileText, id: "entwuerfe" as EmailOrdner },
  { label: "Archiviert", icon: Archive, id: "archiviert" as EmailOrdner },
  { label: "Papierkorb", icon: Trash2, id: "papierkorb" as EmailOrdner },
];

// No demo emails - will load from DB
const DEMO_EMAILS: Omit<Email, "benutzer_id">[] = [];

const EmailSeite = () => {
  const [aktuellerOrdner, setAktuellerOrdner] = useState<EmailOrdner>("posteingang");
  const [emails, setEmails] = useState<Omit<Email, "benutzer_id">[]>(DEMO_EMAILS);
  const [search, setSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<Omit<Email, "benutzer_id"> | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "replyall" | "forward">("new");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imapFolders, setImapFolders] = useState<ImapFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const { toast } = useToast();

  // Load emails from DB
  const loadEmails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("benutzer_id", user.id)
        .order("empfangen_am", { ascending: false })
        .limit(200);
      if (error) throw error;
      if (data) {
        setEmails(data.map((e: any) => ({
          id: e.id,
          betreff: e.betreff,
          inhalt: e.inhalt,
          absender_name: e.absender_name,
          absender_email: e.absender_email,
          vorschau: e.vorschau,
          gelesen: e.gelesen,
          markiert: e.markiert,
          ordner: e.ordner as EmailOrdner,
          empfangen_am: e.empfangen_am,
        })));
      }
    } catch (e) {
      console.error("Email load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmails();
    loadFolders();
  }, []);

  const loadFolders = async () => {
    setLoadingFolders(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-email-folders");
      if (error) throw error;
      if (data?.folders) {
        setImapFolders(data.folders);
      }
    } catch (e) {
      console.error("Folder load error:", e);
    } finally {
      setLoadingFolders(false);
    }
  };

  const syncEmails = async (folder?: string) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-emails", {
        body: folder ? { folder } : undefined,
      });
      
      if (error) throw error;
      if (data?.synced > 0) {
        toast({ title: `${data.synced} neue E-Mails synchronisiert ✓` });
        await loadEmails();
      } else if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
      } else {
        toast({ title: "Postfach ist aktuell – keine neuen E-Mails" });
      }
    } catch (e: any) {
      toast({ title: "Sync fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // Count unread per folder
  const ordnerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ORDNER.forEach((o) => {
      counts[o.id] = emails.filter(
        (e) => e.ordner === o.id && (o.id === "posteingang" ? !e.gelesen : true)
      ).length;
    });
    // For non-inbox, show total count
    ORDNER.forEach((o) => {
      if (o.id !== "posteingang") {
        counts[o.id] = emails.filter((e) => e.ordner === o.id).length;
      }
    });
    return counts;
  }, [emails]);

  // Filtered emails for current folder
  const filteredEmails = useMemo(() => {
    let result = emails.filter((e) => e.ordner === aktuellerOrdner);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.absender_name || "").toLowerCase().includes(q) ||
          e.betreff.toLowerCase().includes(q) ||
          (e.vorschau || "").toLowerCase().includes(q) ||
          (e.absender_email || "").toLowerCase().includes(q)
      );
    }
    return result.sort(
      (a, b) => new Date(b.empfangen_am).getTime() - new Date(a.empfangen_am).getTime()
    );
  }, [emails, aktuellerOrdner, search]);

  const openEmail = async (email: Omit<Email, "benutzer_id">) => {
    setSelectedEmail(email);
    // Mark as read
    if (!email.gelesen) {
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, gelesen: true } : e))
      );
    }
    // Fetch body on demand if not already loaded
    if (!email.inhalt) {
      setLoadingBody(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data, error } = await supabase.functions.invoke("fetch-email-body", {
            body: {
              emailId: email.id,
              betreff: email.betreff,
              absender_email: email.absender_email,
              empfangen_am: email.empfangen_am,
            },
          });
          if (!error && data?.inhalt) {
            const updatedEmail = { ...email, inhalt: data.inhalt, gelesen: true };
            setSelectedEmail(updatedEmail);
            setEmails((prev) =>
              prev.map((e) => (e.id === email.id ? { ...e, inhalt: data.inhalt } : e))
            );
          }
        }
      } catch (err) {
        console.error("Error fetching email body:", err);
      } finally {
        setLoadingBody(false);
      }
    }
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEmails((prev) =>
      prev.map((em) => (em.id === id ? { ...em, markiert: !em.markiert } : em))
    );
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

  const moveEmails = (ids: string[], target: EmailOrdner) => {
    setEmails((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, ordner: target } : e))
    );
    setSelectedIds(new Set());
    setSelectedEmail(null);
    const labels: Record<string, string> = {
      archiviert: "archiviert",
      papierkorb: "in den Papierkorb verschoben",
      posteingang: "in den Posteingang verschoben",
    };
    toast({ title: `E-Mail${ids.length > 1 ? "s" : ""} ${labels[target] || "verschoben"}` });
  };

  const markAsUnread = (id: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, gelesen: false } : e))
    );
    setSelectedEmail(null);
    toast({ title: "Als ungelesen markiert" });
  };

  const deleteForever = (ids: string[]) => {
    setEmails((prev) => prev.filter((e) => !ids.includes(e.id)));
    setSelectedIds(new Set());
    setSelectedEmail(null);
    toast({ title: "Endgültig gelöscht" });
  };

  const openCompose = (mode: "new" | "reply" | "replyall" | "forward", email?: Omit<Email, "benutzer_id">) => {
    setComposeMode(mode);
    if (mode === "new") {
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
    } else if (mode === "reply" && email) {
      setComposeTo(email.absender_email || "");
      setComposeSubject(`Re: ${email.betreff}`);
      setComposeBody(`\n\n---\nAm ${format(new Date(email.empfangen_am), "dd.MM.yyyy HH:mm", { locale: de })} schrieb ${email.absender_name}:\n\n${email.inhalt || ""}`);
    } else if (mode === "forward" && email) {
      setComposeTo("");
      setComposeSubject(`Fwd: ${email.betreff}`);
      setComposeBody(`\n\n--- Weitergeleitete Nachricht ---\nVon: ${email.absender_name} <${email.absender_email}>\nDatum: ${format(new Date(email.empfangen_am), "dd.MM.yyyy HH:mm", { locale: de })}\nBetreff: ${email.betreff}\n\n${email.inhalt || ""}`);
    }
    setComposeOpen(true);
  };

  const handleSend = () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      toast({ title: "Fehler", description: "Empfänger und Betreff sind Pflichtfelder.", variant: "destructive" });
      return;
    }
    const newEmail: Omit<Email, "benutzer_id"> = {
      id: `sent-${Date.now()}`,
      absender_name: "Christian Peetz",
      absender_email: "os@os-immobilien.com",
      betreff: composeSubject,
      inhalt: composeBody,
      vorschau: composeBody.slice(0, 80) + "...",
      gelesen: true,
      markiert: false,
      ordner: "gesendet",
      empfangen_am: new Date().toISOString(),
    };
    setEmails((prev) => [newEmail, ...prev]);
    setComposeOpen(false);
    toast({ title: "E-Mail gesendet ✓", description: `An ${composeTo}` });
  };

  const handleSaveDraft = () => {
    const draft: Omit<Email, "benutzer_id"> = {
      id: `draft-${Date.now()}`,
      absender_name: "Christian Peetz",
      absender_email: "os@os-immobilien.com",
      betreff: composeSubject || "(Kein Betreff)",
      inhalt: composeBody,
      vorschau: composeBody.slice(0, 80) || "(Leerer Entwurf)",
      gelesen: true,
      markiert: false,
      ordner: "entwuerfe",
      empfangen_am: new Date().toISOString(),
    };
    setEmails((prev) => [draft, ...prev]);
    setComposeOpen(false);
    toast({ title: "Entwurf gespeichert ✓" });
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
            <Button size="sm" variant="outline" onClick={() => syncEmails()} disabled={syncing}>
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
                    className="text-[10px] px-1.5 h-5"
                  >
                    {ordnerCounts[o.id]}
                  </Badge>
                )}
              </button>
            ))}

            {/* IMAP Folders */}
            {imapFolders.length > 0 && (
              <>
                <Separator className="my-2" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-1 font-semibold">
                  IMAP Ordner
                </p>
                {imapFolders
                  .filter((f) => {
                    // Filter out standard folders that are already shown above
                    const n = f.name.toLowerCase();
                    return !["inbox", "sent", "drafts", "trash", "junk", "spam"].includes(n) &&
                      !n.includes("sent") && !n.includes("draft") && !n.includes("trash") &&
                      !n.includes("junk") && !n.includes("spam") && !n.includes("deleted");
                  })
                  .map((f) => (
                    <button
                      key={f.name}
                      onClick={() => {
                        // Sync this specific folder
                        syncEmails(f.name);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-foreground hover:bg-muted"
                    >
                      <FolderOpen className="h-4 w-4" />
                      <span className="flex-1 text-left truncate">{f.displayName}</span>
                    </button>
                  ))}
              </>
            )}
            {loadingFolders && (
              <p className="text-[10px] text-muted-foreground px-3 py-2">Lade Ordner…</p>
            )}
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
                  <Button variant="ghost" size="icon" aria-label="Neu laden" className="h-9 w-9" onClick={() => syncEmails()} disabled={syncing}>
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
              <Input value="os@os-immobilien.com" disabled className="bg-muted/30 text-sm" />
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
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm">
                  <Paperclip className="h-4 w-4 mr-1" /> Anhang
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveDraft}>
                  <FileText className="h-4 w-4 mr-1" /> Entwurf speichern
                </Button>
                <Button size="sm" onClick={handleSend}>
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
