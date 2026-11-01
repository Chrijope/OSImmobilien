import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck, Copy, Link2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { ladeKalenderVerbindungen, type KalenderVerbindung } from "@/lib/kalenderSync";
import { oauthFensterOeffnen } from "@/lib/oauthFenster";

/**
 * Kalender verbinden (01.11.2026): Google und Outlook/Microsoft 365 über die
 * Anmeldung beim Anbieter, Apple iCloud und jeder andere CalDAV-Server mit
 * Passwort, beliebige Kalender per Abo-Link (nur lesen). Mehrere gleichzeitig;
 * einer ist Ziel für neue CRM-Termine. Dazu der eigene Abo-Link, mit dem die
 * CRM-Termine in jedem Kalender erscheinen.
 *
 * Eine Komponente für alle Stellen (Einstellungen und Kalenderseite).
 */

interface Props {
  /** Kompakt: ohne Abo-Link und ohne Kalenderliste, für schmale Stellen. */
  kompakt?: boolean;
  /** Nach jeder Änderung, etwa um Termine neu zu laden. */
  aufAenderung?: () => void;
}

const ART_NAME: Record<KalenderVerbindung["art"], string> = {
  google: "Google Kalender",
  microsoft: "Outlook / Microsoft 365",
  caldav: "Apple iCloud / CalDAV",
  abo: "Abonnierter Kalender",
};

type Formular = null | "caldav" | "abo";

async function rufe(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("kalender", { body });
  if (error) throw await edgeFehlerMitGrund(error, { functionName: "kalender" });
  return data;
}

export function KalenderKonten({ kompakt = false, aufAenderung }: Props) {
  const [liste, setListe] = useState<KalenderVerbindung[]>([]);
  const [oauth, setOauth] = useState<{ google: boolean; microsoft: boolean } | null>(null);
  const [formular, setFormular] = useState<Formular>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [caldav, setCaldav] = useState({ server: "", benutzer: "", passwort: "" });
  const [abo, setAbo] = useState({ url: "", name: "" });
  const [feed, setFeed] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setListe(await ladeKalenderVerbindungen(true));
  }, []);

  useEffect(() => {
    void laden();
    rufe({ aktion: "oauth-status" }).then(setOauth).catch(() => setOauth({ google: false, microsoft: false }));
  }, [laden]);

  const geaendert = async () => {
    await laden();
    aufAenderung?.();
  };

  const anmelden = async (art: "google" | "microsoft") => {
    try {
      const { url } = await rufe({ aktion: "oauth-start", art, herkunft: window.location.origin });
      oauthFensterOeffnen(url, () => void geaendert());
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const verbinden = async (): Promise<boolean> => {
    setLaeuft(true);
    try {
      if (formular === "caldav") {
        const r = await rufe({ aktion: "caldav-verbinden", server_url: caldav.server || undefined, benutzername: caldav.benutzer, passwort: caldav.passwort });
        toast.success(`Kalender verbunden, ${r.kalender} Kalender gefunden`);
        setCaldav({ server: "", benutzer: "", passwort: "" });
      } else if (formular === "abo") {
        const r = await rufe({ aktion: "abo-verbinden", url: abo.url, name: abo.name });
        toast.success(`Kalender abonniert, ${r.termine} Termine gefunden`);
        setAbo({ url: "", name: "" });
      }
      setFormular(null);
      await geaendert();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setLaeuft(false);
    }
  };

  const trennen = async (v: KalenderVerbindung) => {
    const { error } = await supabase.from("kalender_verbindungen" as never).delete().eq("id", v.id);
    if (error) return toast.error(`Nicht getrennt: ${error.message}`);
    toast.success(`${ART_NAME[v.art]} getrennt, Zugang gelöscht`);
    await geaendert();
  };

  const alsZiel = async (v: KalenderVerbindung) => {
    try {
      await rufe({ aktion: "schreibziel", id: v.id });
      toast.success(`Neue CRM-Termine landen in ${v.konto}`);
      await geaendert();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const feedErzeugen = async () => {
    try {
      const r = await rufe({ aktion: "feed-link" });
      setFeed(r.url);
      await navigator.clipboard?.writeText(r.url).catch(() => {});
      toast.success("Neuer Abo-Link erstellt und kopiert. Ein älterer Link gilt nicht mehr.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      {liste.map((v) => (
        <Card key={v.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium"><CalendarCheck className="h-4 w-4 shrink-0" /> {ART_NAME[v.art]}</p>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {v.konto}{v.kalender.length ? ` · ${v.kalender.length} Kalender` : ""}{v.schreibziel ? " · neue CRM-Termine landen hier" : ""}
              </p>
              {v.letzter_fehler && <p className="mt-1 flex items-start gap-1 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {v.letzter_fehler}</p>}
              {!kompakt && v.kalender.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{v.kalender.map((k) => k.name + (k.primary ? " (Haupt)" : "")).join(", ")}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {v.art !== "abo" && !v.schreibziel && (
                <Button variant="outline" size="sm" onClick={() => void alsZiel(v)}>Für CRM-Termine nutzen</Button>
              )}
              <Button variant="ghost" size="icon" aria-label="Trennen" onClick={() => void trennen(v)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!oauth?.google} title={oauth && !oauth.google ? "Die Google-Anmeldung ist noch nicht eingerichtet." : undefined} onClick={() => void anmelden("google")}>
          Mit Google verbinden
        </Button>
        <Button size="sm" variant="outline" disabled={!oauth?.microsoft} title={oauth && !oauth.microsoft ? "Die Microsoft-Anmeldung ist noch nicht eingerichtet." : undefined} onClick={() => void anmelden("microsoft")}>
          Mit Outlook / Microsoft verbinden
        </Button>
        <Button size="sm" variant="outline" onClick={() => setFormular(formular === "caldav" ? null : "caldav")}>Apple iCloud / CalDAV</Button>
        <Button size="sm" variant="outline" onClick={() => setFormular(formular === "abo" ? null : "abo")}><Link2 className="mr-1 h-4 w-4" /> Kalender abonnieren</Button>
      </div>
      {oauth && (!oauth.google || !oauth.microsoft) && (
        <p className="text-xs text-muted-foreground">
          {[!oauth.google && "Google", !oauth.microsoft && "Microsoft"].filter(Boolean).join(" und ")}: Die Anmeldung wird beim Umzug auf den eigenen Server eingerichtet. Bis dahin geht Outlook auch über „Kalender abonnieren“ (nur lesen).
        </p>
      )}

      {formular === "caldav" && (
        <Card className="space-y-3 p-4">
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            iCloud: Apple-ID und ein app-spezifisches Passwort von account.apple.com (Anmeldung und Sicherheit, App-spezifische Passwörter). Für andere Anbieter (etwa Nextcloud, mailbox.org, IONOS) zusätzlich die CalDAV-Adresse eintragen.
          </div>
          <div>
            <Label htmlFor="caldav-server">CalDAV-Adresse (leer lassen für iCloud)</Label>
            <Input id="caldav-server" value={caldav.server} placeholder="https://caldav.icloud.com" onChange={(e) => setCaldav({ ...caldav, server: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="caldav-benutzer">Apple-ID oder Benutzername</Label>
            <Input id="caldav-benutzer" value={caldav.benutzer} autoComplete="off" onChange={(e) => setCaldav({ ...caldav, benutzer: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="caldav-passwort">App-spezifisches Passwort</Label>
            <Input id="caldav-passwort" type="password" value={caldav.passwort} autoComplete="new-password" placeholder="xxxx-xxxx-xxxx-xxxx" onChange={(e) => setCaldav({ ...caldav, passwort: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button disabled={laeuft || !caldav.benutzer || !caldav.passwort} onClick={verbinden}>{laeuft ? "Verbinde …" : "Verbinden"}</Button>
            <Button variant="outline" onClick={() => setFormular(null)}>Abbrechen</Button>
          </div>
        </Card>
      )}

      {formular === "abo" && (
        <Card className="space-y-3 p-4">
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            Jeder Kalender, der einen Abo-Link (.ics oder webcal://) anbietet: Outlook (Kalender freigeben, ICS-Link veröffentlichen), Google (Geheime Adresse im iCal-Format), Feiertage, Teamkalender. Nur lesen.
          </div>
          <div>
            <Label htmlFor="abo-url">Abo-Link</Label>
            <Input id="abo-url" value={abo.url} placeholder="https://… oder webcal://…" onChange={(e) => setAbo({ ...abo, url: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="abo-name">Name</Label>
            <Input id="abo-name" value={abo.name} placeholder="z. B. Outlook Büro" onChange={(e) => setAbo({ ...abo, name: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button disabled={laeuft || !abo.url} onClick={verbinden}>{laeuft ? "Prüfe …" : "Abonnieren"}</Button>
            <Button variant="outline" onClick={() => setFormular(null)}>Abbrechen</Button>
          </div>
        </Card>
      )}

      {!kompakt && (
        <Card className="space-y-2 p-4">
          <p className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" /> CRM-Termine in deinem Kalender abonnieren</p>
          <p className="text-xs text-muted-foreground">
            Ein persönlicher Link für Apple, Google und Outlook: Dort als Kalender abonnieren, und deine CRM-Termine erscheinen automatisch. Wer den Link hat, sieht deine Termine; ein neuer Link macht den alten ungültig.
          </p>
          {feed && (
            <div className="flex gap-2">
              <Input readOnly value={feed} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Kopieren" onClick={() => void navigator.clipboard?.writeText(feed)}><Copy className="h-4 w-4" /></Button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => void feedErzeugen()}>{feed ? "Neuen Link erstellen" : "Abo-Link erstellen"}</Button>
        </Card>
      )}
    </div>
  );
}
