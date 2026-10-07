import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import logoImg from "@/assets/moreimmo-logo.png";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { portalSprache, setzeAnzeigeSprache, useHtmlLang } from "@/i18n/portalSprache";

/**
 * Custom 7-day activation page. Unlike Supabase's one-time OTP links
 * (which expire after 24h and can be burnt by mail scanners), this page
 * accepts a long-lived activation_token created server-side by
 * `invite-user` and redeemed via the `redeem-activation-token` edge
 * function. The token only sets a password once the user explicitly
 * submits the form.
 */
type TokenInfo = {
  email: string;
  kundeName: string;
  portal: string;
  kontaktId: string;
  role: string;
  next: string;
  expiresAt: string;
  used: boolean;
  expired: boolean;
  /**
   * Profilsprache des Kunden, nur bei Rolle kunde gesetzt. Ältere Fassungen
   * der Function liefern das Feld nicht, dann bleibt die Anzeige, wie sie ist.
   */
  sprache?: "de" | "en";
};

/** Fehlerantwort der Function `redeem-activation-token`. */
type FehlerKoerper = { error?: string; code?: string };

/**
 * Die Fehlercodes der Function in der Anzeigesprache.
 *
 * Die Function schreibt ihre Meldungen deutsch. Seit der zweisprachigen
 * Fassung liefert sie dazu `code`, und nur darüber wird hier übersetzt.
 * Ohne Code (ältere Fassung) oder bei einem unbekannten Code gilt `null`,
 * dann zeigt die Seite die Servermeldung wie bisher.
 */
function textZumCode(code: unknown, t: TFunction): string | null {
  switch (code) {
    case "invalid_token_format":
      return t("auth.aktivieren.code.invalid_token_format");
    case "token_not_found":
      return t("auth.aktivieren.code.token_not_found");
    case "token_used":
      return t("auth.aktivieren.code.token_used");
    case "token_expired":
      return t("auth.aktivieren.code.token_expired");
    case "password_too_short":
      return t("auth.aktivieren.code.password_too_short");
    case "password_rejected":
      return t("auth.aktivieren.code.password_rejected");
    case "password_set_failed":
      return t("auth.aktivieren.code.password_set_failed");
    default:
      return null;
  }
}

/**
 * Liest bei einer Antwort mit Fehlerstatus den Körper mit `error` und `code`.
 *
 * `supabase.functions.invoke` gibt bei einem Status außerhalb von 2xx kein
 * `data` zurück, sondern einen FunctionsHttpError, dessen `context` die
 * Antwort selbst ist. Ohne diesen Schritt sähe der Nutzer nur „Edge Function
 * returned a non-2xx status code“. `context.response` wird zusätzlich
 * geprüft, weil ältere Fassungen der Bibliothek die Antwort dort ablegten.
 */
async function fehlerKoerper(error: unknown): Promise<FehlerKoerper> {
  const kontext = (error as { context?: unknown } | null)?.context as
    | { json?: () => Promise<unknown>; response?: { json?: () => Promise<unknown> } }
    | undefined;
  const antwort = typeof kontext?.json === "function" ? kontext : kontext?.response;
  if (!antwort || typeof antwort.json !== "function") return {};
  try {
    const koerper = (await antwort.json()) as FehlerKoerper | null;
    return koerper && typeof koerper === "object" ? koerper : {};
  } catch {
    return {};
  }
}

const Aktivieren = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useHtmlLang();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("t") || "";
  // Steht die Sprache schon in der Adresse (Einladungsmail), gilt sie. Nur
  // ohne sie übernimmt die Seite die Profilsprache aus der Token-Info.
  const spracheInAdresse = !!params.get("lang");

  const [loadingInfo, setLoadingInfo] = useState(true);
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) {
        setInfoError(t("auth.aktivieren.kein_token"));
        setLoadingInfo(false);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("redeem-activation-token", {
          body: { action: "info", token },
        });
        if (cancelled) return;
        const koerper: FehlerKoerper = error ? await fehlerKoerper(error) : ((data as FehlerKoerper) ?? {});
        if (cancelled) return;
        if (error || koerper.error) {
          setInfoError(
            textZumCode(koerper.code, t) ||
              koerper.error ||
              error?.message ||
              t("auth.aktivieren.laden_fehlgeschlagen"),
          );
        } else {
          // Fehlt der Name am Token, liefert die Function den Vornamen aus dem
          // Profil mit. Die frühere Abfrage per E-Mail-Adresse ist seit
          // 20261004130000 ohne Anmeldung gesperrt.
          const info = data as TokenInfo;
          if (!spracheInAdresse && info.sprache) setzeAnzeigeSprache(info.sprache);
          setInfo(info);
        }
      } catch (err: any) {
        if (!cancelled) setInfoError(err?.message || t("auth.aktivieren.unbekannter_fehler"));
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // t und spracheInAdresse ändern sich für diese Seite nicht mehr; neu
    // geladen wird nur bei einem anderen Token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!info) return;
    if (password.length < 8) {
      toast.error(t("auth.aktivieren.code.password_too_short"));
      return;
    }
    if (password !== password2) {
      toast.error(t("auth.allgemein.passwoerter_ungleich"));
      return;
    }
    setSubmitting(true);
    try {
      // Sicherstellen, dass keine alte Session aktiv ist. Bleibt eine alte
      // Sitzung bestehen, sieht der Nutzer nach dem Aktivieren weiter den
      // alten Zugang mit dessen Bereichen. Deshalb wird das gemeldet.
      let abgemeldet = true;
      try {
        const { error: abmeldeFehler } = await supabase.auth.signOut();
        if (abmeldeFehler) {
          abgemeldet = false;
          console.error("Abmelden vor der Aktivierung fehlgeschlagen:", abmeldeFehler);
        }
      } catch (abmeldeFehler) {
        abgemeldet = false;
        console.error("Abmelden vor der Aktivierung fehlgeschlagen:", abmeldeFehler);
      }

      const { data, error } = await supabase.functions.invoke("redeem-activation-token", {
        body: { token, password },
      });
      if (error) {
        const koerper = await fehlerKoerper(error);
        throw new Error(textZumCode(koerper.code, t) || koerper.error || error.message);
      }
      const antwort = (data ?? {}) as FehlerKoerper;
      if (antwort.error) throw new Error(textZumCode(antwort.code, t) || antwort.error);

      const loginEmail = (data as any)?.email || info.email;
      if (abgemeldet) {
        toast.success(t("auth.aktivieren.aktiviert"));
      } else {
        toast.warning(t("auth.aktivieren.aktiviert_ohne_abmeldung"));
      }
      navigate(`/login?email=${encodeURIComponent(loginEmail)}&lang=${portalSprache()}`, { replace: true });
    } catch (err: any) {
      toast.error(err?.message || t("auth.aktivieren.fehlgeschlagen"));
      setSubmitting(false);
    }
  };

  return (
    <div data-lg="seite" className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <img src={logoImg} alt="MOREImmo" className="h-10 mx-auto" />

        {loadingInfo ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{t("auth.aktivieren.wird_geprueft")}</span>
          </div>
        ) : infoError ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center text-destructive">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h1 className="text-xl font-bold text-foreground font-serif">
              {t("auth.aktivieren.ungueltig_titel")}
            </h1>
            <p className="text-sm text-muted-foreground">{infoError}</p>
            <p className="text-xs text-muted-foreground">
              {t("auth.aktivieren.ungueltig_hilfe")}
            </p>
          </div>
        ) : info?.used ? (
          <div className="space-y-4">
            <CheckCircle2 className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-xl font-bold text-foreground font-serif">
              {t("auth.aktivieren.bereits_titel")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("auth.aktivieren.bereits_text")}
            </p>
            <Button
              className="w-full"
              onClick={() =>
                navigate(
                  info.email
                    ? `/login?email=${encodeURIComponent(info.email)}&lang=${portalSprache()}`
                    : `/login?lang=${portalSprache()}`,
                )
              }
            >
              {t("auth.allgemein.zum_login")}
            </Button>
          </div>
        ) : info?.expired ? (
          <div className="space-y-4">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <h1 className="text-xl font-bold text-foreground font-serif">
              {t("auth.aktivieren.abgelaufen_titel")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("auth.aktivieren.abgelaufen_text")}
            </p>
          </div>
        ) : info ? (
          <form onSubmit={handleSubmit} className="space-y-5 text-left">
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-bold text-foreground font-serif">
                {info.kundeName
                  ? t("auth.aktivieren.hallo_name", { name: info.kundeName.split(" ")[0] })
                  : t("auth.aktivieren.hallo")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("auth.aktivieren.einleitung")}
              </p>
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">{t("auth.aktivieren.login_email")}</strong> {info.email}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pw1">{t("auth.aktivieren.neues_passwort")}</Label>
              <Input
                id="pw1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.aktivieren.platzhalter")}
                autoComplete="new-password"
                disabled={submitting}
                required
              />
              {password && (
                <PasswordStrengthMeter
                  password={password}
                  userInputs={[info.email, info.kundeName].filter(Boolean)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">{t("auth.aktivieren.wiederholen")}</Label>
              <Input
                id="pw2"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
                required
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <KeyRound className="h-5 w-5 mr-2" />}
              {submitting ? t("auth.aktivieren.absenden_laeuft") : t("auth.aktivieren.absenden")}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              {t("auth.aktivieren.gueltigkeit")}
            </p>
          </form>
        ) : null}
      </div>
    </div>
  );
};

export default Aktivieren;