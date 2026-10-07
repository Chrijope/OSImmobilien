import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Shield, Lock, Unlock, Loader2, Download, CheckCircle2, XCircle, Clock, Eye, User, Building2, Landmark, FolderOpen, ThumbsUp, ThumbsDown, ScrollText } from "lucide-react";
import { ROLES, type UserRole } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Nutzer } from "@/pages/Nutzerverwaltung";

// All sidebar menu items with URL and label
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
  { group: "Hausverwaltung", items: [
    { url: "/hausverwaltung", label: "HV-Übersicht" }, { url: "/mieter", label: "Mieter" },
    { url: "/vermietung", label: "Vermietung" }, { url: "/dienstleister", label: "Dienstleister" },
    { url: "/hv-tickets", label: "HV-Tickets" }, { url: "/hv-statistiken", label: "HV-Statistiken" },
    { url: "/zaehlerstaende", label: "Zählerstände" }, { url: "/kautionen", label: "Kautionen" },
    { url: "/betriebskostenabrechnung", label: "BK-Abrechnung" }, { url: "/hv-kommunikation", label: "Kommunikation" },
    { url: "/mieterhoehung", label: "Mieterhöhung" }, { url: "/uebergabeprotokoll", label: "Übergabeprotokoll" },
    { url: "/eigentuemer", label: "Eigentümer" }, { url: "/versicherungen", label: "Versicherungen" },
    { url: "/fristenueberwachung", label: "Fristenüberwachung" },
  ]},
  { group: "Team & Admin", items: [
    { url: "/teampartner", label: "Teampartner" }, { url: "/nutzerverwaltung", label: "Nutzerverwaltung" },
    { url: "/ansprechpartner", label: "Ansprechpartner" }, { url: "/berater-microseite", label: "Vertriebspartner-Microseite" },
    { url: "/bewerberprozess", label: "Bewerberprozess" },
  ]},
];

import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";
import { TeamleaderSelect } from "@/components/nutzerverwaltung/TeamleaderSelect";
import { VertragAufEinenBlick } from "@/components/bewerbung/VertragAufEinenBlick";
import { getBewerber } from "@/lib/bewerbungStore";
import { useUser } from "@/contexts/UserContext";

interface Props {
  nutzer: Nutzer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface UserSettingsData {
  einstellungen: any;
  unterlagen: any;
  onboarding_complete: boolean;
  onboarding_steps: any;
}

const statusIcon = {
  fehlt: <XCircle className="h-4 w-4 text-destructive" />,
  pruefung: <Clock className="h-4 w-4 text-warning" />,
  freigegeben: <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

const statusLabel: Record<string, string> = {
  fehlt: "Fehlt",
  pruefung: "In Prüfung",
  freigegeben: "Freigegeben",
};

export default function NutzerProfilDialog({ nutzer, open, onOpenChange, onSaved }: Props) {
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettingsData | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [activeTab, setActiveTab] = useState("berechtigungen");
  const [approvingDoc, setApprovingDoc] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<any[] | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const { user: currentUser } = useUser();

  /**
   * Vertragsdaten dürfen hier nur Rollen sehen, die auch das
   * Bewerbungsmanagement sehen. Die RLS auf `bewerbungen` schützt die Daten
   * ohnehin serverseitig, dieses Gate blendet die Karte zusätzlich für Rollen
   * wie Backoffice aus, die zwar die Nutzerverwaltung, aber nicht das
   * Bewerbungsmanagement öffnen dürfen.
   */
  const darfVertragSehen = isUrlAllowedForRole("/bewerberprozess", currentUser.role);

  /**
   * Verknüpfung Nutzer ↔ Bewerber-Datensatz. Beim Aktivieren im
   * Bewerbungsmanagement (invite-user) wird beides gespeichert: die
   * Auth-User-ID am Bewerber (userAccountId) und die Bewerber-ID in den
   * user_settings des Nutzers (bewerber_id). Für Altbestände ohne diese
   * Verknüpfung bleibt der E-Mail-Abgleich als Rückfall.
   */
  const verknuepfterBewerber = useMemo(() => {
    if (!nutzer || !darfVertragSehen) return undefined;
    const alle = getBewerber();
    const perAccount = alle.find((b) => b.userAccountId && b.userAccountId === nutzer.id);
    if (perAccount) return perAccount;
    const bewerberId = (userSettings?.einstellungen as { bewerber_id?: string } | undefined)?.bewerber_id;
    const perSettings = bewerberId ? alle.find((b) => b.id === bewerberId) : undefined;
    if (perSettings) return perSettings;
    const mail = (nutzer.email || "").trim().toLowerCase();
    if (!mail) return undefined;
    return alle.find(
      (b) =>
        (b.persoenlicheEmail || "").trim().toLowerCase() === mail ||
        (b.email || "").trim().toLowerCase() === mail,
    );
  }, [nutzer, userSettings, darfVertragSehen]);

  useEffect(() => {
    if (nutzer && open) {
      setSelectedRole(nutzer.rollen[0] || "kunde");
      setActiveTab("berechtigungen");
      loadCustomPermissions(nutzer.id);
      loadUserSettings(nutzer.id);
      loadAuditEvents(nutzer.id);
    }
  }, [nutzer, open]);

  const loadCustomPermissions = async (userId: string) => {
    setLoadingPerms(true);
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("einstellungen")
        .eq("user_id", userId)
        .single();
      const perms = (data?.einstellungen as any)?.custom_permissions || [];
      setCustomPermissions(perms);
    } catch {
      setCustomPermissions([]);
    } finally {
      setLoadingPerms(false);
    }
  };

  const loadUserSettings = async (userId: string) => {
    setLoadingSettings(true);
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("einstellungen, unterlagen, onboarding_complete, onboarding_steps")
        .eq("user_id", userId)
        .single();
      setUserSettings(data as any);
    } catch {
      setUserSettings(null);
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadAuditEvents = async (userId: string) => {
    setLoadingAudit(true);
    try {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .or(`actor.eq.${userId},entity_id.eq.${userId}`)
        .order("erstellt_am", { ascending: false })
        .limit(200);
      setAuditEvents((data as any[]) || []);
    } catch {
      setAuditEvents([]);
    } finally {
      setLoadingAudit(false);
    }
  };

  const isAllowedByRole = (url: string) => {
    return isUrlAllowedForRole(url, selectedRole as UserRole);
  };

  const isCustomGranted = (url: string) => customPermissions.includes(url);

  const togglePermission = (url: string) => {
    setCustomPermissions(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  const handleSave = async () => {
    if (!nutzer) return;
    setSaving(true);
    try {
      const { error: roleError } = await supabase
        .from("user_roles")
        .update({ role: selectedRole as any })
        .eq("user_id", nutzer.id);
      if (roleError) throw roleError;

      const { error: mergeError } = await supabase.rpc("merge_user_settings" as any, {
        _user_id: nutzer.id,
        _patch: { custom_permissions: customPermissions },
      });
      if (mergeError) throw mergeError;

      toast.success("Nutzerprofil gespeichert. Änderungen sind nach dem nächsten Login des Nutzers aktiv.");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Fehler: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadDoc = (doc: any) => {
    if (doc.url) {
      window.open(doc.url, "_blank");
    } else {
      toast.info("Kein Dokument zum Herunterladen vorhanden.");
    }
  };

  const handleDocStatus = async (docId: string, newStatus: "freigegeben" | "pruefung" | "fehlt") => {
    if (!nutzer) return;
    setApprovingDoc(docId);
    try {
      const updatedUnterlagen = unterlagen.map((doc: any) =>
        doc.id === docId ? { ...doc, status: newStatus } : doc
      );

      await supabase
        .from("user_settings")
        .update({ unterlagen: updatedUnterlagen, updated_at: new Date().toISOString() } as any)
        .eq("user_id", nutzer.id);

      setUserSettings(prev => prev ? { ...prev, unterlagen: updatedUnterlagen } : prev);

      // Notify the user about status change
      const docName = unterlagen.find((d: any) => d.id === docId)?.name || "Unterlage";
      const statusText = newStatus === "freigegeben" ? "freigegeben ✅" : "abgelehnt ❌";
      await supabase.from("benachrichtigungen").insert({
        benutzer_id: nutzer.id,
        titel: `Unterlage ${statusText}`,
        nachricht: `Dein Dokument "${docName}" wurde vom Backoffice ${statusText}.${newStatus === "fehlt" ? " Bitte lade es erneut hoch." : ""}`,
        link: "/einstellungen",
      } as any);

      // WICHTIG: Onboarding-Status NICHT durch Admin-Freigabe von Unterlagen
      // umschalten. `onboarding_complete` darf ausschließlich der Nutzer selbst
      // durch Speichern aller Profil-Pflichtfelder (inkl. Profilbild) setzen –
      // sonst landet er beim nächsten Reload ohne vollständiges Profil direkt
      // in der Vollbild-Academy.
      if (newStatus === "freigegeben") {
        const allApproved = updatedUnterlagen.every((d: any) => d.status === "freigegeben");
        toast.success(allApproved
          ? `"${docName}" freigegeben – alle Unterlagen vollständig.`
          : `"${docName}" freigegeben.`);
      } else {
        toast.info(`"${docName}" wurde abgelehnt – Nutzer wird benachrichtigt.`);
      }
    } catch (err: any) {
      toast.error("Fehler: " + (err.message || "Unbekannt"));
    } finally {
      setApprovingDoc(null);
    }
  };

  if (!nutzer) return null;

  const initials = `${nutzer.vorname?.[0] || "?"}${nutzer.nachname?.[0] || "?"}`.toUpperCase();
  const settings = userSettings?.einstellungen;
  const unterlagen: any[] = userSettings?.unterlagen || [];
  const onboardingComplete = userSettings?.onboarding_complete ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Shield className="h-5 w-5" /> Nutzerprofil & Berechtigungen
          </DialogTitle>
        </DialogHeader>

        {/* User Info */}
        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
          <Avatar className="h-14 w-14">
            {nutzer.avatarUrl && <AvatarImage src={nutzer.avatarUrl} alt={`${nutzer.vorname} ${nutzer.nachname}`} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{nutzer.vorname} {nutzer.nachname}</h3>
            <p className="text-sm text-muted-foreground">{nutzer.email}</p>
            {nutzer.moreId && <p className="text-xs text-muted-foreground">{nutzer.moreId}</p>}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge variant="secondary">{nutzer.rolle}</Badge>
            {onboardingComplete ? (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Onboarding abgeschlossen
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-warning text-warning">
                <Clock className="h-3 w-3 mr-1" /> Onboarding ausstehend
              </Badge>
            )}
          </div>
        </div>

        {/* Vertrag auf einen Blick – nur für Rollen mit Bewerbungsmanagement-Zugriff */}
        {darfVertragSehen && (
          <VertragAufEinenBlick
            bewerber={verknuepfterBewerber}
            fallbackText={
              verknuepfterBewerber
                ? "Im verknüpften Bewerber-Datensatz ist noch kein Vertragspaket hinterlegt."
                : "Kein Vertragsdatensatz im Bewerbermanagement verknüpft."
            }
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="berechtigungen" className="flex-1 gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Berechtigungen
            </TabsTrigger>
            <TabsTrigger value="einstellungen" className="flex-1 gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Einstellungen
            </TabsTrigger>
            <TabsTrigger value="unterlagen" className="flex-1 gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" /> Unterlagen
            </TabsTrigger>
            <TabsTrigger value="verlauf" className="flex-1 gap-1.5">
              <ScrollText className="h-3.5 w-3.5" /> Verlauf
            </TabsTrigger>
          </TabsList>

          {/* ═══ TAB: Berechtigungen ═══ */}
          <TabsContent value="berechtigungen" className="space-y-4 mt-4">
            {/* Role Selection */}
            <div>
              <label className="text-sm font-semibold mb-2 block">Zugewiesene Rolle</label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r.id !== "bewerber").map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                        {r.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Die Rolle bestimmt die Standard-Berechtigungen. Änderungen werden nach dem nächsten Login des Nutzers wirksam.
              </p>
            </div>

            {/* Teamleiter-Zuweisung (nur Vertriebspartner) */}
            {(selectedRole === "vertriebspartner" || (nutzer.rollen || []).includes("vertriebspartner")) && (
              <>
                <Separator />
                <TeamleaderSelect
                  userId={nutzer.id}
                  currentTeamleaderId={(userSettings?.einstellungen as any)?.teamleader_id || null}
                  onSaved={() => loadUserSettings(nutzer.id)}
                />
              </>
            )}

            <Separator />

            {/* Permissions */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" /> Menüpunkte & Berechtigungen
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                Grün = durch Rolle freigeschaltet. Rot = nicht verfügbar. Du kannst einzelne Menüpunkte manuell freischalten.
              </p>

              {loadingPerms ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
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
              )}
            </div>

            <Separator />

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Speichern
              </Button>
            </div>
          </TabsContent>

          {/* ═══ TAB: Einstellungen (read-only) ═══ */}
          <TabsContent value="einstellungen" className="space-y-4 mt-4">
            {loadingSettings ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !settings ? (
              <div className="text-center py-12 text-muted-foreground">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Dieser Nutzer hat noch keine Einstellungen hinterlegt.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Profil */}
                <Card className="p-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <User className="h-4 w-4" /> Profildaten
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Vorname", value: settings.profil?.vorname },
                      { label: "Nachname", value: settings.profil?.nachname },
                      { label: "Telefon", value: settings.profil?.telefon },
                      { label: "Position", value: settings.profil?.position },
                      { label: "Straße", value: settings.profil?.strasse ? `${settings.profil.strasse} ${settings.profil.hausnummer || ""}` : undefined },
                      { label: "Ort", value: settings.profil?.plz ? `${settings.profil.plz} ${settings.profil.ort || ""}` : undefined },
                    ].map(f => (
                      <div key={f.label}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.label}</p>
                        <p className="text-sm font-medium text-foreground">{f.value || <span className="text-muted-foreground italic">Nicht hinterlegt</span>}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Gewerbedaten */}
                <Card className="p-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4" /> Gewerbedaten
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Firmenname", value: settings.gewerbedaten?.firmenname },
                      { label: "Rechtsform", value: settings.gewerbedaten?.rechtsform },
                      { label: "Handelsregister", value: settings.gewerbedaten?.handelsregister },
                      { label: "Registergericht", value: settings.gewerbedaten?.registergericht },
                    ].map(f => (
                      <div key={f.label}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.label}</p>
                        <p className="text-sm font-medium text-foreground">{f.value || <span className="text-muted-foreground italic">Nicht hinterlegt</span>}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Steuer & Bank */}
                <Card className="p-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Landmark className="h-4 w-4" /> Steuer & Bankdaten
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Steuernummer", value: settings.steuerBank?.steuernummer },
                      { label: "USt-IdNr.", value: settings.steuerBank?.ustIdNr },
                      { label: "Finanzamt", value: settings.steuerBank?.finanzamt },
                      { label: "IBAN", value: settings.steuerBank?.iban },
                      { label: "BIC", value: settings.steuerBank?.bic },
                      { label: "Bank", value: settings.steuerBank?.bankname },
                    ].map(f => (
                      <div key={f.label}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{f.label}</p>
                        <p className="text-sm font-medium text-foreground">{f.value || <span className="text-muted-foreground italic">Nicht hinterlegt</span>}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Nur-Lesen-Ansicht – Änderungen können nur vom Nutzer selbst vorgenommen werden.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ═══ TAB: Unterlagen ═══ */}
          <TabsContent value="unterlagen" className="space-y-4 mt-4">
            {loadingSettings ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : unterlagen.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Dieser Nutzer hat noch keine Unterlagen hochgeladen.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  Vom Nutzer hochgeladene Pflichtunterlagen. Du kannst diese herunterladen und prüfen.
                </p>
                {unterlagen.map((doc: any, i: number) => (
                  <div key={doc.id || i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50">
                    <div className="flex items-center gap-3">
                      {statusIcon[doc.status as keyof typeof statusIcon] || statusIcon.fehlt}
                      <div>
                        <p className="text-sm font-medium text-foreground">{doc.name || doc.dateiname || `Unterlage ${i + 1}`}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {doc.beschreibung || ""} · Status: {statusLabel[doc.status] || "Unbekannt"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${
                        doc.status === "freigegeben" ? "border-green-500 text-green-600" :
                        doc.status === "pruefung" ? "border-warning text-warning" :
                        "border-destructive text-destructive"
                      }`}>
                        {statusLabel[doc.status] || "Fehlt"}
                      </Badge>
                      {(doc.url || doc.dateiname) && (
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => handleDownloadDoc(doc)}>
                          <Download className="h-3 w-3 mr-1" /> Download
                        </Button>
                      )}
                      {doc.status === "pruefung" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
                            disabled={approvingDoc === doc.id}
                            onClick={() => handleDocStatus(doc.id, "freigegeben")}
                          >
                            {approvingDoc === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3 mr-1" />}
                            Freigeben
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs border-destructive text-destructive hover:bg-destructive/10"
                            disabled={approvingDoc === doc.id}
                            onClick={() => handleDocStatus(doc.id, "fehlt")}
                          >
                            {approvingDoc === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsDown className="h-3 w-3 mr-1" />}
                            Ablehnen
                          </Button>
                        </>
                      )}
                      {doc.status === "freigegeben" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-destructive"
                          disabled={approvingDoc === doc.id}
                          onClick={() => handleDocStatus(doc.id, "fehlt")}
                        >
                          Widerrufen
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ═══ TAB: Verlauf (Audit-Log) ═══ */}
          <TabsContent value="verlauf" className="space-y-3 mt-4">
            <p className="text-xs text-muted-foreground">
              Alle protokollierten Ereignisse, bei denen dieser Nutzer Auslöser oder betroffene Entität war (max. 200).
            </p>
            {loadingAudit ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !auditEvents || auditEvents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Keine Audit-Einträge für diesen Nutzer.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {auditEvents.map((ev) => {
                  const isActor = ev.actor === nutzer.id;
                  return (
                    <div key={ev.id} className="border rounded-lg p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{ev.action}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{ev.entity}</Badge>
                          <Badge variant="outline" className={`text-[10px] ${isActor ? "border-primary text-primary" : "border-warning text-warning"}`}>
                            {isActor ? "als Auslöser" : "betroffen"}
                          </Badge>
                        </div>
                        <span className="text-muted-foreground">
                          {new Date(ev.erstellt_am).toLocaleString("de-DE")}
                        </span>
                      </div>
                      {ev.entity_id && (
                        <p className="text-muted-foreground">Entity-ID: <span className="font-mono">{ev.entity_id}</span></p>
                      )}
                      {(ev.vorher || ev.nachher) && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Details</summary>
                          {ev.vorher && (
                            <pre className="mt-1 p-2 bg-muted/50 rounded text-[10px] overflow-x-auto">
vorher: {JSON.stringify(ev.vorher, null, 2)}
                            </pre>
                          )}
                          {ev.nachher && (
                            <pre className="mt-1 p-2 bg-muted/50 rounded text-[10px] overflow-x-auto">
nachher: {JSON.stringify(ev.nachher, null, 2)}
                            </pre>
                          )}
                          {ev.meta && Object.keys(ev.meta).length > 0 && (
                            <pre className="mt-1 p-2 bg-muted/50 rounded text-[10px] overflow-x-auto">
meta: {JSON.stringify(ev.meta, null, 2)}
                            </pre>
                          )}
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
