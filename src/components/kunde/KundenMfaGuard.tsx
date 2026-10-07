import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { mfaZustandErmitteln } from "@/lib/mfaZustand";
import { portalSprache } from "@/i18n/portalSprache";
import { getUserSetting, setUserSetting } from "@/lib/userSettingsCache";
import {
  HINWEIS_EINSTELLUNG,
  hinweisSpeicherSchluessel,
  hinweisZeigen,
  kundenMfaSchritt,
  spaeterZeitpunkt,
} from "@/lib/kundenZweiFaktor";
import { KundenZweiFaktorHinweis } from "@/components/kunde/KundenZweiFaktorHinweis";
import { CodeEingabe } from "@/components/security/CodeEingabe";

/**
 * Zwei-Faktor-Anmeldung im Kundenportal. Freiwillig seit dem 25.09.2026.
 *
 * - Kunde ohne Zwei-Faktor: kommt ins Portal. Darüber steht der Hinweis
 *   `KundenZweiFaktorHinweis`, bis er ihn schließt, und nach 30 Tagen wieder
 *   (Regeln in `src/lib/kundenZweiFaktor.ts`). Eingerichtet wird unter
 *   Einstellungen, Reiter Sicherheit (`KundenZweiFaktor`).
 * - Kunde mit Zwei-Faktor, Sitzung ohne Code (aal1): Codeabfrage, vorher ist
 *   nichts zu sehen. Das bleibt Pflicht, wer die Zwei-Faktor-Anmeldung
 *   eingeschaltet hat, kann sie beim Login nicht überspringen.
 *
 * Bis zum 25.09.2026 stand hier zusätzlich eine Pflicht zur Einrichtung:
 * sieben Tage Frist ab dem ersten Login (`portalErstLogin`), danach ein
 * Vollbild, das erst nach der Einrichtung wieder freigab. Beides ist weg.
 *
 * Maßgeblich ist die Faktorliste (siehe `src/lib/mfaZustand.ts`), nicht die
 * Sicherheitsstufe der Sitzung. Vorher wurde die Sitzung gefragt, die Edge
 * Function aber die Liste. Lief beides auseinander, bot die Oberfläche die
 * Einrichtung an, der Server lehnte sie mit "bereits aktiviert" ab, und der
 * Kunde kam nicht mehr weiter.
 */

type Mode = "loading" | "ok" | "challenge";

/** Fehler der Edge Function, um die maschinenlesbare Kennung ergänzt. */
type MfaFehler = Error & { code?: string };

/**
 * Kennungen der Edge Function `manage-mfa`, zu denen es einen eigenen
 * Portaltext gibt. Die Function antwortet nur deutsch, deshalb wird der Text
 * für die Anzeige über die Kennung gewählt.
 */
const SERVER_KENNUNG_SCHLUESSEL: Record<string, string> = {
  mfa_reset_fehlgeschlagen: "portal.mfa.server_reset_failed",
  zweiter_faktor_noetig: "portal.mfa.server_second_factor_needed",
};

/**
 * Nach dem Code alles neu laden.
 *
 * Mit der Migration `20260925200000_kunden_zwei_faktor_freiwillig.sql` gibt
 * die Datenbank einem Kunden mit Zwei-Faktor vor dem Code keine Daten heraus.
 * Was vorher schon geladen wurde (Zwischenspeicher, Sperrprüfung, Kopfzeile),
 * wäre dann leer. Ein Neuladen holt alles mit der neuen Sitzung.
 */
function nachDemCodeNeuLaden() {
  window.location.reload();
}

export function KundenMfaGuard({
  children,
  nurCode = false,
}: {
  children: React.ReactNode;
  /** Nur die Codeabfrage, ohne Hinweis zur Einrichtung (Mobil-Scan, Selbstauskunft). */
  nurCode?: boolean;
}) {
  const { user, authUser } = useUser();
  const { t } = useTranslation();
  // Auf der Einstellungsseite steht die Einrichtung selbst, dort wäre der
  // Hinweis doppelt.
  const aufEinstellungen = useLocation().pathname.startsWith("/kunde/einstellungen");

  /**
   * Text einer Serverablehnung für die Anzeige. Bekannte Kennungen bekommen
   * ihren übersetzten Text. Sonst sieht ein deutscher Kunde wie bisher den
   * Wortlaut der Function, ein englischer den übersetzten Ersatztext, denn
   * dieser Wortlaut ist immer deutsch.
   */
  const serverText = (e: unknown, ersatzSchluessel: string): string => {
    const fehler = e as MfaFehler;
    const schluessel = fehler?.code ? SERVER_KENNUNG_SCHLUESSEL[fehler.code] : undefined;
    if (schluessel) return t(schluessel);
    if (portalSprache() === "de" && fehler?.message) return fehler.message;
    return t(ersatzSchluessel);
  };
  // Nur für Kunden mit aktiver Auth-Session ist überhaupt eine Prüfung nötig.
  // Für alle anderen Rollen direkt "ok" – sonst flasht bei jeder Navigation
  // kurz der "Sicherheitsprüfung läuft…"-Loader (Doppel-Lade-Effekt).
  const needsCheck = user.role === "kunde" && !!authUser?.id;
  const [mode, setMode] = useState<Mode>(needsCheck ? "loading" : "ok");
  const [hinweis, setHinweis] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeFehler, setCodeFehler] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");

  const callMfa = async (payload: any) => {
    const { data, error } = await supabase.functions.invoke("manage-mfa", { body: payload });
    if (error) {
      let message = error.message;
      let kennung: string | undefined;
      const context = (error as any).context;
      if (context && typeof context.json === "function") {
        try {
          const body = await context.clone().json();
          message = body?.error || body?.message || message;
          // Maschinenlesbare Kennung, damit die Oberfläche nicht auf den
          // deutschen Wortlaut angewiesen ist.
          kennung = body?.code;
        } catch {/* fallback to default error */}
      }
      const fehler: MfaFehler = new Error(message);
      if (kennung) fehler.code = kennung;
      throw fehler;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  /** Wann der Hinweis zuletzt geschlossen wurde, auf diesem Gerät oder einem anderen. */
  const hinweisGeschlossenAm = useCallback((): string | null => {
    let lokal: string | null = null;
    try {
      if (authUser?.id) lokal = localStorage.getItem(hinweisSpeicherSchluessel(authUser.id));
    } catch { /* Browserspeicher gesperrt, dann zählt nur das Konto */ }
    let konto: string | null = null;
    try {
      konto = getUserSetting<string | null>(HINWEIS_EINSTELLUNG, null);
    } catch { /* Einstellungen noch nicht geladen */ }
    return spaeterZeitpunkt(lokal, konto);
  }, [authUser?.id]);

  const check = useCallback(async () => {
    if (user.role !== "kunde" || !authUser?.id) {
      setMode("ok");
      return;
    }
    try {
      // Faktorliste holen. Das ist dieselbe Quelle, die auch die Edge
      // Function befragt, bevor sie eine Einrichtung zulässt.
      const zustand = await mfaZustandErmitteln({
        ausSitzung: async () => (await supabase.auth.mfa.listFactors()).data,
        vomServer: async () => (await callMfa({ action: "list" }))?.factors,
      });

      // Sicherheitsstufe der Sitzung. Sie sagt nur, ob der zweite Faktor in
      // dieser Sitzung schon verwendet wurde, nicht ob es ihn gibt.
      let sessionAal2 = false;
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        sessionAal2 = aal?.currentLevel === "aal2";
      } catch {
        // Im Zweifel als "noch nicht verwendet" behandeln. Dann wird der Code
        // abgefragt, das sperrt niemanden aus.
      }

      const schritt = kundenMfaSchritt(zustand, sessionAal2, hinweisZeigen(zustand, hinweisGeschlossenAm()));
      if (schritt === "challenge" && zustand.art === "verifiziert") {
        setFactorId(zustand.factorId);
        setMode("challenge");
        return;
      }
      if (zustand.art === "unbekannt") {
        // Fail-open wie bisher: ein technischer Fehler soll den Kunden nicht
        // aussperren. Mit der Migration zur Zwei-Faktor-Pflicht in der
        // Datenbank bekommt ein Kunde mit Zwei-Faktor ohne Code trotzdem
        // keine Daten.
        console.warn("[KundenMfaGuard] Faktorliste nicht abrufbar, Prüfung übersprungen");
      }
      setHinweis(!nurCode && schritt === "ok_mit_hinweis");
      setMode("ok");
    } catch (e) {
      console.error("[KundenMfaGuard] check error", e);
      setMode("ok"); // Fail-open: blockiere Kunden nicht bei Tech-Fehler
    }
  }, [user.role, authUser?.id, hinweisGeschlossenAm, nurCode]);

  useEffect(() => {
    check();
  }, [check]);

  /** „Später“ oder Kreuz: für 30 Tage aus, auf diesem Gerät sofort, im Konto für alle Geräte. */
  const hinweisSchliessen = () => {
    setHinweis(false);
    const jetzt = new Date().toISOString();
    try {
      if (authUser?.id) localStorage.setItem(hinweisSpeicherSchluessel(authUser.id), jetzt);
    } catch { /* dann gilt nur das Konto */ }
    try {
      setUserSetting(HINWEIS_EINSTELLUNG, jetzt);
    } catch (e) {
      console.warn("[KundenMfaGuard] Hinweis-Zeitpunkt nicht gespeichert", e);
    }
  };

  const consumeRecovery = async () => {
    const cleaned = recoveryInput.trim().toUpperCase().replace(/\s+/g, "");
    if (cleaned.length < 10) {
      toast.error(t("portal.mfa.recovery_incomplete"));
      return;
    }
    setBusy(true);
    try {
      await callMfa({ action: "consume_recovery_code", code: cleaned });
      // Die Zwei-Faktor-Anmeldung ist jetzt zurückgesetzt. Neu einrichten ist
      // freiwillig, der Kunde kommt sofort ins Portal.
      toast.success(t("portal.mfa.recovery_done"));
      setRecoveryInput("");
      setCode("");
      setFactorId(null);
      nachDemCodeNeuLaden();
    } catch (e) {
      toast.error(serverText(e, "portal.mfa.recovery_invalid"));
    } finally {
      setBusy(false);
    }
  };

  const verifyChallenge = async () => {
    if (!factorId || code.length < 6 || busy) return;
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      });
      if (vErr) throw vErr;
      setCode("");
      nachDemCodeNeuLaden();
    } catch (e) {
      toast.error(t("portal.mfa.code_invalid_check"));
      setCodeFehler((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  if (mode === "loading") {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("portal.mfa.checking")}
      </div>
    );
  }

  if (mode === "ok") {
    return (
      <>
        {hinweis && !aufEinstellungen && <KundenZweiFaktorHinweis onSchliessen={hinweisSchliessen} />}
        {children}
      </>
    );
  }

  // Codeabfrage: Vollbild, vorher ist nichts vom Portal zu sehen.
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 sm:p-8 space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{t("portal.mfa.challenge_title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("portal.mfa.challenge_sub")}</p>
        </div>

        <div className="space-y-4">
          <CodeEingabe
            value={code}
            onChange={setCode}
            onVollstaendig={verifyChallenge}
            beschaeftigt={busy}
            fehler={codeFehler}
            label={t("portal.mfa.challenge_title")}
            autoFocus
          />
          <Button onClick={verifyChallenge} disabled={code.length < 6 || busy} className="w-full h-11">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("portal.mfa.checking_code")}</> : t("portal.mfa.confirm")}
          </Button>
          <Separator />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
              <KeyRound className="h-3 w-3" /> {t("portal.mfa.no_code")}
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-muted-foreground">{t("portal.mfa.recovery_intro")}</p>
              <Input
                value={recoveryInput}
                onChange={(e) => setRecoveryInput(e.target.value.toUpperCase().slice(0, 11))}
                placeholder="XXXXX-XXXXX"
                className="h-12 rounded-xl bg-card/70 text-center font-mono tracking-widest"
              />
              <Button onClick={consumeRecovery} disabled={recoveryInput.length < 10 || busy} variant="outline" className="w-full">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("portal.mfa.checking_code")}</> : t("portal.mfa.recovery_submit")}
              </Button>
              <p className="text-muted-foreground">{t("portal.mfa.recovery_none")}</p>
            </div>
          </details>
        </div>
      </Card>
    </div>
  );
}
