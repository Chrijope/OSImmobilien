import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Pencil, Save, X, Loader2, Shield, Lock, Unlock, Download, CheckCircle2, XCircle, Clock, Trash2, ChevronDown, ScrollText } from "lucide-react";
import { KARRIERE_STUFEN, findKarriereStufe } from "@/lib/karriereStufeHelper";
import { useUser } from "@/contexts/UserContext";
import { ROLES, type UserRole } from "@/types/user";
import { rollenLabel, rollenVarianteVonProfil } from "@/lib/rollenLabel";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { toast } from "sonner";
import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";
import { logAudit } from "@/lib/auditLog";
import { TeamleaderSelect } from "@/components/nutzerverwaltung/TeamleaderSelect";

interface MemberData {
  id: string;
  vorname: string;
  nachname: string;
  imonduId: string;
  rolle: string;
  rolleKey: string;
  alleRollen: { key: string; label: string; color: string }[];
  rolleColor: string;
  email: string;
  telefon: string;
  mobilnummer: string;
  status: string;
  erstelltAm: string;
  letzterLogin: string;
  geburtsdatum: string;
  ueberMich: string;
  strasse: string;
  plzOrt: string;
  land: string;
  avatarUrl?: string;
  istTippgeber: boolean;
  zugeordnet?: string;
  provisionstyp?: string;
  provisionswert?: string;
  notizen?: string;
}

const rolleColorMap: Record<string, string> = {
  inhaber: "bg-yellow-400 text-white",
  admin: "bg-red-500 text-white",
  vertriebspartner: "bg-green-500 text-white",
  objektpartner: "bg-amber-500 text-white",
  finanzierungspartner: "bg-cyan-500 text-white",
  buchhaltung: "bg-orange-500 text-white",
  hausverwaltung: "bg-amber-600 text-white",
  setterin: "bg-purple-400 text-white",
  bewerber: "bg-pink-500 text-white",
  kunde: "bg-teal-500 text-white",
  testaccount: "bg-orange-400 text-white",
  individuell: "bg-gray-500 text-white",
  tippgeber: "bg-gray-400 text-white",
};

const ALL_MENU_ITEMS = [
  { group: "Übersicht", items: [
    { url: "/", label: "Dashboard" }, { url: "/inbox", label: "Inbox" },
    { url: "/email", label: "E-Mail" }, { url: "/kalender", label: "Kalender" }, { url: "/news", label: "News & Updates" },
  ]},
  { group: "Vertrieb", items: [
    { url: "/lead-verwaltung", label: "Lead-Verwaltung" }, { url: "/alle-kontakte", label: "Alle Kontakte" },
    { url: "/kontakte", label: "Kontakte" }, { url: "/neukunden", label: "Neue Leads" },
    { url: "/abwicklung", label: "Abwicklung" }, { url: "/bestandskunden", label: "Bestandskunden" },
    { url: "/pipeline", label: "Pipeline" }, { url: "/empfehlungen", label: "Empfehlungen" },
  ]},
  { group: "Immobilien", items: [
    { url: "/objekte", label: "Objekte" }, { url: "/einheitenspiegel", label: "Einheitenspiegel" },
  ]},
  { group: "Auswertungen", items: [
    { url: "/auswertungen", label: "Auswertungen" }, { url: "/abwicklungsuebersicht", label: "Abwicklungsübersicht" },
    { url: "/statistiken", label: "Statistiken" }, { url: "/analysetool", label: "Analysetool" },
    { url: "/abrechnungen", label: "Abrechnungen" }, { url: "/zielplanung", label: "Zielplanung" },
    { url: "/wettbewerb", label: "Wettbewerb" },
  ]},
  { group: "Tools", items: [
    { url: "/afa-rechner", label: "AfA-Rechner" },
    { url: "/bonitaetsrechner", label: "Bonitätsrechner" }, { url: "/academy", label: "Academy" },
    { url: "/immobilien-lexikon", label: "Immobilien-Lexikon" }, { url: "/praesentation", label: "Präsentation" },
    { url: "/unterlagen", label: "Unterlagen" }, { url: "/chat", label: "Chat" },
    { url: "/support-kontaktieren", label: "Support" },
    { url: "/marketing", label: "Marketing" },
  ]},
  { group: "Helpdesk", items: [{ url: "/helpdesk", label: "Helpdesk" }] },
  { group: "Hausverwaltung", items: [
    { url: "/mieter", label: "Mieter" }, { url: "/vermietung", label: "Vermietung" },
    { url: "/dienstleister", label: "Dienstleister" }, { url: "/hv-tickets", label: "HV-Tickets" },
    { url: "/hv-statistiken", label: "HV-Statistiken" }, { url: "/zaehlerstaende", label: "Zählerstände" },
    { url: "/kautionen", label: "Kautionen" }, { url: "/betriebskostenabrechnung", label: "BK-Abrechnung" },
    { url: "/hv-kommunikation", label: "Kommunikation" }, { url: "/mieterhoehung", label: "Mieterhöhung" },
    { url: "/uebergabeprotokoll", label: "Übergabeprotokoll" }, { url: "/eigentuemer", label: "Eigentümer" },
    { url: "/versicherungen", label: "Versicherungen" }, { url: "/fristenueberwachung", label: "Fristenüberwachung" },
  ]},
  { group: "Team & Admin", items: [
    { url: "/teampartner", label: "Teampartner" }, { url: "/nutzerverwaltung", label: "Nutzerverwaltung" },
    { url: "/ansprechpartner", label: "Ansprechpartner" }, { url: "/berater-microseite", label: "Vertriebspartner-Microseite" },
    { url: "/bewerberprozess", label: "Bewerberprozess" },
  ]},
];

function getAvatarColor(rolle: string) {
  const key = rolle.toLowerCase();
  return rolleColorMap[key]?.split(" ")[0] || "bg-primary";
}

// Delegiert an die zentrale Label-Quelle, damit die Anzeige-Variante
// "Lead-Berater" ueberall gleich aussieht.
const getRolleLabel = rollenLabel;

const ROLE_PRIORITY = ROLES.map(r => r.id);

const statusIcon: Record<string, JSX.Element> = {
  fehlt: <XCircle className="h-4 w-4 text-destructive" />,
  pruefung: <Clock className="h-4 w-4 text-orange-500" />,
  freigegeben: <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

const statusLabel: Record<string, string> = {
  fehlt: "Fehlt",
  pruefung: "In Prüfung",
  freigegeben: "Freigegeben",
};

export default function TeampartnerProfil() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberData | null>(null);

  // Settings & permissions state
  const [settings, setSettings] = useState<any>(null);
  const [unterlagen, setUnterlagen] = useState<any[]>([]);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [initialRoles, setInitialRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [savingPerms, setSavingPerms] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [karriereOverride, setKarriereOverride] = useState<string>("");
  // Opt-In: Sidebar/Routen nach Karrierestufe einschränken. Default AUS
  // (Bestandsschutz — bisherige Vertriebspartner sehen das komplette CRM).
  const [karriereGatingActive, setKarriereGatingActive] = useState<boolean>(false);
  const [customProvisionRate, setCustomProvisionRate] = useState<number | null>(null);
  const [customProvisionRateSetter, setCustomProvisionRateSetter] = useState<number | null>(null);
  const [customProvisionRateEigen, setCustomProvisionRateEigen] = useState<number | null>(null);
  const [provisionLocked, setProvisionLocked] = useState<boolean>(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState<boolean>(false);
  const [teamleaderId, setTeamleaderId] = useState<string | null>(null);

  // Audit-Verlauf
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const canEdit = ["admin", "inhaber"].includes(user.role);
  const canEditProfile = ["admin", "inhaber"].includes(user.role);

  useEffect(() => {
    if (!id) return;
    loadMember();
  }, [id]);

  useEffect(() => {
    if (!id || !canEdit) return;
    let cancelled = false;
    (async () => {
      setLoadingAudit(true);
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .or(`actor.eq.${id},entity_id.eq.${id}`)
        .order("erstellt_am", { ascending: false })
        .limit(200);
      if (!cancelled) {
        if (error) console.error("[TeampartnerProfil] audit_log:", error);
        setAuditEvents((data as any[]) || []);
        setLoadingAudit(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, canEdit]);

  const loadMember = async () => {
    if (!id) return;
    setLoading(true);

    // Try profile first. select("*") statt fester Spaltenliste: rollen_variante
    // darf fehlen, solange die Migration nicht gelaufen ist.
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (profile) {
      // Load all roles
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", id);

      const userRoles = (rolesData || []).map((r: any) => r.role as string);
      const primaryRole = ROLE_PRIORITY.find(r => userRoles.includes(r)) || userRoles[0] || "kunde";
      // Defensiv gelesen: Spalte fehlt, solange die Migration nicht gelaufen ist.
      const rollenVariante = rollenVarianteVonProfil(profile);
      const rolleLabel = getRolleLabel(primaryRole, rollenVariante);
      const nameParts = (profile.name || "").split(" ");

      // Load last login
      const { data: session } = await supabase
        .from("login_sessions")
        .select("last_seen_at")
        .eq("user_id", id)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Load user_settings
      const { data: settingsData } = await supabase
        .from("user_settings")
        .select("einstellungen, unterlagen, onboarding_complete")
        .eq("user_id", id)
        .maybeSingle();

      const einst = (settingsData?.einstellungen as any) || {};
      setSettings(einst);
      setUnterlagen((settingsData as any)?.unterlagen || []);
      setOnboardingComplete((settingsData as any)?.onboarding_complete ?? false);
      setCustomPermissions(einst.custom_permissions || []);
      setKarriereOverride(einst.karriere_override || "");
      setKarriereGatingActive(!!einst.karriere_gating_active);
      setCustomProvisionRate(typeof einst.custom_provision_rate === "number" ? einst.custom_provision_rate : null);
      setCustomProvisionRateSetter(typeof einst.custom_provision_rate_setter === "number" ? einst.custom_provision_rate_setter : null);
      setCustomProvisionRateEigen(typeof einst.custom_provision_rate_eigen === "number" ? einst.custom_provision_rate_eigen : null);
      setProvisionLocked(!!einst.provision_locked);
      setTeamleaderId(einst.teamleader_id || null);
      setSelectedRole(primaryRole);
      setSelectedRoles(userRoles.length > 0 ? userRoles : [primaryRole]);
      setInitialRoles(userRoles.length > 0 ? userRoles : [primaryRole]);

      setMember({
        id: profile.id,
        vorname: nameParts[0] || "",
        nachname: nameParts.slice(1).join(" ") || "",
        imonduId: profile.more_id || "",
        rolle: rolleLabel,
        rolleKey: primaryRole,
        alleRollen: userRoles.map(r => ({
          key: r,
          label: getRolleLabel(r, rollenVariante),
          color: rolleColorMap[r] || "bg-primary text-white",
        })),
        rolleColor: rolleColorMap[primaryRole] || "bg-primary text-white",
        email: profile.email || "",
        telefon: einst.profil?.telefon || "",
        mobilnummer: einst.profil?.mobilnummer || "",
        status: "aktiv",
        erstelltAm: profile.created_at ? new Date(profile.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–",
        letzterLogin: session?.last_seen_at ? new Date(session.last_seen_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–",
        geburtsdatum: profile.geburtstag || einst.profil?.geburtsdatum || "",
        ueberMich: einst.profil?.ueber_mich || "",
        strasse: einst.profil?.strasse ? `${einst.profil.strasse} ${einst.profil.hausnummer || ""}`.trim() : "",
        plzOrt: einst.profil?.plz ? `${einst.profil.plz} ${einst.profil.ort || ""}`.trim() : "",
        land: einst.profil?.land || "Deutschland",
        avatarUrl: profile.avatar_url || undefined,
        istTippgeber: false,
      });
      setLoading(false);
      return;
    }

    // Try tippgeber
    const { data: tippgeber } = await (supabase as any)
      .from("tippgeber")
      .select("*")
      .eq("id", id)
      .single();

    if (tippgeber) {
      setMember({
        id: tippgeber.id,
        vorname: tippgeber.vorname,
        nachname: tippgeber.nachname,
        imonduId: "",
        rolle: "Tippgeber",
        rolleKey: "tippgeber",
        alleRollen: [{ key: "tippgeber", label: "Tippgeber", color: "bg-gray-400 text-white" }],
        rolleColor: "bg-gray-400 text-white",
        email: tippgeber.email || "",
        telefon: tippgeber.telefon || "",
        mobilnummer: "",
        status: tippgeber.status || "aktiv",
        erstelltAm: tippgeber.erstellt_am ? new Date(tippgeber.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "–",
        letzterLogin: "–",
        geburtsdatum: "",
        ueberMich: "",
        strasse: [tippgeber.strasse, tippgeber.hausnummer].filter(Boolean).join(" "),
        plzOrt: [tippgeber.plz, tippgeber.ort].filter(Boolean).join(" "),
        land: tippgeber.land || "Deutschland",
        istTippgeber: true,
        zugeordnet: tippgeber.zugeordnet_name || "",
        provisionstyp: tippgeber.provisionstyp || "euro",
        provisionswert: tippgeber.provisionswert || "",
        notizen: tippgeber.notizen || "",
      });
      setLoading(false);
      return;
    }

    setMember(null);
    setLoading(false);
  };

  const handleSavePermissions = async () => {
    if (!member) return;
    // Delete all existing roles and re-insert selected
    const { error: deleteError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", member.id);
    if (deleteError) throw deleteError;

    if (selectedRoles.length > 0) {
      const inserts = selectedRoles.map(role => ({
        user_id: member.id,
        role: role as any,
      }));
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert(inserts as any);
      if (insertError) throw insertError;
    }

    // Update custom permissions (atomic merge)
    await supabase.rpc("merge_user_settings" as any, {
      _user_id: member.id,
      _patch: { custom_permissions: customPermissions },
    });

    loadMember();
  };

  const isAllowedByRole = (url: string) => isUrlAllowedForRole(url, selectedRole as UserRole);
  const isCustomGranted = (url: string) => customPermissions.includes(url);
  const togglePermission = (url: string) => {
    setCustomPermissions(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);
  };

  // Check which settings sections have missing data
  const profilComplete = settings?.profil?.vorname && settings?.profil?.nachname;
  const gewerbeComplete = settings?.gewerbedaten?.firmenname;
  const steuerComplete = settings?.steuer?.steuernummer || settings?.bank?.iban;
  const unterlagenComplete = unterlagen.length > 0 && unterlagen.every((d: any) => d.status === "freigegeben");

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!member) {
    return (
      <DashboardLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Partner nicht gefunden.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const initials = `${member.vorname[0] || "?"}${member.nachname[0] || "?"}`.toUpperCase();
  

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back link */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </button>

        {/* Profile Header */}
        <div data-ui="card" className="bg-card border rounded-lg p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Avatar className="h-16 w-16 shrink-0">
                {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={`${member.vorname} ${member.nachname}`} />}
                <AvatarFallback className={`${getAvatarColor(member.rolle)} text-white text-lg font-semibold`}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold truncate">{member.vorname} {member.nachname}</h1>
                  <Badge className={member.status === "aktiv" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"} variant="secondary">
                    {member.status === "aktiv" ? "✅ Aktiv" : "Inaktiv"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {member.email}{member.imonduId ? ` · ${member.imonduId}` : ""}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {member.alleRollen.map((r, i) => (
                    <Badge key={i} className={r.color} variant="secondary">{r.label}</Badge>
                  ))}
                </div>
                {member.istTippgeber && member.zugeordnet && (
                  <p className="text-xs text-muted-foreground mt-1">Zugeordnet an: <span className="font-medium">{member.zugeordnet}</span></p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3 md:flex-col md:items-end">
              <div className="text-left md:text-right text-xs text-muted-foreground space-y-1 flex-1 md:flex-none">
                <p>📅 Erstellt: {member.erstelltAm}</p>
                <p>🕐 Login: {member.letzterLogin}</p>
                {!member.istTippgeber && (
                  onboardingComplete ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Onboarding ✓
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-500">
                      <Clock className="h-3 w-3 mr-1" /> Onboarding ausstehend
                    </Badge>
                  )
                )}
              </div>
              {canEdit && !member.istTippgeber && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Nutzer löschen
                </Button>
              )}
            </div>
          </div>

          {/* Role & Status change for admins */}
          {canEdit && !member.istTippgeber && (
            <div className="mt-6 pt-6 border-t space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Rollen ändern</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-sm">
                      {selectedRoles.length} Rolle(n) ausgewählt
                      <ChevronDown className="h-3.5 w-3.5 ml-2 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 max-h-64 overflow-y-auto" align="start">
                    {ROLES.map(r => (
                      <div key={r.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent cursor-pointer"
                        onClick={() => setSelectedRoles(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])}>
                        <Checkbox checked={selectedRoles.includes(r.id)} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="text-sm">{r.label}</span>
                      </div>
                    ))}
                  </PopoverContent>
                </Popover>
                {JSON.stringify([...selectedRoles].sort()) !== JSON.stringify([...initialRoles].sort()) && (
                  <Button size="sm" className="mt-2 w-full" disabled={savingPerms} onClick={async () => {
                    setSavingPerms(true);
                    try {
                      await handleSavePermissions();
                      setInitialRoles([...selectedRoles]);
                      toast.success("Rollen erfolgreich aktualisiert");
                    } catch {
                      toast.error("Fehler beim Speichern der Rollen");
                    } finally {
                      setSavingPerms(false);
                    }
                  }}>
                    {savingPerms ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    Übernehmen
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select defaultValue={member.status}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">✅ Aktiv</SelectItem>
                    <SelectItem value="inaktiv">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedRoles.includes("vertriebspartner") && (
                <div>
                  <TeamleaderSelect
                    userId={member.id}
                    currentTeamleaderId={teamleaderId}
                    onSaved={(newId) => setTeamleaderId(newId)}
                  />
                </div>
              )}
              </div>
              {["vertriebspartner"].some(r => selectedRoles.includes(r)) && (() => {
                // Zentrale Auflösung (Kennung vor Titel), sonst löst der Wert
                // "vertriebspartner" über den gleichnamigen Titel die falsche Stufe auf.
                const activeStufe = findKarriereStufe(karriereOverride) || KARRIERE_STUFEN[0];
                const displayRate = customProvisionRate ?? activeStufe.rate;
                const isCustom = customProvisionRate !== null && customProvisionRate !== activeStufe.rate;
                return (
                <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="text-lg">{activeStufe.emoji}</span>
                      <span>Karrierestufe & Provision</span>
                    </div>
                    <Badge variant="outline" className="text-xs font-bold px-3 py-1">
                      {displayRate} %
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Karrierestufe</Label>
                      <Select value={(() => {
                        // Kennung vor Titel auflösen, zentral im Helper.
                        const match = findKarriereStufe(karriereOverride);
                        return match ? match.id : "auto";
                      })()} onValueChange={async (v) => {
                        if (provisionLocked) {
                          toast.error("Provisionssätze sind festgeschrieben. Bitte zuerst entsperren.");
                          return;
                        }
                        const newVal = v === "auto" ? "" : v;
                        setKarriereOverride(newVal);
                        try {
                          const { error } = await supabase.rpc("merge_user_settings" as any, {
                            _user_id: member.id,
                            _patch: { karriere_override: newVal || null },
                          });
                          if (error) throw error;
                          toast.success(`Karrierestufe ${newVal ? `auf "${KARRIERE_STUFEN.find(s=>s.id===newVal)?.titel||newVal}" gesetzt` : "auf automatisch zurückgesetzt"}`);
                        } catch (err: any) {
                          toast.error(`Fehler: ${err.message}`);
                        }
                      }}>
                        <SelectTrigger className="w-full" disabled={provisionLocked}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">🔄 Automatisch</SelectItem>
                          {/* Neu vergeben wird nur die einheitliche 4-%-Stufe.
                              Hat der Partner bereits eine Bestandsstufe, bleibt
                              sie als Eintrag stehen, damit der aktuelle Wert
                              sichtbar ist und nicht ungewollt wechselt. */}
                          {KARRIERE_STUFEN.filter(s => !s.nurBestand || findKarriereStufe(karriereOverride)?.id === s.id).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.emoji} {s.titel} ({s.rate} %)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Standard-Satz: {activeStufe.rate} %</p>
                      <div className="mt-2 flex items-start gap-2 rounded-md border bg-background/60 p-2">
                        <Switch
                          checked={karriereGatingActive}
                          onCheckedChange={async (v) => {
                            setKarriereGatingActive(v);
                            try {
                              const { error } = await supabase.rpc("merge_user_settings" as any, {
                                _user_id: member.id,
                                _patch: { karriere_gating_active: v },
                              });
                              if (error) throw error;
                              toast.success(v
                                ? "Sidebar wird jetzt nach Karrierestufe gefiltert"
                                : "Sidebar zeigt wieder vollen CRM-Zugriff (Bestandsschutz)");
                            } catch (err: any) {
                              setKarriereGatingActive(!v);
                              toast.error(`Fehler: ${err.message}`);
                            }
                          }}
                        />
                        <div className="space-y-0.5 text-[11px] leading-tight">
                          <p className="font-medium">Sidebar nach Karrierestufe einschränken</p>
                          <p className="text-muted-foreground">
                            Standard AUS: Bestandspartner sehen das komplette CRM. Aktivieren, um nur Module der gewählten Stufe zu zeigen.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Individueller Satz (%)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min={0} max={100} step={0.5}
                          placeholder={`${activeStufe.rate} (Standard)`}
                          value={customProvisionRate ?? ""}
                          onChange={(e) => setCustomProvisionRate(e.target.value === "" ? null : parseFloat(e.target.value))}
                          className="w-full"
                          disabled={provisionLocked}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Allgemeiner Override</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Setter-Lead Satz (%)</Label>
                      <Input
                        type="number" min={0} max={100} step={0.01}
                        placeholder="z. B. 5"
                        value={customProvisionRateSetter ?? ""}
                        onChange={(e) => setCustomProvisionRateSetter(e.target.value === "" ? null : parseFloat(e.target.value))}
                        disabled={provisionLocked}
                      />
                      <p className="text-[10px] text-muted-foreground">Bei Leads mit Setter-Zuweisung</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Eigen-Kontakt Satz (%)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min={0} max={100} step={0.01}
                          placeholder="z. B. 7.14"
                          value={customProvisionRateEigen ?? ""}
                          onChange={(e) => setCustomProvisionRateEigen(e.target.value === "" ? null : parseFloat(e.target.value))}
                          disabled={provisionLocked}
                        />
                        <Button size="sm" variant="outline" disabled={provisionLocked} onClick={async () => {
                          try {
                            const vorher = {
                              custom_provision_rate: (member as any)?.einstellungen?.custom_provision_rate ?? null,
                              custom_provision_rate_setter: (member as any)?.einstellungen?.custom_provision_rate_setter ?? null,
                              custom_provision_rate_eigen: (member as any)?.einstellungen?.custom_provision_rate_eigen ?? null,
                            };
                            const { error } = await supabase.rpc("merge_user_settings" as any, {
                              _user_id: member.id,
                              _patch: {
                                custom_provision_rate: customProvisionRate,
                                custom_provision_rate_setter: customProvisionRateSetter,
                                custom_provision_rate_eigen: customProvisionRateEigen,
                              },
                            });
                            if (error) throw error;
                            void logAudit({
                              action: "provision_satz_override",
                              entity: "user_settings",
                              entityId: member.id,
                              vorher,
                              nachher: {
                                custom_provision_rate: customProvisionRate,
                                custom_provision_rate_setter: customProvisionRateSetter,
                                custom_provision_rate_eigen: customProvisionRateEigen,
                              },
                              meta: { target_user: `${member.vorname} ${member.nachname}` },
                            });
                            toast.success("Provisionssätze gespeichert");
                          } catch (err: any) { toast.error(`Fehler: ${err.message}`); }
                        }}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Selbst angelegte Kontakte</p>
                    </div>
                  </div>
                  {/* Lock-Toggle */}
                  <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-amber-600 dark:text-amber-400">
                        {provisionLocked ? "🔒 Provisionssätze sind festgeschrieben" : "🔓 Provisionssätze können geändert werden"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={provisionLocked ? "outline" : "default"}
                      onClick={async () => {
                        if (provisionLocked) {
                          const ok = await confirmDialog({
                            title: "Provisionssätze entsperren?",
                            description: "Danach lassen sich die Werte wieder ändern.",
                            confirmText: "Entsperren",
                            cancelText: "Festgeschrieben lassen",
                          });
                          if (!ok) return;
                        }
                        try {
                          // Beim Festschreiben: aktuelle Input-Werte MIT speichern,
                          // sonst geht eine ungespeicherte Änderung verloren.
                          const patch: Record<string, any> = provisionLocked
                            ? { provision_locked: false }
                            : {
                                provision_locked: true,
                                provision_locked_at: new Date().toISOString(),
                                custom_provision_rate: customProvisionRate,
                                custom_provision_rate_setter: customProvisionRateSetter,
                                custom_provision_rate_eigen: customProvisionRateEigen,
                              };
                          const { error } = await supabase.rpc("merge_user_settings" as any, {
                            _user_id: member.id,
                            _patch: patch,
                          });
                          if (error) throw error;
                          void logAudit({
                            action: "provision_lock_changed",
                            entity: "user_settings",
                            entityId: member.id,
                            vorher: { provision_locked: provisionLocked },
                            nachher: provisionLocked
                              ? { provision_locked: false }
                              : {
                                  provision_locked: true,
                                  custom_provision_rate: customProvisionRate,
                                  custom_provision_rate_setter: customProvisionRateSetter,
                                  custom_provision_rate_eigen: customProvisionRateEigen,
                                },
                            meta: { target_user: `${member.vorname} ${member.nachname}` },
                          });
                          setProvisionLocked(!provisionLocked);
                          toast.success(
                            provisionLocked
                              ? "Entsperrt"
                              : "🔒 Festgeschrieben — Werte gespeichert und gesperrt"
                          );
                        } catch (err: any) { toast.error(`Fehler: ${err.message}`); }
                      }}
                    >
                      {provisionLocked ? "Entsperren" : "🔒 Festschreiben"}
                    </Button>
                  </div>
                </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profil">
          <TabsList>
            <TabsTrigger value="profil">
              Profil {!profilComplete && <span className="ml-1 w-2 h-2 rounded-full bg-orange-400 inline-block" />}
            </TabsTrigger>
            {!member.istTippgeber && (
              <>
                {!["setterin", "objektpartner", "buchhaltung"].includes(member.rolleKey) && (
                  <>
                    <TabsTrigger value="gewerbedaten">
                      Gewerbedaten {!gewerbeComplete && <span className="ml-1 w-2 h-2 rounded-full bg-orange-400 inline-block" />}
                    </TabsTrigger>
                    <TabsTrigger value="steuer-bank">
                      Steuer & Bank {!steuerComplete && <span className="ml-1 w-2 h-2 rounded-full bg-orange-400 inline-block" />}
                    </TabsTrigger>
                    <TabsTrigger value="unterlagen">
                      Unterlagen {!unterlagenComplete && <span className="ml-1 w-2 h-2 rounded-full bg-orange-400 inline-block" />}
                    </TabsTrigger>
                  </>
                )}
                {canEdit && (
                  <TabsTrigger value="berechtigungen">
                    <Shield className="h-3.5 w-3.5 mr-1" /> Berechtigungen
                  </TabsTrigger>
                )}
                {canEdit && (
                  <TabsTrigger value="verlauf">
                    <ScrollText className="h-3.5 w-3.5 mr-1" /> Verlauf
                  </TabsTrigger>
                )}
              </>
            )}
          </TabsList>

          {/* Profil Tab */}
          <TabsContent value="profil" className="mt-4">
            <div className="grid grid-cols-2 gap-6">
              <div data-ui="card" className="bg-card border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">⚙️ Persönliche Daten</h3>
                  {canEditProfile && !editing && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="h-3 w-3 mr-1" /> Bearbeiten
                    </Button>
                  )}
                  {canEditProfile && editing && (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="h-3 w-3 mr-1" /> Abbrechen</Button>
                      <Button size="sm" onClick={() => setEditing(false)}><Save className="h-3 w-3 mr-1" /> Speichern</Button>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {[
                    ["Vorname", member.vorname],
                    ["Nachname", member.nachname],
                    ["E-Mail", member.email],
                    ["Telefon", member.telefon || "–"],
                    ["Mobilnummer", member.mobilnummer || "–"],
                    ["Geburtsdatum", member.geburtsdatum || "–"],
                    ["Über mich", member.ueberMich || "–"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      {editing ? (
                        <Input defaultValue={value === "–" ? "" : value} className="w-48 h-8 text-sm text-right" />
                      ) : (
                        <span className="text-sm font-medium">{value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div data-ui="card" className="bg-card border rounded-lg p-6">
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">📍 Adresse</h3>
                <div className="space-y-3">
                  {[
                    ["Straße", member.strasse || "–"],
                    ["PLZ / Ort", member.plzOrt || "–"],
                    ["Land", member.land || "–"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      {editing ? (
                        <Input defaultValue={value === "–" ? "" : value} className="w-48 h-8 text-sm text-right" />
                      ) : (
                        <span className="text-sm font-medium">{value}</span>
                      )}
                    </div>
                  ))}
                </div>

                {member.istTippgeber && member.notizen && (
                  <div className="mt-6 pt-4 border-t">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">📝 Notizen</h3>
                    <p className="text-sm text-muted-foreground">{member.notizen}</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Gewerbedaten Tab */}
          <TabsContent value="gewerbedaten" className="mt-4">
            <div data-ui="card" className="bg-card border rounded-lg p-6">
              <h3 className="font-semibold text-sm mb-4">🏢 Gewerbedaten</h3>
              <div className="grid grid-cols-2 gap-6">
                {(() => {
                  const g = settings?.gewerbedaten || {};
                  const strasse = [g.strasse, g.hausnummer].filter(Boolean).join(" ").trim();
                  const plzOrt = [g.plz, g.ort].filter(Boolean).join(" ").trim();
                  const gewerbeAnschrift = [strasse, plzOrt, g.land].filter(Boolean).join(", ").trim();
                  return [
                    ["Firmenname", g.firmenname],
                    ["Rechtsform", g.rechtsform],
                    ["Gewerbe-Anschrift", gewerbeAnschrift],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between py-1.5 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <span className="text-sm font-medium">{value || "–"}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </TabsContent>

          {/* Steuer & Bank Tab */}
          <TabsContent value="steuer-bank" className="mt-4">
            <div className="grid grid-cols-2 gap-6">
              <div data-ui="card" className="bg-card border rounded-lg p-6">
                <h3 className="font-semibold text-sm mb-4">🏦 Bankdaten</h3>
                <div className="space-y-3">
                  {[
                    ["Kontoinhaber", settings?.bank?.kontoinhaber],
                    ["IBAN", settings?.bank?.iban],
                    ["BIC", settings?.bank?.bic],
                    ["Bank", settings?.bank?.bank],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <span className="text-sm font-medium">{value || "–"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div data-ui="card" className="bg-card border rounded-lg p-6">
                <h3 className="font-semibold text-sm mb-4">📋 Steuerdaten</h3>
                <div className="space-y-3">
                  {[
                    ["Steuernummer", settings?.steuer?.steuernummer],
                    ["Finanzamt", settings?.steuer?.finanzamt],
                    ["Steuer-ID", settings?.steuer?.steuer_id],
                    ["Kleinunternehmerregelung", settings?.steuer?.kleinunternehmer ? "Ja" : settings?.steuer?.kleinunternehmer === false ? "Nein" : undefined],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <span className="text-sm font-medium">{(value as string) || "–"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Unterlagen Tab */}
          <TabsContent value="unterlagen" className="mt-4">
            <div data-ui="card" className="bg-card border rounded-lg p-6">
              <h3 className="font-semibold text-sm mb-4">📁 Unterlagen & Dokumente</h3>
              {unterlagen.length > 0 ? (
                <div className="space-y-2">
                  {unterlagen.map((doc: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 rounded border">
                      <div className="flex items-center gap-2">
                        {statusIcon[doc.status] || statusIcon.fehlt}
                        <span className="text-sm">{doc.name || doc.label || `Dokument ${i + 1}`}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {statusLabel[doc.status] || "Fehlt"}
                        </Badge>
                        {doc.url && (
                          <Button variant="ghost" size="sm" onClick={() => window.open(doc.url, "_blank")}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">Keine Unterlagen hinterlegt.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Berechtigungen Tab (admin only) */}
          {canEdit && (
            <TabsContent value="berechtigungen" className="mt-4 space-y-4">
              <div data-ui="card" className="bg-card border rounded-lg p-6">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Sidebar-Berechtigungen
                </h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Grün = durch Rolle freigeschaltet. Du kannst einzelne Menüpunkte manuell freischalten.
                </p>

                <div className="space-y-4">
                  {ALL_MENU_ITEMS.map(group => (
                    <div key={group.group}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.group}</p>
                      <div className="space-y-1">
                        {group.items.map(item => {
                          const allowedByRole = isAllowedByRole(item.url);
                          const customGranted = isCustomGranted(item.url);
                          const effectivelyAllowed = allowedByRole || customGranted;

                          return (
                            <div key={item.url} className="flex items-center justify-between py-1.5 px-3 rounded hover:bg-accent">
                              <div className="flex items-center gap-2">
                                {effectivelyAllowed ? (
                                  <Unlock className="h-3.5 w-3.5 text-green-600" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 text-red-500" />
                                )}
                                <span className={`text-sm ${effectivelyAllowed ? "" : "text-muted-foreground"}`}>{item.label}</span>
                                {allowedByRole && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">Rolle</Badge>
                                )}
                                {customGranted && !allowedByRole && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 border-green-500 text-green-600">Manuell</Badge>
                                )}
                              </div>
                              {!allowedByRole && (
                                <Switch
                                  checked={customGranted}
                                  onCheckedChange={() => togglePermission(item.url)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="my-4" />

                <div className="flex justify-end">
                  <Button onClick={handleSavePermissions} disabled={savingPerms}>
                    {savingPerms && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Berechtigungen speichern
                  </Button>
                </div>
              </div>
            </TabsContent>
          )}

          {/* Verlauf Tab (Audit-Log für diesen Nutzer) */}
          {canEdit && (
            <TabsContent value="verlauf" className="mt-4">
              <div data-ui="card" className="bg-card border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <ScrollText className="h-4 w-4" /> Verlauf
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {auditEvents.length} Eintrag{auditEvents.length === 1 ? "" : "e"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Alle protokollierten Aktionen, bei denen dieser Nutzer Akteur oder betroffen war (z. B. Provisions­änderungen, Lock/Unlock).
                </p>
                {loadingAudit ? (
                  <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Lade Verlauf …
                  </div>
                ) : auditEvents.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Noch keine Einträge.
                  </div>
                ) : (
                  <div className="divide-y">
                    {auditEvents.map((e: any) => (
                      <details key={e.id} className="py-2 group">
                        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Badge variant="secondary" className="text-[10px]">{e.entity}</Badge>
                            <span className="text-xs font-medium truncate">{e.action}</span>
                            <span className="text-[10px] text-muted-foreground truncate">
                              {e.actor === id ? "als Akteur" : "betroffen"}
                            </span>
                            {(() => {
                              const src = e.nachher ?? e.vorher ?? {};
                              const parts: string[] = [];
                              if (typeof src.custom_provision_rate === "number") parts.push(`Std ${src.custom_provision_rate}%`);
                              if (typeof src.custom_provision_rate_setter === "number") parts.push(`Setter ${src.custom_provision_rate_setter}%`);
                              if (typeof src.custom_provision_rate_eigen === "number") parts.push(`Eigen ${src.custom_provision_rate_eigen}%`);
                              if (typeof src.provision_locked === "boolean") parts.push(src.provision_locked ? "🔒 gesperrt" : "🔓 entsperrt");
                              return parts.length > 0 ? (
                                <span className="text-[10px] text-foreground/80 truncate hidden md:inline">
                                  {parts.join(" · ")}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {new Date(e.erstellt_am).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </summary>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                          <div>
                            <div className="font-semibold mb-1">Vorher</div>
                            <pre className="bg-muted/40 p-2 rounded overflow-auto max-h-48">{JSON.stringify(e.vorher ?? null, null, 2)}</pre>
                          </div>
                          <div>
                            <div className="font-semibold mb-1">Nachher</div>
                            <pre className="bg-muted/40 p-2 rounded overflow-auto max-h-48">{JSON.stringify(e.nachher ?? null, null, 2)}</pre>
                          </div>
                          <div>
                            <div className="font-semibold mb-1">Meta</div>
                            <pre className="bg-muted/40 p-2 rounded overflow-auto max-h-48">{JSON.stringify(e.meta ?? {}, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nutzer endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du <strong>{member?.vorname} {member?.nachname}</strong> ({member?.email}) wirklich unwiderruflich löschen? 
              Alle zugehörigen Daten (Rollen, Einstellungen, Sessions, Benachrichtigungen) werden ebenfalls entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!member) return;
                setDeleting(true);
                try {
                  await Promise.all([
                    supabase.from("user_roles").delete().eq("user_id", member.id),
                    supabase.from("user_settings").delete().eq("user_id", member.id),
                    supabase.from("benachrichtigungen").delete().eq("benutzer_id", member.id),
                    supabase.from("login_sessions").delete().eq("user_id", member.id),
                  ]);
                  await supabase.from("profiles").delete().eq("id", member.id);
                  const { error } = await supabase.functions.invoke("invite-user", {
                    body: { action: "delete", userId: member.id },
                  });
                  if (error) throw error;
                  toast.success(`${member.vorname} ${member.nachname} wurde gelöscht.`);
                  navigate("/nutzerverwaltung");
                } catch (err: any) {
                  toast.error(`Fehler beim Löschen: ${err.message}`);
                } finally {
                  setDeleting(false);
                  setShowDeleteDialog(false);
                }
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
