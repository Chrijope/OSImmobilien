import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, KeyRound, Eye, EyeOff, Download, ShieldAlert, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { supabase } from "@/integrations/supabase/client";
import { useUserSettings } from "@/hooks/useUserSettings";
import { requestPushPermission } from "@/lib/pushNotifications";
import { ActiveSessionsSection } from "@/pages/Einstellungen";
import { KundenZweiFaktor } from "@/components/kunde/KundenZweiFaktor";
import { useSearchParams } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { portalSprache } from "@/i18n/portalSprache";
import { datumText, zahlText } from "@/lib/sprachFormat";
import { friendlyError } from "@/lib/errorMessages";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Kunden-Einstellungen im neuen Portal-Look.
 * Nutzt KundePortalLayout (keine CRM-Sidebar) und zeigt nur die für Kunden
 * relevanten Bereiche: Benachrichtigungen, Passwort & Sicherheit.
 */
export default function KundeEinstellungen() {
  const { t } = useTranslation();
  const { loaded, settings, saveSettings } = useUserSettings();
  // `?tab=sicherheit` kommt vom Hinweis „Jetzt einrichten“ und öffnet gleich
  // den Reiter mit der Zwei-Faktor-Anmeldung.
  const [searchParams] = useSearchParams();
  const startReiter = ["benachrichtigungen", "passwort", "sicherheit", "datenschutz"].includes(searchParams.get("tab") || "")
    ? (searchParams.get("tab") as string)
    : "benachrichtigungen";

  const kanaele = settings?.benachrichtigungen?.kanaele || { email: true, feed: true, browser: false, popup: true };

  const toggleKanal = (key: "email" | "feed" | "browser" | "popup", v: boolean) => {
    saveSettings({
      ...settings,
      benachrichtigungen: {
        ...settings.benachrichtigungen,
        kanaele: { ...kanaele, [key]: v },
      },
    });
    if (key === "browser" && v) {
      requestPushPermission().then((granted) => {
        if (!granted) toast.error(t("portal.settings.browser_blocked"));
      });
    }
  };

  return (
    <div className="portal-settings max-w-3xl">
        <header className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/45 mb-1">{t("portal.settings.eyebrow")}</div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("portal.settings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("portal.settings.subtitle")}</p>
        </header>

        <Tabs defaultValue={startReiter} className="w-full">
          {/* Auf dem Handy zwei mal zwei Reiter statt einer Zeile. Die Zeile
              lief dort über den Rand und war links wie rechts abgeschnitten. */}
          <TabsList className="grid w-full grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-start h-auto gap-1 bg-transparent border-b border-border rounded-none p-0 mb-6">
            {[
              { value: "benachrichtigungen", label: t("portal.settings.tabs.notifications") },
              { value: "passwort", label: t("portal.settings.tabs.password") },
              { value: "sicherheit", label: t("portal.settings.tabs.security") },
              { value: "datenschutz", label: t("portal.settings.tabs.privacy") },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="min-h-[44px] whitespace-normal text-center rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 py-2 text-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="benachrichtigungen" className="space-y-6">
            <section>
              <h3 className="text-lg font-bold text-foreground">{t("portal.settings.notifications_heading")}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t("portal.settings.notifications_sub")}</p>
              {!loaded ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("portal.settings.loading")}
                </div>
              ) : (
                [
                  { key: "email" as const, t: t("portal.settings.channel_email_t"), d: t("portal.settings.channel_email_d") },
                  { key: "feed" as const, t: t("portal.settings.channel_feed_t"), d: t("portal.settings.channel_feed_d") },
                  { key: "browser" as const, t: t("portal.settings.channel_browser_t"), d: t("portal.settings.channel_browser_d") },
                  { key: "popup" as const, t: t("portal.settings.channel_popup_t"), d: t("portal.settings.channel_popup_d") },
                ].map((n) => (
                  <div key={n.key} className="flex items-start gap-3 py-3">
                    <Switch checked={!!kanaele[n.key]} onCheckedChange={(v) => toggleKanal(n.key, v)} />
                    <div>
                      <p className="text-sm font-medium">{n.t}</p>
                      <p className="text-xs text-muted-foreground">{n.d}</p>
                    </div>
                  </div>
                ))
              )}
              <p className="text-xs text-muted-foreground mt-2">{t("portal.settings.auto_save_hint")}</p>
            </section>
          </TabsContent>

          <TabsContent value="passwort" className="space-y-6">
            <PasswordChangeCard />
          </TabsContent>

          <TabsContent value="sicherheit" className="space-y-6">
            <KundenZweiFaktor />
            <Separator />
            <ActiveSessionsSection />
          </TabsContent>

          <TabsContent value="datenschutz" className="space-y-6">
            <DsgvoSection />
          </TabsContent>
        </Tabs>
    </div>
  );
}

/** Mindestlänge fürs Portal-Passwort. Prüfung und Texte beziehen sich beide hierauf. */
const MIN_PASSWORD_LENGTH = 10;

function PasswordChangeCard() {
  const { t } = useTranslation();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (pw1.length < MIN_PASSWORD_LENGTH) { toast.error(t("portal.settings.password_too_short", { min: MIN_PASSWORD_LENGTH })); return; }
    const { evaluatePassword, checkPasswordPwned } = await import("@/lib/passwordSecurity");
    const s = await evaluatePassword(pw1);
    if (!s.acceptable) { toast.error(t("portal.settings.password_too_weak")); return; }
    if (pw1 !== pw2) { toast.error(t("portal.settings.password_mismatch")); return; }
    setSaving(true);
    const pwned = await checkPasswordPwned(pw1);
    if (pwned > 0) {
      setSaving(false);
      toast.error(t("portal.settings.password_pwned", { times: zahlText(pwned, portalSprache()) }));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSaving(false);
    if (error) { toast.error(t("portal.settings.error_prefix") + friendlyError(error, undefined, portalSprache())); return; }
    toast.success(t("portal.settings.password_saved"));
    setPw1(""); setPw2("");
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="h-4 w-4 text-foreground/60" />
        <h3 className="text-lg font-bold text-foreground">{t("portal.settings.password_heading")}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t("portal.settings.password_sub", { min: MIN_PASSWORD_LENGTH })}</p>

      <div className="space-y-3 max-w-md">
        <div>
          <label className="text-sm font-semibold block mb-1.5">{t("portal.settings.password_new")}</label>
          <div className="relative">
            <Input type={show ? "text" : "password"} value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder={t("portal.settings.password_placeholder_min", { min: MIN_PASSWORD_LENGTH })} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? t("portal.settings.password_hide") : t("portal.settings.password_show")}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2">
            <PasswordStrengthMeter password={pw1} />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1.5">{t("portal.settings.password_repeat")}</label>
          <Input type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t("portal.settings.password_placeholder_again")} />
        </div>
        <div className="flex justify-end pt-1">
          <Button variant="brand" onClick={submit} disabled={saving || !pw1 || !pw2}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("portal.settings.password_saving")}</> : t("portal.settings.password_submit")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Frist bis zur endgültigen Löschung. Einzige Quelle der Wahrheit: alle
 * nutzersichtbaren Texte werden aus dieser Konstante erzeugt, damit Frist und
 * Text nie wieder auseinanderlaufen (Art. 17 DSGVO).
 */
const DELETION_COOLDOWN_DAYS = 30;

function DsgvoSection() {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionRequestedAt, setDeletionRequestedAt] = useState<string | null>(null);
  const sprache = portalSprache();

  // Lade aktuellen Lösch-Status
  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("kontakte")
          .select("meta")
          .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        const reqAt = (data?.meta as any)?.deletionRequestedAt;
        if (reqAt) setDeletionRequestedAt(reqAt);
      } catch (e: any) {
        if (cancelled) return;
        toast.error(t("portal.settings.dsgvo.status_failed"));
        console.error("[KundeEinstellungen] Löschstatus konnte nicht geladen werden:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.id, t]);

  const handleExport = async () => {
    if (!authUser?.id) return;
    setExporting(true);
    try {
      const { data: kontakt } = await supabase
        .from("kontakte")
        .select("*")
        .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
        .maybeSingle();

      let investments: any[] = [];
      if (kontakt?.id) {
        const { data: invs } = await supabase
          .from("investments")
          .select("*")
          .eq("kunde_id", kontakt.id);
        investments = invs || [];
      }

      const payload = {
        exportiert_am: new Date().toISOString(),
        hinweis: t("portal.settings.dsgvo.export_note"),
        konto: {
          email: authUser.email,
          id: authUser.id,
          erstellt_am: authUser.created_at,
        },
        profil: kontakt,
        investments,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t("portal.settings.dsgvo.export_file_name")}-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("portal.settings.dsgvo.export_done"));
    } catch (e: any) {
      toast.error(t("portal.settings.dsgvo.export_failed") + friendlyError(e, undefined, portalSprache()));
    } finally {
      setExporting(false);
    }
  };

  const handleDeletionRequest = async () => {
    if (!authUser?.id) return;
    setDeleting(true);
    try {
      const { data: kontakt } = await supabase
        .from("kontakte")
        .select("id, vorname, nachname, zustaendig_id")
        .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
        .maybeSingle();
      if (!kontakt?.id) {
        toast.error(t("portal.settings.dsgvo.profile_not_found"));
        return;
      }
      const now = new Date().toISOString();
      await supabase.rpc("merge_kontakt_meta", {
        _kontakt_id: kontakt.id,
        _updates: { deletionRequestedAt: now, deletionRequestedBy: "user" },
      });

      // VP per Bell+Inbox benachrichtigen
      if (kontakt.zustaendig_id) {
        await supabase.from("benachrichtigungen").insert({
          benutzer_id: kontakt.zustaendig_id,
          titel: `Löschanfrage: ${kontakt.vorname} ${kontakt.nachname}`,
          nachricht: `${kontakt.vorname} ${kontakt.nachname} hat im Kundenportal die Löschung seines Kontos beantragt. Bitte prüfen und an Admin weiterleiten.`,
          link: `/kunden/${kontakt.id}`,
        });
      }

      setDeletionRequestedAt(now);
      toast.success(t("portal.settings.dsgvo.request_done"));
    } catch (e: any) {
      toast.error(t("portal.settings.dsgvo.request_failed") + friendlyError(e, undefined, portalSprache()));
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    if (!authUser?.id) return;
    setDeleting(true);
    try {
      const { data: kontakt, error: findError } = await supabase
        .from("kontakte")
        .select("id")
        .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
        .maybeSingle();
      if (findError) throw findError;
      if (!kontakt?.id) {
        toast.error(t("portal.settings.dsgvo.profile_not_found"));
        return;
      }
      const { error: rpcError } = await supabase.rpc("merge_kontakt_meta", {
        _kontakt_id: kontakt.id,
        _updates: { deletionRequestedAt: null, deletionRequestedBy: null },
      });
      if (rpcError) throw rpcError;
      setDeletionRequestedAt(null);
      toast.success(t("portal.settings.dsgvo.withdraw_done"));
    } catch (e: any) {
      toast.error(t("portal.settings.dsgvo.withdraw_failed") + friendlyError(e, undefined, portalSprache()));
    } finally {
      setDeleting(false);
    }
  };

  const deletionDate = deletionRequestedAt
    ? new Date(new Date(deletionRequestedAt).getTime() + DELETION_COOLDOWN_DAYS * 86400000)
    : null;

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <Download className="h-4 w-4 text-foreground/60" />
          <h3 className="text-lg font-bold text-foreground">{t("portal.settings.dsgvo.export_title")}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t("portal.settings.dsgvo.export_sub")}
        </p>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting
            ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("portal.settings.dsgvo.export_running")}</>
            : <><Download className="h-4 w-4 mr-1" /> {t("portal.settings.dsgvo.export_button")}</>}
        </Button>
      </Card>

      <Card className="p-5 border-destructive/30">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <h3 className="text-lg font-bold text-foreground">{t("portal.settings.dsgvo.delete_title")}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t("portal.settings.dsgvo.delete_sub", { days: DELETION_COOLDOWN_DAYS })}
        </p>

        {deletionRequestedAt ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-destructive">{t("portal.settings.dsgvo.pending_title")}</p>
                <p className="text-xs mt-1">
                  {t("portal.settings.dsgvo.pending_text", {
                    date: datumText(deletionRequestedAt, sprache),
                    days: DELETION_COOLDOWN_DAYS,
                  })}
                </p>
                {deletionDate && (
                  <p className="text-xs mt-1 font-medium">
                    {t("portal.settings.dsgvo.pending_date", { date: datumText(deletionDate, sprache) })}
                  </p>
                )}
              </div>
            </div>
            <Button variant="outline" onClick={handleCancelDeletion} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {t("portal.settings.dsgvo.withdraw")}
            </Button>
          </div>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">{t("portal.settings.dsgvo.request_button")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("portal.settings.dsgvo.confirm_title")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("portal.settings.dsgvo.confirm_text", { days: DELETION_COOLDOWN_DAYS })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("portal.settings.dsgvo.confirm_cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeletionRequest} disabled={deleting}>
                  {t("portal.settings.dsgvo.confirm_action")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </Card>
    </>
  );
}