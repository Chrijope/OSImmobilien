import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Mail, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { oauthFensterOeffnen } from "@/lib/oauthFenster";
import { ANBIETER, anbieterFuerAdresse, type MailAnbieter } from "@/lib/mailAnbieter";
import { datumUhrzeitText } from "@/lib/sprachFormat";

/*
 * Mailkonten verbinden (01.11.2026). Die Konten stehen in `email_konten`, das
 * Passwort im Tresor. Der Browser schickt es nur einmal an die Function
 * `email-konten`, die vorher die Anmeldung am Server prüft, und bekommt es
 * nie zurück. Abgeholt wird alle 5 Minuten automatisch.
 */

export interface EmailKontoZeile {
  id: string;
  art: "imap" | "google" | "microsoft";
  adresse: string;
  anzeigename: string | null;
  imap_host: string | null;
  imap_port: number;
  smtp_host: string | null;
  smtp_port: number;
  benutzername: string | null;
  zuletzt_abgeholt: string | null;
  letzter_fehler: string | null;
}

export const KONTO_FELDER = "id, art, adresse, anzeigename, imap_host, imap_port, smtp_host, smtp_port, benutzername, zuletzt_abgeholt, letzter_fehler";

interface Entwurf {
  id?: string;
  anbieter: string;
  adresse: string;
  anzeigename: string;
  benutzername: string;
  passwort: string;
  imap_host: string;
  imap_port: string;
  smtp_host: string;
  smtp_port: string;
}

const LEER: Entwurf = { anbieter: "andere", adresse: "", anzeigename: "", benutzername: "", passwort: "", imap_host: "", imap_port: "993", smtp_host: "", smtp_port: "465" };

function mitAnbieter(e: Entwurf, a: MailAnbieter): Entwurf {
  return { ...e, anbieter: a.id, imap_host: a.imap, imap_port: String(a.imapPort), smtp_host: a.smtp, smtp_port: String(a.smtpPort) };
}

export function EmailKontenVerwaltung() {
  const [konten, setKonten] = useState<EmailKontoZeile[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [holt, setHolt] = useState<string | null>(null);
  const [loeschen, setLoeschen] = useState<EmailKontoZeile | null>(null);
  const [oauth, setOauth] = useState<{ google: boolean; microsoft: boolean } | null>(null);

  const laden = useCallback(async () => {
    const { data, error } = await supabase.from("email_konten" as never).select(KONTO_FELDER).order("erstellt_am");
    if (error) toast.error(`Mailkonten nicht lesbar: ${error.message}`);
    setKonten((data as unknown as EmailKontoZeile[]) ?? []);
    setLaedt(false);
  }, []);

  useEffect(() => {
    void laden();
    supabase.functions.invoke("email-konten", { body: { aktion: "oauth-status" } })
      .then(({ data }) => setOauth(data ?? { google: false, microsoft: false }));
  }, [laden]);

  /** Gmail oder Outlook über die Anmeldung beim Anbieter, ohne Passwort. */
  const anmelden = async (art: "google" | "microsoft") => {
    const { data, error } = await supabase.functions.invoke("email-konten", { body: { aktion: "oauth-start", art, herkunft: window.location.origin } });
    if (error || !data?.url) {
      const f = error ? await edgeFehlerMitGrund(error, { functionName: "email-konten" }) : null;
      return toast.error((f as Error)?.message || "Anmeldung nicht möglich");
    }
    oauthFensterOeffnen(data.url, () => void laden());
  };

  const anbieter = entwurf ? ANBIETER.find((a) => a.id === entwurf.anbieter) : undefined;

  const speichern = async () => {
    if (!entwurf) return false;
    setSpeichert(true);
    const { data, error } = await supabase.functions.invoke("email-konten", {
      body: {
        aktion: "speichern",
        id: entwurf.id,
        adresse: entwurf.adresse,
        anzeigename: entwurf.anzeigename,
        benutzername: entwurf.benutzername,
        passwort: entwurf.passwort,
        imap_host: entwurf.imap_host,
        imap_port: Number(entwurf.imap_port),
        smtp_host: entwurf.smtp_host,
        smtp_port: Number(entwurf.smtp_port),
      },
    });
    setSpeichert(false);
    if (error) {
      const f = await edgeFehlerMitGrund(error, { functionName: "email-konten" });
      toast.error((f as Error)?.message || "Konto konnte nicht gespeichert werden.");
      return false;
    }
    toast.success(data?.neu ? `Konto verbunden, ${data.neu} Mails abgeholt` : "Konto verbunden");
    setEntwurf(null);
    await laden();
    return true;
  };

  const abholen = async (konto: EmailKontoZeile) => {
    setHolt(konto.id);
    const { data, error } = await supabase.functions.invoke("sync-emails", { body: { kontoId: konto.id } });
    setHolt(null);
    if (error || data?.fehler?.length) {
      const f = error ? await edgeFehlerMitGrund(error, { functionName: "sync-emails" }) : null;
      toast.error((f as Error)?.message || data?.fehler?.[0]?.fehler || "Abholen fehlgeschlagen");
    } else {
      toast.success(data?.synced ? `${data.synced} neue Mails abgeholt` : "Postfach ist aktuell");
    }
    await laden();
  };

  const entfernen = async () => {
    if (!loeschen) return;
    const { error } = await supabase.from("email_konten" as never).delete().eq("id", loeschen.id);
    setLoeschen(null);
    if (error) return toast.error(`Konto nicht entfernt: ${error.message}`);
    toast.success("Konto getrennt, Passwort gelöscht");
    await laden();
  };

  return (
    <div className="space-y-3">
      {laedt && <p className="text-sm text-muted-foreground">Konten werden geladen …</p>}
      {!laedt && konten.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch kein Konto verbunden. Danach erscheinen deine Mails unter E-Mail in der Seitenleiste, Mails von Kunden zusätzlich im Kundenprofil.</p>
      )}
      {konten.map((k) => (
        <Card key={k.id} className="p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{k.adresse}</span></p>
            <p className="text-xs text-muted-foreground">
              {k.imap_host} · {k.zuletzt_abgeholt ? `zuletzt abgeholt ${datumUhrzeitText(k.zuletzt_abgeholt, "de")}` : "noch nicht abgeholt"}
            </p>
            {k.letzter_fehler && (
              <p className="mt-1 text-xs text-destructive flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {k.letzter_fehler}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" aria-label="Jetzt abholen" disabled={holt === k.id} onClick={() => abholen(k)}>
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${holt === k.id ? "animate-spin" : ""}`} />
            </Button>
{k.art === "imap" && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Bearbeiten"
              onClick={() => setEntwurf({
                id: k.id,
                anbieter: anbieterFuerAdresse(k.adresse)?.id ?? "andere",
                adresse: k.adresse,
                anzeigename: k.anzeigename ?? "",
                benutzername: k.benutzername ?? "",
                passwort: "",
                imap_host: k.imap_host ?? "",
                imap_port: String(k.imap_port),
                smtp_host: k.smtp_host ?? "",
                smtp_port: String(k.smtp_port),
              })}
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
            )}
            <Button variant="ghost" size="icon" aria-label="Entfernen" onClick={() => setLoeschen(k)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </Card>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!oauth?.google} title={oauth && !oauth.google ? "Die Google-Anmeldung ist noch nicht eingerichtet." : undefined} onClick={() => void anmelden("google")}>Mit Google anmelden (Gmail)</Button>
        <Button variant="outline" size="sm" disabled={!oauth?.microsoft} title={oauth && !oauth.microsoft ? "Die Microsoft-Anmeldung ist noch nicht eingerichtet." : undefined} onClick={() => void anmelden("microsoft")}>Mit Microsoft anmelden (Outlook)</Button>
        <Button variant="outline" size="sm" onClick={() => setEntwurf({ ...LEER })}><Plus className="h-4 w-4 mr-1" /> Anderes Postfach (IMAP)</Button>
      </div>
      {oauth && (!oauth.google || !oauth.microsoft) && (
        <p className="text-xs text-muted-foreground">Die Anmeldung mit Google und Microsoft wird beim Umzug auf den eigenen Server eingerichtet. Gmail geht bis dahin über „Anderes Postfach“ mit App-Passwort.</p>
      )}

      <Dialog open={!!entwurf} onOpenChange={(offen) => !offen && setEntwurf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entwurf?.id ? "E-Mail-Konto ändern" : "E-Mail-Konto verbinden"}</DialogTitle>
            <DialogDescription>Die Anmeldung wird beim Speichern geprüft. Dein Passwort liegt danach verschlüsselt auf dem Server und ist hier nicht mehr lesbar.</DialogDescription>
          </DialogHeader>
          {entwurf && (
            <div className="grid gap-4">
              <div>
                <Label>Anbieter</Label>
                <Select value={entwurf.anbieter} onValueChange={(id) => {
                  const a = ANBIETER.find((x) => x.id === id);
                  setEntwurf(a ? mitAnbieter(entwurf, a) : { ...entwurf, anbieter: id });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANBIETER.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    <SelectItem value="andere">Anderer Anbieter</SelectItem>
                  </SelectContent>
                </Select>
                {anbieter?.hinweis && <p className="mt-1.5 text-xs text-muted-foreground">{anbieter.hinweis}</p>}
              </div>
              <div>
                <Label>E-Mail-Adresse</Label>
                <Input type="email" autoComplete="email" value={entwurf.adresse} placeholder="name@firma.de" onChange={(e) => {
                  const adresse = e.target.value;
                  const a = entwurf.id ? undefined : anbieterFuerAdresse(adresse);
                  setEntwurf(a && entwurf.anbieter === "andere" ? mitAnbieter({ ...entwurf, adresse }, a) : { ...entwurf, adresse });
                }} />
              </div>
              <div>
                <Label>Anzeigename beim Senden</Label>
                <Input value={entwurf.anzeigename} placeholder="Vorname Nachname · OS Immobilien" onChange={(e) => setEntwurf({ ...entwurf, anzeigename: e.target.value })} />
              </div>
              <div>
                <Label>{anbieter?.appPasswort ? "App-Passwort" : "Passwort"}</Label>
                <Input type="password" autoComplete="new-password" value={entwurf.passwort} placeholder={entwurf.id ? "Leer lassen, um es zu behalten" : ""} onChange={(e) => setEntwurf({ ...entwurf, passwort: e.target.value })} />
              </div>
              <Collapsible defaultOpen={entwurf.anbieter === "andere"}>
                <CollapsibleTrigger asChild>
                  <Button variant="link" size="sm" className="px-0">Server und Benutzername</Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-3 pt-2">
                  <div>
                    <Label>Benutzername</Label>
                    <Input value={entwurf.benutzername} placeholder="meist die E-Mail-Adresse" onChange={(e) => setEntwurf({ ...entwurf, benutzername: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-[1fr_6rem] gap-3">
                    <div><Label>IMAP-Server</Label><Input value={entwurf.imap_host} placeholder="imap.firma.de" onChange={(e) => setEntwurf({ ...entwurf, imap_host: e.target.value })} /></div>
                    <div><Label>Port</Label><Input inputMode="numeric" value={entwurf.imap_port} onChange={(e) => setEntwurf({ ...entwurf, imap_port: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-[1fr_6rem] gap-3">
                    <div><Label>SMTP-Server</Label><Input value={entwurf.smtp_host} placeholder="smtp.firma.de" onChange={(e) => setEntwurf({ ...entwurf, smtp_host: e.target.value })} /></div>
                    <div><Label>Port</Label><Input inputMode="numeric" value={entwurf.smtp_port} onChange={(e) => setEntwurf({ ...entwurf, smtp_port: e.target.value })} /></div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setEntwurf(null)}>Abbrechen</Button>
                <Button haken disabled={speichert || !entwurf.adresse} onClick={speichern}>
                  {speichert ? "Anmeldung wird geprüft …" : "Speichern"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!loeschen} onOpenChange={(offen) => !offen && setLoeschen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konto trennen?</DialogTitle>
            <DialogDescription>
              {loeschen?.adresse} wird getrennt und das Passwort gelöscht. Die abgeholten Mails dieses Kontos verschwinden aus dem CRM; im Postfach selbst bleibt alles, wie es ist.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setLoeschen(null)}>Abbrechen</Button>
            <Button variant="destructive" onClick={entfernen}>Trennen</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
