import { supabase } from "@/integrations/supabase/client";

import { useNavigate, Navigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ShieldCheck, Shield, Smartphone, Copy, Check, ChevronRight, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";
import { CodeEingabe } from "@/components/security/CodeEingabe";
import { QRCodeSVG } from "qrcode.react";
import { ZugangWeg, type ZugangsArt } from "@/components/login/ZugangWeg";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/kunde/portal/LanguageToggle";
import { portalSprache, useHtmlLang } from "@/i18n/portalSprache";

type MfaStep = "login" | "enroll" | "verify";

/**
 * Rechtliche Verweise in der Fußzeile.
 *
 * Sie zeigen bewusst auf die Website osimmobilien.netlify.app und nicht auf die
 * CRM-eigenen Seiten /impressum und /datenschutz. Die maßgeblichen Fassungen
 * stehen auf der Website, das CRM ist nur das Werkzeug dahinter.
 */
const IMPRESSUM_URL = "https://osimmobilien.netlify.app/impressum";
const DATENSCHUTZ_URL = "https://osimmobilien.netlify.app/datenschutz";
const SUPPORT_EMAIL = "os@os-immobilien.com";

/**
 * Die beiden Wege ohne Konto, wie sie unter dem Formular angeboten werden.
 *
 * Nur der Anreisser steht hier. Was dahinter kommt, liegt in
 * src/components/login/ZugangWeg.tsx, damit diese Datei das Anmelden behaelt
 * und nicht zusaetzlich zwei Erklaerseiten traegt.
 */
const ZUGANGSKAESTEN: ZugangsArt[] = ["kunde", "partner"];

/**
 * Bekannte Servermeldungen von `secure-login` in der Anzeigesprache.
 *
 * Die Function antwortet deutsch. Bei falschen Zugangsdaten gibt es genau
 * zwei feste Saetze, die hier uebersetzt werden. Alles andere (etwa ein
 * interner Fehler) bleibt, wie es kommt.
 */
function anmeldeMeldung(meldung: unknown, t: (k: string) => string): string {
  const text = typeof meldung === "string" ? meldung : "";
  if (!text || text === "Ungültige Anmeldedaten.") return t("auth.login.fehler.ungueltig");
  if (text === "Bitte bestätige zuerst deine E-Mail-Adresse.") return t("auth.login.fehler.email_unbestaetigt");
  return text;
}

/**
 * Die blaue Bildmarke ohne Schriftzug.
 *
 * Hausregel, dieselbe wie in src/lib/pdfBranding.ts: Auf hellem Grund steht
 * das Originallogo, auf DUNKLEM Grund die blaue Bildmarke plus einen hell
 * gesetzten Schriftzug. Der Schriftzug des Originallogos ist schwarz und
 * würde auf der dunklen Bühne verschwinden.
 */
const BILDMARKE_URL = "/images/moreimmo-icon-blau.png";
// Fuer den dunklen Bildteil: dunkles Gruen der Bildmarke als Weiss.
const BILDMARKE_HELL_URL = "/images/os-bildmarke-hell.png";

const Login = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useHtmlLang();
  const { isLoggedIn } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  /**
   * Das Kundenportal dieses Kontos ist gesperrt. Dann steht über dem
   * Formular ein ruhiger Hinweis statt eines roten Toasts: Der Kunde hat
   * nichts falsch eingegeben, er soll nur wissen, an wen er sich wendet.
   */
  const [zugangGesperrt, setZugangGesperrt] = useState(false);

  /**
   * Welcher der beiden Wege ohne Konto gerade offen ist.
   *
   * `null` heisst: das Anmeldeformular steht. Der Zustand haengt bewusst hier
   * und nicht in der Adresse, denn es ist keine eigene Seite, sondern eine
   * Erklaerung an derselben Stelle.
   */
  const [zugangsWeg, setZugangsWeg] = useState<ZugangsArt | null>(null);

  // MFA state
  const [mfaStep, setMfaStep] = useState<MfaStep>("login");
  const [totpCode, setTotpCode] = useState("");
  const [codeFehler, setCodeFehler] = useState(0);
  const [qrUri, setQrUri] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [copied, setCopied] = useState(false);

  // Ziel nach erfolgreichem Login. Ein interner Guard (z.B. die
  // Beratungspräsentation) haengt die urspruengliche URL als ?redirect=... an,
  // damit der Kontext (kunde/kundeId/investmentId) erhalten bleibt. Nur interne
  // Pfade zulassen, um Open-Redirects zu verhindern.
  const redirectParam = new URLSearchParams(window.location.search).get("redirect");
  const redirectTarget =
    redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")
      ? redirectParam
      : "/";

  if (isLoggedIn) {
    return <Navigate to={redirectTarget} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t("auth.login.fehler.felder_leer"));
      return;
    }
    setZugangGesperrt(false);
    setLoading(true);

    try {
      const { data: resp, error: fnError } = await supabase.functions.invoke("secure-login", {
        body: { email, password },
      });

      if (fnError && !resp) {
        toast.error(t("auth.login.fehler.verbindung"));
        return;
      }

      // Portal gesperrt: secure-login meldet das eigens, sowohl bei gesperrter
      // Anmeldung als auch bei gesperrtem Portal mit noch offener Anmeldung,
      // und zählt es nicht als Fehlversuch. Eine Sitzung kommt dann nicht an.
      if (resp?.error === "zugang_gesperrt") {
        setZugangGesperrt(true);
        return;
      }
      if (resp?.error === "account_locked") {
        const mins = Math.max(1, Math.ceil(Number(resp.retry_after_seconds || 0) / 60));
        toast.error(t("auth.login.fehler.gesperrt", { count: mins }));
        return;
      }
      if (resp?.error === "invalid_credentials") {
        const basis = anmeldeMeldung(resp.message, t);
        const msg = resp.just_locked
          ? t("auth.login.fehler.gerade_gesperrt")
          : (resp.remaining_attempts != null
              ? `${basis} ${t("auth.login.fehler.versuche_uebrig", { count: Number(resp.remaining_attempts) })}`
              : basis);
        toast.error(msg);
        return;
      }
      if (!resp?.session) {
        toast.error(resp?.message || t("auth.login.fehler.fehlgeschlagen"));
        return;
      }

      // Session lokal installieren
      const { data: authData, error: sessionError } = await supabase.auth.setSession({
        access_token: resp.session.access_token,
        refresh_token: resp.session.refresh_token,
      });
      if (sessionError || !authData?.user) {
        toast.error(t("auth.login.fehler.sitzung"));
        return;
      }

      // Check if user account is blocked
      if (authData?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("gesperrt, gesperrt_grund")
          .eq("id", authData.user.id)
          .single();

        if (profile?.gesperrt) {
          await supabase.auth.signOut();
          toast.error(profile.gesperrt_grund || t("auth.login.fehler.account_gesperrt"));
          return;
        }
      }

      // MFA deaktiviert – direkt einloggen
      toast.success(t("auth.login.willkommen"));
      navigate(redirectTarget);
    } catch (err) {
      console.error("Login error:", err);
      toast.error(t("auth.login.fehler.verbindung"));
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollVerify = async () => {
    if (totpCode.length !== 6 || loading) {
      if (!loading) toast.error(t("auth.login.fehler.code_sechs"));
      return;
    }
    setLoading(true);

    // Challenge the newly enrolled factor
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      toast.error(t("auth.login.fehler.verifizierung"));
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: totpCode,
    });

    if (verifyError) {
      toast.error(t("auth.login.fehler.code_ungueltig"));
      setCodeFehler((n) => n + 1);
      setLoading(false);
      return;
    }

    // MFA enrollment + verification complete
    try {
      await supabase.functions.invoke("manage-sessions", {
        body: { action: "record", userAgent: navigator.userAgent },
      });
    } catch (_) {}
    toast.success(t("auth.login.zwei_fa_eingerichtet"));
    navigate(redirectTarget);
    setLoading(false);
  };

  const handleMfaVerify = async () => {
    if (totpCode.length !== 6 || loading) {
      if (!loading) toast.error(t("auth.login.fehler.code_sechs"));
      return;
    }
    setLoading(true);

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: totpCode,
    });

    if (verifyError) {
      toast.error(t("auth.login.fehler.code_ungueltig"));
      setCodeFehler((n) => n + 1);
      setLoading(false);
      return;
    }

    try {
      await supabase.functions.invoke("manage-sessions", {
        body: { action: "record", userAgent: navigator.userAgent },
      });
    } catch (_) {}
    toast.success(t("auth.login.willkommen"));
    navigate(redirectTarget);
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error(t("auth.login.fehler.email_zuerst"));
      return;
    }
    // loginEmail als Query-Param mitgeben, damit der Nutzer auf /reset-password
    // bei abgelaufenem Link direkt einen neuen anfordern kann. lang haelt die
    // Reset-Seite in der Sprache, in der diese Seite gerade steht.
    const redirectTo = `${window.location.origin}/reset-password?loginEmail=${encodeURIComponent(email)}&lang=${portalSprache()}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      toast.error(t("auth.login.fehler.reset_senden"));
    } else {
      toast.success(t("auth.login.reset_gesendet"));
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---- Render MFA Enrollment ----
  const renderEnrollStep = () => (
    <div className="w-full space-y-6">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-primary">
          <Smartphone className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-foreground">{t("auth.login.einrichten.titel")}</h2>
        <p className="text-muted-foreground mt-2 text-[15px]">
          {t("auth.login.einrichten.text")}
        </p>
      </div>

      <div className="flex justify-center">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <QRCodeSVG value={qrUri} size={192} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground text-center">{t("auth.login.einrichten.manuell")}</p>
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
          <code className="text-sm font-mono flex-1 text-center break-all text-foreground">{secret}</code>
          <button
            onClick={copySecret}
            aria-label={copied ? t("auth.login.einrichten.geheimnis_kopiert") : t("auth.login.einrichten.geheimnis_kopieren")}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-center block">{t("auth.login.einrichten.code_label")}</Label>
        <div className="flex justify-center">
          <CodeEingabe
            value={totpCode}
            onChange={setTotpCode}
            onVollstaendig={handleEnrollVerify}
            beschaeftigt={loading}
            fehler={codeFehler}
            label={t("auth.login.einrichten.code_label")}
          />
        </div>
      </div>

      <Button
        onClick={handleEnrollVerify}
        disabled={loading || totpCode.length !== 6}
        className="w-full h-12 text-[15px] font-medium rounded-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <ShieldCheck className="h-5 w-5 mr-2" />
        {loading ? t("auth.login.verifiziere") : t("auth.login.einrichten.absenden")}
      </Button>
    </div>
  );

  // ---- Render MFA Verification ----
  const renderVerifyStep = () => (
    <div className="w-full space-y-6">
      <div className="text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-primary">
          <Shield className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-foreground">{t("auth.login.pruefen.titel")}</h2>
        <p className="text-muted-foreground mt-2 text-[15px]">
          {t("auth.login.pruefen.text")}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex justify-center">
          <CodeEingabe
            value={totpCode}
            onChange={setTotpCode}
            onVollstaendig={handleMfaVerify}
            beschaeftigt={loading}
            fehler={codeFehler}
            label={t("auth.login.pruefen.titel")}
            autoFocus
          />
        </div>
      </div>

      <Button
        onClick={handleMfaVerify}
        disabled={loading || totpCode.length !== 6}
        className="w-full h-12 text-[15px] font-medium rounded-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <ShieldCheck className="h-5 w-5 mr-2" />
        {loading ? t("auth.login.verifiziere") : t("auth.login.pruefen.absenden")}
      </Button>

      <button
        onClick={() => {
          setMfaStep("login");
          setTotpCode("");
          supabase.auth.signOut();
        }}
        className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {t("auth.login.pruefen.zurueck")}
      </button>
    </div>
  );

  // ---- Render Login Form ----
  const renderLoginStep = () => (
    <div className="w-full">
      <div className="mb-7">
        <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-foreground leading-tight">
          {t("auth.login.titel")}
        </h1>
        <p className="text-muted-foreground mt-1.5 text-[14px] leading-relaxed">
          {t("auth.login.untertitel")}
        </p>
      </div>

      {zugangGesperrt && (
        <Alert className="mb-5 rounded-[10px] bg-muted/50">
          <Lock className="h-4 w-4" />
          <AlertTitle>{t("auth.login.fehler.portal_gesperrt_titel")}</AlertTitle>
          <AlertDescription className="text-muted-foreground">{t("auth.login.fehler.portal_gesperrt_text")}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] font-medium text-foreground/80">{t("auth.allgemein.email_label")}</Label>
          <Input
            id="email"
            type="email"
            placeholder="name@os-immobilien.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-[10px] bg-white dark:bg-background border-border"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[13px] font-medium text-foreground/80">{t("auth.login.passwort_label")}</Label>
            <button
              type="button"
              className="text-[13px] font-medium text-primary hover:underline"
              onClick={handleForgotPassword}
            >
              {t("auth.login.passwort_vergessen")}
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pr-12 rounded-[10px] bg-white dark:bg-background border-border"
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
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 text-[15px] font-medium rounded-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(19,132,88,0.35)]"
        >
          {loading ? t("auth.login.absenden_laeuft") : t("auth.login.absenden")}
        </Button>
        {/* Die Anmeldung gilt bis zur nächsten Nacht, siehe
            supabase/migrations/20260926200000_naechtliche_abmeldung.sql. Kunden
            und Bewerber sind ausgenommen, deshalb nennt der Satz nur Partner und Team. */}
        <p className="-mt-2 text-center text-[12px] leading-relaxed text-muted-foreground">
          {t("auth.login.naechtliche_abmeldung")}
        </p>
      </form>


      {/* Zwei Wege ohne Konto. Die Anmeldeseite nutzen Kunden und Partner
          gleichermassen, deshalb wird hier getrennt: Kunden gehen ins
          Erstgespraech, Interessenten fuer eine Zusammenarbeit an die
          Bewerbungsadresse. */}
      <div className="mt-7 mb-4 flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="text-[12.5px] text-muted-foreground">{t("auth.login.kein_zugang")}</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>

      {/*
        Beide Kaesten sind jetzt Knoepfe und keine Links mehr. Ein Link haette
        die Seite verlassen, bevor jemand weiss, was ihn erwartet; der Knopf
        tauscht das Formular gegen die Erklaerung und laesst den Weg zurueck
        offen. Deshalb <button> und nicht <a>: Es fuehrt nirgendwohin, es
        klappt etwas auf.
      */}
      <div className="space-y-2.5">
        {ZUGANGSKAESTEN.map((art) => (
          <button
            key={art}
            type="button"
            onClick={() => setZugangsWeg(art)}
            className="group flex w-full items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[13.5px] font-semibold text-foreground">
                {art === "kunde" ? t("auth.login.kasten_kunde_titel") : t("auth.login.kasten_partner_titel")}
              </span>
              <span className="block text-[12.5px] leading-relaxed text-muted-foreground">
                {art === "kunde" ? t("auth.login.kasten_kunde_text") : t("auth.login.kasten_partner_text")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>

      <div className="mt-7 border-t border-border pt-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
          <a
            href={IMPRESSUM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/80 hover:text-foreground hover:underline"
          >
            {t("auth.login.impressum")}
          </a>
          <a
            href={DATENSCHUTZ_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/80 hover:text-foreground hover:underline"
          >
            {t("auth.login.datenschutz")}
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-foreground/80 hover:text-foreground hover:underline"
          >
            {t("auth.login.support")}
          </a>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          {t("auth.login.fusszeile")}
        </p>
      </div>
    </div>
  );

  return (
    <div data-lg="seite" className="min-h-screen w-full bg-white flex">
      {/*
        Die Bewegung der Bühne steht hier als eigener Stilblock und nicht in
        src/index.css, weil sie nur auf dieser einen Seite vorkommt. Animiert
        werden ausschließlich transform und opacity, damit der Browser kein
        Layout neu rechnen muss. Wer im Betriebssystem reduzierte Bewegung
        eingestellt hat, sieht ein ruhiges Bild.
      */}
      <style>{`
        @keyframes loginLichtA { to { transform: translate3d(90px, 70px, 0) scale(1.12); } }
        @keyframes loginLichtB { to { transform: translate3d(-70px, -60px, 0) scale(1.16); } }
        /* Genau eine Rasterweite, dadurch ist der Sprung am Ende unsichtbar. */
        @keyframes loginRaster  { to { transform: translate3d(74px, 74px, 0); } }
        .login-licht-a { animation: loginLichtA 22s ease-in-out infinite alternate; will-change: transform; }
        .login-licht-b { animation: loginLichtB 27s ease-in-out infinite alternate; will-change: transform; }
        .login-raster  { animation: loginRaster 40s linear infinite; will-change: transform; }
        @media (prefers-reduced-motion: reduce) {
          .login-licht-a, .login-licht-b, .login-raster { animation: none; }
        }
      `}</style>

      {/* Linke Spalte: das Formular auf Weiß, ohne Karte und ohne Logo. */}
      <div className="relative flex w-full flex-col items-center px-6 py-12 sm:px-10 lg:w-1/2 lg:px-14">
        {/*
          Sprachumschalter, dezent oben rechts in der Formularspalte und auf
          Handy wie Desktop sichtbar. Er aendert nur die Anzeige dieser Seite
          und der folgenden. Die Profilsprache eines Kunden setzt das Portal
          nach dem Anmelden ohnehin selbst (src/i18n/portalSprache.ts).
        */}
        <div className="absolute right-3 top-3 sm:right-5 sm:top-5">
          <LanguageToggle className="text-muted-foreground" />
        </div>
        <div className={`my-auto w-full ${zugangsWeg ? "max-w-[440px]" : "max-w-[400px]"}`}>
          {/*
            Marke nur auf schmalen Fenstern. Ab lg traegt sie die Buehne rechts,
            darunter faellt die Buehne weg und die Seite waere sonst voellig
            unmarkiert. Steht hier ausserhalb der drei Schritte, damit beim
            Wechsel auf die Zwei-Faktor-Abfrage nichts springt.
            Auf hellem Grund ist der Schriftzug dunkel, nicht weiss wie rechts.
          */}
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <img src={BILDMARKE_URL} alt="" className="h-[26px] w-auto object-contain" />
            <span className="text-[19px] font-semibold tracking-[-0.01em] text-foreground">Immobilien</span>
          </div>

          {/*
            Der erklaerte Weg ersetzt das Formular an derselben Stelle. Er gilt
            nur im Schritt "login": Wer schon beim zweiten Faktor steht, ist
            angemeldet und sucht keinen Zugang mehr.
          */}
          {mfaStep === "login" && zugangsWeg && (
            <ZugangWeg art={zugangsWeg} onZurueck={() => setZugangsWeg(null)} />
          )}
          {mfaStep === "login" && !zugangsWeg && renderLoginStep()}
          {mfaStep === "enroll" && renderEnrollStep()}
          {mfaStep === "verify" && renderVerifyStep()}
        </div>
      </div>

      {/*
        Rechte Bühne. Auf schmalen Fenstern fällt sie weg, das Formular nimmt
        dann die volle Breite. Der dunkle Ton steht bewusst fest und kommt
        nicht aus den Tokens, genauso wie bei .apple-hero und .la-hero in
        src/index.css: Die Schrift darauf ist immer hell, eine Fläche, die im
        hellen Modus hell würde, wäre unlesbar. Die Akzente laufen dagegen
        über die Markenfarbe.

        sticky plus volle Fensterhöhe: Ist das Formular höher als das Fenster,
        scrollt nur die linke Spalte. Die Bühne bleibt vollständig sichtbar,
        sonst rutschten die Vertrauensmerkmale unter die Kante.
      */}
      <div
        className="relative hidden overflow-hidden px-14 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:sticky lg:top-0 lg:h-screen lg:self-start"
        style={{
          background:
            "linear-gradient(160deg, hsl(220 30% 10%) 0%, hsl(220 25% 14%) 60%, hsl(220 28% 18%) 100%)",
        }}
      >
        {/* Zwei weich verlaufende Lichtflächen, die gegeneinander driften. */}
        <div
          className="login-licht-a pointer-events-none absolute -left-[260px] -top-[320px] h-[900px] w-[900px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, hsl(var(--primary) / 0) 62%)",
          }}
        />
        <div
          className="login-licht-b pointer-events-none absolute -bottom-[330px] -right-[300px] h-[760px] w-[760px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(157 75% 49% / 0.28) 0%, hsl(157 75% 49% / 0) 64%)",
          }}
        />
        {/* Feines Raster. Der Rahmen ist absichtlich größer als die Fläche,
            damit die Verschiebung an keinem Rand eine Lücke zeigt.

            Die Maske hält das Karo dort, wo der Text steht, und lässt es nach
            außen auslaufen. Ein Raster, das bis an alle Kanten durchläuft,
            legt sich wie ein Gitter über die Fläche und macht sie flach.
            Läuft es aus, entsteht Tiefe: das Auge liest die Mitte als nah und
            die Ränder als fern. Der Mittelpunkt sitzt links der Mitte, weil
            der Text dort steht. */}
        <div
          className="login-raster pointer-events-none absolute -inset-[80px] opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)",
            backgroundSize: "74px 74px",
            WebkitMaskImage:
              "radial-gradient(ellipse 62% 46% at 38% 50%, #000 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.12) 72%, transparent 88%)",
            maskImage:
              "radial-gradient(ellipse 62% 46% at 38% 50%, #000 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.12) 72%, transparent 88%)",
          }}
        />

        {/* Marke oben rechts: blaue Bildmarke plus hell gesetzter Schriftzug. */}
        <div className="absolute right-14 top-11 z-10 flex items-center gap-2.5">
          <img src={BILDMARKE_HELL_URL} alt="" className="h-[26px] w-auto object-contain" />
          <span className="text-[19px] font-semibold tracking-[-0.01em] text-white">Immobilien</span>
        </div>

        <div className="relative z-10 max-w-[430px]">
          {/* Helles Blau statt --primary. Das Markenblau ist auf dieser
              dunklen Fläche zu kontrastarm. Der Wert ist derselbe, den
              pdfBranding als accentLight und index.css in .beratung-dark
              für Blau auf Dunkel verwenden. */}
          <p className="mb-5 text-[11.5px] uppercase tracking-[0.18em] text-[hsl(157_75%_49%)]">
            {t("auth.login.buehne.augenbraue")}
          </p>
          <p className="mb-4 text-[44px] font-semibold leading-[1.14] tracking-[-0.028em]">
            {t("auth.login.buehne.titel")}
          </p>
          <p className="text-[15.5px] leading-[1.65] text-white/70">
            {t("auth.login.buehne.text")}
          </p>
        </div>

        {/* Vertrauensmerkmale. Bewusst nur Belegbares, siehe Bericht. */}
        <div className="absolute bottom-14 left-14 right-14 z-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/15 pt-4">
          <div className="text-[12px] text-white/60">
            <span className="mb-0.5 block text-[13.5px] font-semibold text-white">{t("auth.login.buehne.verschluesselt_titel")}</span>
            {t("auth.login.buehne.verschluesselt_text")}
          </div>
          <div className="text-[12px] text-white/60">
            <span className="mb-0.5 block text-[13.5px] font-semibold text-white">{t("auth.login.buehne.dsgvo_titel")}</span>
            {t("auth.login.buehne.dsgvo_text")}
          </div>
          <div className="text-[12px] text-white/60">
            <span className="mb-0.5 block text-[13.5px] font-semibold text-white">{t("auth.login.buehne.persoenlich_titel")}</span>
            {t("auth.login.buehne.persoenlich_text")}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
