import "@/styles/kundenportal.css";
// Liquid Glass fuer das Portal. Muss nach der Datei darueber stehen, die sie ueberstimmt.
import "@/styles/kundenportal-liquid.css";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import logoImg from "@/assets/moreimmo-logo.png";
import { useTranslation } from "react-i18next";
import { portalSprache, useHtmlLang } from "@/i18n/portalSprache";

/**
 * Button-gated activation page.
 *
 * Auth-Email-Links (Supabase /verify) sind One-Time-Tokens und werden häufig
 * von E-Mail-Scannern (Outlook Safe Links, Microsoft Defender, Gmail Preview)
 * "verbraucht", bevor der Kunde den Link überhaupt klickt. Resultat:
 * "Link ungültig oder abgelaufen".
 *
 * Diese Seite hält den `token_hash` als Query-Parameter und führt verifyOtp()
 * erst nach einem expliziten Button-Klick aus — Scanner klicken keine Buttons.
 */
const PortalAktivieren = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useHtmlLang();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tokenHash = params.get("token_hash") || "";
  const rawType = (params.get("type") || "recovery").toLowerCase();
  const otpType = (["recovery", "invite", "signup", "magiclink", "email_change"].includes(rawType)
    ? rawType
    : "recovery") as "recovery" | "invite" | "signup" | "magiclink" | "email_change";
  const loginEmail = params.get("loginEmail") || params.get("email") || "";
  const kontaktId = params.get("kontaktId") || "";
  const portal = params.get("portal") || "";
  const next = params.get("next") || "";
  const kundeName = params.get("kundeName") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedName = kundeName;

  // Ohne Namen in der Adresse bleibt die Begrüßung allgemein. Die frühere
  // Nachfrage per E-Mail-Adresse verriet jedem, ob es ein Konto gibt, und ist
  // seit 20261004130000 ohne Anmeldung gesperrt.

  const handleActivate = async () => {
    if (!tokenHash) {
      setError(t("auth.portal_aktivieren.kein_token"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser && (!loginEmail || currentUser.email?.toLowerCase() !== loginEmail.toLowerCase())) {
        await supabase.auth.signOut();
      }
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (verifyError) {
        setError(
          verifyError.message.toLowerCase().includes("expired")
            ? t("auth.portal_aktivieren.abgelaufen")
            : t("auth.portal_aktivieren.fehlgeschlagen", { fehler: verifyError.message }),
        );
        setLoading(false);
        return;
      }
      toast.success(t("auth.portal_aktivieren.verifiziert"));
      const sp = new URLSearchParams();
      if (portal) sp.set("portal", portal);
      if (next) sp.set("next", next);
      if (loginEmail) sp.set("loginEmail", loginEmail);
      if (kontaktId) sp.set("kontaktId", kontaktId);
      if (kundeName) sp.set("kundeName", kundeName);
      // Die Passwortseite öffnet in derselben Sprache wie diese.
      sp.set("lang", portalSprache());
      navigate(`/reset-password${sp.toString() ? `?${sp.toString()}` : ""}`, { replace: true });
    } catch (err: any) {
      setError(t("auth.allgemein.fehler_mit_text", { fehler: err?.message || t("portal.common.error_unknown") }));
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!loginEmail) {
      toast.error(t("auth.portal_aktivieren.keine_email"));
      return;
    }
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (portal) sp.set("portal", portal);
      if (next) sp.set("next", next);
      if (loginEmail) sp.set("loginEmail", loginEmail);
      if (kontaktId) sp.set("kontaktId", kontaktId);
      if (kundeName) sp.set("kundeName", kundeName);
      sp.set("lang", portalSprache());
      const redirectTo = `${window.location.origin}/reset-password${sp.toString() ? `?${sp.toString()}` : ""}`;
      const { error: resendError } = await supabase.auth.resetPasswordForEmail(loginEmail, { redirectTo });
      if (resendError) {
        toast.error(t("auth.portal_aktivieren.senden_fehlgeschlagen", { fehler: resendError.message }));
      } else {
        toast.success(t("auth.portal_aktivieren.gesendet", { email: loginEmail }));
      }
    } catch (err: any) {
      toast.error(t("auth.allgemein.fehler_mit_text", { fehler: err?.message || t("portal.common.error_unknown") }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-lg="seite" data-portal={portal} className="portal-ui portal-activation min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <img src={logoImg} alt="OS Immobilien" className="h-10 mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground font-serif">
            {resolvedName
              ? t("auth.portal_aktivieren.hallo_name", { name: resolvedName.split(" ")[0] })
              : t("auth.portal_aktivieren.hallo")}
          </h1>
          <p className="text-muted-foreground">
            {portal === "kunde"
              ? t("auth.portal_aktivieren.text_kundenportal")
              : t("auth.portal_aktivieren.text_konto")}
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button
          onClick={handleActivate}
          disabled={loading || !tokenHash}
          className="w-full h-12 text-base font-medium text-white"
          style={{ background: "linear-gradient(135deg, hsl(72, 18%, 42%), hsl(72, 18%, 52%))" }}
        >
          {loading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <KeyRound className="h-5 w-5 mr-2" />}
          {loading ? t("auth.portal_aktivieren.absenden_laeuft") : t("auth.portal_aktivieren.absenden")}
        </Button>

        {error && loginEmail && (
          <Button onClick={handleResend} variant="outline" disabled={loading} className="w-full">
            {t("auth.portal_aktivieren.neu_anfordern")}
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          {t("auth.portal_aktivieren.sicherheit")}
        </p>
      </div>
    </div>
  );
};

export default PortalAktivieren;