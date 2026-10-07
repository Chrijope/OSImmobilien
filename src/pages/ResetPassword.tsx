import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { upsertUserSettingsRole } from "@/lib/userRoles";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import logoImg from "@/assets/moreimmo-logo.png";
import { useTranslation } from "react-i18next";
import { portalSprache, useHtmlLang } from "@/i18n/portalSprache";
import { zahlText } from "@/lib/sprachFormat";
import { CodeEingabe } from "@/components/security/CodeEingabe";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useHtmlLang();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [pwSecurity, setPwSecurity] = useState<{ ok: boolean; pwnedCount: number; score: number }>({
    ok: false,
    pwnedCount: 0,
    score: 0,
  });
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVerifying, setMfaVerifying] = useState(false);
  const [mfaCodeFehler, setMfaCodeFehler] = useState(0);

  const searchParams = new URLSearchParams(window.location.search);
  const loginEmailFromUrl = searchParams.get("loginEmail") || "";
  const kontaktIdFromUrl = searchParams.get("kontaktId") || "";
  const portalFromUrl = searchParams.get("portal") || "";
  const nextFromUrl = searchParams.get("next") || "";
  const kundeNameFromUrl = searchParams.get("kundeName") || "";

  useEffect(() => {
    let mounted = true;

    const getFlowState = () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const searchParams = new URLSearchParams(window.location.search);
      const flowType = hashParams.get("type") || searchParams.get("type");
      const hasAuthTokens = hashParams.has("access_token") || searchParams.has("code") || searchParams.has("token_hash");
      const isPasswordFlow = ["recovery", "invite", "signup"].includes(flowType || "") || hasAuthTokens;
      const errorCode = hashParams.get("error_code") || searchParams.get("error_code") || hashParams.get("error") || searchParams.get("error");
      const errorDescription = hashParams.get("error_description") || searchParams.get("error_description");

      return { isPasswordFlow, errorCode, errorDescription };
    };

    const resolveSession = async (sessionOverride?: Session | null) => {
      if (sessionOverride?.user) return true;

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) return true;

      await new Promise((resolve) => window.setTimeout(resolve, 350));

      const { data: { session: retriedSession } } = await supabase.auth.getSession();
      return !!retriedSession?.user;
    };

    const syncRecoveryState = async (sessionOverride?: Session | null) => {
      try {
        const { isPasswordFlow, errorCode, errorDescription } = getFlowState();

        if (errorCode) {
          if (!mounted) return;
          const msg = String(errorCode).toLowerCase();
          if (msg.includes("expired") || msg.includes("otp_expired")) {
            setLinkError(t("auth.reset.abgelaufen"));
          } else if (msg.includes("denied") || msg.includes("invalid")) {
            setLinkError(t("auth.reset.ungueltig_verwendet"));
          } else {
            setLinkError(errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, " ")) : t("auth.reset.nicht_verarbeitet_aktivierung"));
          }
          setIsRecovery(false);
          setAuthChecking(false);
          return;
        }

        if (isPasswordFlow) {
          if (!mounted) return;
          setIsRecovery(true);
          setAuthChecking(false);
          return;
        }

        const hasSession = await resolveSession(sessionOverride);
        if (!mounted) return;

        setIsRecovery(hasSession);
        if (!hasSession) {
          setLinkError(t("auth.reset.ungueltig"));
        }
        setAuthChecking(false);
      } catch {
        if (!mounted) return;
        setIsRecovery(false);
        setLinkError(t("auth.reset.nicht_verarbeitet"));
        setAuthChecking(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (["PASSWORD_RECOVERY", "SIGNED_IN", "INITIAL_SESSION"].includes(event)) {
        void syncRecoveryState(session);
        return;
      }

      if (event === "SIGNED_OUT" && mounted) {
        setIsRecovery(false);
        setAuthChecking(false);
      }
    });

    void syncRecoveryState();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // Einmal beim Öffnen; t wechselt auf dieser Seite nicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validatePassword = async (pw: string): Promise<string | null> => {
    if (pw.length < 8) return t("auth.aktivieren.code.password_too_short");
    // Erst hier nachladen. Die Woerterbuecher von zxcvbn wiegen rund 800 KB
    // gzip und wuerden diese Seite sonst schon beim Oeffnen aufblaehen.
    const { evaluatePassword } = await import("@/lib/passwordSecurity");
    const s = await evaluatePassword(pw);
    if (!s.acceptable) return t("auth.reset.zu_schwach");
    return null;
  };

  // Meldet den Nutzer nach dem Passwortwechsel ab, damit er sich bewusst neu
  // anmeldet. Gibt zurueck, ob das geklappt hat. Bleibt eine alte Sitzung
  // bestehen, sieht der Nutzer sonst weiter die Ansicht des alten Zugangs,
  // ohne zu verstehen warum. Deshalb wird ein Fehlschlag gemeldet.
  const abmelden = async (): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Abmelden nach dem Passwortwechsel fehlgeschlagen:", error);
        return false;
      }
      return true;
    } catch (fehler) {
      console.error("Abmelden nach dem Passwortwechsel fehlgeschlagen:", fehler);
      return false;
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwError = await validatePassword(password);
    if (pwError) {
      toast.error(pwError);
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.allgemein.passwoerter_ungleich"));
      return;
    }
    setLoading(true);
    // HIBP-Check serverseitig vom Browser (k-anonymity)
    const { checkPasswordPwned } = await import("@/lib/passwordSecurity");
    const pwnedCount = await checkPasswordPwned(password);
    if (pwnedCount > 0) {
      toast.error(t("portal.settings.password_pwned", { times: zahlText(pwnedCount, portalSprache()) }));
      setLoading(false);
      return;
    }
    // Wenn der User MFA (TOTP) aktiviert hat, verlangt Supabase AAL2, um das
    // Passwort ändern zu dürfen. Recovery-Links liefern aber nur AAL1 -> wir
    // müssen zuerst eine TOTP-Challenge bestehen.
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      const needsAal2 = msg.includes("aal2") || msg.includes("mfa");
      if (needsAal2) {
        try {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const totp = factors?.totp?.find((f) => f.status === "verified") || factors?.all?.find((f) => f.status === "verified");
          if (totp?.id) {
            setMfaFactorId(totp.id);
            setMfaRequired(true);
            toast.info(t("auth.reset.mfa_bitte_code"));
            setLoading(false);
            return;
          }
        } catch (mfaErr) {
          console.error("MFA-Faktor konnte nicht ermittelt werden:", mfaErr);
        }
      }
      toast.error(t("auth.reset.fehler_zuruecksetzen", { fehler: error.message }));
      setLoading(false);
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const nextPath = searchParams.get("next");

    // WICHTIG: NICHT auf den URL-Flag ?portal=kunde vertrauen, sondern auf die
    // tatsächlich verifizierten Rollen des Auth-Users, der gerade das Passwort
    // gesetzt hat. Sonst landen z.B. frisch eingeladene Vertriebspartner im
    // Kundenportal, wenn der Browser parallel noch eine Kunden-Session offen
    // hatte (Apple-Mail-Aliase, dasselbe Postfach -> mehrere Auth-Accounts).
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        const { data: roleRows, error: rollenFehler } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", currentUser.id);

        // Ohne gelesene Rollen greift weiter unten der sichere Rueckfallweg
        // (abmelden und neu anmelden). Ein stiller Fehlschlag waere hier
        // besonders unangenehm, weil dann eine alte Ansicht bestehen bleibt.
        if (rollenFehler) {
          console.error("Rollen des Nutzers konnten nicht gelesen werden:", rollenFehler);
        }

        const roles = (roleRows || []).map((entry: any) => entry.role as string);
        const hasKundeRole = roles.includes("kunde");
        const hasInternalRole = roles.some((r) => r !== "kunde");
        const urlSuggestsKunde = searchParams.get("portal") === "kunde";

        // Kunden-Portal nur betreten, wenn der User EINDEUTIG nur Kunde ist
        // (oder bewusst über den Kunden-Aktivierungslink kam UND Kunde ist).
        if (hasKundeRole && !hasInternalRole && urlSuggestsKunde) {
            await upsertUserSettingsRole(currentUser.id, "kunde");

            let kontaktId = "";
            if (kontaktIdFromUrl) {
              const { data: requestedKontakt } = await supabase
                .from("kontakte")
                .select("id")
                .eq("id", kontaktIdFromUrl)
                .or(`meta->>authUserId.eq.${currentUser.id},meta->person2->>authUserId.eq.${currentUser.id}`)
                .maybeSingle();
              kontaktId = requestedKontakt?.id || "";
            }
            if (!kontaktId) {
              const { data: kontakte } = await supabase
                .from("kontakte")
                .select("id")
                .or(`meta->>authUserId.eq.${currentUser.id},meta->person2->>authUserId.eq.${currentUser.id}`)
                .limit(1);
              kontaktId = kontakte?.[0]?.id || "";
            }
            // Diese Freischaltung entscheidet, ob der Kunde seine Unterlagen im
            // Portal sieht. Ein stiller Fehlschlag hier hat frueher trotzdem
            // "Dein Kundenportal ist jetzt aktiv" gemeldet.
            let portalAktiviert = false;
            if (kontaktId) {
              const { error: portalFehler } = await supabase.rpc("merge_kontakt_meta", {
                _kontakt_id: kontaktId,
                _updates: {
                  portalAktiv: true,
                  portalFreigeschalten: true,
                  portalGesperrt: false,
                  portalAktivAt: new Date().toISOString(),
                },
              });
              if (portalFehler) {
                console.error("Kundenportal konnte nicht freigeschaltet werden:", portalFehler);
              } else {
                portalAktiviert = true;
              }
            } else {
              console.warn("Zu diesem Zugang wurde kein passender Kontakt gefunden, das Kundenportal wurde nicht freigeschaltet.");
            }

          if (portalAktiviert) {
            toast.success(t("auth.reset.portal_aktiv"));
          } else {
            toast.error(t("auth.reset.portal_nicht_aktiv"));
          }
          navigate(nextPath || "/kunde/stammdaten", { replace: true });
          setLoading(false);
          return;
        }

        // Interner Nutzer (VP, Setter, Admin, ...) – immer ins CRM-Onboarding,
        // nie ins Kundenportal, auch wenn URL-Param etwas anderes suggeriert.
        if (hasInternalRole) {
          // Aktive Rolle auf die wichtigste interne Rolle setzen, damit nicht
          // versehentlich "kunde" als active_role aus einer alten Session
          // bestehen bleibt.
          const preferred = ["inhaber","admin","vertriebsleiter","vertriebspartner","setterin","backoffice","hr","buchhaltung","marketing","versicherungsexperte","objektpartner","finanzierungspartner","hausverwaltung","individuell","testaccount"].find((r) => roles.includes(r));
          // Scheitert das Speichern der Ansicht, bleibt eine alte Einstellung
          // stehen und der Nutzer landet nach dem Anmelden im falschen Bereich.
          // Das darf nicht mehr still passieren.
          let ansichtGesetzt = true;
          if (preferred) {
            try {
              await upsertUserSettingsRole(currentUser.id, preferred as any);
            } catch (ansichtFehler) {
              ansichtGesetzt = false;
              console.error("Aktive Ansicht konnte nicht gespeichert werden:", ansichtFehler);
            }
          }
          // Erst ausloggen, damit der Nutzer sich bewusst mit E-Mail + Passwort
          // einloggen muss. Danach greift im DashboardLayout der Onboarding-Redirect.
          const abgemeldet = await abmelden();
          if (!ansichtGesetzt) {
            toast.error(t("auth.reset.ansicht_fehler"));
          } else if (!abgemeldet) {
            toast.warning(t("auth.reset.abmeldung_fehler"));
          } else {
            toast.success(t("auth.reset.erfolg_neu_anmelden"));
          }
          navigate(`/login?lang=${portalSprache()}`, { replace: true });
          setLoading(false);
          return;
        }
      }
    } catch (syncError) {
      console.error("Rollen-basierte Weiterleitung fehlgeschlagen:", syncError);
    }

    // Fallback (Rolle unbekannt): ebenfalls Login erzwingen
    const abgemeldetFallback = await abmelden();
    if (abgemeldetFallback) {
      toast.success(t("auth.reset.erfolg_neu_anmelden"));
    } else {
      toast.warning(t("auth.reset.abmeldung_fehler"));
    }
    navigate(`/login?lang=${portalSprache()}`, { replace: true });
    setLoading(false);
  };

  const handleMfaVerify = (e: React.FormEvent) => {
    e.preventDefault();
    mfaPruefen();
  };

  // Auch ohne Formular aufrufbar: Die Codeeingabe sendet nach der sechsten Ziffer selbst ab.
  const mfaPruefen = async () => {
    if (mfaVerifying) return;
    if (!mfaFactorId) {
      toast.error(t("auth.reset.kein_faktor"));
      return;
    }
    const code = mfaCode.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) {
      toast.error(t("auth.reset.code_sechs"));
      return;
    }
    setMfaVerifying(true);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code,
      });
      if (verifyError) {
        toast.error(t("auth.reset.code_ungueltig", { fehler: verifyError.message }));
        setMfaCodeFehler((n) => n + 1);
        setMfaVerifying(false);
        return;
      }
      // Jetzt mit AAL2-Session das Passwort setzen
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        toast.error(t("auth.reset.fehler_zuruecksetzen", { fehler: pwError.message }));
        setMfaVerifying(false);
        return;
      }
      setMfaRequired(false);
      setMfaVerifying(false);
      const abgemeldetNachMfa = await abmelden();
      if (abgemeldetNachMfa) {
        toast.success(t("auth.reset.erfolg_neu_anmelden"));
      } else {
        toast.warning(t("auth.reset.abmeldung_fehler"));
      }
      navigate(`/login?lang=${portalSprache()}`, { replace: true });
    } catch (err: any) {
      toast.error(t("auth.reset.verifizierung_fehlgeschlagen", { fehler: err?.message || t("portal.common.error_unknown") }));
      setMfaVerifying(false);
    }
  };

  if (authChecking) {
    return (
      <div data-lg="seite" className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="text-center space-y-4">
          <img src={logoImg} alt="MOREImmo" className="h-10 mx-auto" />
          <h1 className="text-xl font-bold text-foreground">{t("auth.reset.link_pruefen_titel")}</h1>
          <p className="text-muted-foreground">{t("auth.reset.link_pruefen_text")}</p>
        </div>
      </div>
    );
  }

  if (!isRecovery) {
    // Fallback: Wenn keine loginEmail im Link enthalten ist, bieten wir dem
    // Nutzer ein Eingabefeld an – so kann er sich IMMER selbst einen neuen
    // Passwort-Reset-Link zuschicken lassen, egal wie der alte Link entstand.
    const canResend = true;
    const handleResend = async () => {
      const target = (loginEmailFromUrl || manualEmail || "").trim();
      if (!target) {
        toast.error(t("auth.reset.email_fehlt"));
        return;
      }
      setResending(true);
      try {
        const params = new URLSearchParams();
        if (portalFromUrl) params.set("portal", portalFromUrl);
        if (nextFromUrl) params.set("next", nextFromUrl);
        params.set("loginEmail", target);
        if (kontaktIdFromUrl) params.set("kontaktId", kontaktIdFromUrl);
        if (kundeNameFromUrl) params.set("kundeName", kundeNameFromUrl);
        // Der neue Link öffnet in der Sprache, in der diese Seite gerade steht.
        params.set("lang", portalSprache());
        const redirectTo = `${window.location.origin}/reset-password${params.toString() ? `?${params.toString()}` : ""}`;
        const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
        if (error) {
          toast.error(t("auth.reset.senden_fehlgeschlagen", { fehler: error.message }));
        } else {
          setResent(true);
          toast.success(t("auth.reset.gesendet", { email: target }));
        }
      } catch (err: any) {
        toast.error(t("auth.allgemein.fehler_mit_text", { fehler: err?.message || t("portal.common.error_unknown") }));
      } finally {
        setResending(false);
      }
    };

    return (
      <div data-lg="seite" className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="text-center space-y-4 max-w-md">
          <img src={logoImg} alt="MOREImmo" className="h-10 mx-auto" />
          <h1 className="text-xl font-bold text-foreground">{t("auth.reset.nicht_gueltig_titel")}</h1>
          <p className="text-muted-foreground">
            {linkError || t("auth.reset.ungueltig")}
          </p>
          {!resent && !loginEmailFromUrl && (
            <div className="text-left space-y-2">
              <Label htmlFor="resend-email">{t("auth.allgemein.email_label")}</Label>
              <Input
                id="resend-email"
                type="email"
                autoComplete="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder={t("auth.reset.email_platzhalter")}
              />
            </div>
          )}
          {!resent && (
            <Button onClick={handleResend} disabled={resending} className="w-full">
              {resending ? t("auth.reset.wird_gesendet") : t("auth.reset.neu_anfordern")}
            </Button>
          )}
          {resent && (
            <p className="text-sm text-foreground">
              {t("auth.reset.postfach_pruefen")}
            </p>
          )}
          <Button onClick={() => navigate(`/login?lang=${portalSprache()}`)} variant="outline" className="w-full">
            {t("auth.allgemein.zum_login")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div data-lg="seite" className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <img src={logoImg} alt="MOREImmo" className="h-10" />
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground font-serif">{t("auth.reset.titel")}</h2>
          <p className="text-muted-foreground mt-1">
            {new URLSearchParams(window.location.search).get("portal") === "kunde"
              ? t("auth.reset.text_kunde")
              : t("auth.reset.text_intern")}
          </p>
        </div>

        {mfaRequired ? (
          <form onSubmit={handleMfaVerify} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="mfaCode">{t("auth.reset.mfa_label")}</Label>
              <CodeEingabe
                id="mfaCode"
                value={mfaCode}
                onChange={setMfaCode}
                onVollstaendig={mfaPruefen}
                beschaeftigt={mfaVerifying}
                fehler={mfaCodeFehler}
                label={t("auth.reset.mfa_label")}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {t("auth.reset.mfa_hinweis")}
              </p>
            </div>
            <Button
              type="submit"
              disabled={mfaVerifying || mfaCode.length !== 6}
              className="w-full h-12 text-base font-medium"
            >
              <KeyRound className="h-5 w-5 mr-2" />
              {mfaVerifying ? t("auth.reset.mfa_wird_geprueft") : t("auth.reset.mfa_absenden")}
            </Button>
          </form>
        ) : (
        <form onSubmit={handleReset} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.aktivieren.neues_passwort")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t("auth.reset.platzhalter")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 pr-12"
              />
              <button
                type="button"
                aria-label={showPassword ? t("auth.allgemein.passwort_verbergen") : t("auth.allgemein.passwort_anzeigen")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <PasswordStrengthMeter
              password={password}
              userInputs={[loginEmailFromUrl, kundeNameFromUrl].filter(Boolean)}
              onResult={(r) =>
                setPwSecurity({ ok: r.ok, pwnedCount: r.pwnedCount, score: r.strength.score })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">{t("auth.reset.bestaetigen")}</Label>
            <Input
              id="confirm"
              type="password"
              placeholder={t("auth.aktivieren.wiederholen")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-base font-medium"
          >
            <KeyRound className="h-5 w-5 mr-2" />
            {loading ? t("auth.reset.wird_gespeichert") : t("auth.reset.absenden")}
          </Button>
        </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
