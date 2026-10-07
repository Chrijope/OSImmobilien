import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { OVERHEAD_AKTIV } from "@/lib/lizenzPakete";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Search, UserPlus, MoreHorizontal, Shield, CheckCircle, XCircle, AlertCircle, Loader2, Flag, ArrowUpDown } from "lucide-react";
import NutzerProfilDialog from "@/components/nutzerverwaltung/NutzerProfilDialog";
import { KontoAbschaltenDialog } from "@/components/nutzerverwaltung/KontoAbschaltenDialog";
import { PageHeader } from "@/components/PageHeader";
import { ROLES, type UserRole } from "@/types/user";
import { rollenLabel, rollenVarianteVonProfil, LEAD_BERATER_LABEL, ROLLEN_VARIANTE_LEAD_BERATER } from "@/lib/rollenLabel";
import { RolePermissionsEditor } from "@/components/nutzerverwaltung/RolePermissionsEditor";
import { DokumentFreigabeRollen } from "@/components/nutzerverwaltung/DokumentFreigabeRollen";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { beendeSitzungenVon, sitzungenNachSperreBeenden } from "@/lib/sitzungenBeenden";
import { useUser } from "@/contexts/UserContext";
import { getEffectiveRate, getKarriereOverrideForUser, getKarriereStufe, getCustomProvisionRateSetter, getCustomProvisionRateEigen, KARRIERE_STUFEN, NEUVERGABE_KARRIERE_STUFEN, formatStufenProvision } from "@/lib/karriereStufeHelper";
import { useLiveVersion } from "@/hooks/useLiveData";
import { cacheRefreshTable } from "@/lib/dataCache";
import { PhoneInput } from "@/components/ui/phone-input";

const ModerationTab = lazy(() => import("@/components/moderation/ModerationTab"));

export interface Nutzer {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  privateEmail: string;
  moreId: string;
  /** Anzeigename der Hauptrolle (kann "Lead-Berater" sein). NIE vergleichen, dafuer gibt es rolleId. */
  rolle: string;
  /** Kennung der Hauptrolle, z. B. "vertriebspartner". Massgeblich fuer Filter und Logik. */
  rolleId: string;
  /** Anzeige-Variante aus profiles.rollen_variante ('lead_berater' oder leer). */
  rollenVariante?: string;
  rollen: string[];
  rolleColor: string;
  status: "aktiv" | "inaktiv";
  einladung: "angenommen" | "ausstehend" | "abgelaufen";
  erstelltAm: string;
  letzterLogin: string;
  karriereStufe: string;
  isNew?: boolean;
  avatarUrl?: string;
  crmFreigeschaltet: boolean;
  /**
   * Konto abgeschaltet. Achtung, nicht mit `status` verwechseln: `status`
   * bedeutet "gerade angemeldet", `gesperrt` bedeutet "kommt gar nicht mehr
   * rein". Geprüft wird das beim Anmelden in `Login.tsx` und beim Laden des
   * Profils in `UserContext.tsx`.
   */
  gesperrt: boolean;
  gesperrtGrund?: string;
}

// Vorteile sind Anzeige-Texte dieser Seite. Kennung, Titel, Emoji und Saetze
// kommen aus der kanonischen Stufen-Definition in karriereStufeHelper.
const KARRIERE_STUFEN_VORTEILE: Record<string, string[]> = {
  tippgeber: ["Vollzugriff CRM & Pipeline", "Academy Grundkurse", "Persönliches Vertriebspartner-Microsite", "Setterin-Leads (gegen Setter-Satz)"],
  vertriebspartner: ["Einheitlich 4 % auf Lead- und Eigenkontakte", "Vollzugriff CRM & Pipeline", "Academy inkl. Aufbau- & Tax-Kursen", "Eigene Empfehlungsprogramme", "Erweiterte Beratungs-Präsentation"],
  manager: ["Alles aus Vertriebspartner", "Vertriebspartner werben & coachen", "1,5 % Override auf jeden Junior-Abschluss", "Team-Dashboard & Statistiken", "Zielplanungs-Tool für das Team"],
  vertriebsfirma: ["Alles aus Team Lead", "2 % Override auf jeden Junior-Abschluss", "Whitelabel-Optionen für eigene Marke", "Direkter Ansprechpartner aus der Geschäftsleitung", "Strategische Mitgestaltung"],
};

// Neuvergabe im Einladedialog: nur noch die einheitliche 4-%-Stufe.
// Bestandsstufen bleiben in KARRIERE_STUFEN und werden fuer bestehende
// Nutzer weiterhin korrekt angezeigt (getKarriereStufe unten).
const karriereStufen = NEUVERGABE_KARRIERE_STUFEN.map((s) => ({
  id: s.id,
  titel: s.titel,
  emoji: s.emoji,
  provision: formatStufenProvision(s),
  vorteile: KARRIERE_STUFEN_VORTEILE[s.id],
}));

const einladungConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  angenommen: { icon: CheckCircle, color: "text-green-600", label: "Angenommen" },
  ausstehend: { icon: AlertCircle, color: "text-orange-500", label: "Ausstehend" },
  abgelaufen: { icon: XCircle, color: "text-red-500", label: "Abgelaufen" },
};

function getInitials(v: string, n: string) { return `${v?.[0] || "?"}${n?.[0] || "?"}`.toUpperCase(); }
// Bewusst nach Rollen-KENNUNG statt Anzeigename: Lead-Berater sollen dieselbe
// Farbe tragen wie Vertriebspartner, das Label kann sich also unterscheiden.
function getAvatarColor(rolleId: string) {
  const map: Record<string, string> = { inhaber: "bg-yellow-400", vertriebspartner: "bg-green-500", buchhaltung: "bg-orange-500", objektpartner: "bg-amber-500", finanzierungspartner: "bg-cyan-500", individuell: "bg-gray-400" };
  return map[rolleId] || "bg-primary";
}


function generateMoreId(nutzerList: Nutzer[]): string {
  const maxId = nutzerList.reduce((max, n) => {
    const num = parseInt(n.moreId?.replace("MI-", "") || "0");
    return num > max ? num : max;
  }, 0);
  return `MI-${String(maxId + 1).padStart(5, "0")}`;
}

export default function Nutzerverwaltung() {
  const { user, authUser } = useUser();
  const settingsVersion = useLiveVersion(["user_settings"]);
  const [nutzerList, setNutzerList] = useState<Nutzer[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [rolleFilter, setRolleFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [einladungFilter, setEinladungFilter] = useState("alle");
  const [sortLogin, setSortLogin] = useState<"asc" | "desc" | null>(null);
  const [nutzerDialog, setNutzerDialog] = useState(false);
  const [rollenDialog, setRollenDialog] = useState(false);
  const [rolleEditDialog, setRolleEditDialog] = useState<string | null>(null);
  const [editRollen, setEditRollen] = useState<string[]>([]);
  const [profilNutzer, setProfilNutzer] = useState<Nutzer | null>(null);
  const [profilOpen, setProfilOpen] = useState(false);

  // Form state
  const [formVorname, setFormVorname] = useState("");
  const [formNachname, setFormNachname] = useState("");
  const [formTelefon, setFormTelefon] = useState("");
  const [formPrivateEmail, setFormPrivateEmail] = useState("");
  const [formKarriere, setFormKarriere] = useState("");
  const [formRollen, setFormRollen] = useState<string[]>([]);
  const [formTeamleader, setFormTeamleader] = useState("__none__");
  const [formCustomRate, setFormCustomRate] = useState<string>("");
  const [formCustomRateSetter, setFormCustomRateSetter] = useState<string>("");
  const [formCustomRateEigen, setFormCustomRateEigen] = useState<string>("");
  // Opt-In: Sidebar/Routen nach Karrierestufe einschränken (Default AUS = voller CRM-Zugriff)
  const [formKarriereGating, setFormKarriereGating] = useState<boolean>(false);
  // Anzeige-Variante: Rolle bleibt vertriebspartner, nur der Anzeigename wird "Lead-Berater"
  const [formLeadBerater, setFormLeadBerater] = useState<boolean>(false);

  
  const selectedKarriere = karriereStufen.find(k => k.id === formKarriere);

  // Load users from DB
  const loadUsers = async () => {
    try {
      const [profilesRes, rolesRes, sessionsRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("*"),
        supabase.rpc("get_user_login_summary" as any),
      ]);
      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      // Build maps for session data
      const lastLoginMap = new Map<string, string>();
      const isOnlineMap = new Map<string, boolean>();
      const hasEverLoggedIn = new Set<string>();
      for (const s of ((sessionsRes.data as any[]) || [])) {
        if (!s?.user_id) continue;
        hasEverLoggedIn.add(s.user_id);
        if (s.last_seen_at) lastLoginMap.set(s.user_id, s.last_seen_at);
        if (s.aktiv) isOnlineMap.set(s.user_id, true);
      }

      const users: Nutzer[] = profiles.map((p) => {
        const userRoles = roles.filter((r) => r.user_id === p.id);
        const roleIds = userRoles.map((r) => r.role);
        const ROLE_PRIORITY = ["inhaber", "admin", "vertriebspartner", "setter", "setterin", "objektpartner", "versicherungsexperte", "tippgeber", "kunde"];
        const primaryRoleId = ROLE_PRIORITY.find((r) => (roleIds as string[]).includes(r)) || roleIds[0] || "kunde";
        // Defensiv gelesen: Spalte fehlt, solange die Migration nicht gelaufen ist.
        const rollenVariante = rollenVarianteVonProfil(p);

        // CRM freigeschaltet, wenn Academy bestanden ODER die PRIMÄRE Rolle
        // (= die in der Tabelle angezeigte Rolle) nicht academy-pflichtig ist.
        // Nur "some()" zu prüfen würde Admins/Inhaber, die zusätzlich z. B. die
        // VP-Rolle besitzen, fälschlich als "Academy offen" markieren.
        // Die CRM-Academy als Freischalt-Hürde gibt es nicht mehr; das CRM steht
        // nach abgeschlossenem Profil-Onboarding jedem offen.
        const crmFreigeschaltet = true;

        return {
          id: p.id,
          vorname: p.name?.split(" ")[0] || "",
          nachname: p.name?.split(" ").slice(1).join(" ") || "",
          email: p.email || "",
          privateEmail: "",
          moreId: p.more_id || "",
          rolle: rollenLabel(primaryRoleId, rollenVariante),
          rolleId: primaryRoleId,
          rollenVariante,
          rollen: roleIds.length > 0
            ? [primaryRoleId, ...roleIds.filter((r) => r !== primaryRoleId)]
            : ["kunde"],
          rolleColor: "bg-primary text-primary-foreground",
          status: isOnlineMap.get(p.id) ? "aktiv" as const : "inaktiv" as const,
          einladung: hasEverLoggedIn.has(p.id) ? "angenommen" as const : "ausstehend" as const,
          erstelltAm: new Date(p.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }),
          letzterLogin: lastLoginMap.has(p.id)
            ? new Date(lastLoginMap.get(p.id)!).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
            : "–",
          karriereStufe: "",
          avatarUrl: (p as any).avatar_url || undefined,
          crmFreigeschaltet,
          gesperrt: !!(p as any).gesperrt,
          gesperrtGrund: (p as any).gesperrt_grund || undefined,
        };
      });

      setNutzerList(users);
    } catch (err) {
      console.error("Error loading users:", err);
      toast.error("Fehler beim Laden der Nutzer");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // user_settings Cache initial nachladen, damit Karrierestufen-Overrides
    // (z. B. Lead Partner 4 %) sofort korrekt angezeigt werden.
    cacheRefreshTable("user_settings").catch(() => {});
  }, []);

  // Kunden sind keine "Nutzer" im Sinne der Nutzerverwaltung – sie zählen nicht
  // in die KPIs (Gesamt/Aktiv/Inaktiv/Einladung ausstehend/Rollen) hinein.
  const nichtKunden = nutzerList.filter(
    (n) => !(n.rollen.length === 1 && n.rollen[0] === "kunde"),
  );
  const aktive = nichtKunden.filter((n) => n.status === "aktiv").length;
  const inaktive = nichtKunden.filter((n) => n.status === "inaktiv").length;
  const ausstehend = nichtKunden.filter((n) => n.einladung === "ausstehend").length;

  const filtered = nutzerList.filter((n) => {
    const q = search.toLowerCase();
    const matchSearch = !q || n.vorname.toLowerCase().includes(q) || n.nachname.toLowerCase().includes(q) || n.email.toLowerCase().includes(q);
    // Nach Rollen-KENNUNG filtern, nicht nach Anzeigename: Der Filter
    // "Vertriebspartner" soll auch Lead-Berater zeigen (gleiche Rolle, andere
    // Anzeige). "Lead-Berater" ist ein eigener Zusatzfilter auf die Variante.
    const matchRolle =
      rolleFilter === "alle" ||
      (rolleFilter === LEAD_BERATER_LABEL
        ? n.rolleId === "vertriebspartner" && n.rollenVariante === ROLLEN_VARIANTE_LEAD_BERATER
        : ROLES.find((r) => r.label === rolleFilter)?.id === n.rolleId);
    const matchStatus = statusFilter === "alle" || n.status === statusFilter;
    const matchEinladung = einladungFilter === "alle" || n.einladung === einladungFilter;
    // Externe Rollen (Kunde, Tippgeber) standardmäßig ausblenden – nur
    // sichtbar, wenn die jeweilige Rolle explizit gefiltert wird.
    const primary = (n.rollen[0] || "").toLowerCase();
    const isExtern = primary === "kunde" || primary === "tippgeber";
    const hideExtern =
      isExtern &&
      !(
        (primary === "kunde" && rolleFilter === "Kunde") ||
        (primary === "tippgeber" && rolleFilter === "Tippgeber")
      );
    return matchSearch && matchRolle && matchStatus && matchEinladung && !hideExtern;
  });

  // Sort by last login if active
  const sortedFiltered = sortLogin
    ? [...filtered].sort((a, b) => {
        const aTime = a.letzterLogin === "–" ? 0 : new Date(a.letzterLogin.split(",")[0].split(".").reverse().join("-")).getTime();
        const bTime = b.letzterLogin === "–" ? 0 : new Date(b.letzterLogin.split(",")[0].split(".").reverse().join("-")).getTime();
        return sortLogin === "asc" ? aTime - bTime : bTime - aTime;
      })
    : filtered;

  const resetForm = () => {
    setFormVorname(""); setFormNachname(""); setFormTelefon(""); setFormPrivateEmail(""); 
    setFormKarriere(""); setFormRollen([]); setFormTeamleader("");
    setFormCustomRate(""); setFormCustomRateSetter(""); setFormCustomRateEigen("");
    setFormKarriereGating(false);
    setFormLeadBerater(false);
  };

  const handleInvite = async () => {
    const needsKarriere = formRollen.includes("vertriebspartner");
    if (!formVorname || !formNachname || !formPrivateEmail || formRollen.length === 0 || (needsKarriere && !formKarriere)) return;
    setInviting(true);

    try {
      const name = `${formVorname} ${formNachname}`;
      const role = formRollen[0]; // Primary role
      const moreId = generateMoreId(nutzerList);

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: formPrivateEmail,
          name,
          role,
          roles: formRollen,
          moreId,
          vorname: formVorname,
          nachname: formNachname,
          telefon: formTelefon || undefined,
          karriereStufe: needsKarriere ? formKarriere : undefined,
          teamleaderId: formTeamleader && formTeamleader !== "__none__" ? formTeamleader : undefined,
          customProvisionRate: formCustomRate !== "" ? parseFloat(formCustomRate) : undefined,
          customProvisionRateSetter: formCustomRateSetter !== "" ? parseFloat(formCustomRateSetter) : undefined,
          customProvisionRateEigen: formCustomRateEigen !== "" ? parseFloat(formCustomRateEigen) : undefined,
          karriereGatingActive: formKarriereGating,
          // Reine Anzeige-Variante, keine eigene Rolle (siehe rollenLabel.ts)
          rollenVariante: formLeadBerater && formRollen.includes("vertriebspartner") ? ROLLEN_VARIANTE_LEAD_BERATER : undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(
        `Einladung an ${formPrivateEmail} gesendet! ${name} erhält eine E-Mail zur Verifizierung und kann dann ein eigenes Passwort setzen.`,
        { duration: 10000 }
      );

      resetForm();
      setNutzerDialog(false);
      // Reload user list
      await loadUsers();
      // user_settings Cache aktualisieren, damit Karrierestufen-Override (z.B. Lead Partner 4 %)
      // direkt in der Liste angezeigt wird statt der Standard-Anzeige Vertriebspartner 3 %.
      await cacheRefreshTable("user_settings");
    } catch (err: any) {
      console.error("Invite error:", err);
      toast.error(`Fehler: ${err.message || "Einladung fehlgeschlagen"}`);
    } finally {
      setInviting(false);
    }
  };

  const toggleRolle = (roleId: string) => {
    setFormRollen(prev => prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]);
  };

  /**
   * Konto abschalten oder löschen. Beides läuft über denselben Dialog, weil
   * beides denselben Pflichtschritt braucht: Was geschieht mit den Leads
   * dieser Person? Ohne Entscheidung geht keins von beidem durch.
   */
  const [abschaltZiel, setAbschaltZiel] = useState<Nutzer | null>(null);
  const [abschaltModus, setAbschaltModus] = useState<"sperren" | "loeschen">("sperren");

  const oeffneAbschalten = (nutzer: Nutzer, modus: "sperren" | "loeschen") => {
    // Sich selbst abzuschalten sperrt einen aus der Nutzerverwaltung aus, und
    // niemand kann das Konto danach von innen wieder aufmachen.
    if (nutzer.id === authUser?.id) {
      toast.error("Du kannst dein eigenes Konto nicht abschalten.");
      return;
    }
    setAbschaltModus(modus);
    setAbschaltZiel(nutzer);
  };

  /** Sperrt das Konto. Wird vom Dialog erst nach der Lead-Entscheidung gerufen. */
  const sperreKonto = async (nutzer: Nutzer, grund: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({
        gesperrt: true,
        gesperrt_grund: grund || "Dein Zugang wurde deaktiviert. Wende dich an deinen Ansprechpartner.",
      })
      .eq("id", nutzer.id);
    if (error) {
      throw new Error(
        error.code === "42501" || /row-level security/i.test(error.message || "")
          ? "Nur Admin und Inhaber dürfen Konten sperren."
          : `Das Konto konnte nicht gesperrt werden: ${error.message}`,
      );
    }
    // Laufende Sitzungen beenden, sonst arbeitet der gesperrte Nutzer im
    // offenen Tab einfach weiter. Scheitert das, erscheint ein Hinweis.
    await sitzungenNachSperreBeenden(nutzer.id, `${nutzer.vorname} ${nutzer.nachname}`.trim());
  };

  /** Hebt die Sperre wieder auf. Kein Pflichtschritt, es geht nichts verloren. */
  const entsperreKonto = async (nutzer: Nutzer) => {
    const { error } = await supabase
      .from("profiles")
      .update({ gesperrt: false, gesperrt_grund: null })
      .eq("id", nutzer.id);
    if (error) {
      toast.error(
        error.code === "42501" || /row-level security/i.test(error.message || "")
          ? "Nur Admin und Inhaber dürfen Konten entsperren."
          : `Die Sperre konnte nicht aufgehoben werden: ${error.message}`,
      );
      return;
    }
    toast.success(`${nutzer.vorname} ${nutzer.nachname} kann sich wieder anmelden.`);
    loadUsers();
  };

  const loescheKonto = async (nutzer: Nutzer) => {
    // Delete user_roles, user_settings, profiles, then auth user via edge function
    await Promise.all([
      supabase.from("user_roles").delete().eq("user_id", nutzer.id),
      supabase.from("user_settings").delete().eq("user_id", nutzer.id),
      supabase.from("benachrichtigungen").delete().eq("benutzer_id", nutzer.id),
      supabase.from("login_sessions").delete().eq("user_id", nutzer.id),
    ]);
    const { error: profilFehler } = await supabase.from("profiles").delete().eq("id", nutzer.id);
    if (profilFehler) throw new Error(`Das Profil konnte nicht gelöscht werden: ${profilFehler.message}`);
    // Delete auth user via admin API (edge function)
    const { error } = await supabase.functions.invoke("invite-user", {
      body: { action: "delete", userId: nutzer.id },
    });
    if (error) throw new Error(`Der Zugang konnte nicht gelöscht werden: ${error.message}`);
  };

  const handleResendInvite = async (id: string) => {
    const nutzer = nutzerList.find(n => n.id === id);
    if (!nutzer) return;
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: nutzer.email,
          name: `${nutzer.vorname} ${nutzer.nachname}`,
          role: nutzer.rollen[0] || "kunde",
          moreId: nutzer.moreId,
          resend: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Einladung erneut an ${nutzer.email} gesendet!`);
    } catch (err: any) {
      toast.error(`Fehler: ${err.message || "Erneutes Senden fehlgeschlagen"}`);
    }
  };

  const handleForceLogout = async (nutzer: Nutzer) => {
    const ok = await confirmDialog({
      title: "Alle Sitzungen sofort beenden?",
      description: `${nutzer.vorname} ${nutzer.nachname} wird auf allen Geräten abgemeldet und muss sich neu anmelden.`,
      confirmText: "Sitzungen beenden",
      cancelText: "Abbrechen",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await beendeSitzungenVon(nutzer.id);
      toast.success(`${nutzer.vorname} ${nutzer.nachname} wurde auf allen Geräten abgemeldet.`);
      loadUsers();
    } catch (err: any) {
      toast.error(`Fehler: ${err.message || "Abmelden fehlgeschlagen"}`);
    }
  };

  const openRolleEdit = (id: string) => {
    const nutzer = nutzerList.find(n => n.id === id);
    setEditRollen(nutzer?.rollen || []);
    setRolleEditDialog(id);
  };

  const saveRolleEdit = async () => {
    if (!rolleEditDialog || editRollen.length === 0) return;

    try {
      // Dedupe (UI sollte das verhindern, aber unique(user_id, role) ist strict)
      const desired = Array.from(new Set(editRollen));

      // Aktuellen Stand laden – nur Diff schreiben (kein destruktiver
      // delete-then-insert: wenn der Insert fehlschlägt, hätte der Nutzer
      // sonst gar keine Rolle mehr und wäre ausgesperrt).
      const { data: currentRows, error: loadError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", rolleEditDialog);
      if (loadError) throw loadError;
      const current = new Set((currentRows ?? []).map((r: any) => r.role as string));
      const desiredSet = new Set(desired);

      const toAdd = desired.filter((r) => !current.has(r));
      const toRemove = Array.from(current).filter((r) => !desiredSet.has(r));

      // Inhaber-Schutz: Super-Admin-Rolle darf nicht per UI entfernt werden.
      if (toRemove.includes("inhaber")) {
        toast.error("Die Rolle 'Inhaber' (Super Admin) ist geschützt und kann nicht entfernt werden.");
        return;
      }

      // Self-Lockout verhindern: niemand darf sich selbst alle Admin-Rollen
      // entziehen, sonst verliert er sofort den Zugang zur Nutzerverwaltung.
      if (rolleEditDialog === authUser?.id) {
        const stillHasAdmin = desired.some((r) => r === "admin" || r === "inhaber");
        const hadAdmin = Array.from(current).some((r) => r === "admin" || r === "inhaber");
        if (hadAdmin && !stillHasAdmin) {
          toast.error("Du kannst dir selbst nicht die letzte Admin-Rolle entziehen.");
          return;
        }
      }

      // 1) Erst hinzufügen (idempotent), 2) dann entfernen – verhindert
      // einen Zwischenzustand mit 0 Rollen.
      if (toAdd.length > 0) {
        const inserts = toAdd.map((role) => ({
          user_id: rolleEditDialog,
          role: role as any,
        }));
        const { error: insertError } = await supabase
          .from("user_roles")
          .insert(inserts as any);
        if (insertError) throw insertError;
      }

      if (toRemove.length > 0) {
        const { error: removeError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", rolleEditDialog)
          .in("role", toRemove as any);
        if (removeError) throw removeError;
      }

      if (toAdd.length === 0 && toRemove.length === 0) {
        toast.info("Keine Änderungen – Rollen bereits identisch.");
      } else {
        toast.success(
          `Rollen aktualisiert: ${desired.length} aktiv` +
            (toAdd.length ? ` · +${toAdd.length}` : "") +
            (toRemove.length ? ` · −${toRemove.length}` : ""),
        );
      }
      setRolleEditDialog(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(`Fehler: ${err.message ?? "Rollen konnten nicht gespeichert werden"}`);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Tabs defaultValue="nutzer" className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Nutzerverwaltung" subtitle={`${nutzerList.length} Nutzer · ${aktive} aktiv`} />
          <div className="flex items-center gap-3">
            <TabsList>
              <TabsTrigger value="nutzer">Nutzer</TabsTrigger>
              <TabsTrigger value="moderation" className="gap-1.5">
                <Flag className="h-3.5 w-3.5" /> Moderation
              </TabsTrigger>
            </TabsList>
            <Dialog open={rollenDialog} onOpenChange={setRollenDialog}>
              <DialogTrigger asChild>
                <Button variant="outline"><Shield className="h-4 w-4 mr-2" /> Rollen & Berechtigungen</Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-2xl max-h-[85vh] overflow-y-auto md:left-[calc(50%+var(--app-sidebar-offset,0px)/2)]"
                overlayClassName="md:left-[var(--app-sidebar-offset,0px)]"
              >
                <DialogHeader>
                  <DialogTitle>Rollen & Berechtigungen</DialogTitle>
                  <p className="text-sm text-muted-foreground">Pfade pro Rolle pflegen — Änderungen wirken sofort in Sidebar und Routen-Schutz.</p>
                </DialogHeader>
                {/* Zeigt sich selbst nur Admin und Inhaber. */}
                <DokumentFreigabeRollen />
                <RolePermissionsEditor />
              </DialogContent>
            </Dialog>

            <Dialog open={nutzerDialog} onOpenChange={(open) => { setNutzerDialog(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button variant="brand">
                  <UserPlus className="h-4 w-4 mr-2" /> Nutzer einladen
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-3xl max-h-[90vh] overflow-y-auto md:left-[calc(50%+var(--app-sidebar-offset,0px)/2)]"
                overlayClassName="md:left-[var(--app-sidebar-offset,0px)]"
              >
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Neuen Nutzer einladen</DialogTitle>
                  <p className="text-sm text-muted-foreground">Der Nutzer erhält eine Einladungs-E-Mail mit einem Bestätigungslink. Nach Verifizierung kann er ein eigenes Passwort setzen.</p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {/* Name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Vorname *</Label><Input placeholder="Max" value={formVorname} onChange={e => setFormVorname(e.target.value)} /></div>
                    <div><Label>Nachname *</Label><Input placeholder="Müller" value={formNachname} onChange={e => setFormNachname(e.target.value)} /></div>
                  </div>

                  {/* Email */}
                  <div>
                    <Label>E-Mail-Adresse *</Label>
                    <Input placeholder="max.mueller@gmail.com" value={formPrivateEmail} onChange={e => setFormPrivateEmail(e.target.value)} />
                    <p className="text-xs text-muted-foreground mt-1">Diese E-Mail wird als Login für das Backoffice verwendet.</p>
                  </div>

                  <div><Label>Telefonnummer (optional)</Label><PhoneInput value={formTelefon} onChange={v => setFormTelefon(v)} /></div>

                  {/* Karrierestufe - nur bei Vertriebspartner */}
                  {formRollen.includes("vertriebspartner") && (
                  <div>
                    <Label>Karrierestufe *</Label>
                    <Select value={formKarriere} onValueChange={setFormKarriere}>
                      <SelectTrigger><SelectValue placeholder="Stufe wählen..." /></SelectTrigger>
                      <SelectContent>
                        {karriereStufen.map(k => (
                          <SelectItem key={k.id} value={k.id}>{k.emoji} {k.titel} – {k.provision}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedKarriere && (
                      <div className="mt-2 bg-muted rounded-lg p-3 text-xs space-y-1">
                        <p className="font-semibold">{selectedKarriere.emoji} {selectedKarriere.titel} – {selectedKarriere.provision}</p>
                        {selectedKarriere.vorteile.map((v, i) => (
                          <p key={i} className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> {v}</p>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-start gap-2 rounded-md border bg-background/60 p-2">
                      <Switch
                        checked={formKarriereGating}
                        onCheckedChange={setFormKarriereGating}
                      />
                      <div className="space-y-0.5 text-[11px] leading-tight">
                        <p className="font-medium">Sidebar nach Karrierestufe einschränken</p>
                        <p className="text-muted-foreground">
                          Standard AUS: Nutzer sieht das komplette CRM (Bestandsschutz). Aktivieren, um nur Module der gewählten Stufe zu zeigen — die Stufe kann später jederzeit im Nutzerprofil geändert werden.
                        </p>
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Provisionssätze - synchron mit Nutzerprofil */}
                  {formRollen.includes("vertriebspartner") && (
                  <div data-ui="card" className="rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold flex items-center gap-2">🔥 Karrierestufe & Provision</p>
                      <Badge variant="outline" className="text-xs">
                        {(() => {
                          const stufe = KARRIERE_STUFEN.find(s => s.id === formKarriere);
                          const custom = formCustomRate !== "" ? parseFloat(formCustomRate) : null;
                          const rate = custom != null && !isNaN(custom) ? custom : (stufe?.rate ?? 3);
                          return `${rate} %`;
                        })()}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Individueller Satz (%)</Label>
                        <Input
                          type="number" min={0} max={100} step={0.5}
                          placeholder={`${KARRIERE_STUFEN.find(s => s.id === formKarriere)?.rate ?? 4} (Standard)`}
                          value={formCustomRate}
                          onChange={e => setFormCustomRate(e.target.value)}
                        />
                        <p className="text-[10px] text-muted-foreground">Allgemeiner Override</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Lead Satz (%)</Label>
                        <Input
                          type="number" min={0} max={100} step={0.01}
                          placeholder="z. B. 3"
                          value={formCustomRateSetter}
                          onChange={e => setFormCustomRateSetter(e.target.value)}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Provision für Leads, die dem Nutzer über MOREImmo zugewiesen werden.
                        </p>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs text-muted-foreground">Eigen Satz (%)</Label>
                        <Input
                          type="number" min={0} max={100} step={0.01}
                          placeholder="z. B. 5"
                          value={formCustomRateEigen}
                          onChange={e => setFormCustomRateEigen(e.target.value)}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Honorarsatz für Interessenten &amp; Leads aus dem eigenen Netzwerk.
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-3">
                      💡 <strong>Individueller Satz</strong> gilt für Lead- und Eigenkontakte gemeinsam. Wenn du differenzieren willst, lass ihn leer und trage stattdessen <strong>Lead Satz</strong> (Leads über MOREImmo) und <strong>Eigen Satz</strong> (eigenes Netzwerk) ein. Priorität: Individueller Satz → Lead/Eigen → Karrierestufe → Standard 3 %.
                    </p>
                  </div>
                  )}

                  {/* Teamleiter-Zuordnung - bei VP-Rollen */}
                  {(formRollen.includes("vertriebspartner") || formRollen.includes("tippgeber")) && (
                  <div>
                    <Label>Teamleiter (optional)</Label>
                    <Select value={formTeamleader} onValueChange={setFormTeamleader}>
                      <SelectTrigger><SelectValue placeholder="Teamleiter wählen..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Kein Teamleiter</SelectItem>
                        {nutzerList
                          .filter(n => {
                            // Hinweis: `status` markiert hier "online" (Session <15min),
                            // nicht "Account aktiv". Für die Teamleiter-Auswahl reicht es,
                            // dass die Einladung angenommen wurde – sonst tauchen
                            // legitime Teamleiter nur dann auf, wenn sie gerade live sind.
                            if (!n.id) return false;
                            if (n.einladung === "ausstehend") return false;
                            const rollen = (n.rollen && n.rollen.length ? n.rollen : [n.rolle])
                              .map(r => (r || "").toLowerCase());
                            // Immer erlaubt: Admin / Inhaber / Vertriebsleiter
                            if (rollen.some(r => ["admin", "super admin", "inhaber", "vertriebsleiter"].includes(r))) {
                              return true;
                            }
                            // Vertriebspartner nur ab Team Lead / Lizenzpartner
                            if (rollen.includes("vertriebspartner")) {
                              return n.karriereStufe === "manager" || n.karriereStufe === "vertriebsfirma";
                            }
                            return false;
                          })
                          .map(n => (
                            <SelectItem key={n.id} value={n.id}>{n.vorname} {n.nachname} – {n.rolle}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">{OVERHEAD_AKTIV ? "Der Teamleiter erhält Team-Overhead auf Abschlüsse dieses Nutzers." : "Der Teamleiter sieht diesen Nutzer in seinen Team-Auswertungen."}</p>
                  </div>
                  )}

                  {/* Rollen */}
                  <div>
                    <Label>Rollen zuweisen * (Mehrfachauswahl möglich)</Label>
                    <div className="space-y-2 mt-2 bg-card border rounded-lg p-3 max-h-56 overflow-y-auto">
                      {ROLES.filter((r) => r.id !== "bewerber").map((r) => (
                        <div key={r.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={formRollen.includes(r.id)} onCheckedChange={() => toggleRolle(r.id)} />
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                            <span className="text-sm">{r.label}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{formRollen.length} Rolle(n) ausgewählt. Die erste Rolle wird als Hauptrolle verwendet.</p>
                    {formRollen.includes("vertriebspartner") && (
                      <div className="mt-2 flex items-start gap-2 rounded-md border bg-background/60 p-2">
                        <Switch checked={formLeadBerater} onCheckedChange={setFormLeadBerater} />
                        <div className="space-y-0.5 text-[11px] leading-tight">
                          <p className="font-medium">Als Lead-Berater anzeigen</p>
                          <p className="text-muted-foreground">
                            Gleiche Rechte und Ansichten wie Vertriebspartner, nur der angezeigte Name lautet Lead-Berater und der Weekly Call beginnt früher.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ablauf */}
                  <div className="bg-muted rounded-lg p-3">
                    <p className="font-semibold text-sm mb-2 flex items-center gap-1">📧 Ablauf nach der Einladung:</p>
                    <ol className="text-xs space-y-1 list-decimal pl-4 text-muted-foreground">
                      <li>Nutzer erhält eine Einladungs-E-Mail an die angegebene Adresse</li>
                      <li>Nutzer klickt den Bestätigungslink und verifiziert seine E-Mail</li>
                      <li>Nutzer setzt sein eigenes Passwort</li>
                      <li>Nutzer wird zu den Einstellungen weitergeleitet</li>
                      <li>Profil, Gewerbedaten, Steuer & Bank ausfüllen</li>
                      <li>Pflichtunterlagen hochladen (PDF)</li>
                      <li>Backoffice prüft und gibt Unterlagen frei (Ampelsystem)</li>
                      <li>Nach Freigabe: Voller Backoffice-Zugang</li>
                    </ol>
                  </div>

                  <div className="flex gap-3 justify-end">
                    <Button variant="outline" onClick={() => { resetForm(); setNutzerDialog(false); }}>Abbrechen</Button>
                    <Button
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={handleInvite}
                      disabled={!formVorname || !formNachname || !formPrivateEmail || formRollen.length === 0 || (formRollen.includes("vertriebspartner") && !formKarriere) || inviting}
                    >
                      {inviting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                      {inviting ? "Wird eingeladen..." : "Nutzer einladen"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <TabsContent value="nutzer" className="space-y-6 mt-0">
        {/* KPI Cards with hover overlays */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "GESAMT NUTZER", value: String(nichtKunden.length), users: nichtKunden },
            { label: "AKTIVE NUTZER", value: String(aktive), users: nichtKunden.filter(n => n.status === "aktiv") },
            { label: "INAKTIVE NUTZER", value: String(inaktive), users: nichtKunden.filter(n => n.status === "inaktiv") },
            { label: "EINLADUNG AUSSTEHEND", value: String(ausstehend), users: nichtKunden.filter(n => n.einladung === "ausstehend") },
            { label: "ROLLEN", value: String(new Set(nichtKunden.map(n => n.rolle)).size), users: [] },
          ].map((kpi) => (
            <Popover key={kpi.label}>
              <PopoverTrigger asChild>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">{kpi.label}</p>
                    <p className="text-3xl font-bold mt-1">{kpi.value}</p>
                  </CardContent>
                </Card>
              </PopoverTrigger>
              {kpi.users.length > 0 && (
                <PopoverContent className="w-72 p-0" align="center">
                  <div className="p-3 border-b">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">{kpi.label}</p>
                  </div>
                  <ScrollArea className="max-h-64">
                    <div className="p-2 space-y-1">
                      {kpi.users.map(u => (
                        <div key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer" onClick={() => { setProfilNutzer(u); setProfilOpen(true); }}>
                          <Avatar className="h-6 w-6">
                            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={`${u.vorname} ${u.nachname}`} />}
                            <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">
                              {getInitials(u.vorname, u.nachname)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{u.vorname} {u.nachname}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{u.rolle}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              )}
            </Popover>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Name oder E-Mail suchen..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={rolleFilter} onValueChange={setRolleFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Alle Rollen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Rollen</SelectItem>
              {ROLES.flatMap((r) => [
                <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>,
                // Zusatzfilter direkt unter Vertriebspartner: nur die Anzeige-Variante.
                ...(r.id === "vertriebspartner"
                  ? [<SelectItem key="lead-berater" value={LEAD_BERATER_LABEL}>{LEAD_BERATER_LABEL}</SelectItem>]
                  : []),
              ])}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Status</SelectItem>
              <SelectItem value="aktiv">Aktiv</SelectItem>
              <SelectItem value="inaktiv">Inaktiv</SelectItem>
            </SelectContent>
          </Select>
          <Select value={einladungFilter} onValueChange={setEinladungFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Einladung" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Einladungen</SelectItem>
              <SelectItem value="angenommen">Angenommen</SelectItem>
              <SelectItem value="ausstehend">Ausstehend</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* User Table */}
        <div data-ui="card" className="bg-card border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NUTZER</TableHead>
                <TableHead>ROLLE</TableHead>
                <TableHead>PROVISION</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead>EINLADUNG</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>ERSTELLT AM</TableHead>
                <TableHead
                  className="cursor-pointer select-none hover:text-foreground"
                  onClick={() => setSortLogin(prev => prev === "desc" ? "asc" : prev === "asc" ? null : "desc")}
                >
                  <span className="flex items-center gap-1">
                    LETZTER LOGIN
                    <ArrowUpDown className={`h-3 w-3 ${sortLogin ? "text-foreground" : "text-muted-foreground/50"}`} />
                  </span>
                </TableHead>
                <TableHead>AKTIONEN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFiltered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    Keine Nutzer gefunden. Klicke auf "Nutzer einladen" um den ersten Nutzer anzulegen.
                  </TableCell>
                </TableRow>
              ) : (
                sortedFiltered.map((n) => {
                  const einladung = einladungConfig[n.einladung] || einladungConfig.angenommen;
                  const EinladungIcon = einladung.icon;
                  return (
                    <TableRow key={n.id} className="cursor-pointer" onClick={() => navigate(`/teampartner/${n.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            {n.avatarUrl && <AvatarImage src={n.avatarUrl} alt={`${n.vorname} ${n.nachname}`} />}
                            <AvatarFallback className={`${getAvatarColor(n.rolleId)} text-white text-xs`}>
                              {getInitials(n.vorname, n.nachname)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{n.vorname} {n.nachname}</p>
                            <p className="text-xs text-muted-foreground">{n.email}</p>
                            {n.moreId && <p className="text-xs text-muted-foreground">{n.moreId}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        {n.rollen.length <= 1 ? (
                          <Badge variant="secondary">{n.rolle}</Badge>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="flex items-center gap-1.5 cursor-pointer hover:opacity-80">
                                <Badge variant="secondary">{n.rolle}</Badge>
                                <span className="text-[10px] text-muted-foreground">+{n.rollen.length - 1}</span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="min-w-[160px]">
                              {n.rollen.map((roleId) => {
                                const rc = ROLES.find(r => r.id === roleId);
                                return (
                                  <DropdownMenuItem key={roleId} className="gap-2 text-xs cursor-default">
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: rc?.color || "hsl(220,10%,46%)" }} />
                                    {rollenLabel(roleId, n.rollenVariante)}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const isVp = n.rollen.includes("vertriebspartner");
                          if (!isVp) return <span className="text-xs text-muted-foreground">–</span>;
                          const override = getKarriereOverrideForUser(n.id);
                          const stufe = override ? getKarriereStufe(0, override) : KARRIERE_STUFEN[0];
                          const rate = getEffectiveRate(n.id, stufe);
                          const setterRate = getCustomProvisionRateSetter(n.id);
                          const eigenRate = getCustomProvisionRateEigen(n.id);
                          const hasSplit = setterRate !== null || eigenRate !== null;
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs">{stufe.emoji} {stufe.titel}</span>
                              {hasSplit ? (
                                <>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold" title="Lead Satz (Leads über MOREImmo)">
                                    Lead {setterRate ?? rate} %
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold" title="Eigen Satz (eigenes Netzwerk)">
                                    Eigen {eigenRate ?? rate} %
                                  </Badge>
                                </>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold">{rate} %</Badge>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {/*
                          Zwei verschiedene Dinge, deshalb zwei Anzeigen:
                          "Aktiv/Inaktiv" heißt gerade angemeldet oder nicht,
                          "Gesperrt" heißt, das Konto ist abgeschaltet.
                        */}
                        <div className="flex flex-col gap-1">
                          <span className={`flex items-center gap-1 text-xs ${n.status === "aktiv" ? "text-green-600" : "text-muted-foreground"}`}>
                            <span className={`w-2 h-2 rounded-full ${n.status === "aktiv" ? "bg-green-500" : "bg-gray-300"}`} />
                            {n.status === "aktiv" ? "Aktiv" : "Inaktiv"}
                          </span>
                          {n.gesperrt && (
                            <Badge variant="outline" className="w-fit gap-1 text-destructive border-destructive/40" title={n.gesperrtGrund || undefined}>
                              <XCircle className="h-3 w-3" /> Gesperrt
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`flex items-center gap-1 text-xs ${einladung.color}`}>
                          <EinladungIcon className="h-3 w-3" /> {einladung.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        {n.einladung !== "angenommen" ? (
                          <span className="text-xs text-muted-foreground">–</span>
                        ) : n.crmFreigeschaltet ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 gap-1">
                            <CheckCircle className="h-3 w-3" /> Freigeschaltet
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-orange-600 border-orange-300">
                            <AlertCircle className="h-3 w-3" /> Academy offen
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{n.erstelltAm}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{n.letzterLogin}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Weitere Aktionen" onClick={e => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => navigate(`/teampartner/${n.id}`)}>Profil anzeigen</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openRolleEdit(n.id)}>Rolle ändern</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/*
                              Sperren heißt: kommt gar nicht mehr rein. Die
                              Zeile darüber zeigt dagegen nur, wer gerade
                              angemeldet ist. Beides sind verschiedene Dinge.
                              Super Admins sind wie beim Löschen geschützt.
                            */}
                            {!(n.rollen?.includes("inhaber") && user.role !== "inhaber") && (
                              n.gesperrt ? (
                                <DropdownMenuItem onClick={() => entsperreKonto(n)}>
                                  Konto entsperren
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => oeffneAbschalten(n, "sperren")}>
                                  Konto sperren
                                </DropdownMenuItem>
                              )
                            )}
                            {n.einladung !== "angenommen" && (
                              <DropdownMenuItem onClick={() => handleResendInvite(n.id)}>Einladung erneut senden</DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleForceLogout(n)}>
                              Alle Sessions beenden
                            </DropdownMenuItem>
                            {/* Super Admins können nicht von regulären Admins gelöscht werden */}
                            {!(n.rollen?.includes("inhaber") && user.role !== "inhaber") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => oeffneAbschalten(n, "loeschen")}>Löschen</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Rolle ändern Dialog */}
        <Dialog open={!!rolleEditDialog} onOpenChange={(open) => { if (!open) setRolleEditDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Rollen ändern</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-2 bg-card border rounded-lg p-3 max-h-56 overflow-y-auto">
              {ROLES.filter((r) => r.id !== "bewerber").map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={editRollen.includes(r.id)}
                    onCheckedChange={() => setEditRollen(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                  />
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="text-sm">{r.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{editRollen.length} Rolle(n) ausgewählt</p>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setRolleEditDialog(null)}>Abbrechen</Button>
              <Button onClick={saveRolleEdit} disabled={editRollen.length === 0}>Speichern</Button>
            </div>
          </DialogContent>
        </Dialog>

        <NutzerProfilDialog
          nutzer={profilNutzer}
          open={profilOpen}
          onOpenChange={setProfilOpen}
          onSaved={loadUsers}
        />

        {/* Konto abschalten: Sperren und Löschen mit Pflichtschritt für die Leads */}
        <KontoAbschaltenDialog
          nutzer={abschaltZiel ? {
            id: abschaltZiel.id,
            name: `${abschaltZiel.vorname} ${abschaltZiel.nachname}`.trim(),
            email: abschaltZiel.email,
          } : null}
          modus={abschaltModus}
          open={!!abschaltZiel}
          onOpenChange={(open) => { if (!open) setAbschaltZiel(null); }}
          onAusfuehren={async (grund) => {
            if (!abschaltZiel) return;
            if (abschaltModus === "sperren") await sperreKonto(abschaltZiel, grund);
            else await loescheKonto(abschaltZiel);
          }}
          onFertig={loadUsers}
        />
        </TabsContent>

        <TabsContent value="moderation" className="mt-0">
          <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Laden...</div>}>
            <ModerationTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
