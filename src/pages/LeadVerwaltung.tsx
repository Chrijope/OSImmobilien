import { useState, useMemo, useEffect } from "react";
import { formatDatum } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { NeuerTabLink } from "@/components/kunden/NeuerTabLink";
import { zeilenKlick } from "@/lib/zeilenNavigation";
import { supabase } from "@/integrations/supabase/client";
import { cacheGet, cacheLadeZeilenFuer, cacheRefreshTable } from "@/lib/dataCache";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useCacheReady } from "@/hooks/useCacheReady";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronUp, ChevronDown, Search, UserPlus, Phone, Mail, MapPin, Calendar, Clock, Users, Trash2, RefreshCw, Check, Plus, Loader2, XCircle, AlertTriangle, PhoneCall, Info, Mic, Hand, Undo2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ImportExportButton } from "@/components/kunden/ImportExportButton";
import { PageHeader } from "@/components/PageHeader";
import { getKontakte, addKontakt, deleteKontakte, leadZuweisenWennFrei, type KundeData } from "@/lib/kundenStore";
import { confirmDialog } from "@/lib/confirm";
import { getCurrentUserId } from "@/lib/currentUser";
import { fehlenKontaktdaten, istOffenerPoolLead, POOL_LEAD_ALARM_TAGE, POOL_LEAD_WARNUNG_TAGE } from "@/lib/leadPool";
import { istRuecklaeufer, kennungAusProtokoll, rueckgabeInfo, type RueckgabeInfo } from "@/lib/leadRueckgabe";
import { umhaengungAusLog, type Umhaengung } from "@/lib/leadZuweisungStatistik";
import { tageSeit } from "@/lib/datumsformate";
import { getProzessBereich } from "@/lib/kontaktPipeline";
import { HandbuchStandKurz, KonfiguratorKurz, useHandbuchLeadStand } from "@/components/handbuch/HandbuchLeadTabelle";
import { konfiguratorAngabenFuerKontakt } from "@/lib/handbuch/leadStand";
import { QUELLEN_GRUPPEN, quellenGruppe } from "@/lib/leadVerwaltungReiter";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { cn } from "@/lib/utils";
import { DuplikatBanner } from "@/components/kunden/DuplikatBanner";
import { markItemSeen, isItemSeen, getSeenAt, SEEN_KEYS } from "@/lib/seenBadges";
import { findPotentialDuplicates } from "@/lib/duplikatCheck";
import { StickyPagination, usePagination } from "@/components/kunden/StickyPagination";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizeTelefon } from "@/lib/phoneUtils";
import { siehtAlleGeloeschten } from "@/lib/papierkorbRegeln";
import { ladeLeadPakete, leadPaketZuweisungVermerken, offenePaketeFuer, SCHON_GEZAEHLT, type LeadPaketDaten } from "@/lib/leadPaketStore";
import { KEIN_PAKET, LeadPaketAuswahl } from "@/components/leadpakete/LeadPaketAuswahl";



const LEAD_COLORS: Record<string, string> = {
  meta: "bg-blue-500/10 text-blue-600",
  google: "bg-amber-500/10 text-amber-600",
  website: "bg-emerald-500/10 text-emerald-600",
};

const LEAD_LABELS: Record<string, string> = {
  meta: "Funnel Lead",
  google: "Google Ad",
  website: "Website",
};

function formatNoShowDatum(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getLetzterNoShow(k: KundeData): { datum: string; uhrzeit: string; berater: string; gemeldetAm: string } | null {
  const hist = (k as any).noShowHistorie as Array<{ datum: string; uhrzeit: string; berater: string; gemeldetAm: string }> | undefined;
  if (!hist || hist.length === 0) return null;
  return [...hist].sort((a, b) => (b.gemeldetAm || "").localeCompare(a.gemeldetAm || ""))[0];
}

/**
 * Wie lange liegt der Lead schon im Pool.
 *
 * Die Dringlichkeit darf nicht nur an der Farbe haengen: ab einem Tag kommt
 * eine Uhr dazu, ab drei Tagen ein Warndreieck und fetter Text. Damit ist die
 * Reihenfolge auch ohne Farbwahrnehmung ablesbar.
 */
function LiegtSeitZelle({ erstelltAm }: { erstelltAm?: string }) {
  const tage = tageSeit(erstelltAm);
  if (tage === null || tage < 0) {
    return <span className="text-xs text-muted-foreground">–</span>;
  }
  const alarm = tage >= POOL_LEAD_ALARM_TAGE;
  const warnung = !alarm && tage >= POOL_LEAD_WARNUNG_TAGE;
  const text = tage === 0 ? "heute" : tage === 1 ? "1 Tag" : `${tage} Tage`;
  const titel = alarm
    ? `Liegt seit ${tage} Tagen im Pool. Ab ${POOL_LEAD_ALARM_TAGE} Tagen meldet die Nachtprüfung den Lead.`
    : warnung
      ? `Liegt seit ${text} im Pool.`
      : "Heute eingegangen.";
  return (
    <span
      title={titel}
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap",
        alarm && "font-bold text-destructive",
        warnung && "font-semibold text-[hsl(var(--warning))]",
        !alarm && !warnung && "text-muted-foreground",
      )}
    >
      {alarm ? <AlertTriangle className="h-3 w-3 shrink-0" /> : warnung ? <Clock className="h-3 w-3 shrink-0" /> : null}
      {text}
    </span>
  );
}

export default function LeadVerwaltung() {
  const cacheReady = useCacheReady(["kontakte"]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useUser();
  // Hinweis: KEIN `markSeen` mehr beim Öffnen der Liste – das Sidebar-Badge
  // zählt erst herunter, wenn ein einzelner Lead geöffnet ODER zugewiesen wird.
  const isSetterin = user.role === "setterin";
  const isInhaberAdmin = ["inhaber", "admin"].includes(user.role);
  // Papierkorb (weiches Löschen, wiederherstellbar). Die Vertriebsleitung darf
  // das laut Datenbank ebenso, seit dem 26.09.2026 auch mit Knopf. Gekoppelt an
  // die Rollen, die im Papierkorb alle Gelöschten sehen und wiederherstellen,
  // damit niemand etwas wegräumt, das er nicht zurückholen kann. Endgültiges
  // Löschen geschieht im Papierkorb (Admin, Inhaber, Vertriebsleitung).
  const canDelete = siehtAlleGeloeschten(user.role);

  const liveVersion = useLiveVersion(["kontakte"]);
  const myUserId = getCurrentUserId();
  // Die Bedingungen stehen in `leadPool`, damit Liste und Sidebar-Zähler
  // dieselben Leads meinen. Vorher hatte jede Stelle ihre eigene Kopie.
  const kontakte = useMemo(
    () => getKontakte().filter(k => istOffenerPoolLead(k, { rolle: user.role, benutzerId: myUserId })),
    [liveVersion, user.role, myUserId],
  );
  /*
   * Zwei Reiter seit dem 01.10.2026: „Leads“ mit allen offenen Leads außer
   * Rückläufern, und „Rückläufer“. Wer was sieht, entscheidet weiter allein
   * `istOffenerPoolLead` oben, die Vertriebsleitung sieht also wie bisher
   * nur die Handbuch-Leads.
   */
  const ruecklaeufer = useMemo(() => kontakte.filter(istRuecklaeufer), [kontakte]);
  const offeneLeads = useMemo(() => kontakte.filter((k) => !istRuecklaeufer(k)), [kontakte]);
  const ruecklaeuferAnzahl = ruecklaeufer.length;
  // Gruppe für den Quellen-Filter, je Lead einmal.
  const gruppeVon = useMemo(
    () => new Map(kontakte.map((k) => [k.id, quellenGruppe(k, konfiguratorAngabenFuerKontakt(k))])),
    [kontakte],
  );
  /*
   * Wer hat zurückgegeben? Die Kennung steht seit dem 30.09.2026 in der
   * Verlaufsspur. Für ältere Rückläufer holen wir sie aus dem Protokoll der
   * Zuständigkeitswechsel, nur wenn es überhaupt Rückläufer gibt. Wer das
   * Protokoll nicht lesen darf, bekommt nichts (RLS), dann bleibt nur der
   * Name aus der Verlaufsspur.
   */
  const hatRuecklaeufer = ruecklaeuferAnzahl > 0;
  useEffect(() => {
    if (hatRuecklaeufer) void cacheLadeZeilenFuer("activity_log", "action", "kontakt_reassigned");
  }, [hatRuecklaeufer]);
  const logVersion = useLiveVersion(["activity_log"]);
  const umhaengungen = useMemo(
    () => hatRuecklaeufer
      ? cacheGet("activity_log").map(umhaengungAusLog).filter((u): u is Umhaengung => !!u && !u.neu)
      : [],
    [hatRuecklaeufer, logVersion],
  );
  const ruecklaufVon = (k: KundeData | null | undefined): RueckgabeInfo | null => {
    const info = rueckgabeInfo(k);
    if (!info || info.vonId || !k) return info;
    return { ...info, vonId: kennungAusProtokoll(k.id, info.am, umhaengungen) };
  };
  const [search, setSearch] = useState("");
  const [filterQuelle, setFilterQuelle] = useState("-");
  // Voreinstellung: das, was am längsten wartet, steht oben. Alle Leads hier
  // sind unzugewiesen, deshalb ist "älteste zuerst" die richtige Reihenfolge.
  // Mit "neueste zuerst" sanken alte Leads auf hintere Seiten und fielen nicht auf.
  const [sortField, setSortField] = useState("liegtSeit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [assignDialog, setAssignDialog] = useState<KundeData | null>(null);
  /*
   * Angehakter Lead in „Meta-Kampagnen“ oder „Rückläufer“ (seit 30.09.2026). Genau einer, denn
   * zugewiesen wird je Lead über den Einzeldialog; eine Mehrfachauswahl gibt
   * es seit dem 26.09.2026 bewusst nicht mehr.
   */
  const [ausgewaehltId, setAusgewaehltId] = useState<string | null>(null);
  const [selectedBerater, setSelectedBerater] = useState("");
  const [assignLaeuft, setAssignLaeuft] = useState(false);
  // Leadpakete für das Feld „aus Paket“. `null` bei der Paketwahl heißt:
  // noch nichts gewählt, dann gilt das älteste offene Paket.
  const [paketDaten, setPaketDaten] = useState<LeadPaketDaten | null>(null);
  const [paketWahl, setPaketWahl] = useState<string | null>(null);
  /*
   * Reiter „leads“ (vorausgewählt) oder „ruecklaeufer“. Er steht nur im
   * Zustand der Seite, nicht in der Adresse oder im Speicher, ein alter Wert
   * kann also nicht hängen bleiben. Leads über ein Partnerkürzel stehen hier
   * gar nicht, sie gehören sofort dem Partner.
   */
  const [bereich, setBereich] = useState<"leads" | "ruecklaeufer">("leads");
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  // Zählt bei jedem „Aktualisieren“ hoch, damit auch der Handbuch-Stand neu lädt.
  const [aktualisierung, setAktualisierung] = useState(0);
  const [beraterList, setBeraterList] = useState<{ id: string; name: string }[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newLead, setNewLead] = useState({ anrede: "", vorname: "", nachname: "", email: "", telefon: "", quelle: "", leadTyp: "manuell" as string, strasse: "", hausnummer: "", plz: "", ort: "" });
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const updField = (field: string, value: string) => {
    setNewLead(p => ({ ...p, [field]: value }));
    if (formErrors[field]) setFormErrors(e => ({ ...e, [field]: false }));
  };
  const fieldClass = (field: string) => formErrors[field] ? "border-destructive ring-1 ring-destructive/30" : "";

  const handleCreateLead = async () => {
    const required: Record<string, string> = { vorname: newLead.vorname.trim(), nachname: newLead.nachname.trim(), telefon: newLead.telefon.trim() };
    if (isSetterin) {
      required.email = (newLead.email || "").trim();
      required.quelle = (newLead.quelle || "").trim();
    }
    const errors: Record<string, boolean> = {};
    Object.entries(required).forEach(([k, v]) => { if (!v) errors[k] = true; });
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: "Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }

    // Duplikat-Check nach der Regel in duplikatCheck.ts: gleiche E-Mail, gleiche
    // Telefonnummer oder gleicher voller Name, keine Aehnlichkeitssuche.
    const dupes = findPotentialDuplicates(
      { vorname: newLead.vorname, nachname: newLead.nachname, email: newLead.email, telefon: newLead.telefon },
      getKontakte()
    );
    if (dupes.length > 0) {
      const hard = dupes.find(d => d.grund === "email" || d.grund === "telefon");
      if (hard) {
        toast({
          title: hard.grund === "email" ? "E-Mail bereits vergeben" : "Telefonnummer bereits vergeben",
          description: `Bereits zugeordnet: "${hard.kontakt.vorname} ${hard.kontakt.nachname}" (${hard.detail}).`,
          variant: "destructive",
          action: (
            <Button variant="outline" size="sm" onClick={() => navigate(`/kunden/${hard.kontakt.id}`)}>
              Zum Kontakt
            </Button>
          ),
        });
        return;
      }
      const soft = dupes[0];
      const proceed = await confirmDialog({
        title: "Möglicher Duplikat-Kontakt gefunden",
        description:
          `Es gibt bereits ${soft.kontakt.vorname} ${soft.kontakt.nachname} (gleicher Name). Soll trotzdem ein neuer Lead angelegt werden?`,
        confirmText: "Trotzdem anlegen",
        cancelText: "Nicht anlegen",
      });
      if (!proceed) return;
    }

    // Lead-Pool-Logik: Setter und Admins legen Leads im Pool an (ohne Vertriebspartner),
    // damit sie später zugewiesen werden können. Vertriebspartner & andere Rollen
    // bekommen den Lead direkt sich selbst zugeordnet.
    const isPoolCreator = isSetterin || isInhaberAdmin;
    const createdContact = addKontakt({
      anrede: newLead.anrede,
      vorname: newLead.vorname.trim(),
      nachname: newLead.nachname.trim(),
      email: newLead.email,
      telefon: normalizeTelefon(newLead.telefon),
      quelle: newLead.quelle,
      strasse: newLead.strasse,
      hausnummer: newLead.hausnummer,
      plz: newLead.plz,
      ort: newLead.ort,
      leadTyp: newLead.leadTyp || "manuell",
      pipelineStufe: "neuer_lead",
      berater: isPoolCreator ? "" : user.name,
      // Wichtig: Bei Pool-Anlage (Setterin/Admin/Inhaber) muss zustaendig_id explizit leer
      // gesetzt werden, sonst übernimmt addKontakt() den anlegenden User automatisch
      // als Zuständigen → Lead würde fälschlich z. B. Christian Peetz zugeordnet werden.
      zustaendig_id: isPoolCreator ? "" : undefined,
      // Auto-Attribution: Wenn die anlegende Person eine Setterin ist,
      // werden Name UND UUID automatisch als Setter-Attribution gesetzt
      // (für ROI-/KPI-Tracking und robuste Filterung in der Lead-Verwaltung).
      setter: isSetterin ? user.name : "",
      setterId: isSetterin ? (myUserId || undefined) : undefined,
      setterName: isSetterin ? user.name : undefined,
    } as any);

    // Auto-Bestätigungsmail an den Lead, wenn Setterin angelegt hat & E-Mail vorhanden
    const leadEmail = (newLead.email || "").trim();
    if (isSetterin && leadEmail) {
      const sendIt = (id?: string) => {
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "setter-lead-bestaetigung",
            recipientEmail: leadEmail,
            idempotencyKey: `setter-lead-confirm-${id || `${leadEmail}-${Date.now()}`}`,
            ...(id ? { kontaktId: id } : {}),
            templateData: {
              kundeName: `${newLead.vorname.trim()} ${newLead.nachname.trim()}`.trim(),
              telefon: newLead.telefon.trim(),
            },
          },
        }).catch((err) => console.error("Setter-Lead-Bestätigungsmail fehlgeschlagen:", err));
      };
      if (createdContact && typeof (createdContact as any).then === "function") {
        (createdContact as any).then((c: any) => sendIt(c?.id)).catch(() => sendIt());
      } else {
        sendIt((createdContact as any)?.id);
      }
    }
    toast({ title: "Lead angelegt ✓", description: `${newLead.vorname} ${newLead.nachname}` });
    setCreateDialogOpen(false);
    setNewLead({ anrede: "", vorname: "", nachname: "", email: "", telefon: "", quelle: "", leadTyp: "manuell", strasse: "", hausnummer: "", plz: "", ort: "" });
    setFormErrors({});
  };

  // Load real users from profiles, filtered to assignable roles only
  // (vertriebspartner, vertriebsleiter, admin, inhaber)
  useEffect(() => {
    (async () => {
      const ALLOWED = ["vertriebspartner", "vertriebsleiter", "admin", "inhaber"];
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ALLOWED as any);
      const ids = Array.from(new Set((roleRows || []).map((r: any) => r.user_id).filter(Boolean)));
      if (ids.length === 0) { setBeraterList([]); return; }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, gesperrt")
        .in("id", ids);
      const list = (profs || [])
        .filter((p: any) => p.name && !p.gesperrt)
        .map((p: any) => ({ id: p.id as string, name: p.name as string }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setBeraterList(list);
    })();
  }, []);

  // Realtime handled by useLiveVersion + dataCache realtime sync
  // Zusätzliche Sicherheit: bei Mount sofort frisch aus DB ziehen + alle 30s
  // pollen, damit Zapier-Leads garantiert ohne manuellen Klick erscheinen,
  // selbst wenn der Realtime-Channel kurzzeitig getrennt war.
  useEffect(() => {
    void cacheRefreshTable("kontakte");
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void cacheRefreshTable("kontakte");
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // CSV Export
  const handleExport = () => {
    const headers = ["Vorname", "Nachname", "E-Mail", "Telefon", "Quelle", "Lead-Typ", "Vertriebspartner", "Status", "Erstellt am", "Ort"];
    const rows = kontakte.map(k => [
      k.vorname, k.nachname, k.email, k.telefon, k.quelle || "", k.leadTyp || "", k.berater || "", k.status || "neu", k.erstellt_am || "", k.ort || ""
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers.join(";"), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export abgeschlossen ✓", description: `${kontakte.length} Leads exportiert` });
  };

  // CSV Import
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target?.result as string;
        if (!text) return;
        const lines = text.split("\n").filter(l => l.trim());
        if (lines.length < 2) { toast({ title: "Leere Datei", variant: "destructive" }); return; }
        const sep = lines[0].includes(";") ? ";" : ",";
        const headers = lines[0].split(sep).map(h => h.replace(/"/g, "").trim().toLowerCase());
        
        const findCol = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));
        const iName = findCol(["name", "full_name", "full name", "kontakt"]);
        const iVorname = findCol(["vorname", "first_name", "first name"]);
        const iNachname = findCol(["nachname", "last_name", "last name", "surname"]);
        const iEmail = findCol(["email", "e-mail", "mail"]);
        const iTelefon = findCol(["telefon", "phone", "phone_number", "telefonnummer", "mobilnummer"]);
        const iQuelle = findCol(["quelle", "source", "form_name", "formular"]);
        const iOrt = findCol(["ort", "city", "stadt"]);
        
        let imported = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(sep).map(c => c.replace(/"/g, "").trim());
          let vorname = iVorname >= 0 ? cols[iVorname] || "" : "";
          let nachname = iNachname >= 0 ? cols[iNachname] || "" : "";
          
          // If no separate vorname/nachname, try "Name" column (full name)
          if (!vorname && !nachname && iName >= 0) {
            const fullName = cols[iName] || "";
            if (fullName.includes(" ")) {
              const parts = fullName.split(" ");
              vorname = parts[0];
              nachname = parts.slice(1).join(" ");
            } else {
              vorname = fullName;
              nachname = "";
            }
          }
          
          // Handle full_name in vorname column
          if (vorname && !nachname && vorname.includes(" ")) {
            const parts = vorname.split(" ");
            vorname = parts[0];
            nachname = parts.slice(1).join(" ");
          }
          
          if (!vorname && !nachname) continue;
          
          try {
            await addKontakt({
              vorname,
              nachname,
              email: iEmail >= 0 ? cols[iEmail] || "" : "",
              telefon: iTelefon >= 0 ? cols[iTelefon] || "" : "",
              quelle: iQuelle >= 0 ? cols[iQuelle] || "" : "",
              ort: iOrt >= 0 ? cols[iOrt] || "" : "",
              leadTyp: "meta",
              status: "neu",
              pipelineStufe: "neuer_lead",
            } as any);
            imported++;
          } catch {
            // skip failed row
          }
        }
        // Data auto-refreshes via useLiveVersion
        toast({ title: `${imported} Leads importiert ✓` });
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const suchTreffer = (k: KundeData, q: string) =>
    k.vorname.toLowerCase().includes(q) || k.nachname.toLowerCase().includes(q) ||
    k.email.toLowerCase().includes(q) || k.telefon.includes(q) || k.ort.toLowerCase().includes(q);
  const filtered = useMemo(() => {
    let result = bereich === "ruecklaeufer" ? ruecklaeufer : offeneLeads;
    if (filterQuelle !== "-") result = result.filter((k) => gruppeVon.get(k.id) === filterQuelle);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(k => suchTreffer(k, q));
    }
    return result.sort((a, b) => {
      if (sortField === "liegtSeit") {
        // Absteigend heißt hier: die meisten Tage zuerst, also älteste zuerst.
        const aT = tageSeit(a.erstellt_am) ?? -1;
        const bT = tageSeit(b.erstellt_am) ?? -1;
        return sortDir === "asc" ? aT - bT : bT - aT;
      }
      if (sortField === "nichtErreichtCount") {
        const aN = (a as any).nichtErreichtCount || 0;
        const bN = (b as any).nichtErreichtCount || 0;
        return sortDir === "asc" ? aN - bN : bN - aN;
      }
      const aV = String((a as any)[sortField] ?? "");
      const bV = String((b as any)[sortField] ?? "");
      return sortDir === "asc" ? aV.localeCompare(bV) : bV.localeCompare(aV);
    });
  }, [ruecklaeufer, offeneLeads, gruppeVon, bereich, search, filterQuelle, sortField, sortDir]);

  // Verschwindet der Lead aus der Liste (zugewiesen, weggefiltert), ist auch
  // der Knopf „Zuweisen an“ weg, statt einen unsichtbaren Lead zuzuweisen.
  // Konfigurator-Stand der Handbuch-Leads, kompakt in der Zeile.
  const handbuchLeads = useMemo(() => kontakte.filter((k) => gruppeVon.get(k.id) === "handbuch"), [kontakte, gruppeVon]);
  const handbuchStand = useHandbuchLeadStand(handbuchLeads, aktualisierung);

  const ausgewaehlterLead = ausgewaehltId ? filtered.find((k) => k.id === ausgewaehltId) ?? null : null;

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };


  const sendAssignNotification = async (
    recipientId: string,
    recipientName: string,
    lead: { id: string; vorname?: string; nachname?: string },
  ) => {
    try {
      const kontaktName = `${lead.vorname || ""} ${lead.nachname || ""}`.trim() || "Neuer Lead";
      await (supabase as any).from("benachrichtigungen").insert({
        benutzer_id: recipientId,
        titel: `🎯 Neuer Lead erhalten: ${kontaktName}`,
        nachricht: `Neuer Lead erhalten: ${kontaktName}. Bitte anrufen und qualifizieren. Viel Erfolg!`,
        link: `/kunden/${lead.id}`,
        gelesen: false,
      });
    } catch (e) {
      console.error("assign notification failed", e);
    }
  };

  // Keine Bestätigungsmail an den Lead bei der Zuweisung. Sie ist am
  // 26.09.2026 auf Christians Wunsch entfallen, der Partner meldet sich
  // selbst. Glocke und Partnermail bleiben unverändert.

  // Beim Öffnen des Dialogs frisch laden, damit „noch offen“ stimmt. Ohne
  // Migration bleibt `paketDaten` leer und das Feld erscheint nicht.
  useEffect(() => {
    if (!assignDialog || isSetterin) return;
    let aktiv = true;
    void ladeLeadPakete().then((d) => { if (aktiv) setPaketDaten(d); });
    return () => { aktiv = false; };
  }, [assignDialog, isSetterin]);
  const offenePakete = selectedBerater && paketDaten ? offenePaketeFuer(selectedBerater, paketDaten) : [];
  const gewaehltesPaket = paketWahl ?? offenePakete[0]?.id ?? KEIN_PAKET;

  const handleAssign = async () => {
    if (!assignDialog || !selectedBerater || assignLaeuft) return;
    const berater = beraterList.find(b => b.id === selectedBerater);
    if (!berater) return;
    // Zurück an den, der ihn gerade abgegeben hat? Geht, aber nur bewusst.
    const rueck = ruecklaufVon(assignDialog);
    if (rueck?.vonId && rueck.vonId === berater.id) {
      const ja = await confirmDialog({
        title: `Wieder an ${berater.name} zuweisen?`,
        description: `${berater.name} hat diesen Lead am ${formatDatum(rueck.am)} an die Zentrale zurückgegeben${rueck.grundText ? ` (Grund: ${rueck.grundText})` : ""}.`,
        confirmText: "Trotzdem zuweisen",
        cancelText: "Anderen wählen",
      });
      if (!ja) return;
    }
    setAssignLaeuft(true);
    try {
      const ergebnis = await leadZuweisenWennFrei(assignDialog.id, berater);
      if (ergebnis.status !== "ok") {
        if (ergebnis.status === "vergeben") {
          toast({
            title: "Diesen Lead hat gerade jemand anderes übernommen",
            description: ergebnis.belegtVon
              ? `Zuständig ist jetzt ${ergebnis.belegtVon}.`
              : "Die Zuweisung wurde nicht gespeichert.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Zuweisung fehlgeschlagen", description: ergebnis.meldung, variant: "destructive" });
        }
        await cacheRefreshTable("kontakte");
        setAssignDialog(null);
        setSelectedBerater("");
        return;
      }
      markItemSeen(SEEN_KEYS.leadVerwaltung, assignDialog.id);
      if (ausgewaehltId === assignDialog.id) setAusgewaehltId(null);
      // Die Zuweisung steht schon; scheitert nur der Vermerk, sagen wir es
      // deutlich, statt die Zuweisung zurückzudrehen. Es gibt nur einen
      // Toast zur Zeit (TOAST_LIMIT), deshalb dann keine grüne Meldung, sie
      // würde die rote überdecken.
      const vermerk =
        offenePakete.length > 0 && gewaehltesPaket !== KEIN_PAKET
          ? await leadPaketZuweisungVermerken(gewaehltesPaket, assignDialog.id)
          : { ok: true };
      await sendAssignNotification(berater.id, berater.name, assignDialog);
      if (vermerk.ok) {
        toast({
          title: "Lead zugewiesen ✓",
          description: `${assignDialog.vorname} ${assignDialog.nachname} → ${berater.name}`,
        });
      } else {
        toast({
          title: "Lead zugewiesen, aber nicht als Paketlieferung vermerkt",
          description:
            vermerk.meldung === SCHON_GEZAEHLT
              ? `${vermerk.meldung} Reklamiere ihn erst dort, wenn er hier zählen soll.`
              : `${vermerk.meldung} Du kannst die Lieferung unter Statistik, Lead-Zuweisung, Leadpakete nachtragen.`,
          variant: "destructive",
        });
      }
      setAssignDialog(null);
      setSelectedBerater("");
    } finally {
      setAssignLaeuft(false);
    }
  };


  const showAssignActions = !isSetterin;

  /*
   * Löschen je Zeile, nach einer Rückfrage im Projektstil. Der Lead geht wie
   * bisher in den Papierkorb (`deleteKontakte`), wiederherstellbar; eine
   * neue Löschlogik gibt es nicht. Inhaber, Admin und Vertriebsleitung.
   */
  const handleDeleteSingle = async (k: KundeData) => {
    const name = `${k.vorname} ${k.nachname}`.trim();
    const ja = await confirmDialog({
      title: "Lead in den Papierkorb verschieben?",
      description: `${name || "Dieser Lead"} wird in den Papierkorb verschoben und lässt sich dort wiederherstellen.`,
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    });
    if (!ja) return;
    try {
      await deleteKontakte([k.id], { geloeschtVonName: user?.name });
      toast({ title: "Lead in Papierkorb verschoben ✓", description: "Wiederherstellbar im Bereich Papierkorb." });
    } catch {
      toast({ title: "Löschen fehlgeschlagen", variant: "destructive" });
    }
  };

  const pagination = usePagination("lead-verwaltung", filtered.length);
  const paged = pagination.slice(filtered);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Lead-Verwaltung"
          subtitle={`${kontakte.length} Leads`}
        />

        <DuplikatBanner kontakte={kontakte} onMerged={() => cacheRefreshTable("kontakte")} />

        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center flex-wrap">
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className={`gap-1.5 transition-all duration-500 ${refreshSuccess ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-600" : ""}`}
              onClick={async () => {
                await cacheRefreshTable("kontakte");
                setAktualisierung((n) => n + 1);
                setRefreshSuccess(true);
                setTimeout(() => setRefreshSuccess(false), 3000);
              }}
            >
              {refreshSuccess ? <Check className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {refreshSuccess ? "Aktualisiert ✓" : "Aktualisieren"}
            </Button>
            {(isInhaberAdmin || isSetterin) && (
              <ImportExportButton kontakte={kontakte} onImportDone={() => cacheRefreshTable("kontakte")} exportFilename="leads" importTarget="leadverwaltung" />
            )}
            <Dialog open={createDialogOpen} onOpenChange={(o) => { setCreateDialogOpen(o); if (!o) setFormErrors({}); }}>
              <DialogTrigger asChild>
                <Button variant="brand" size="sm"><Plus className="h-4 w-4 mr-1" /> Lead anlegen</Button>
              </DialogTrigger>
               <DialogContent className="max-w-3xl w-[95vw]">
                <DialogHeader><DialogTitle>Neuen Lead anlegen</DialogTitle></DialogHeader>
                <div className="grid gap-5 py-4 max-h-[75vh] overflow-y-auto pr-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Anrede *</Label>
                      <Select value={newLead.anrede} onValueChange={v => updField("anrede", v)}>
                        <SelectTrigger className={fieldClass("anrede")}><SelectValue placeholder="–" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Herr">Herr</SelectItem>
                          <SelectItem value="Frau">Frau</SelectItem>
                          <SelectItem value="Divers">Divers</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Vorname *</Label><Input className={fieldClass("vorname")} value={newLead.vorname} onChange={e => updField("vorname", e.target.value)} /></div>
                    <div><Label className="text-xs">Nachname *</Label><Input className={fieldClass("nachname")} value={newLead.nachname} onChange={e => updField("nachname", e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">E-Mail{isSetterin ? " *" : ""}</Label><Input className={fieldClass("email")} type="email" value={newLead.email} onChange={e => updField("email", e.target.value)} /></div>
                    <div><Label className="text-xs">Telefon *</Label><PhoneInput className={fieldClass("telefon")} value={newLead.telefon} onChange={v => updField("telefon", v)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Quelle{isSetterin ? " *" : ""}</Label>
                      <Select value={newLead.quelle} onValueChange={v => updField("quelle", v)}>
                        <SelectTrigger className={fieldClass("quelle")}><SelectValue placeholder="Quelle wählen..." /></SelectTrigger>
                        <SelectContent>
                          {["Website","Instagram","Facebook","LinkedIn","TikTok","Empfehlung","Veranstaltung","Netzwerk","Meta Kampagne","Google Ads","Flyer","Kaltakquise","Sonstige"].map(q => (
                            <SelectItem key={q} value={q}>{q}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Lead-Typ *</Label>
                      <Select value={newLead.leadTyp} onValueChange={v => updField("leadTyp", v)}>
                        <SelectTrigger className={fieldClass("leadTyp")}><SelectValue placeholder="Typ wählen..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manuell">Manuell</SelectItem>
                          <SelectItem value="meta">Funnel Lead</SelectItem>
                          <SelectItem value="google">Google Ad</SelectItem>
                          <SelectItem value="website">Website</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-2"><Label className="text-xs">Straße</Label><Input value={newLead.strasse} onChange={e => updField("strasse", e.target.value)} /></div>
                    <div><Label className="text-xs">Nr.</Label><Input value={newLead.hausnummer} onChange={e => updField("hausnummer", e.target.value)} /></div>
                    <div><Label className="text-xs">PLZ</Label><Input value={newLead.plz} onChange={e => updField("plz", e.target.value)} /></div>
                  </div>
                  <div><Label className="text-xs">Ort</Label><Input value={newLead.ort} onChange={e => updField("ort", e.target.value)} /></div>
                  <Button onClick={handleCreateLead} className="w-full">Lead anlegen</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={bereich} onValueChange={(v) => setBereich(v as "leads" | "ruecklaeufer")}>
          <TabsList>
            <TabsTrigger value="leads" className="gap-1.5">
              Leads
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{offeneLeads.length}</span>
            </TabsTrigger>
            <TabsTrigger value="ruecklaeufer" className="gap-1.5">
              <Undo2 className="h-3.5 w-3.5" />
              Rückläufer
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{ruecklaeuferAnzahl}</span>
            </TabsTrigger>
          </TabsList>
          {(["leads", "ruecklaeufer"] as const).map((reiter) => (
          <TabsContent key={reiter} value={reiter} className="mt-4 space-y-6">
        <div data-ui="card" className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Leads suchen..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Quelle:</span>
              <Select value={filterQuelle} onValueChange={setFilterQuelle}>
                <SelectTrigger className="w-44 h-8" aria-label="Quelle filtern"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">Alle</SelectItem>
                  {QUELLEN_GRUPPEN.map((g) => (
                    <SelectItem key={g.wert} value={g.wert}>{g.text}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ausgewaehlterLead && (
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 ml-auto"
                title={`${ausgewaehlterLead.vorname} ${ausgewaehlterLead.nachname} einem Vertriebspartner zuweisen`}
                onClick={() => { setAssignDialog(ausgewaehlterLead); setSelectedBerater(""); }}
              >
                <UserPlus className="h-3.5 w-3.5" /> Zuweisen an
              </Button>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"><span className="sr-only">Auswahl</span></TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("erstellt_am")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Eingang <SortIcon field="erstellt_am" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("liegtSeit")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Liegt seit <SortIcon field="liegtSeit" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("leadTyp")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Quelle <SortIcon field="leadTyp" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("nachname")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Name <SortIcon field="nachname" /></span>
                </TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("quelle")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Quelle <SortIcon field="quelle" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("qualZiel")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Ziel <SortIcon field="qualZiel" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("qualEinkommen")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Verdienst <SortIcon field="qualEinkommen" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("qualEigenkapital")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Eigenkapital <SortIcon field="qualEigenkapital" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("qualBeruflicheSituation")}>
                  <span className="flex items-center gap-1 text-xs font-semibold">Beruf <SortIcon field="qualBeruflicheSituation" /></span>
                </TableHead>
                
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!cacheReady ? (
                <TableRow>
                   <TableCell colSpan={13}>
                    <TableSkeleton columns={13} rows={6} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                    Keine Leads gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                paged.map(k => (
                  <TableRow
                    key={k.id}
                    className="group cursor-pointer hover:bg-muted/50"
                    onClick={e => {
                      markItemSeen(SEEN_KEYS.leadVerwaltung, k.id);
                      zeilenKlick(e, `/kunden/${k.id}`, navigate);
                    }}
                    onAuxClick={e => {
                      if (e.button === 1) markItemSeen(SEEN_KEYS.leadVerwaltung, k.id);
                      zeilenKlick(e, `/kunden/${k.id}`, navigate);
                    }}
                  >
                    {/* Eigene Zelle ohne Zeilenklick, sonst öffnet das Anhaken den Kontakt. */}
                    <TableCell className="w-8" onClick={e => e.stopPropagation()} onAuxClick={e => e.stopPropagation()}>
                      <Checkbox
                        className="rounded-full"
                        checked={ausgewaehltId === k.id}
                        onCheckedChange={(c) => setAusgewaehltId(c === true ? k.id : null)}
                        aria-label={`${k.vorname} ${k.nachname} auswählen`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDatum(k.erstellt_am)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <LiegtSeitZelle erstelltAm={k.erstellt_am} />
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${LEAD_COLORS[k.leadTyp || ""] || "bg-muted text-muted-foreground"}`}>
                        {LEAD_LABELS[k.leadTyp || ""] || k.leadTyp || "–"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const hist = ((k as any).noShowHistorie || []) as Array<{ datum: string; uhrzeit: string; berater: string; gemeldetAm: string }>;
                          const count = hist.length;
                          if (count === 0) return null;
                          const ns = hist[hist.length - 1];
                          const tooltip = hist.map((h, i) => `${i + 1}. ${formatNoShowDatum(h.datum)}${h.uhrzeit ? " um " + h.uhrzeit : ""}${h.berater ? " mit " + h.berater : ""}`).join("\n");
                          return (
                            <Badge
                              variant="destructive"
                              className="self-start gap-1 text-[10px] font-bold uppercase tracking-wide animate-pulse"
                              title={tooltip}
                            >
                              <XCircle className="h-3 w-3" />
                              {count > 1 ? `${count}× No-Show` : "No-Show"}
                            </Badge>
                          );
                        })()}
                        {/*
                          Rückläufer: von einem Partner an uns zurückgegeben.
                          Wer neu verteilt, muss sehen, dass dieser Lead schon
                          einmal jemandem gehörte, von wem er kam und warum er
                          zurückkam. Ohne diesen Hinweis geht er als frischer
                          Lead durch und der Nächste fängt bei null an.
                        */}
                        {(() => {
                          const info = ruecklaufVon(k);
                          if (!info) return null;
                          const name = info.vonName === "Unbekannter Betreuer" ? "unbekannt" : info.vonName;
                          const verlauf = info.verlauf
                            .map((v, i) => `${i + 1}. ${formatDatum(v.am)} von ${v.name}`)
                            .join("\n");
                          const titel = [
                            info.anzahl > 1 ? `${info.anzahl} mal zurückgegeben:\n${verlauf}` : `Zurückgegeben am ${formatDatum(info.am)}`,
                            info.grundText ? `Grund: ${info.grundText}` : "",
                            info.nichtErreicht > 0 ? `${info.nichtErreicht} mal nicht erreicht` : "",
                          ].filter(Boolean).join("\n");
                          return (
                            <div className="flex flex-col items-start gap-0.5" title={titel}>
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 h-4 border-primary text-primary uppercase tracking-wide"
                              >
                                Rückläufer
                              </Badge>
                              <span className="inline-flex items-center gap-1 text-xs text-primary whitespace-nowrap">
                                <Undo2 className="h-3 w-3 shrink-0" />
                                Zurückgegeben von <span className="font-medium">{name}</span>
                                <span className="text-muted-foreground">
                                  {formatDatum(info.am)}{info.anzahl > 1 ? `, ${info.anzahl}×` : ""}
                                </span>
                              </span>
                            </div>
                          );
                        })()}
                        <span className="text-sm font-medium inline-flex items-center gap-1.5">
                          {(() => {
                            const seenCutoff = getSeenAt(SEEN_KEYS.leadVerwaltung);
                            const isNew =
                              !isItemSeen(SEEN_KEYS.leadVerwaltung, k.id) &&
                              (seenCutoff ? String(k.erstellt_am || "") > seenCutoff : false);
                            return isNew ? (
                              <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500 text-white border-0 hover:bg-emerald-500 uppercase tracking-wide">
                                Neu
                              </Badge>
                            ) : null;
                          })()}
                          {isSetterin && (() => {
                            const istVerloren = k.pipelineStufe === "verloren" || k.status === "verloren";
                            if (istVerloren) return null;
                            const hatNotizen = !!(k.setterSkriptNotizen && String(k.setterSkriptNotizen).trim().length > 0);
                            const hatVersuche = (k.nichtErreichtCount || 0) > 0;
                            const istErsteller = k.erstelltVonId === myUserId || (k as any).setterId === myUserId;
                            if (!istErsteller || hatNotizen || hatVersuche) return null;
                            return (
                              <span
                                title="Bitte zeitnah anrufen – noch kein Erstkontakt"
                                className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-200 dark:bg-amber-900 shrink-0"
                              >
                                <PhoneCall className="h-3 w-3 text-amber-700 dark:text-amber-300" />
                              </span>
                            );
                          })()}
                          {/* Leads ohne jeden Kontaktweg stehen seit der Aufhebung des
                              Geister-Filters in der Liste. Ohne Hinweis haelt man das
                              fehlende Telefon fuer einen Anzeigefehler. */}
                          {fehlenKontaktdaten(k) && (
                            <Badge
                              variant="outline"
                              title="Weder Telefonnummer noch E-Mail hinterlegt. Bitte im Profil ergaenzen."
                              className="text-[9px] px-1.5 py-0 h-4 border-[hsl(var(--warning))] text-[hsl(var(--warning))] uppercase tracking-wide"
                            >
                              Kontaktdaten fehlen
                            </Badge>
                          )}
                          <Link to={`/kunden/${k.id}`} className="hover:underline">{k.anrede} {k.vorname} {k.nachname}</Link>
                          <NeuerTabLink href={`/kunden/${k.id}`} />
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {normalizeTelefon(k.telefon) || "–"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {k.email || "–"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground max-w-[160px] truncate inline-block" title={k.quelle || ""}>
                        {k.quelle || "–"}
                      </span>
                      <HandbuchStandKurz kontakt={k} stand={handbuchStand} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{k.qualZiel || "–"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{k.qualEinkommen || "–"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{k.qualEigenkapital || "–"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{k.qualBeruflicheSituation || "–"}</span>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {/* Kein „Öffnen“ mehr: Der Klick auf die Zeile öffnet das Kundenprofil (Christian, 30.09.2026). */}
                        {isSetterin && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 text-primary hover:text-primary"
                            title="Erstgespräch aufnehmen (Sales Coach)"
                            onClick={() => {
                              window.dispatchEvent(
                                new CustomEvent("salescoach:open", {
                                  detail: { kontaktId: k.id, typ: "erstgespraech" },
                                }),
                              );
                            }}
                          >
                            <Mic className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteSingle(k)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <StickyPagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          showAll={pagination.showAll}
          total={filtered.length}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          onToggleShowAll={pagination.setShowAll}
        />
          </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Single Assign Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={o => !o && setAssignDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lead zuweisen</DialogTitle>
          </DialogHeader>
          {assignDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                <p className="text-sm font-medium">{assignDialog.vorname} {assignDialog.nachname}</p>
                <p className="text-xs text-muted-foreground">{assignDialog.email}</p>
                <p className="text-xs text-muted-foreground">{normalizeTelefon(assignDialog.telefon)}</p>
                <Badge className={`text-[10px] mt-1 ${LEAD_COLORS[assignDialog.leadTyp || ""] || ""}`}>
                  {LEAD_LABELS[assignDialog.leadTyp || ""] || assignDialog.leadTyp}
                </Badge>
              </div>

              {(() => {
                const rueck = ruecklaufVon(assignDialog);
                if (!rueck) return null;
                return (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2">
                    <Undo2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-primary">
                        Rückläufer{rueck.anzahl > 1 ? `, ${rueck.anzahl} mal zurückgegeben` : ""}
                      </p>
                      <p className="text-muted-foreground mt-0.5">
                        Zuletzt zurückgegeben von <strong>{rueck.vonName === "Unbekannter Betreuer" ? "unbekannt" : rueck.vonName}</strong> am {formatDatum(rueck.am)}.
                        {rueck.grundText ? <> Grund: {rueck.grundText}.</> : null}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const ns = assignDialog ? getLetzterNoShow(assignDialog) : null;
                if (!ns) return null;
                return (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-semibold text-destructive">No-Show beim letzten Erstgespräch</p>
                      <p className="text-muted-foreground mt-0.5">
                        Termin am <strong>{formatNoShowDatum(ns.datum)}</strong>
                        {ns.uhrzeit ? <> um <strong>{ns.uhrzeit}</strong></> : null}
                        {ns.berater ? <> mit <strong>{ns.berater}</strong></> : null} wurde nicht wahrgenommen.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Was der Lead im Konfigurator angegeben hat: Rahmen, Ausgang,
                  Antworten. Damit die Leitung sinnvoll zuteilen kann. */}
              <KonfiguratorKurz kontakt={assignDialog} />

              {/* Qualifizierungsfragen */}
              {(assignDialog.qualZiel || assignDialog.qualEinkommen || assignDialog.qualEigenkapital || assignDialog.qualBeruflicheSituation) && (
                <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-primary">Qualifizierungsfragen</p>
                  {assignDialog.qualZiel && (
                    <div><p className="text-[10px] text-muted-foreground">Ziel</p><p className="text-xs">{assignDialog.qualZiel}</p></div>
                  )}
                  {assignDialog.qualEinkommen && (
                    <div><p className="text-[10px] text-muted-foreground">Einkommen</p><p className="text-xs">{assignDialog.qualEinkommen}</p></div>
                  )}
                  {assignDialog.qualEigenkapital && (
                    <div><p className="text-[10px] text-muted-foreground">Eigenkapital</p><p className="text-xs">{assignDialog.qualEigenkapital}</p></div>
                  )}
                  {assignDialog.qualBeruflicheSituation && (
                    <div><p className="text-[10px] text-muted-foreground">Berufliche Situation</p><p className="text-xs">{assignDialog.qualBeruflicheSituation}</p></div>
                  )}
                </div>
              )}

              {/* Gesprächsnotizen */}
              {assignDialog.setterSkriptNotizen && (
                <div className="p-3 bg-accent/30 border border-accent/20 rounded-lg space-y-1">
                  <p className="text-xs font-semibold">Gesprächsnotizen</p>
                  <p className="text-xs whitespace-pre-wrap">{assignDialog.setterSkriptNotizen}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-1 block">Vertriebspartner auswählen</label>
                <Select value={selectedBerater} onValueChange={(v) => { setSelectedBerater(v); setPaketWahl(null); }}>
                  <SelectTrigger><SelectValue placeholder="Vertriebspartner wählen..." /></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      // Kennzeichnung nur über die Kennung, nie über den Namen.
                      const zurueckVon = ruecklaufVon(assignDialog)?.vonId;
                      return beraterList.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                          {b.id === zurueckVon && <span className="ml-1 text-xs text-muted-foreground">(hat zurückgegeben)</span>}
                        </SelectItem>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <LeadPaketAuswahl
                ladeFehler={!!paketDaten?.fehler}
                offene={offenePakete}
                zuweisungen={paketDaten?.zuweisungen || []}
                value={gewaehltesPaket}
                onChange={setPaketWahl}
              />
              <Button onClick={handleAssign} disabled={!selectedBerater || assignLaeuft} className="w-full">
                {assignLaeuft
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Wird zugewiesen…</>
                  : <><UserPlus className="h-4 w-4 mr-1" /> Zuweisen</>}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
