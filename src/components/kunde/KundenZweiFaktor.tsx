import { useCallback, useEffect, useState } from "react";
import { Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { portalSprache } from "@/i18n/portalSprache";
import { datumText, datumUhrzeitText } from "@/lib/sprachFormat";
import type { MfaFaktor } from "@/lib/mfaZustand";
import { CodeEingabe } from "@/components/security/CodeEingabe";

/**
 * Zwei-Faktor-Anmeldung in den Kunden-Einstellungen (Reiter Sicherheit).
 *
 * Freiwillig seit dem 25.09.2026, siehe `src/lib/kundenZweiFaktor.ts`. Der
 * Kunde schaltet sie hier ein und aus. Interne Rollen melden sich seit dem
 * 05.10.2026 nur mit Passwort an, für sie gibt es keine Einrichtung mehr.
 *
 * Einschalten: Die Edge Function `manage-mfa` legt den Faktor an (sie räumt
 * dabei halbfertige Versuche weg). Bestätigt wird hier im Browser mit
 * `auth.mfa.challenge` und `auth.mfa.verify`. Anders als im CRM, wo die
 * Function bestätigt: So steigt die Sitzung des Kunden sofort auf aal2, er
 * muss nicht gleich danach noch einen Code eingeben, und die Datenbank gibt
 * ihm seine Daten weiter heraus. Die Wiederherstellungscodes stellt danach
 * `generate_recovery_codes` aus, die dafür genau diese aal2-Sitzung verlangt.
 *
 * Ausschalten: nur mit einem aktuellen Code aus der App. Die Function prüft
 * den Code selbst (Aktion `deaktivieren`), eine laufende Sitzung allein
 * genügt nicht.
 */

type MfaFehler = Error & { code?: string };

type Ansicht =
  | { art: "laden" }
  | { art: "fehler" }
  | { art: "aus" }
  | { art: "an"; faktor: MfaFaktor & { created_at?: string | null } };

export function KundenZweiFaktor() {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: "laden" });
  const [busy, setBusy] = useState(false);
  const [einrichtung, setEinrichtung] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [codeFehler, setCodeFehler] = useState(0);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [ausschalten, setAusschalten] = useState(false);
  const [ausCode, setAusCode] = useState("");

  const callMfa = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-mfa", { body: payload });
    if (error) {
      let nachricht = error.message;
      let kennung: string | undefined;
      const context = (error as { context?: { clone?: () => { json: () => Promise<{ error?: string; code?: string } | null> } } }).context;
      if (context?.clone) {
        try {
          const body = await context.clone().json();
          nachricht = body?.error || nachricht;
          kennung = body?.code;
        } catch { /* dann bleibt die technische Meldung */ }
      }
      const fehler: MfaFehler = new Error(nachricht);
      if (kennung) fehler.code = kennung;
      throw fehler;
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const laden = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const faktoren = [...((data?.totp ?? []) as MfaFaktor[]), ...((data?.all ?? []) as MfaFaktor[])];
      const aktiv = faktoren.find((f) => (!f.factor_type || f.factor_type === "totp") && f.status === "verified");
      setAnsicht(aktiv ? { art: "an", faktor: aktiv } : { art: "aus" });
    } catch (e) {
      console.error("[KundenZweiFaktor] Faktorliste nicht abrufbar", e);
      setAnsicht({ art: "fehler" });
    }
  }, []);

  useEffect(() => { laden(); }, [laden, authUser?.id]);

  const einrichtungStarten = async () => {
    setBusy(true);
    try {
      const data = await callMfa({ action: "enroll", friendlyName: "OS Immobilien Kundenportal" });
      setEinrichtung({ factorId: data.factorId, qrCode: data.qrCode, secret: data.secret });
      setCode("");
    } catch (e) {
      if ((e as MfaFehler)?.code === "mfa_bereits_aktiv") {
        await laden();
      } else {
        toast.error(t("portal.tfa.start_failed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const einrichtungBestaetigen = async () => {
    if (!einrichtung || code.length < 6 || busy) return;
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: einrichtung.factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: einrichtung.factorId,
        challengeId: ch.id,
        code,
      });
      if (vErr) throw vErr;
    } catch {
      toast.error(t("portal.tfa.code_invalid"));
      setCodeFehler((n) => n + 1);
      setBusy(false);
      return;
    }

    // Ab hier ist die Zwei-Faktor-Anmeldung aktiv. Scheitern nur die Codes,
    // bleibt sie trotzdem an, der Kunde erfährt aber, dass sie fehlen.
    try {
      const r = await callMfa({ action: "generate_recovery_codes" });
      if (Array.isArray(r?.codes) && r.codes.length) setCodes(r.codes);
      else toast.error(t("portal.mfa.codes_failed"));
    } catch (e) {
      console.error("[KundenZweiFaktor] Wiederherstellungscodes fehlgeschlagen", e);
      toast.error(t("portal.mfa.codes_failed"));
    }
    toast.success(t("portal.tfa.enabled_toast"));
    setEinrichtung(null);
    setCode("");
    setBusy(false);
    await laden();
  };

  const einrichtungAbbrechen = () => {
    // Der angelegte, unbestätigte Faktor bleibt liegen. Das stört nicht: Er
    // gilt nicht als Zwei-Faktor, und beim nächsten Einrichten räumt
    // `manage-mfa` ihn weg.
    setEinrichtung(null);
    setCode("");
  };

  const ausschaltenBestaetigen = async () => {
    if (ansicht.art !== "an" || ausCode.length < 6 || busy) return;
    setBusy(true);
    try {
      await callMfa({ action: "deaktivieren", factorId: ansicht.faktor.id, code: ausCode });
      toast.success(t("portal.tfa.disabled_toast"));
      setAusschalten(false);
      setAusCode("");
      setCodes(null);
      await laden();
    } catch (e) {
      const kennung = (e as MfaFehler)?.code;
      toast.error(kennung === "code_ungueltig" ? t("portal.tfa.code_invalid") : t("portal.tfa.disable_failed"));
      if (kennung === "code_ungueltig") setCodeFehler((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const codesHerunterladen = () => {
    if (!codes) return;
    // Die Datei folgt der Anzeigesprache: Der Kunde liest sie wie den Bildschirm.
    const text = [
      t("portal.mfa.file_title"),
      t("portal.mfa.file_account", { email: authUser?.email || "" }),
      t("portal.mfa.file_created", { date: datumUhrzeitText(new Date(), portalSprache()) }),
      "",
      t("portal.mfa.file_once"),
      t("portal.mfa.file_reset_1"),
      t("portal.mfa.file_reset_2"),
      "",
      ...codes.map((c, i) => `${String(i + 1).padStart(2, "0")}.  ${c}`),
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("portal.mfa.file_name")}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kopieren = (text: string, meldung: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(meldung)).catch(() => {});
  };

  return (
    <section id="zwei-faktor" aria-labelledby="zwei-faktor-titel">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 id="zwei-faktor-titel" className="text-lg font-bold text-foreground">{t("portal.tfa.title")}</h3>
        <Badge variant="outline" className="text-[10px]">{t("portal.tfa.badge")}</Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t("portal.tfa.sub")}</p>

      {codes && (
        <Card className="p-4 mb-4 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <KeyRound className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">{t("portal.tfa.codes_title")}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t("portal.tfa.codes_text")}</p>
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {codes.map((c, i) => (
              <code key={c} className="text-xs bg-background px-2 py-1 rounded font-mono text-center">
                <span className="text-muted-foreground mr-1">{String(i + 1).padStart(2, "0")}.</span>{c}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={codesHerunterladen}>
              <Download className="h-3 w-3" /> {t("portal.mfa.download")}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => kopieren(codes.join("\n"), t("portal.mfa.copied"))}>
              <Copy className="h-3 w-3" /> {t("portal.mfa.copy")}
            </Button>
            <Button size="sm" onClick={() => setCodes(null)}>{t("portal.mfa.codes_saved")}</Button>
          </div>
        </Card>
      )}

      {ansicht.art === "laden" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("portal.security.loading")}
        </div>
      )}

      {ansicht.art === "fehler" && (
        <Card className="p-4 text-sm text-muted-foreground">
          <p>{t("portal.tfa.load_failed")}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setAnsicht({ art: "laden" }); laden(); }}>
            {t("portal.tfa.retry")}
          </Button>
        </Card>
      )}

      {ansicht.art === "an" && (
        <div className="space-y-3">
          <Card className="p-4 border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("portal.tfa.on_title")}</p>
                  <p className="text-xs text-muted-foreground">{t("portal.tfa.on_text")}</p>
                  {ansicht.faktor.created_at && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Smartphone className="h-3 w-3" aria-hidden="true" />
                      {t("portal.tfa.on_since", { date: datumText(ansicht.faktor.created_at, portalSprache()) })}
                    </p>
                  )}
                </div>
              </div>
              {!ausschalten && (
                <Button variant="outline" size="sm" onClick={() => { setAusschalten(true); setAusCode(""); }}>
                  {t("portal.tfa.disable")}
                </Button>
              )}
            </div>
          </Card>

          {ausschalten && (
            <Card className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldOff className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">{t("portal.tfa.disable_title")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("portal.tfa.disable_text")}</p>
                </div>
              </div>
              {/* Ohne automatisches Absenden: Ausschalten bestätigt der Kunde ausdrücklich per Knopf. */}
              <CodeEingabe
                value={ausCode}
                onChange={setAusCode}
                beschaeftigt={busy}
                fehler={codeFehler}
                label={t("portal.tfa.code_label")}
                autoFocus
                className="max-w-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { setAusschalten(false); setAusCode(""); }} disabled={busy}>
                  {t("portal.tfa.disable_keep")}
                </Button>
                <Button variant="destructive" onClick={ausschaltenBestaetigen} disabled={ausCode.length < 6 || busy}>
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t("portal.tfa.checking")}</> : t("portal.tfa.disable_confirm")}
                </Button>
              </div>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">{t("portal.tfa.lost_phone")}</p>
        </div>
      )}

      {ansicht.art === "aus" && !einrichtung && (
        <Card className="p-5 border-dashed space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">{t("portal.tfa.off_title")}</p>
                <p className="text-xs text-muted-foreground">{t("portal.tfa.off_text")}</p>
              </div>
            </div>
            <Button onClick={einrichtungStarten} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t("portal.tfa.preparing")}</> : t("portal.tfa.enable")}
            </Button>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold text-foreground">{t("portal.tfa.need_title")}</p>
            <p>{t("portal.tfa.need_app")}</p>
            <p>{t("portal.tfa.need_steps")}</p>
            <p>{t("portal.tfa.need_login")}</p>
          </div>
        </Card>
      )}

      {ansicht.art === "aus" && einrichtung && (
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="text-center">
            <p className="text-sm font-semibold mb-3">{t("portal.tfa.step_scan")}</p>
            <div className="inline-block p-3 bg-white rounded-lg border">
              <img src={einrichtung.qrCode} alt={t("portal.tfa.qr_alt")} className="w-44 h-44 sm:w-48 sm:h-48" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">{t("portal.tfa.manual")}</p>
            <div className="flex items-center justify-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all max-w-[260px]">{einrichtung.secret}</code>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("portal.tfa.copy_secret")}
                className="h-7 w-7"
                onClick={() => kopieren(einrichtung.secret, t("portal.tfa.secret_copied"))}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <Separator />
          <div className="max-w-sm mx-auto space-y-3">
            <p className="text-sm font-semibold text-center">{t("portal.tfa.step_code")}</p>
            <CodeEingabe
              value={code}
              onChange={setCode}
              onVollstaendig={einrichtungBestaetigen}
              beschaeftigt={busy}
              fehler={codeFehler}
              label={t("portal.tfa.code_label")}
            />
            {/* Auf dem Handy untereinander, sonst passt der längere Knopf nicht in die Karte. */}
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" className="sm:flex-1" onClick={einrichtungAbbrechen} disabled={busy}>
                {t("portal.tfa.cancel")}
              </Button>
              <Button className="sm:flex-1" onClick={einrichtungBestaetigen} disabled={code.length < 6 || busy}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> {t("portal.tfa.checking")}</> : t("portal.tfa.confirm")}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </section>
  );
}
